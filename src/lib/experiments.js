// 文章の実験（A/B）を、訪問者の画面に当てる部分。
//
// 何をするか
//   ・/api/exp から「いま動いている実験」を読みます（無ければ何もしません）。
//   ・この端末の「その日の種」と実験の名前から A / B を決めます。種は
//     localStorage に日付つきで置き、日付が変わると作り直します。サーバーへは
//     送りません——送るのは「実験名:A」のような印だけです。
//   ・B なら、その項目の文章を差し替えます。差し替えは最初の描画の前
//     （起動画面の下）で済ませるので、文章が入れ替わって見えたり、画面が
//     ずれたりしません。読み込みに時間がかかったときは元の文章（A）のまま
//     出し、その人は数えません。
//   ・ビルド時に作る静的なページ（prerender）は、いつも元の文章です。
//
// 同じ計算（hash32 / assign）が api/_auto-core.js にもあり、
// scripts/test-auto.mjs が両方を突き合わせています。

import { applyOverrides } from './content-registry.js'

const SEED_KEY = 'lum_xd'      // その日の種 "YYYY-MM-DD:ランダム"
const SEEN_KEY = 'lum_xs'      // その日に「見た」を送った印 "YYYY-MM-DD:実験名,…"
const FORCE_KEY = 'lum_exp_force' // 管理画面の「この端末で B を見る」（数えません）
const TIMEOUT_MS = 1200

let active = null // { id, key, variant, text, counted }
const pins = {}

export function hash32(s) {
  let h = 0x811c9dc5
  const str = String(s)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function assign(seed, expId) {
  return hash32(`${seed}|${expId}`) % 100 < 50 ? 'A' : 'B'
}

function jstDay() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

function ls(name, value) {
  try {
    if (value === undefined) return window.localStorage.getItem(name)
    window.localStorage.setItem(name, value)
  } catch (_) { /* 使えない端末では、このページの中だけで決めます */ }
  return null
}

/** その日の種。無ければ作ります（日付が変わると作り直し）。 */
export function daySeed(day = jstDay()) {
  const got = ls(SEED_KEY) || ''
  if (got.slice(0, 10) === day && got.length > 11) return got
  const seed = `${day}:${Math.random().toString(36).slice(2, 10)}`
  ls(SEED_KEY, seed)
  return seed
}

/** その日に初めて見せたか（初めてなら印を付けて true）。 */
function firstToday(id, day = jstDay()) {
  const got = ls(SEEN_KEY) || ''
  const ids = got.slice(0, 10) === day ? got.slice(11).split(',').filter(Boolean) : []
  if (ids.includes(id)) return false
  ids.push(id)
  ls(SEEN_KEY, `${day}:${ids.slice(-10).join(',')}`)
  return true
}

/** /api/exp を読みます。失敗・時間切れは null（＝実験なし）。 */
export async function fetchExperiments() {
  if (typeof fetch !== 'function') return null
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS)
    const res = await fetch('/api/exp', { signal: ctl ? ctl.signal : undefined, credentials: 'omit' })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data === 'object' ? data : null
  } catch (_) {
    return null
  }
}

/** 設定を当てます。描画の前に1回だけ呼びます。
 *  返り値は beacon に渡す印（無ければ null）。 */
export function applyExperiments(config, { force } = {}) {
  active = null
  if (!config) return null
  // 採用済みで content.json に入らない項目（予約欄の見出し）。
  if (config.pins && typeof config.pins === 'object') {
    for (const [k, v] of Object.entries(config.pins)) if (typeof v === 'string' && v) pins[k] = v
  }
  const list = Array.isArray(config.exps) ? config.exps : []
  // 同じページで動くのは1つまで（サーバーもそう決めています）。
  const exp = list.find((e) => e && /^[a-z0-9]{4,20}$/.test(e.id) && typeof e.key === 'string')
  if (!exp) return null
  const forced = force !== undefined ? force : ls(FORCE_KEY)
  if (exp.phase === 'watch') {
    // 採用後の見張り。文章は content.json の側で替わっているので、印だけ。
    active = { id: exp.id, key: exp.key, variant: 'W', counted: !forced }
  } else {
    const variant = forced === 'A' || forced === 'B' ? forced : assign(daySeed(), exp.id)
    active = { id: exp.id, key: exp.key, variant, text: variant === 'B' ? String(exp.b || '') : null, counted: !forced }
    if (variant === 'B' && active.text && exp.key.indexOf('text.') === 0) {
      // content.json の項目は、文章編集と同じ仕組みで差し替えます（項目名の
      // 先頭 "text." を含めた、content.json と同じ書き方）。
      applyOverrides({ [exp.key]: active.text })
    }
  }
  if (!active.counted) return null
  return { tag: `${active.id}:${active.variant}`, first: firstToday(active.id) }
}

/** 項目の文章。実験の B・採用済みの固定があればそれ、無ければ fallback。
 *  content.json の項目は applyExperiments で差し替え済みなので、これを
 *  使うのは content.json に無い項目（予約欄の見出し）だけです。 */
export function textFor(key, fallback) {
  if (active && active.key === key && active.text) return active.text
  if (pins[key]) return pins[key]
  return fallback
}

/** テスト用。 */
export function _reset() { active = null; for (const k of Object.keys(pins)) delete pins[k] }
