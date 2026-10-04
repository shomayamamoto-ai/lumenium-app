export const config = { runtime: 'edge' }

// 商談の自動予約。フォーム送信の直後に候補日時を出し、1クリックで確定する。
//
//   GET  /api/booking            → いま押せる枠（Googleの空きを見た結果）
//   POST /api/booking {key,…}    → その枠で確定。Meet付きの予定を作る
//   GET  /api/booking?recent=1   → 管理画面用の予約一覧（要 ADMIN_KEY）
//
// 夜間・休日も動くのは、これが人ではなくサーバーだからです。相手が動ける
// うちに次の一手を出せることが、この仕組みの全部です。
//
// 押さえてある考え方:
//   ・クライアントから戻ってきた枠は信用しない。毎回ルールから作り直して、
//     その中に無い時刻は断る。任意の時刻を予定に入れられては困る。
//   ・同じ枠を同時に押されたら、先に取った方だけを通す。
//   ・Googleが未接続なら「仮予約」として受け、.ics を送る。黙って壊れる
//     より、できる範囲で受けてこちらが折り返すほうがよい。
//   ・どちらも無い（保存先もGoogleも無い）ときは枠を出さない。二重予約を
//     防げない状態で予約を受けるのは、受けないより悪い。

import { storeConfig, storeFor, pipeline } from './_analytics-store.js'
import { setting } from './_settings.js'
import { requireAdmin } from './_admin-auth.js'
import { hit, seenBefore, digest } from './_ratelimit.js'
import { pickTopics } from './_form-options.js'
import { creds, connected, busy as gcalBusy, createEvent } from './_google-cal.js'
import { busyFromUrl } from './_ics.js'
import {
  SHOW, candidates, removeBusy, toWire, label, gcalAddUrl,
  cellsFor, takeCells, releaseCells, bookingsBetween, occupies, recSpan, recStatus, getBooking, STATUS,
  saveBooking, recentBookings, icsFile,
  readRules, saveRules, pickService, activeServices, HOLIDAY_LAST, HOLIDAYS,
} from './_booking.js'
import { BRAND, KV } from './_brand.js'
import { mailBooked, summaryOf, descriptionOf, sandboxFrom, manageSecret } from './_booking-mail.js'
import { cancelBooking, moveBooking, markBooking } from './_booking-ops.js'

const LIMITS = { name: 50, email: 100, message: 500 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BURST = { max: 4, windowS: 15 * 60 }
const SLOT_CACHE = `${KV}bk:cache`

const json = (payload, status = 200, extra) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(extra || {}) },
})

/** いま提示できる枠と、どの仕組みで動いているか。
 *  ignoreId は日時の変更のときの自分の予約（自分の今の枠は空きとして見る）。 */
export async function openSlots(req, wanted, rules, svc, ignoreId = '') {
  const c = await creds(req)
  const store = storeConfig()
  const all = candidates(Date.now(), rules, svc.minutes)
  const buf = rules.bufferMin
  if (!all.length) return { mode: 'off', slots: [], reason: 'NO_SLOTS' }
  const from = all[0].start
  const to = all[all.length - 1].end
  // 既に入った予約は、どの方式でも前後の空きごと除きます。Google に入って
  // いる分は向こうの空きにも出ますが、作った直後の行き違いをここで防ぎます。
  const taken = async () => (store
    ? (await bookingsBetween(store, pipeline, from - 86400000, to)).filter((r) => occupies(r) && r.id !== ignoreId).map(recSpan)
    : [])

  if (connected(c)) {
    try {
      const [busy, mine] = await Promise.all([gcalBusy(c, from, to), taken()])
      const free = removeBusy(all, busy.concat(mine), buf)
      return { mode: 'google', slots: free.slice(0, wanted), total: free.length }
    } catch (e) {
      // 接続が切れている・Googleが落ちている。枠を出さないのではなく、
      // 保存先があれば仮予約として受ける。理由は管理画面に出ます。
      if (!store) return { mode: 'off', slots: [], reason: String(e.message || e).slice(0, 120) }
      const free = removeBusy(all, await taken(), buf)
      return { mode: 'local', slots: free.slice(0, wanted), total: free.length, warn: String(e.message || e).slice(0, 120) }
    }
  }

  /* 簡易接続（非公開iCal URL）。Cloud Console を通さずに、空きだけ本物に
     します。書き込みはできないので、確定は仮予約のままです。 */
  const icsUrl = await setting('GOOGLE_CALENDAR_ICS_URL', '', req)
  let icsBusy = null
  if (icsUrl) {
    icsBusy = await busyFromUrl(icsUrl, from, to)
  }

  if (!store && !icsBusy) return { mode: 'off', slots: [], reason: 'NOT_CONFIGURED' }

  // 簡易接続ではカレンダーに書き込めないので、入った予約はここで見るしかありません。
  const open = removeBusy(all, (icsBusy || []).concat(await taken()), buf)
  return { mode: icsBusy ? 'ics' : 'local', slots: open.slice(0, wanted), total: open.length }
}

export async function GET(req) {
  const url = new URL(req.url)

  // 管理画面からの一覧。
  if (url.searchParams.get('recent')) {
    const denied = await requireAdmin(req)
    if (denied) return denied
    const store = storeConfig()
    const c = await creds(req)
    return json({
      ok: true,
      connected: connected(c),
      // 簡易接続（非公開iCal URL）だけの状態も、はっきり分けて返します。
      ics: !!(await setting('GOOGLE_CALENDAR_ICS_URL', '', req)),
      // 訪問者のリクエストから見える保存先（＝環境変数）。予約が動くために
      // 要るのはこちらです。
      stored: !!store,
      // この管理画面から見える保存先。端末に保存した分も含みます。両方を
      // 返すのは、「この端末では設定済みに見えるのに予約欄が出ない」という
      // 食い違いを、画面の側で説明できるようにするためです。
      storedHere: !!(await storeFor(req)),
      calendarId: c.calendarId,
      rules: await readRules(store, pipeline),
      // 予約管理の画面は、一覧・週の表・数字をこの記録から作ります（直近300件）。
      bookings: await recentBookings(store, pipeline, url.searchParams.get('recent') === 'all' ? 300 : 20),
      holidayLast: HOLIDAY_LAST,
      holidays: HOLIDAYS,
      // メール・リンク・毎朝の仕事・LINE が動く状態か。値そのものは返しません。
      mail: { resend: !!(await setting('RESEND_API_KEY', '', req)), sandbox: sandboxFrom(), from: BRAND.from.replace(/^.*</, '').replace(/>.*$/, '') },
      links: !!(await manageSecret(req)),
      cron: { secret: !!(process.env.CRON_SECRET || '').trim(), last: await cronLast(store) },
      line: { token: !!(await setting('LINE_CHANNEL_TOKEN', '', req)) },
      now: Date.now(),
    })
  }

  const rules = await readRules(storeConfig(), pipeline)
  const svc = pickService(rules, url.searchParams.get('service') || '')
  const wanted = url.searchParams.get('all') ? SHOW.max : SHOW.first
  const { mode, slots, total, warn, reason } = await openSlots(req, wanted, rules, svc)
  return json({
    ok: true,
    enabled: mode !== 'off',
    mode,
    // Google's own error text names the calendar setup; visitors only need to
    // know whether it worked. The detail is in the admin's settings check.
    reason: reason ? 'calendar_unavailable' : null,
    warn: warn ? 'calendar_unavailable' : null,
    tz: 'Asia/Tokyo',
    // 画面の「◯分」はこの値から作ります（決め打ちの30分・60分は書かない）。
    minutes: svc.minutes,
    service: svc.id,
    services: activeServices(rules).map(({ id, name, minutes, desc, price }) => ({ id, name, minutes, desc, price })),
    wording: rules.wording,
    online: rules.online,
    total: total || 0,
    slots: slots.map(toWire),
  })
}

export async function POST(req) {
  let body
  try { body = await req.json() } catch (_) { return json({ error: 'invalid_json' }, 400) }

  // 見えない欄。人は空のまま、botは埋める。
  // （罠は website。company はフォームで実際に入力される会社名です）
  if (String(body?.website ?? '').trim()) return json({ ok: true })

  const key = String(body?.key ?? '').trim()
  const name = String(body?.name ?? '').trim()
  const email = String(body?.email ?? '').trim()
  const note = String(body?.message ?? '').trim().slice(0, LIMITS.message)
  const page = String(body?.page ?? '').slice(0, 120)
  // フォームで選んだ内容を、そのまま予定に持っていく。当日は「何の話か」が
  // 分かった状態で始められます。
  const company = String(body?.company ?? '').trim().slice(0, 80)
  const topics = pickTopics(body?.topics)

  if (!name || name.length > LIMITS.name) return json({ error: 'invalid_name' }, 400)
  if (!email || !EMAIL_RE.test(email) || email.length > LIMITS.email) return json({ error: 'invalid_email' }, 400)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await hit(`${KV}bk:rl:${ip}`, BURST.max, BURST.windowS)
  if (rl.limited) {
    return json({ error: 'rate_limited', message: '予約の操作が続いています。しばらくおいてからお試しください。' },
      429, { 'retry-after': String(rl.retryAfter) })
  }
  // 連打・再送信で同じ人が二枠取ってしまわないように。
  const fp = await digest(email, key)
  if (await seenBefore(`${KV}bk:dup:${fp}`, 10 * 60)) return json({ ok: true, duplicate: true })

  // クライアントが返してきた時刻は使わない。いま作り直した候補の中に
  // 同じ鍵があるかどうかだけを見る。
  const rules = await readRules(storeConfig(), pipeline)
  const svc = pickService(rules, String(body?.service ?? ''))
  const { mode, slots } = await openSlots(req, SHOW.max, rules, svc)
  if (mode === 'off') return json({ error: 'not_available' }, 503)
  const slot = slots.find((s) => new Date(s.start).toISOString() === key)
  if (!slot) return json({ error: 'slot_taken', message: 'その枠は埋まりました。別の日時をお選びください。' }, 409)

  const store = storeConfig()
  const id = `bk_${slot.start}_${Math.random().toString(36).slice(2, 8)}`
  // 予約が使う15分の区切りを全部取る（前後の空きを含む）。10:00 と 10:30 の
  // ように開始がずれた2件も、ここでどちらか一方だけが通ります。
  const cells = cellsFor(slot.start, slot.end, rules.bufferMin)
  if (!(await takeCells(store, pipeline, cells, id, slot.end))) {
    return json({ error: 'slot_taken', message: 'その枠は埋まりました。別の日時をお選びください。' }, 409)
  }

  const when = label(slot.start, slot.end)
  // 予定の題と中身は、メールと同じ作り方（_booking-mail.js）で作ります。
  const draft = { id, start: slot.start, end: slot.end, service: { id: svc.id, name: svc.name, minutes: svc.minutes }, wording: rules.wording, name, email, company, topics, note, page }
  const summary = summaryOf(draft, rules)
  const description = descriptionOf(draft)

  let meet = ''
  let eventId = ''
  if (mode === 'google') {
    try {
      const c = await creds(req)
      const ev = await createEvent(c, {
        startMs: slot.start, endMs: slot.end, summary, description,
        attendee: email, attendeeName: name, online: rules.online,
      })
      meet = ev.meet
      eventId = ev.id
    } catch (e) {
      await releaseCells(store, pipeline, cells, id)
      return json({ error: 'calendar_failed', message: '予定の作成に失敗しました。お手数ですがもう一度お試しください。' }, 502)
    }
  }

  const rec = {
    id, key, when, start: slot.start, end: slot.end,
    service: { id: svc.id, name: svc.name, minutes: svc.minutes }, wording: rules.wording,
    status: mode === 'google' ? 'confirmed' : 'tentative', cells: [cells[0], cells[cells.length - 1]],
    name, email, company, topics, note, page, mode, meet, eventId,
    // 簡易接続・未接続のときに、管理画面とメールから1回でカレンダーに入れる
    addUrl: mode === 'google' ? '' : gcalAddUrl({ startMs: slot.start, endMs: slot.end, summary, description }),
    at: new Date().toISOString(),
  }
  await saveBooking(store, pipeline, rec)
  await invalidateSlots(store)
  await mailBooked(req, rec, rules)

  return json({
    ok: true,
    when,
    meet,
    mode,
    // Google が入っていれば、この時点で相手のカレンダーにも招待が届きます。
    invited: mode === 'google',
  })
}

/** 管理画面から「予約の決まり」（受付時間・休み・メニュー・呼び方）を保存する。 */
export async function PUT(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const store = storeConfig()
  if (!store) {
    return json({ ok: false, message: '保存先（Upstash Redis）が Vercel の環境変数に無いため、決まりを保存できません。いまは既定の決まりで動いています。' }, 503)
  }
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  try {
    const { rules, problems } = await saveRules(store, pipeline, body?.rules)
    await invalidateSlots(store)
    return json({ ok: true, rules, problems, message: problems.length ? '保存しました。読めなかった所は直してあります（下の注意をご覧ください）。' : '保存しました。サイトの予約欄には1分以内に反映されます。' })
  } catch (_) {
    return json({ ok: false, message: '保存先に書き込めませんでした。少しおいてからもう一度お試しください。' }, 502)
  }
}

async function cronLast(store) {
  if (!store) return null
  try { const [raw] = await pipeline(store, [['GET', `${KV}bk:cron:last`]]); return raw ? JSON.parse(raw) : null } catch (_) { return null }
}

/** 空き枠の控え（1分）を捨てる。予約・取り消し・決まりの保存のたびに呼びます。 */
export async function invalidateSlots(store) {
  if (!store) return
  try { await pipeline(store, [['DEL', SLOT_CACHE]]) } catch (_) { /* 1分で消えます */ }
}

/** 管理画面からの操作: 取り消し・日時の変更・確定・来店済み・無断キャンセル・メモ。 */
export async function PATCH(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const store = storeConfig()
  if (!store) return json({ ok: false, message: '保存先（Upstash Redis）が無いため、予約を変えられません。' }, 503)
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  const rec = await getBooking(store, pipeline, body?.id)
  if (!rec) return json({ ok: false, message: 'その予約が見つかりませんでした（180日より前の記録は消えています）。' }, 404)
  const rules = await readRules(store, pipeline)
  const action = String(body?.action || '')
  const memo = typeof body?.memo === 'string' ? body.memo : undefined
  const mailNote = (m) => (m && (m.customer === false || m === false) ? 'お客様へのメールは送れませんでした（メールの設定をご確認ください）。' : '')

  if (action === 'cancel') {
    if (!occupies(rec) || recStatus(rec) === 'visited') return json({ ok: false, message: 'この予約は取り消せる状態ではありません。' }, 409)
    const r = await cancelBooking(req, rec, rules, 'owner')
    await invalidateSlots(store)
    return json({ ok: true, booking: r.rec, message: ['取り消しました。', r.calendar === 'failed' ? 'Googleカレンダーの予定は消せませんでした。カレンダーから手で消してください。' : '', mailNote(r.mail)].join('') })
  }
  if (action === 'move') {
    const svc = pickService(rules, rec.service?.id) || rules.services[0]
    const minutes = rec.service?.minutes || svc.minutes
    const { slots } = await openSlots(req, 500, rules, { ...svc, minutes }, rec.id)
    const slot = slots.find((s) => new Date(s.start).toISOString() === String(body?.key || ''))
    if (!slot) return json({ ok: false, message: 'その日時は空いていません。別の日時をお選びください。' }, 409)
    const r = await moveBooking(req, rec, rules, slot, 'owner')
    if (r.error) return json({ ok: false, message: r.error === 'slot_taken' ? 'その日時は先に埋まりました。' : 'Googleカレンダーの予定を動かせませんでした。少しおいてからもう一度お試しください。' }, 409)
    await invalidateSlots(store)
    return json({ ok: true, booking: r.rec, message: '日時を変更しました。' + mailNote(r.mail) })
  }
  if (['confirmed', 'visited', 'noshow', 'memo'].includes(action)) {
    const r = await markBooking(req, rec, rules, action === 'memo' ? '' : action, memo)
    return json({ ok: true, booking: r.rec, message: action === 'memo' ? 'メモを保存しました。' : `「${STATUS[action]}」にしました。` + (action === 'confirmed' ? mailNote(r.mail) || 'お客様に確定のメールを送りました。' : '') })
  }
  return json({ ok: false, message: '知らない操作です。' }, 400)
}
