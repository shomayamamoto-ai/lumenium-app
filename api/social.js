export const config = { runtime: 'edge' }

// Posting to the networks from the admin screen.
//
//   GET                                  -> what is configured, and what went out
//   POST { text, link, imageUrl, targets } -> post, and record it
//
// Admin key only, by the header only: this spends the site's own accounts, so
// it must not be reachable by a share link or a key in a URL.

import { requireAdmin, json } from './_admin-auth.js'
import { NETWORKS, socialStatus, postTo, logPosts, recentPosts, socialActivity } from './_social.js'
import { storeConfig } from './_analytics-store.js'

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  return json({
    ok: true,
    stored: !!storeConfig(),
    networks: await socialStatus(),
    recent: await recentPosts(20),
    activity: await socialActivity(30),
  })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }

  const text = String((body && body.text) || '').trim()
  const link = String((body && body.link) || '').trim()
  const imageUrl = String((body && body.imageUrl) || '').trim()
  const targets = Array.isArray(body && body.targets) ? body.targets : []

  if (!targets.length) return json({ ok: false, message: '投稿先が選ばれていません。' }, 400)
  const unknown = targets.filter((t) => !NETWORKS.some((n) => n.id === t))
  if (unknown.length) return json({ ok: false, message: '不明な投稿先です：' + unknown.join(', ') }, 400)
  if (!text && !imageUrl) return json({ ok: false, message: '本文か画像URLのどちらかは必要です。' }, 400)
  if (text.length > 5000) return json({ ok: false, message: '本文が長すぎます。' }, 400)
  for (const u of [link, imageUrl]) {
    if (u && !/^https:\/\//i.test(u)) return json({ ok: false, message: 'URL は https:// で始まる必要があります。' }, 400)
  }

  // One at a time, and one failing does not stop the rest: four networks
  // accepting and one refusing is a normal afternoon, and the report has to
  // say which was which.
  const results = []
  for (const id of targets) {
    const net = NETWORKS.find((n) => n.id === id)
    let r
    try {
      r = await postTo(id, { text, link, imageUrl })
    } catch (e) {
      r = { ok: false, message: `${net.label}：${String((e && e.message) || e).slice(0, 200)}` }
    }
    results.push({ net: id, label: net.label, ok: !!r.ok, id: r.id || '', url: r.url || '', message: r.message || '' })
  }

  const entry = {
    at: new Date().toISOString(),
    text: text.slice(0, 400),
    link, imageUrl,
    results,
  }
  const kept = await logPosts(entry)

  const okCount = results.filter((r) => r.ok).length
  return json({
    ok: okCount > 0,
    posted: okCount,
    total: results.length,
    kept,
    results,
    recent: await recentPosts(20),
    activity: await socialActivity(30),
    message: okCount === results.length
      ? `${okCount} 件すべてに投稿しました。`
      : okCount
        ? `${okCount}/${results.length} 件に投稿しました。残りは下の理由をご覧ください。`
        : '投稿できませんでした。理由を下に出しています。',
  }, okCount ? 200 : 502)
}
