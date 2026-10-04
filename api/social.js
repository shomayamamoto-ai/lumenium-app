export const config = { runtime: 'edge' }

// Posting to the networks from the admin screen.
//
//   GET                       -> what is configured, what went out, what is booked
//   GET ?quota=1              -> LINE's monthly allowance and audience, IG/Threads daily room
//   POST { action:'post', ... }      -> post now, to every target at once, and record it
//   POST { action:'schedule', date } -> keep the same payload for that morning's run
//   POST { action:'cancel', id }     -> drop a booked post
//   POST { action:'test', net }      -> a cheap read with the stored keys (nothing is posted)
//   POST { action:'refresh-threads' }-> extend the Threads token, saved where it was
//   POST { action:'metrics', id }    -> likes / comments / reach for one history entry
//
// Admin key only, by the header only: this spends the site's own accounts, so
// it must not be reachable by a share link or a key in a URL.

import { requireAdmin, json } from './_admin-auth.js'
import {
  NETWORKS, socialStatus, readPayload, precheck, sendPost, recentPosts, socialActivity,
  historyStored, socialQuotas, testNetwork, refreshThreadsToken, fetchMetrics, threadsTokenInfo,
} from './_social.js'
import { SCHEDULE, scheduleReady, addScheduled, listScheduled, cancelScheduled, summarize } from './_social-queue.js'
import { setting } from './_settings.js'
import { BRAND } from './_brand.js'

async function state(req) {
  const ready = scheduleReady()
  const networks = await socialStatus(req)
  return {
    stored: await historyStored(req),
    networks,
    recent: await recentPosts(20, req),
    activity: await socialActivity(30, req),
    brand: { name: BRAND.name, host: BRAND.host, url: BRAND.url },
    schedule: {
      ready: ready.ok, message: ready.ok ? '' : ready.message, code: ready.code || '',
      jstHour: SCHEDULE.jstHour,
      items: ready.ok || ready.code === 'NO_CRON_SECRET' ? (await listScheduled()).map(summarize) : [],
    },
    upload: { ready: !!(await setting('BLOB_READ_WRITE_TOKEN', '', req)) },
    threadsToken: networks.some((n) => n.id === 'threads' && n.ready) ? await threadsTokenInfo(req) : null,
  }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  if (new URL(req.url).searchParams.get('quota')) {
    return json({ ok: true, quotas: await socialQuotas(req) })
  }
  return json({ ok: true, ...(await state(req)) })
}

function outcome(results) {
  const ok = results.filter((r) => r.ok).length
  const unknown = results.filter((r) => r.unknown).length
  const total = results.length
  if (ok === total) return `${ok} 件すべてに投稿しました。`
  const parts = []
  if (ok) parts.push(`${ok}/${total} 件に投稿しました`)
  if (unknown) parts.push(`${unknown} 件は結果が分かりません（各SNSで確認してください）`)
  const failed = total - ok - unknown
  if (failed) parts.push(`${failed} 件は投稿できませんでした`)
  return parts.join('。') + '。理由は下に出しています。'
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  const action = String((body && body.action) || 'post')

  if (action === 'test') {
    if (!NETWORKS.some((n) => n.id === body.net)) return json({ ok: false, message: '不明な投稿先です。' }, 400)
    return json({ net: body.net, ...(await testNetwork(body.net, req)) })
  }
  if (action === 'refresh-threads') {
    const r = await refreshThreadsToken(req)
    return json({ ...r, token: await threadsTokenInfo(req) }, r.ok ? 200 : 400)
  }
  if (action === 'metrics') {
    const r = await fetchMetrics(String(body.id || ''), req)
    return json({ ...r, recent: await recentPosts(20, req) }, r.ok ? 200 : 400)
  }
  if (action === 'cancel') {
    const r = await cancelScheduled(body.id)
    return json({ ...r, items: (await listScheduled()).map(summarize) }, r.ok ? 200 : 404)
  }

  const read = readPayload(body)
  if (!read.ok) return json(read, 400)
  const payload = read.payload
  const problems = precheck(payload)
  if (problems.length) {
    return json({ ok: false, code: 'CHECK', problems, message: '送る前の確認で止めました（どこにも送っていません）：' + problems.join(' / ') }, 400)
  }

  if (action === 'schedule') {
    // The morning run has no browser: a key kept only in this one would be
    // missing at 9 a.m., and the post would fail with nobody watching.
    const nets = await socialStatus(req)
    const blind = payload.targets.filter((t) => { const n = nets.find((x) => x.id === t); return n && n.ready && !n.scheduled })
    if (blind.length) {
      const names = blind.map((t) => nets.find((n) => n.id === t).label).join('・')
      return json({ ok: false, message: `${names} の鍵がこの端末のブラウザにだけ保存されているため、予約投稿では使えません。保存先（Upstash Redis）を Vercel に接続してから鍵を貼り直すか、今すぐ投稿してください。` }, 400)
    }
    const r = await addScheduled(String(body.date || ''), payload)
    if (!r.ok) return json(r, 400)
    return json({
      ok: true, scheduled: summarize(r.item), items: (await listScheduled()).map(summarize),
      message: `${r.item.date} の朝${SCHEDULE.jstHour}時ごろに投稿するよう予約しました。`,
    })
  }

  if (action !== 'post') return json({ ok: false, message: '不明な操作です。' }, 400)

  const { results, kept } = await sendPost(payload, req)
  const okCount = results.filter((r) => r.ok).length
  return json({
    ok: okCount > 0,
    posted: okCount,
    total: results.length,
    kept,
    results,
    recent: await recentPosts(20, req),
    activity: await socialActivity(30, req),
    message: outcome(results),
  }, okCount ? 200 : 502)
}
