export const config = { runtime: 'edge' }

// お客様が開く「見るだけの見積書」。管理キーは要りません（署名つきのリンクで開きます）。
//
//   GET ?t=<id>.<期限>.<署名>  -> 見積書（または請求書）を A4 の形で。印刷・「PDFで保存」のボタン付き
//
// 署名は SESSION_SECRET（無ければ ADMIN_KEY）で作ります（_quotes.js の signView）。
// 署名が合わない・期限を過ぎた・消された見積書は、中身を見せずに「発行元に
// ご連絡ください」とだけ出します。開いたことは見積書に記録します（初めての日・
// 最後の日・回数）。会社のメールの安全確認の仕組みが先にリンクを開くことがあり、
// その場合もお客様が開いたものとして数えます（管理画面にその旨を書いています）。

import { storeConfig } from './_analytics-store.js'
import { manageSecret } from './_booking-mail.js'
import { verifyView, recordView, loadQuoteSettings } from './_quotes.js'
import { docPage } from './_quote-core.js'

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}

function page(title, body, status) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;background:#faf9f6;color:#1b1b1f;margin:0;padding:40px 16px;line-height:1.8}` +
    `main{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e1da;border-radius:14px;padding:24px}h1{font-size:18px;margin:0 0 8px}</style></head>` +
    `<body><main><h1>${esc(title)}</h1><p>${esc(body)}</p></main></body></html>`,
    { status, headers: HEADERS },
  )
}

export async function GET(req) {
  const t = new URL(req.url).searchParams.get('t') || ''
  const cfg = storeConfig()
  if (!cfg) return page('いま表示できません', 'お手数ですが、見積書の発行元に直接ご連絡ください。', 503)
  const v = await verifyView(t, await manageSecret(req))
  if (!v.ok) {
    if (v.reason === 'expired') {
      let who = ''
      try { const s = await loadQuoteSettings(cfg); who = [s.company, s.tel, s.email].filter(Boolean).join('　') } catch (_) {}
      return page('リンクの有効期限が切れています', `お手数ですが、発行元に新しいリンクをご依頼ください。${who ? `（${who}）` : ''}`, 410)
    }
    return page('リンクが正しくありません', 'メールに書かれたリンクを、途中で切れないようにもう一度開いてください。開けないときは、見積書の発行元にご連絡ください。', 400)
  }
  let q = null
  let settings = null
  try {
    q = await recordView(cfg, v.id)
    settings = await loadQuoteSettings(cfg)
  } catch (_) {
    return page('いま表示できません', '時間をおいてもう一度開いてください。', 503)
  }
  if (!q) return page('見積書が見つかりません', '取り下げられたか、新しいものに差し替えられた可能性があります。発行元にご連絡ください。', 404)
  return new Response(docPage(q, settings, { toolbar: true }), { status: 200, headers: HEADERS })
}
