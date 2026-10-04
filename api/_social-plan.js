// SNS（文章）の「運用プラン」を保存する場所と、画面に渡すものをまとめる処理。
//
//   ${KV}social:plan       … { pillars, targets, tags }（_social-plan-core.js の validatePlan の形）
//   ${KV}social:plan:line  … LINE の友だちの人数を1日1回メモしたもの { 日付: {followers, reach} }
//
// 計算は _social-plan-core.js（画面と同じもの）がします。ここは読み書きと、
// 投稿の記録を画面向けに小さくすることだけです。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeFor, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { validatePlan, cleanPillarId } from './_social-plan-core.js'

export const PLAN_KEY = `${KV}social:plan`
export const LINE_KEY = `${KV}social:plan:line`
const LINE_KEEP = 120

const NO_STORE = '保存先（Upstash Redis）が未接続のため保存できません。設定状況から保存先をつないでください。'

export async function readPlan(req) {
  const cfg = await storeFor(req)
  if (!cfg) return validatePlan({}).plan
  try {
    const [raw] = await pipeline(cfg, [['GET', PLAN_KEY]])
    return validatePlan(raw ? JSON.parse(raw) : {}).plan
  } catch (_) { return validatePlan({}).plan }
}

export async function savePlan(input, req) {
  const { plan, problems } = validatePlan(input)
  const cfg = await storeFor(req)
  if (!cfg) return { ok: false, message: NO_STORE, plan, problems }
  try {
    await pipeline(cfg, [['SET', PLAN_KEY, JSON.stringify(plan)]])
    return { ok: true, plan, problems }
  } catch (_) { return { ok: false, message: '保存できませんでした。時間をおいてもう一度お試しください。', plan, problems } }
}

/** あとから柱を付ける（付け忘れた投稿・予約に）。pillar が空なら外します。 */
export async function tagPost(id, pillar, req) {
  const key = String(id || '')
  if (!/^[a-z0-9:.-]{1,60}$/i.test(key)) return { ok: false, message: '投稿の指定が正しくありません。' }
  const plan = await readPlan(req)
  const p = cleanPillarId(pillar)
  if (p && !plan.pillars.some((x) => x.id === p)) return { ok: false, message: 'その柱は見つかりませんでした。' }
  if (p) plan.tags[key] = p
  else delete plan.tags[key]
  return savePlan(plan, req)
}

/** 投稿の記録（recentPosts）を、画面で使う分だけに小さくします。 */
export function compactPost(p, outcomes) {
  const ok = (p.results || []).filter((r) => r.ok)
  const urls = {}
  let reactions = null
  let saves = null
  for (const r of ok) {
    if (r.url) urls[r.net] = r.url
    const m = r.metrics
    if (m && m.ok) {
      reactions = (reactions || 0) + (Number(m.likes) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0)
      const s = Number(m.saved != null ? m.saved : m.saves)
      if (isFinite(s)) saves = (saves || 0) + s
    }
  }
  const o = outcomes && outcomes[p.id || p.at]
  let visits = null
  let inquiries = null
  const byNet = {}
  if (o && typeof o === 'object') {
    visits = 0
    inquiries = 0
    for (const [net, v] of Object.entries(o)) {
      byNet[net] = { visits: Number(v.visits) || 0, inquiries: Number(v.inquiries) || 0 }
      visits += byNet[net].visits
      inquiries += byNet[net].inquiries
    }
  }
  return {
    id: p.id || p.at, at: p.at, scheduledFor: p.scheduledFor || '',
    text: String(p.text || '').slice(0, 120),
    pillar: cleanPillarId(p.pillar),
    nets: ok.map((r) => r.net), urls, reactions, saves,
    outcome: o ? { visits, inquiries, byNet } : null,
  }
}

export function compactQueued(item) {
  const p = item.payload || {}
  return { id: item.id, date: item.date, text: String(p.text || '').slice(0, 120), targets: p.targets || [], pillar: cleanPillarId(p.pillar) }
}

/** LINE の友だちの人数を、その日の分だけメモします（増え方を見るため）。 */
export async function noteLineFollowers(q, today, req) {
  const cfg = await storeFor(req)
  if (!cfg) return []
  try {
    const cmds = []
    if (q && q.ok && q.followers != null) {
      cmds.push(['HSET', LINE_KEY, today, JSON.stringify({ followers: Number(q.followers) || 0, reach: q.reach == null ? null : Number(q.reach) || 0 })])
    }
    cmds.push(['HGETALL', LINE_KEY])
    const res = await pipeline(cfg, cmds)
    const flat = Array.isArray(res[res.length - 1]) ? res[res.length - 1] : []
    const rows = []
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try { rows.push({ date: flat[i], ...JSON.parse(flat[i + 1]) }) } catch (_) {}
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : 1))
    if (rows.length > LINE_KEEP) {
      const drop = rows.splice(0, rows.length - LINE_KEEP).map((r) => r.date)
      await pipeline(cfg, [['HDEL', LINE_KEY, ...drop]])
    }
    return rows
  } catch (_) { return [] }
}
