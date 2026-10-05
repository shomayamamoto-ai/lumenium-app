export const config = { runtime: 'edge' }

// 口コミ管理（Googleレビュー）の窓口。中身は _reviews.js と _reviews-core.js。
//
//   GET                         -> つながり・口コミの控え・設定・AIの今月の額・お願いメールの状態
//   GET ?view=badge             -> 未返信の数（タブとポータルの印）
//   GET ?optout=<署名つきの値>   -> お願いメールの配信停止（お客様が押すリンク。管理キーは要りません）
//   POST { action:'sync', full? }            -> Google から読み直す
//   POST { action:'reply', id, text }        -> 返信を出す・直す
//   POST { action:'reply-delete', id }       -> 返信を消す
//   POST { action:'draft', id }              -> AIの返信の下書き（出しはしません）
//   POST { action:'prefs', prefs }           -> 口調・署名・店名・お願いメールなどの設定
//   POST { action:'locations' }              -> 連携したアカウントの店舗の一覧
//   POST { action:'request-send', id }       -> 来店済みの予約1件に、お願いのメールを送る
//
// 管理キーはヘッダーでだけ受けます（お店のアカウントで返信を出せるため）。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import { setting } from './_settings.js'
import { BRAND } from './_brand.js'
import { sandboxFrom, manageSecret } from './_booking-mail.js'
import {
  readPrefs, savePrefs, readMeta, readItems, locationsFor, connection, syncReviews, setReply, draftReply, aiStatus,
  requestCandidates, requestLog, sendRequest, linkFor, checkOptout, recordOptout, gbpLocations, pub,
} from './_reviews.js'
import { REPLY_MAX_BYTES, REQUEST_GAP_DAYS, REQUEST_MAX_AGE_DAYS } from './_reviews-core.js'

function page(title, body, status = 200) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>${esc(title)} | ${esc(BRAND.name)}</title><style>body{font-family:system-ui,sans-serif;background:#faf9f6;color:#1b1b1f;margin:0;padding:40px 16px;line-height:1.8}` +
    `main{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e1da;border-radius:14px;padding:24px}h1{font-size:18px;margin:0 0 8px}</style></head>` +
    `<body><main><h1>${esc(title)}</h1><p>${esc(body)}</p><p><a href="${esc(BRAND.url)}">${esc(BRAND.name)}</a></p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  )
}

async function state(req) {
  const cfg = storeConfig()
  const prefs = await readPrefs(cfg)
  const meta = await readMeta(cfg)
  const locs = await locationsFor(prefs, req)
  const [conn, reviews, ai, candidates, log, address] = await Promise.all([
    connection(req, prefs, meta), readItems(cfg, locs), aiStatus(req, prefs),
    requestCandidates(req, prefs, meta), requestLog(cfg), setting('MAIL_SENDER_ADDRESS', '', req),
  ])
  return {
    ok: true,
    stored: !!cfg,
    connection: conn,
    locations: locs.map((l) => ({ name: l, ...(meta.locs[l] || {}) })),
    lastSync: meta.lastSync || '',
    reviews,
    prefs,
    ai,
    limits: { replyBytes: REPLY_MAX_BYTES, gapDays: REQUEST_GAP_DAYS, maxAgeDays: REQUEST_MAX_AGE_DAYS },
    requests: {
      mode: prefs.requests,
      link: linkFor(prefs, meta),
      address: !!address,
      sandbox: sandboxFrom(),
      mail: !!(await setting('RESEND_API_KEY', '', req)),
      candidates: candidates.map(pub),
      log,
    },
  }
}

export async function GET(req) {
  const url = new URL(req.url)
  // お客様が押す配信停止のリンク。署名が合えば記録します（管理キーは要りません）。
  const opt = url.searchParams.get('optout')
  if (opt !== null) {
    const hash = await checkOptout(opt, await manageSecret(req))
    if (!hash) return page('リンクが正しくありません', 'お手数ですが、メールに書かれた店舗まで直接ご連絡ください。', 400)
    const ok = await recordOptout(hash)
    return ok
      ? page('配信を停止しました', '今後、口コミのお願いのメールはお送りしません。ご利用ありがとうございました。')
      : page('いま停止できませんでした', '時間をおいてもう一度開くか、店舗まで直接ご連絡ください。', 503)
  }
  const denied = await requireAdmin(req)
  if (denied) return denied
  if (url.searchParams.get('view') === 'badge') {
    const meta = await readMeta()
    return json({ ok: true, unreplied: meta.unreplied || 0 })
  }
  return json(await state(req))
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  const action = String((body && body.action) || '')
  if (!storeConfig() && action !== 'locations') return json({ ok: false, message: '保存先（Upstash Redis）が無いため使えません。「設定状況」で保存先をつないでください。' }, 503)

  if (action === 'sync') {
    const r = await syncReviews(req, { full: !!body.full })
    return json({ ...r, ...(await state(req)), ok: r.ok, message: r.message }, r.ok ? 200 : r.code === 'busy' ? 409 : 400)
  }
  if (action === 'reply' || action === 'reply-delete') {
    const r = await setReply(req, String(body.id || ''), action === 'reply' ? String(body.text || '') : null)
    return json({ ok: r.ok, item: r.item, unreplied: r.unreplied, unknown: r.unknown, message: r.message }, r.ok ? 200 : 400)
  }
  if (action === 'draft') {
    const r = await draftReply(req, String(body.id || ''))
    return json(r, r.ok ? 200 : r.status || 400)
  }
  if (action === 'prefs') {
    const r = await savePrefs(body.prefs || {})
    return json({ ...r, message: r.ok ? '設定を保存しました。' : r.message, ...(r.ok ? { ai: await aiStatus(req, r.prefs) } : {}) }, r.ok ? 200 : 400)
  }
  if (action === 'locations') {
    const r = await gbpLocations(req)
    return json(r, r.ok ? 200 : 400)
  }
  if (action === 'request-send') {
    const r = await sendRequest(req, String(body.id || ''))
    return json(r, r.ok ? 200 : 400)
  }
  return json({ ok: false, message: '知らない操作です。' }, 400)
}
