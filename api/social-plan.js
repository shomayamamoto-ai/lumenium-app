export const config = { runtime: 'edge' }

// SNS（文章）の「運用プラン」。
//
//   GET                        -> 保存したプラン（柱・ペースの目標）と、計算の材料
//                                 （投稿の記録・予約・投稿ごとの成果・LINE の人数）
//   PUT { plan }               -> プランを丸ごと保存
//   PUT { tag: { id, pillar } } -> 投稿・予約に、あとから柱を付ける（外す）
//
// 計算そのもの（割合・ペース・今週やること・振り返り）は画面がします。
// 画面とサーバーで同じ _social-plan-core.js を使うので、数え方は1つです。
//
// Admin key only, by the header only.

import { requireAdmin, json } from './_admin-auth.js'
import { recentPosts, socialQuotas, socialStatus, historyStored } from './_social.js'
import { listScheduled } from './_social-queue.js'
import { socialInsights } from './_social-insights.js'
import { jstDate } from './_analytics-store.js'
import { readPlan, savePlan, tagPost, compactPost, compactQueued, noteLineFollowers } from './_social-plan.js'

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const today = jstDate()
  const [plan, posts, queue, nets, stored] = await Promise.all([
    readPlan(req), recentPosts(200, req), listScheduled(), socialStatus(req), historyStored(req),
  ])
  const lineOn = nets.some((n) => n.id === 'line' && n.ready)
  const [insights, quotas] = await Promise.all([
    socialInsights(posts, req).catch(() => null),
    lineOn ? socialQuotas(req).catch(() => ({})) : Promise.resolve({}),
  ])
  const line = quotas && quotas.line ? quotas.line : null
  return json({
    ok: true, today, stored, plan,
    networks: nets.map((n) => ({ id: n.id, label: n.label, ready: !!n.ready })),
    posts: posts.map((p) => compactPost(p, insights && insights.results)),
    queue: queue.map(compactQueued),
    recommend: (insights && insights.recommend) || {},
    line: line ? { ...line, trend: await noteLineFollowers(line, today, req) } : null,
  })
}

export async function PUT(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  if (body && body.tag && typeof body.tag === 'object') {
    const r = await tagPost(body.tag.id, body.tag.pillar, req)
    return json({ ...r, message: r.ok ? '柱を付けました。' : r.message }, r.ok ? 200 : 400)
  }
  if (body && body.plan && typeof body.plan === 'object') {
    const r = await savePlan(body.plan, req)
    return json({ ...r, message: r.ok ? 'プランを保存しました。' + (r.problems.length ? '（' + r.problems.join(' ') + '）' : '') : r.message }, r.ok ? 200 : 400)
  }
  return json({ ok: false, message: '保存するものがありません。' }, 400)
}
