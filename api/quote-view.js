export const config = { runtime: 'edge' }

// お客様が開く「見るだけの見積書」。管理キーは要りません（署名つきのリンクで開きます）。
//
//   GET ?t=<id>.<期限>.<署名>  -> 見積書（または請求書）を A4 の形で。印刷・「PDFで保存」のボタン付き
//   POST { t, name }           -> 見積書を「この内容で発注します」（お客様の承諾。受注になります）
//
// 署名は SESSION_SECRET（無ければ ADMIN_KEY）で作ります（_quotes.js の signView）。
// 署名が合わない・期限を過ぎた・消された見積書は、中身を見せずに「発行元に
// ご連絡ください」とだけ出します。開いたことは見積書に記録します（初めての日・
// 最後の日・回数）。会社のメールの安全確認の仕組みが先にリンクを開くことがあり、
// その場合もお客様が開いたものとして数えます（管理画面にその旨を書いています）。

import { storeConfig } from './_analytics-store.js'
import { manageSecret } from './_booking-mail.js'
import { verifyView, recordView, loadQuoteSettings, acceptByCustomer } from './_quotes.js'
import { docPage, canAccept, jstToday, jpDate } from './_quote-core.js'
import { hit } from './_ratelimit.js'
import { KV } from './_brand.js'

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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
  return new Response(docPage(q, settings, { toolbar: true, extra: acceptBox(q, t) }), { status: 200, headers: HEADERS })
}

const escH = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** 見積書の上に出す「この内容で発注します」の欄（印刷には出ません）。 */
function acceptBox(q, token) {
  const wrap = (inner) => '<div class="qd-noprint" style="max-width:210mm;margin:12px auto 0;padding:0 12px;font-family:system-ui,sans-serif">' +
    '<div style="background:#fff;border:1px solid #d9d6cf;border-radius:14px;padding:14px 16px;font-size:14px;line-height:1.7">' + inner + '</div></div>'
  if ((q.kind || 'quote') !== 'quote') return ''
  if (q.acceptedAt || q.status === 'won') {
    return wrap('<b style="color:#047857">ご発注を承りました</b>' + (q.acceptedAt ? `（${escH(jpDate(String(q.acceptedAt).slice(0, 10)))}）` : '') + '。ありがとうございます。担当より、このあとのご案内をお送りします。')
  }
  const c = canAccept(q, jstToday())
  if (!c.ok) return c.reason === 'expired' ? wrap('この見積書は有効期限を過ぎています。ご発注をご希望の場合は、発行元に新しい見積書をご依頼ください。') : ''
  return wrap(
    '<b>この内容でよろしければ、ここからご発注いただけます。</b>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px">' +
    '<label for="qa-name" style="font-size:13px;color:#55555e">ご担当者のお名前</label>' +
    '<input id="qa-name" maxlength="40" autocomplete="name" style="flex:1 1 180px;min-width:0;font:inherit;padding:9px 11px;border:1px solid #c9c5bc;border-radius:10px">' +
    '<button type="button" id="qa-go" style="font:inherit;font-weight:700;padding:10px 18px;border-radius:10px;border:0;background:#3d3fbf;color:#fff;cursor:pointer">この内容で発注します</button></div>' +
    '<p id="qa-msg" role="status" style="margin:8px 0 0;font-size:13px;color:#55555e">押すと、発行元に「発注」として届きます。内容を変えたいときは、押さずに発行元へご連絡ください。</p>' +
    '<script>(function(){var b=document.getElementById("qa-go"),n=document.getElementById("qa-name"),m=document.getElementById("qa-msg");' +
    'b.addEventListener("click",function(){var v=n.value.trim();if(!v){m.textContent="ご担当者のお名前を入れてください。";n.focus();return;}' +
    'if(!confirm("この見積書の内容で発注します。よろしいですか？"))return;b.disabled=true;m.textContent="送っています…";' +
    'fetch("/api/quote-view",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:' + JSON.stringify(token) + ',name:v})})' +
    '.then(function(r){return r.json();}).then(function(d){if(d&&d.ok){location.reload();return;}b.disabled=false;m.textContent=(d&&d.message)||"送れませんでした。発行元に直接ご連絡ください。";})' +
    '.catch(function(){b.disabled=false;m.textContent="送れませんでした。通信の状態をお確かめください。";});});})();</script>',
  )
}

export async function POST(req) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  let b
  try { b = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: 'いま受け付けられません。発行元に直接ご連絡ください。' }, 503)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await hit(`${KV}quote:acc:${ip}`, 6, 15 * 60)
  if (rl.limited) return json({ ok: false, message: '操作が続いています。しばらくおいてからお試しください。' }, 429)
  const v = await verifyView(String((b && b.t) || ''), await manageSecret(req))
  if (!v.ok) return json({ ok: false, message: v.reason === 'expired' ? 'リンクの有効期限が切れています。発行元に新しいリンクをご依頼ください。' : 'リンクが正しくありません。' }, 400)
  const name = String((b && b.name) || '').trim().slice(0, 40)
  if (!name) return json({ ok: false, message: 'ご担当者のお名前を入れてください。' }, 400)
  const r = await acceptByCustomer(req, cfg, v.id, name)
  if (!r.ok) {
    const m = { done: 'この見積書は、すでにご発注を承っています。', expired: '有効期限を過ぎています。発行元に新しい見積書をご依頼ください。', lost: 'この見積書は取り下げられています。発行元にご連絡ください。', kind: 'この書類からは発注できません。' }
    return json({ ok: false, message: m[r.reason] || r.message || '受け付けられませんでした。' }, 409)
  }
  return json({ ok: true })
}
