export const config = { runtime: 'edge' }

// 責任者が開く承認ページ（管理画面の鍵は要りません）。
//
//   GET  ?t=<リンクの文字列>            … SNS ごとの見え方と、投稿前チェックの結果
//   POST t, decision=approve|return, comment … 承認 / 差し戻し（押したらリンクは消えます）
//
// 画面は JavaScript を使わない、ふつうのフォームです。スマホのメールや LINE から
// 開かれることが多いので、どこで開いても同じように動くことを優先しました。
// リンクの扱い（ハッシュだけ保存・7日・1回きり）は _social-approve.js にあります。

import { BRAND } from './_brand.js'
import { NETWORKS } from './_social.js'
import { compose, check, review, foldCheck, findUrls, REVIEW_NOTE } from './_social-text.js'
import { readStyle } from './_social-store.js'
import { openApproval, decideApproval } from './_social-approve.js'
import { SCHEDULE } from './_social-queue.js'

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  // リンクの文字列が、画像の読み込み先などに「紹介元」として漏れないように。
  'Referrer-Policy': 'no-referrer',
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/brand.css">
<style>
  body { margin: 0; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 28px 16px 48px; }
  h1 { font-size: 22px !important; margin: 0 0 8px; }
  .lead { font-size: 14px; line-height: 1.9; margin: 0 0 16px; }
  .box { background: var(--card); border: 1px solid var(--hair); border-radius: 14px; padding: 14px 16px; margin: 12px 0; }
  .net { font-size: 14px; font-weight: 700; color: var(--ink); display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .cnt { font-size: 12px; font-weight: 500; color: var(--ink-mute); }
  .tx { white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.85; color: var(--ink); background: #fff; border: 1px solid var(--hair); border-radius: 10px; padding: 10px 12px; margin: 8px 0; }
  .fold { display: block; border-top: 1px dashed #b45309; color: #b45309; font-size: 12px; font-weight: 700; margin: 4px 0; padding-top: 3px; }
  .rest { color: #8a8a94; }
  .u { color: var(--accent); }
  ul.is { margin: 6px 0 0; padding: 0; list-style: none; }
  ul.is li { font-size: 13px; line-height: 1.75; padding: 2px 0; }
  ul.is li::before { content: none !important; }
  .err { color: #b42318 !important; }
  .warn { color: #92400e !important; }
  .imgs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .imgs img { width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid var(--hair); }
  textarea { width: 100%; box-sizing: border-box; min-height: 90px; font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid var(--hair); border-radius: 10px; background: #fff; color: var(--ink); }
  .btns { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
  button { font: inherit; font-size: 15px; font-weight: 700; padding: 12px 22px; border-radius: 999px; border: 1px solid var(--accent); cursor: pointer; }
  button.ok { background: var(--accent); color: #fff; }
  button.ng { background: #fff; color: var(--accent); }
  .small { font-size: 12px; color: var(--ink-mute); line-height: 1.8; }
</style>
</head>
<body><main class="wrap">${body}</main></body>
</html>`
}

function hl(text) {
  const s = String(text || '')
  let out = '', at = 0
  for (const u of findUrls(s)) { out += esc(s.slice(at, u.start)) + '<span class="u">' + esc(u.url) + '</span>'; at = u.end }
  return out + esc(s.slice(at))
}

function netBlock(id, payload, style) {
  const n = NETWORKS.find((x) => x.id === id)
  const c = compose(id, payload, BRAND.host)
  const k = check(id, c)
  const f = foldCheck(id, c.text)
  const rv = review(c.text, id, style).filter((x) => x.level === 'warn')
  const texts = c.parts && c.parts.length > 1 ? c.parts : [c.text]
  const shown = texts.map((t, i) => {
    let inner = hl(t)
    if (texts.length === 1 && f.at >= 0 && !f.notice) inner = hl(t.slice(0, f.at)) + `<span class="fold">${esc(f.label)}（ここから先は押した人だけに見えます・目安）</span><span class="rest">${hl(t.slice(f.at))}</span>`
    return `<div class="tx">${texts.length > 1 ? `<span class="small">${i + 1}/${texts.length} 件目</span>\n` : ''}${inner}</div>`
  }).join('')
  const issues = [
    ...k.errors.map((e) => `<li class="err">✗ ${esc(e)}</li>`),
    ...k.warnings.concat(f.warnings).map((w) => `<li class="warn">⚠ ${esc(w)}</li>`),
    ...rv.map((r) => `<li class="warn">⚠ ${esc(r.label)}：「${esc(r.word)}」${r.why ? ' — ' + esc(r.why) : ''}${r.alt ? '（言い換え例：' + esc(r.alt) + '）' : ''}</li>`),
  ]
  const imgs = c.images.length ? `<div class="imgs">${c.images.map((i) => /^https:\/\//.test(i.url) ? `<img src="${esc(i.url)}" alt="${esc(i.alt || '')}">` : '').join('')}</div>` : ''
  return `<div class="box"><div class="net">${esc(n ? n.label : id)} <span class="cnt">${k.count} / ${k.limit} 文字${texts.length > 1 ? `・スレッド ${texts.length} 件` : ''}</span></div>` +
    shown + (c.linkSeparate ? `<div class="small">リンク（ボタン・カードとして付きます）：${esc(c.link)}</div>` : '') + imgs +
    (id === 'instagram' && payload.firstComment ? `<div class="small">最初のコメント：${esc(payload.firstComment)}</div>` : '') +
    (issues.length ? `<ul class="is">${issues.join('')}</ul>` : '<div class="small">投稿前チェックで気になるところはありませんでした。</div>') + '</div>'
}

function gone() {
  return new Response(page('このリンクは使えません', `<h1>このリンクは使えません</h1>
<p class="lead">期限（7日）が過ぎたか、取り下げられたか、もう承認・差し戻しが済んでいます。担当者に、新しいリンクを作ってもらってください。</p>`), { status: 410, headers: HEADERS })
}

async function form(token, item, message) {
  const style = await readStyle()
  const p = item.payload || {}
  const when = item.date
    ? `承認すると、${esc(item.date)} の朝${SCHEDULE.jstHour}時ごろに投稿する予約に入ります。`
    : '承認したあと、担当者が管理画面から投稿します。'
  return new Response(page('SNS投稿の確認', `<h1>SNS投稿の確認のお願い</h1>
<p class="lead">${esc(BRAND.name)} の担当者から、SNSへの投稿の確認のお願いです。下の内容で出してよいかを選んでください。${when}</p>
${message ? `<p class="lead err">${esc(message)}</p>` : ''}
${item.note ? `<div class="box"><div class="net">担当者からのひとこと</div><div class="tx">${esc(item.note)}</div></div>` : ''}
${(p.targets || []).map((id) => netBlock(id, p, style)).join('')}
<p class="small">${esc(REVIEW_NOTE)} 文字数や「…続きを読む」の位置は目安です。</p>
<form method="post" action="/api/social-approve">
  <input type="hidden" name="t" value="${esc(token)}">
  <label for="comment" class="net" style="margin-top:14px">コメント（差し戻すときは必ず。承認のときは任意）</label>
  <textarea id="comment" name="comment" maxlength="500" placeholder="例：2行目の日付を 10/12 に直してください"></textarea>
  <div class="btns">
    <button class="ok" type="submit" name="decision" value="approve">承認する</button>
    <button class="ng" type="submit" name="decision" value="return">差し戻す（コメントを送る）</button>
  </div>
  <p class="small">押せるのは1回だけです。押したあとは、このリンクは使えなくなります。</p>
</form>`), { headers: HEADERS })
}

export async function GET(req) {
  const token = new URL(req.url).searchParams.get('t') || ''
  const item = token ? await openApproval(token) : null
  if (!item) return gone()
  return form(token, item, '')
}

export async function POST(req) {
  let f
  try { f = await req.formData() } catch (_) { return gone() }
  const token = String(f.get('t') || '')
  const decision = String(f.get('decision') || '')
  const r = await decideApproval(token, decision, String(f.get('comment') || ''))
  if (!r.ok) {
    if (r.retry) { const item = await openApproval(token); if (item) return form(token, item, r.message) }
    return gone()
  }
  const it = r.item
  const done = it.status === 'returned'
    ? '差し戻しました。コメントは担当者の管理画面に届いています。'
    : it.status === 'scheduled'
      ? `承認しました。${esc(it.date)} の朝${SCHEDULE.jstHour}時ごろに投稿されます。`
      : `承認しました。担当者が管理画面から投稿します。${it.error ? esc(it.error) : ''}`
  return new Response(page('ありがとうございました', `<h1>ありがとうございました</h1><p class="lead">${done}</p><p class="small">このページは閉じてかまいません。</p>`), { headers: HEADERS })
}
