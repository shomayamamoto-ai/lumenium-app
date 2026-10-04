export const config = { runtime: 'edge' }

// Posting to the networks from the admin screen.
//
//   GET                       -> what is configured, what went out, what is booked
//   GET ?quota=1              -> LINE's monthly allowance and audience, IG/Threads daily room
//   GET ?insights=1           -> visits / enquiries each post brought (ref tag, 7 days)

//   POST { action:'post', ... }      -> post now, to every target at once, and record it
//   POST { action:'schedule', date } -> keep the same payload for that morning's run
//   POST { action:'cancel', id }     -> drop a booked post
//   POST { action:'test', net }      -> a cheap read with the stored keys (nothing is posted)
//   POST { action:'refresh-threads' }-> extend the Threads token, saved where it was
//   POST { action:'metrics', id }    -> likes / comments / reach for one history entry
//   POST { action:'gbp-locations' }  -> the Business Profile locations the linked account manages
//   POST { action:'gbp-pick', location } -> save which location GBP posts go to
//   PUT  { style }                   -> the site's own wording rules (NG words, notation)
//   PUT  { prefs }                   -> { xAutoMetrics } for the daily reaction refresh
//   PUT  { templates }               -> the saved post templates (whole list)
//   PUT  { links }                   -> the profile link page (/links): title, note, latest, items
//   POST { action:'approval-create', ...payload, date?, note? } -> save as 承認待ち, return a one-time link
//   POST { action:'approval-send', id }            -> post an approved draft now
//   POST { action:'approval-schedule', id, date }  -> book an approved draft
//   POST { action:'approval-delete', id }          -> withdraw / clear from the list



//
// Admin key only, by the header only: this spends the site's own accounts, so
// it must not be reachable by a share link or a key in a URL.

import { requireAdmin, json } from './_admin-auth.js'
import {
  NETWORKS, socialStatus, readPayload, precheck, sendPost, recentPosts, socialActivity,
  historyStored, socialQuotas, testNetwork, refreshThreadsToken, fetchMetrics, threadsTokenInfo,
} from './_social.js'
import { SCHEDULE, scheduleReady, addScheduled, listScheduled, cancelScheduled, summarize } from './_social-queue.js'
import { setting, saveSetting } from './_settings.js'
import { BRAND } from './_brand.js'
import { readStyle, saveStyle, readPrefs, savePrefs, readTemplates, saveTemplates, readLinks, saveLinks } from './_social-store.js'
import { gbpLocations, LOCATION_RE } from './_social-more.js'
import { socialInsights } from './_social-insights.js'
import { createApproval, listApprovals, getApproval, markApproval, removeApproval, approvalUrl, APPROVE_DAYS } from './_social-approve.js'

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
    style: await readStyle(req),
    prefs: await readPrefs(req),
    templates: await readTemplates(req),
    links: await readLinks(req),
    approvals: await listApprovals(),
  }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  if (new URL(req.url).searchParams.get('quota')) {
    return json({ ok: true, quotas: await socialQuotas(req) })
  }
  // 投稿ごとの成果（と、いつ出すと良いか）。履歴より重いので別に読みます。
  if (new URL(req.url).searchParams.get('insights')) {
    return json(await socialInsights(await recentPosts(200, req), req))
  }
  return json({ ok: true, ...(await state(req)) })
}

/** Saving the site's own rules. Only what validateStyle keeps is stored, and
 *  what it dropped is said back, so a line that vanished is not a mystery. */
export async function PUT(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  if (body && body.style && typeof body.style === 'object') {
    const r = await saveStyle(body.style, req)
    return json({ ...r, message: r.ok ? '決まりを保存しました。' + (r.problems.length ? '（' + r.problems.join(' ') + '）' : '') : r.message }, r.ok ? 200 : 400)
  }
  if (body && Array.isArray(body.templates)) {
    const r = await saveTemplates(body.templates, req)
    return json({ ...r, message: r.ok ? '定型文を保存しました。' + (r.problems.length ? '（' + r.problems.join(' ') + '）' : '') : r.message }, r.ok ? 200 : 400)
  }
  // プロフィールのリンク集（/links）の一覧。
  if (body && body.links && typeof body.links === 'object') {
    const r = await saveLinks(body.links, req)
    return json({ ...r, message: r.ok ? 'リンク集を保存しました（数分で /links に出ます）。' + (r.problems.length ? '（' + r.problems.join(' ') + '）' : '') : r.message }, r.ok ? 200 : 400)
  }
  if (body && body.prefs && typeof body.prefs === 'object') {
    const r = await savePrefs(body.prefs, req)
    return json({ ...r, message: r.ok ? '設定を保存しました。' : r.message }, r.ok ? 200 : 400)
  }
  return json({ ok: false, message: '保存するものがありません。' }, 400)
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
  // Googleビジネスプロフィール：連携したアカウントの店舗の一覧と、投稿する店舗の保存。
  if (action === 'gbp-locations') {
    const r = await gbpLocations(req)
    return json(r, r.ok ? 200 : 400)
  }
  if (action === 'gbp-pick') {
    const loc = String(body.location || '')
    if (!LOCATION_RE.test(loc)) return json({ ok: false, message: '店舗の指定が正しくありません。' }, 400)
    const r = await saveSetting('GBP_LOCATION', loc, req)
    if (!r.ok) return json({ ok: false, message: r.message === 'NO_STORE' ? '保存先（Upstash Redis）が未接続のため保存できません。Vercel の環境変数 GBP_LOCATION に「' + loc + '」を入れてください。' : r.message }, 400)
    return json({ ok: true, message: '投稿する店舗を保存しました。', networks: await socialStatus(req) })
  }
  /* ---- 承認の流れ ---- */
  if (action === 'approval-delete') {
    const gone = await removeApproval(String(body.id || ''))
    return json({ ok: gone, message: gone ? '承認の記録から消しました（リンクも使えなくなりました）。' : 'その記録は見つかりませんでした。', approvals: await listApprovals() }, gone ? 200 : 404)
  }
  if (action === 'approval-send' || action === 'approval-schedule') {
    const item = await getApproval(String(body.id || ''))
    if (!item) return json({ ok: false, message: 'その記録は見つかりませんでした。', approvals: await listApprovals() }, 404)
    if (item.status !== 'approved') return json({ ok: false, message: '承認済みのものだけ、ここから出せます（いまは「' + item.status + '」）。', approvals: await listApprovals() }, 400)
    // 承認された中身そのままを出します（画面で書き換えたものではなく）。
    const nets = await socialStatus(req)
    const targets = item.payload.targets.filter((t) => { const n = nets.find((x) => x.id === t); return n && n.ready && (action === 'approval-send' || n.scheduled) })
    if (!targets.length) return json({ ok: false, message: 'ここから送れる投稿先がありません（つないでいないSNSは、編集に戻してコピーで投稿してください）。', approvals: await listApprovals() }, 400)
    const payload = { ...item.payload, targets }
    const problems = precheck(payload)
    if (problems.length) return json({ ok: false, code: 'CHECK', problems, message: '送る前の確認で止めました：' + problems.join(' / '), approvals: await listApprovals() }, 400)
    if (action === 'approval-schedule') {
      const r = await addScheduled(String(body.date || ''), payload)
      if (!r.ok) return json({ ...r, approvals: await listApprovals() }, 400)
      await markApproval(item.id, { status: 'scheduled', scheduledId: r.item.id, date: r.item.date, error: '' })
      return json({ ok: true, message: `${r.item.date} の朝${SCHEDULE.jstHour}時ごろに投稿するよう予約しました。`, items: (await listScheduled()).map(summarize), approvals: await listApprovals() })
    }
    const { results, kept } = await sendPost(payload, req)
    const okCount = results.filter((r) => r.ok).length
    if (okCount) await markApproval(item.id, { status: 'done', postedAt: new Date().toISOString(), error: '' })
    return json({
      ok: okCount > 0, posted: okCount, total: results.length, kept, results,
      recent: await recentPosts(20, req), approvals: await listApprovals(), message: outcome(results),
    }, okCount ? 200 : 502)
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

  if (action === 'approval-create') {
    const r = await createApproval(payload, { date: String(body.date || ''), note: String(body.note || '') })
    if (!r.ok) return json(r, 400)
    return json({
      ok: true, link: approvalUrl(BRAND.url, r.token), days: APPROVE_DAYS, approvals: await listApprovals(),
      message: `承認待ちとして保存しました。下のリンクを責任者に送ってください（${APPROVE_DAYS}日間・1回だけ使えます。このリンクは、いまだけ表示されます）。`,
    })
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
