export const config = { runtime: 'edge' }

// お客様が自分の予約を確かめ、取り消し・日時の変更をするページ。
//
//   GET  /api/booking-manage?t=<署名付きの鍵>   → 予約の中身と、変更・取り消しのボタン
//   POST /api/booking-manage  (t, action=cancel|move, key)
//
// 鍵は予約受付のメールに入っているもので、予約の id と期限に署名したもの
// （_booking.js の signManage）。ログインの代わりなので、ページは検索にも
// 載せず、リファラーでも外に出しません。
//
// 見た目は飾らず、どの会社のサイトに載せても浮かないようにしています
// （社名の文字だけ入ります）。スクリプトは使いません。

import { storeConfig, pipeline } from './_analytics-store.js'
import { hit } from './_ratelimit.js'
import { BRAND, KV } from './_brand.js'
import {
  readRules, getBooking, verifyManage, canChange, recSpan, recStatus, label, pickService, toWire, bookingNoun, STATUS,
} from './_booking.js'
import { manageSecret } from './_booking-mail.js'
import { cancelBooking, moveBooking } from './_booking-ops.js'
import { openSlots, invalidateSlots } from './booking.js'

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(title)}｜${esc(BRAND.name)}</title>
<style>
:root{--ink:#1f2328;--sub:#59636e;--line:#d8dee4;--bg:#f6f7f9;--ok:#0f766e;--ng:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.8 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:560px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:19px;margin:0 0 4px}.who{color:var(--sub);font-size:12.5px;margin:0 0 18px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px}
.card h2{font-size:15px;margin:0 0 8px}dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px}dt{color:var(--sub);font-size:13px}dd{margin:0;overflow-wrap:anywhere}
.msg{border-radius:10px;padding:12px 14px;margin:0 0 16px;background:#ecfdf5;color:var(--ok);font-weight:600}.msg.ng{background:#fef3f2;color:var(--ng)}
.day{font-weight:700;font-size:13px;margin:12px 0 6px}.slots{display:flex;flex-wrap:wrap;gap:6px}
.slots label{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:14px;cursor:pointer}
button{font:inherit;font-weight:700;border-radius:9px;padding:11px 16px;border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;margin-top:12px;width:100%}
button.ng{background:#fff;color:var(--ng);border-color:var(--ng)}.note{color:var(--sub);font-size:13px;margin:8px 0 0}
.check{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin-top:6px}
</style></head><body><main>
<h1>${esc(title)}</h1><p class="who">${esc(BRAND.name)}</p>
${body}
</main></body></html>`
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      // URL の鍵を、ページ内のリンク先に渡さない。
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  })
}

const T = 'ご予約の確認・変更・取り消し'
const sorry = (text, status = 400) => page(T, `<p class="msg ng">${esc(text)}</p><p class="note">お手数ですが、予約のメールに返信してご連絡ください。</p>`, status)

async function load(req, token) {
  const store = storeConfig()
  const v = await verifyManage(token, await manageSecret(req))
  if (!v.ok) return { error: v.why === 'expired' ? 'このご予約の日時は過ぎているため、このリンクはもう使えません。' : 'このリンクは使えません。メールのリンクを最後までコピーできているか、お確かめください。' }
  if (!store) return { error: 'いま予約の記録を読めません。少しおいてからもう一度お試しください。' }
  const rec = await getBooking(store, pipeline, v.id)
  if (!rec) return { error: 'このご予約の記録が見つかりませんでした。' }
  return { rec, rules: await readRules(store, pipeline), store }
}

function details(rec) {
  const { start, end } = recSpan(rec)
  return `<div class="card"><h2>ご予約の内容</h2><dl>
<dt>日時</dt><dd>${esc(label(start, end))}（日本時間）</dd>
${rec.service ? `<dt>メニュー</dt><dd>${esc(rec.service.name)}（${esc(rec.service.minutes)}分）</dd>` : ''}
<dt>お名前</dt><dd>${esc(rec.name)} 様</dd>
<dt>状態</dt><dd>${esc(STATUS[recStatus(rec)] || '')}</dd>
${rec.meet && recStatus(rec) !== 'cancelled' ? `<dt>参加URL</dt><dd>${esc(rec.meet)}</dd>` : ''}
</dl></div>`
}

async function view(req, rec, rules, token, flash) {
  let body = (flash ? `<p class="msg${flash.ng ? ' ng' : ''}">${esc(flash.text)}</p>` : '') + details(rec)
  const can = canChange(rec, rules)
  if (!can.ok) {
    body += `<p class="note">${esc(can.why === 'status'
      ? (recStatus(rec) === 'cancelled' ? 'このご予約は取り消し済みです。またのご予約をお待ちしています。' : 'このご予約は、ここからは変更できません。')
      : can.why === 'past' ? 'このご予約の日時は過ぎています。'
        : `開始の${rules.cutoffHours}時間前を過ぎたため、ここからは変更・取り消しができません。お手数ですが、予約のメールに返信してご連絡ください。`)}</p>`
    return page(T, body)
  }
  const svc = pickService(rules, rec.service?.id)
  const minutes = rec.service?.minutes || svc.minutes
  const { slots } = await openSlots(req, 60, rules, { ...svc, minutes }, rec.id)
  const days = []
  for (const s of slots.map(toWire)) {
    const last = days[days.length - 1]
    if (last && last.day === s.day) last.list.push(s); else days.push({ day: s.day, list: [s] })
  }
  body += `<form class="card" method="post" action="/api/booking-manage"><h2>日時を変更する</h2>
<input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="action" value="move">
${days.length ? days.map((d) => `<p class="day">${esc(d.day)}</p><div class="slots">${d.list.map((s) => `<label><input type="radio" name="key" value="${esc(s.key)}" required>${esc(s.time)}</label>`).join('')}</div>`).join('')
    + '<button type="submit">この日時に変更する</button>'
    : '<p class="note">いま変更できる空きがありません。日を改めてお試しいただくか、メールに返信してご連絡ください。</p>'}
</form>
<form class="card" method="post" action="/api/booking-manage"><h2>${esc(bookingNoun(rules))}を取り消す</h2>
<input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="action" value="cancel">
<label class="check"><input type="checkbox" name="sure" value="1" required>このご予約を取り消します</label>
<button type="submit" class="ng">取り消す</button>
<p class="note">変更・取り消しは開始の${esc(rules.cutoffHours)}時間前までできます。</p>
</form>`
  return page(T, body)
}

export async function GET(req) {
  const token = new URL(req.url).searchParams.get('t') || ''
  const r = await load(req, token)
  if (r.error) return sorry(r.error)
  return view(req, r.rec, r.rules, token)
}

export async function POST(req) {
  let form
  try { form = await req.formData() } catch (_) { return sorry('送られた内容を読めませんでした。') }
  const token = String(form.get('t') || '')
  const action = String(form.get('action') || '')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await hit(`${KV}bk:rl:m:${ip}`, 10, 15 * 60)
  if (rl.limited) return sorry('操作が続いています。しばらくおいてからお試しください。', 429)
  const r = await load(req, token)
  if (r.error) return sorry(r.error)
  const { rec, rules, store } = r
  const can = canChange(rec, rules)
  if (!can.ok) return view(req, rec, rules, token)

  if (action === 'cancel') {
    if (form.get('sure') !== '1') return view(req, rec, rules, token, { ng: true, text: '「このご予約を取り消します」に印を付けてから押してください。' })
    const done = await cancelBooking(req, rec, rules, 'customer')
    await invalidateSlots(store)
    return view(req, done.rec, rules, token, { text: 'ご予約を取り消しました。確認のメールをお送りしています。' })
  }
  if (action === 'move') {
    const svc = pickService(rules, rec.service?.id)
    const minutes = rec.service?.minutes || svc.minutes
    const { slots } = await openSlots(req, 500, rules, { ...svc, minutes }, rec.id)
    const slot = slots.find((s) => new Date(s.start).toISOString() === String(form.get('key') || ''))
    if (!slot) return view(req, rec, rules, token, { ng: true, text: 'その日時は埋まりました。別の日時をお選びください。' })
    const done = await moveBooking(req, rec, rules, slot, 'customer')
    if (done.error) return view(req, rec, rules, token, { ng: true, text: done.error === 'slot_taken' ? 'その日時は先に埋まりました。別の日時をお選びください。' : '日時を変更できませんでした。少しおいてからもう一度お試しください。' })
    await invalidateSlots(store)
    return view(req, done.rec, rules, token, { text: `日時を ${done.rec.when} に変更しました。確認のメールをお送りしています。` })
  }
  return sorry('知らない操作です。')
}
