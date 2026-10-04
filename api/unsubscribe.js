export const config = { runtime: 'edge' }

// 配信停止のページ（だれでも開けます）。
//
//   GET  /api/unsubscribe?e=<アドレス>&t=<署名>[&test=1]   確認のページ
//   POST /api/unsubscribe （同じ e と t）                   止める
//
// 登録完了のメールや、お知らせメールの試し送りのように1通ずつ送るメールの
// 「配信を停止する」リンクの行き先です（一斉のお知らせメールは Resend の
// 配信停止のページを使います）。署名（api/_members.js）が合うときだけ
// 止めるので、他人のアドレスを入れても止められません。
//
// 開いただけでは止めず、ボタンを押したときに止めます。メールソフトや
// ウイルス対策のソフトが、届いたメールのリンクを先に開いて確かめることが
// あり、開いただけで止まると、本人が押していないのに止まるためです。
// メールソフトの「配信停止」ボタン（List-Unsubscribe-Post: One-Click）は
// POST で来るので、そのまま止めます。

import { BRAND } from './_brand.js'
import { setting } from './_settings.js'
import { hit, digest } from './_ratelimit.js'
import { KV } from './_brand.js'
import { verifyUnsubscribe, updateMember, auditEntry, writeAudit, isEmail } from './_members.js'

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} | ${esc(BRAND.name)}</title>
<style>body{margin:0;background:#f6f4ef;color:#17171c;font-family:system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;line-height:1.8}
main{max-width:520px;margin:0 auto;padding:48px 16px}h1{font-size:20px;margin:0 0 12px}p{font-size:15px;margin:0 0 14px}
.card{background:#fff;border:1px solid #dcd8ce;border-radius:14px;padding:22px 20px}
button{font:inherit;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;border:0;background:#b42318;color:#fff;cursor:pointer}
.sub{font-size:13px;color:#5b5b66}a{color:#3d3fbf}</style></head>
<body><main><div class="card"><h1>${esc(title)}</h1>${body}</div>
<p class="sub" style="margin-top:16px">${esc(BRAND.name)}　<a href="${esc(BRAND.url)}/">${esc(BRAND.host)}</a></p></main></body></html>`
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
    },
  })
}

const BAD = () => page('リンクを確かめられませんでした',
  '<p>この配信停止のリンクは使えません（途中で切れているか、古いリンクです）。</p>' +
  `<p>お手数ですが、届いたメールにそのまま返信して「配信停止」とお知らせください。こちらで止めます。お問い合わせは <a href="${esc(BRAND.url)}/contact.html">こちら</a> からも受け付けています。</p>`, 400)

async function read(req) {
  const u = new URL(req.url)
  let e = u.searchParams.get('e') || ''
  let t = u.searchParams.get('t') || ''
  let test = u.searchParams.get('test') === '1'
  if (req.method === 'POST' && (!e || !t)) {
    const form = await req.formData().catch(() => null)
    if (form) { e = String(form.get('e') || ''); t = String(form.get('t') || ''); test = form.get('test') === '1' }
  }
  e = e.trim().toLowerCase()
  return { e, t, test, ok: isEmail(e) && (await verifyUnsubscribe(e, t)) }
}

export async function GET(req) {
  const q = await read(req)
  if (!q.ok) return BAD()
  return page('お知らせメールの配信停止',
    `<p>${esc(BRAND.name)} からのお知らせメールを止めます。よろしければ下のボタンを押してください。</p>` +
    (q.test ? '<p class="sub">これはテスト送信のメールに付いたリンクです。押しても、実際には何も止まりません。</p>' : '') +
    `<form method="post"><input type="hidden" name="e" value="${esc(q.e)}"><input type="hidden" name="t" value="${esc(q.t)}">` +
    (q.test ? '<input type="hidden" name="test" value="1">' : '') +
    '<button type="submit">配信を停止する</button></form>' +
    '<p class="sub" style="margin-top:14px">止めたあとも、会員として登録した内容（ミニゲームの会員コードなど）はそのまま使えます。</p>')
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await hit(`${KV}unsub:rl:${await digest('unsub-ip', ip)}`, 20, 3600)
  if (rl.limited) return page('しばらくお待ちください', '<p>短い時間に何度も押されました。少し時間をおいて、もう一度お試しください。</p>', 429)
  const q = await read(req)
  if (!q.ok) return BAD()
  if (q.test) {
    return page('テストのため止めていません', '<p>これはテスト送信のメールのリンクでした。実際の会員あてのメールでは、ここで配信が止まります。</p>')
  }
  const apiKey = await setting('RESEND_API_KEY')
  const r = apiKey ? await updateMember(apiKey, q.e, { unsubscribed: true }) : { ok: false, status: 0 }
  // 会員でないアドレス（すでに削除した人など）は、止めるものが無いので「止まっている」と同じ。
  if (!r.ok && r.status !== 404) {
    return page('いま止められませんでした',
      '<p>こちらの都合で、いま配信を止められませんでした。少し時間をおいてもう一度押すか、届いたメールに返信して「配信停止」とお知らせください。</p>', 502)
  }
  if (r.ok) await writeAudit(auditEntry('unsubscribe-link'))
  return page('配信を停止しました', `<p>${esc(BRAND.name)} からのお知らせメールは、今後お送りしません。</p><p class="sub">まちがえて押した場合は、もう一度会員登録をしていただくと受け取れるようになります。</p>`)
}
