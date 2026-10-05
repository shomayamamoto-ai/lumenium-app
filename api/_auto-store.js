// 自動改善の保存先（Upstash Redis）。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
//   ${KV}auto:settings        … 設定（_auto-core.js の DEFAULT_SETTINGS の形）
//   ${KV}auto:props           … HASH 提案の id → 提案（JSON）
//   ${KV}auto:exps            … HASH 実験の id → 実験（JSON）
//   ${KV}auto:exp:live        … 訪問者に配る設定（liveConfig の形。/api/exp と track.js が読む）
//   ${KV}auto:log             … LIST 自動・手動でしたことの記録（新しい順、200件まで）
//   ${KV}auto:last            … 最後に毎朝の処理が動いた結果
//   ${KV}auto:snap:<日付>     … 観測の1枚（_auto-signals.js、400日）
//   ${KV}exp:<id>:<A|B|W>:<x|c> … 見た人・成果（HyperLogLog。人・日の識別子を
//                                数えるだけで、識別子そのものは残りません）

import { KV } from './_brand.js'
import { DEFAULT_SETTINGS, cleanSettings, liveConfig, countFor } from './_auto-core.js'

export const AK = {
  settings: `${KV}auto:settings`,
  props: `${KV}auto:props`,
  exps: `${KV}auto:exps`,
  live: `${KV}auto:exp:live`,
  log: `${KV}auto:log`,
  last: `${KV}auto:last`,
  count: (id, v, kind) => `${KV}exp:${id}:${v}:${kind}`,
}
export const TTL = 400 * 24 * 3600
export const LOG_MAX = 200

const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback } catch (_) { return fallback } }
const hashToMap = (flat) => {
  const out = {}
  for (let i = 0; Array.isArray(flat) && i + 1 < flat.length; i += 2) {
    const v = parse(flat[i + 1], null)
    if (v) out[flat[i]] = v
  }
  return out
}

export async function readSettings(cfg, pipeline) {
  if (!cfg) return { ...DEFAULT_SETTINGS }
  const [raw] = await pipeline(cfg, [['GET', AK.settings]])
  return cleanSettings(parse(raw, {}), DEFAULT_SETTINGS)
}
export async function saveSettings(cfg, pipeline, s) {
  await pipeline(cfg, [['SET', AK.settings, JSON.stringify(s)]])
}

export async function readProps(cfg, pipeline) {
  const [flat] = await pipeline(cfg, [['HGETALL', AK.props]])
  return hashToMap(flat)
}
/** 提案を丸ごと置き換えます（消えたものは消す）。 */
export async function writeProps(cfg, pipeline, map, before) {
  const cmds = []
  for (const id of Object.keys(before || {})) if (!(id in map)) cmds.push(['HDEL', AK.props, id])
  for (const [id, p] of Object.entries(map)) cmds.push(['HSET', AK.props, id, JSON.stringify(p)])
  if (cmds.length) await pipeline(cfg, cmds)
}
export async function saveProp(cfg, pipeline, p) {
  await pipeline(cfg, [['HSET', AK.props, p.id, JSON.stringify(p)]])
}

export async function readExps(cfg, pipeline) {
  const [flat] = await pipeline(cfg, [['HGETALL', AK.exps]])
  return Object.values(hashToMap(flat)).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
}
export async function saveExp(cfg, pipeline, e) {
  await pipeline(cfg, [['HSET', AK.exps, e.id, JSON.stringify(e)]])
}

/** 訪問者に配る設定を作り直します。実験や設定を変えたら必ず呼びます。 */
export async function publishLive(cfg, pipeline, exps, settings) {
  const live = liveConfig(exps, settings)
  await pipeline(cfg, [['SET', AK.live, JSON.stringify(live)]])
  return live
}
export async function readLive(cfg, pipeline) {
  const [raw] = await pipeline(cfg, [['GET', AK.live]])
  return parse(raw, { v: 1, exps: [], pins: {} })
}

/** 見た人・成果の数（人・日）。 */
export async function readCounts(cfg, pipeline, id, variants = ['A', 'B']) {
  const cmds = []
  for (const v of variants) cmds.push(['PFCOUNT', AK.count(id, v, 'x')], ['PFCOUNT', AK.count(id, v, 'c')])
  const res = await pipeline(cfg, cmds)
  const out = {}
  variants.forEach((v, i) => { out[v] = { x: Number(res[i * 2]) || 0, c: Number(res[i * 2 + 1]) || 0 } })
  return out
}

/** 計測（track.js）から。印つきの「見た」と成果を数える命令を返します
 *  （呼び出し側の書き込みに相乗りさせるため）。印が今の実験と合わなければ空。 */
export async function countCommands(cfg, pipeline, tag, ev, vid) {
  if (!tag || !vid) return []
  let live
  try { live = await readLive(cfg, pipeline) } catch (_) { return [] }
  const hit = countFor(live, tag, ev)
  if (!hit) return []
  const key = AK.count(hit.id, hit.variant, hit.kind)
  return [['PFADD', key, vid], ['EXPIRE', key, TTL]]
}

/** 記録。entry は { kind, title, by: 'auto'|'owner', before, after, evidence, undo } */
export async function addLog(cfg, pipeline, entry, now = Date.now()) {
  const e = { id: 'l' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36), at: new Date(now).toISOString(), ...entry }
  await pipeline(cfg, [['LPUSH', AK.log, JSON.stringify(e)], ['LTRIM', AK.log, 0, LOG_MAX - 1]])
  return e
}
export async function readLog(cfg, pipeline, n = 50) {
  const [raw] = await pipeline(cfg, [['LRANGE', AK.log, 0, n - 1]])
  return (Array.isArray(raw) ? raw : []).map((r) => parse(r, null)).filter(Boolean)
}
/** 記録の1件を書き換えます（「元に戻した」の印）。LIST の位置で探します。 */
export async function markLog(cfg, pipeline, id, patch) {
  const [raw] = await pipeline(cfg, [['LRANGE', AK.log, 0, LOG_MAX - 1]])
  const list = Array.isArray(raw) ? raw : []
  for (let i = 0; i < list.length; i++) {
    const e = parse(list[i], null)
    if (e && e.id === id) {
      const next = { ...e, ...patch }
      await pipeline(cfg, [['LSET', AK.log, i, JSON.stringify(next)]])
      return next
    }
  }
  return null
}
