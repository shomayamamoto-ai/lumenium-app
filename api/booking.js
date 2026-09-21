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

import { storeConfig, pipeline } from './_analytics-store.js'
import { setting } from './_settings.js'
import { requireAdmin } from './_admin-auth.js'
import { hit, seenBefore, digest } from './_ratelimit.js'
import { pickTopics } from './_form-options.js'
import { creds, connected, busy as gcalBusy, createEvent } from './_google-cal.js'
import { busyFromUrl } from './_ics.js'
import {
  RULES, candidates, removeBusy, toWire, label,
  takeSlot, releaseSlot, saveBooking, recentBookings, icsFile,
} from './_booking.js'

const LIMITS = { name: 50, email: 100, message: 500 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BURST = { max: 4, windowS: 15 * 60 }

const json = (payload, status = 200, extra) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(extra || {}) },
})

/** いま提示できる枠と、どの仕組みで動いているか。 */
async function openSlots(req, wanted) {
  const c = await creds(req)
  const store = storeConfig()
  const all = candidates()
  if (!all.length) return { mode: 'off', slots: [], reason: 'NO_SLOTS' }

  if (connected(c)) {
    try {
      const busy = await gcalBusy(c, all[0].start, all[all.length - 1].end)
      const free = removeBusy(all, busy)
      return { mode: 'google', slots: free.slice(0, wanted), total: free.length }
    } catch (e) {
      // 接続が切れている・Googleが落ちている。枠を出さないのではなく、
      // 保存先があれば仮予約として受ける。理由は管理画面に出ます。
      if (!store) return { mode: 'off', slots: [], reason: String(e.message || e).slice(0, 120) }
      return { mode: 'local', slots: all.slice(0, wanted), total: all.length, warn: String(e.message || e).slice(0, 120) }
    }
  }

  /* 簡易接続（非公開iCal URL）。Cloud Console を通さずに、空きだけ本物に
     します。書き込みはできないので、確定は仮予約のままです。 */
  const icsUrl = await setting('GOOGLE_CALENDAR_ICS_URL', '', req)
  let icsBusy = null
  if (icsUrl) {
    icsBusy = await busyFromUrl(icsUrl, all[0].start, all[all.length - 1].end)
  }

  if (!store && !icsBusy) return { mode: 'off', slots: [], reason: 'NOT_CONFIGURED' }

  if (icsBusy) {
    const free = removeBusy(all, icsBusy)
    // 保存先があれば、既に取られた枠も除く。
    const taken = store ? await takenKeys(store, free) : []
    const open = free.filter((s) => !taken.includes(new Date(s.start).toISOString()))
    return { mode: 'ics', slots: open.slice(0, wanted), total: open.length }
  }

  // 仮予約モード: 既に取られた枠だけは除く。
  const taken = await takenKeys(store, all)
  const free = all.filter((s) => !taken.includes(new Date(s.start).toISOString()))
  return { mode: 'local', slots: free.slice(0, wanted), total: free.length }
}

/** 既に押さえられている枠。保存先が答えなければ、空として扱います
 *  （二重予約は確定時にもう一度見ます）。 */
async function takenKeys(store, slots) {
  const keys = slots.map((s) => new Date(s.start).toISOString())
  if (!keys.length) return []
  try {
    const out = await pipeline(store, keys.map((k) => ['GET', `lum:bk:lock:${k}`]))
    return keys.filter((_, i) => out[i])
  } catch (_) {
    return []
  }
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
      stored: !!store,
      calendarId: c.calendarId,
      bookings: await recentBookings(store, pipeline, 20),
    })
  }

  const wanted = url.searchParams.get('all') ? RULES.max : RULES.first
  const { mode, slots, total, warn, reason } = await openSlots(req, wanted)
  return json({
    ok: true,
    enabled: mode !== 'off',
    mode,
    reason: reason || null,
    warn: warn || null,
    tz: 'Asia/Tokyo',
    minutes: RULES.slotMin,
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
  const rl = await hit(`lum:bk:rl:${ip}`, BURST.max, BURST.windowS)
  if (rl.limited) {
    return json({ error: 'rate_limited', message: '予約の操作が続いています。しばらくおいてからお試しください。' },
      429, { 'retry-after': String(rl.retryAfter) })
  }
  // 連打・再送信で同じ人が二枠取ってしまわないように。
  const fp = await digest(email, key)
  if (await seenBefore(`lum:bk:dup:${fp}`, 10 * 60)) return json({ ok: true, duplicate: true })

  // クライアントが返してきた時刻は使わない。いま作り直した候補の中に
  // 同じ鍵があるかどうかだけを見る。
  const { mode, slots } = await openSlots(req, RULES.max)
  if (mode === 'off') return json({ error: 'not_available' }, 503)
  const slot = slots.find((s) => new Date(s.start).toISOString() === key)
  if (!slot) return json({ error: 'slot_taken', message: 'その枠は埋まりました。別の日時をお選びください。' }, 409)

  const store = storeConfig()
  if (!(await takeSlot(store, pipeline, key))) {
    return json({ error: 'slot_taken', message: 'その枠は埋まりました。別の日時をお選びください。' }, 409)
  }

  const id = `bk_${slot.start}_${Math.random().toString(36).slice(2, 8)}`
  const when = label(slot.start, slot.end)
  const owner = await setting('CONTACT_TO_EMAIL', 'shoma.yamamoto@lumenium.net', req)
  const summary = `商談: ${company ? `${company} ` : ''}${name}様 × Lumenium${topics.length ? `（${topics[0]}${topics.length > 1 ? 'ほか' : ''}）` : ''}`
  const description = [
    `お名前: ${name}`,
    company ? `会社名: ${company}` : null,
    `メール: ${email}`,
    topics.length ? `ご相談の内容: ${topics.join('、')}` : null,
    page ? `申し込みページ: ${page}` : null,
    note ? `\nご相談内容:\n${note}` : null,
  ].filter(Boolean).join('\n')

  let meet = ''
  let eventId = ''
  if (mode === 'google') {
    try {
      const c = await creds(req)
      const ev = await createEvent(c, {
        startMs: slot.start, endMs: slot.end, summary, description,
        attendee: email, attendeeName: name,
      })
      meet = ev.meet
      eventId = ev.id
    } catch (e) {
      await releaseSlot(store, pipeline, key)
      return json({ error: 'calendar_failed', message: '予定の作成に失敗しました。お手数ですがもう一度お試しください。' }, 502)
    }
  }

  const rec = {
    id, key, when, name, email, company, topics, note, page, mode, meet, eventId,
    at: new Date().toISOString(),
  }
  await saveBooking(store, pipeline, rec)
  await notify(req, rec, owner, { summary, description, startMs: slot.start, endMs: slot.end })

  return json({
    ok: true,
    when,
    meet,
    mode,
    // Google が入っていれば、この時点で相手のカレンダーにも招待が届きます。
    invited: mode === 'google',
  })
}

/** UTF-8 のまま base64 に。btoa は1バイト文字しか受けないので、日本語の
 *  入った .ics をそのまま渡すと例外になります。 */
function b64(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** 知らせる。Google 経由の招待は相手にしか届かないので、こちら側にも必ず
 *  1通送る。仮予約のときは相手にも .ics を送る。 */
async function notify(req, rec, owner, ev) {
  const apiKey = await setting('RESEND_API_KEY', '', req)
  if (!apiKey) return
  const from = process.env.CONTACT_FROM_EMAIL || 'Lumenium <onboarding@resend.dev>'
  const send = (payload) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, ...payload }),
  }).catch(() => {})

  const lines = [
    `日時: ${rec.when}（JST）`,
    `お名前: ${rec.name}`,
    rec.company ? `会社名: ${rec.company}` : null,
    `メール: ${rec.email}`,
    (rec.topics || []).length ? `ご相談の内容: ${rec.topics.join('、')}` : null,
    rec.meet ? `Meet: ${rec.meet}` : null,
    rec.page ? `申し込みページ: ${rec.page}` : null,
    rec.mode === 'google' ? 'カレンダーに登録済み・相手にも招待を送信しました。' : '仮予約です（Googleカレンダー未接続）。折り返し確定のご連絡が要ります。',
    rec.note ? `\nご相談内容:\n${rec.note}` : null,
  ].filter(Boolean)

  await send({
    to: [owner],
    reply_to: rec.email,
    subject: `【商談予約】${rec.when} ${rec.company ? `${rec.company} ` : ''}${rec.name}様`,
    text: lines.join('\n'),
  })

  if (rec.mode !== 'google') {
    const file = icsFile({
      id: rec.id, startMs: ev.startMs, endMs: ev.endMs,
      summary: ev.summary, description: ev.description, organizer: owner, attendee: rec.email,
    })
    await send({
      to: [rec.email],
      reply_to: owner,
      subject: `【仮予約を承りました】${rec.when} Lumenium`,
      text: [
        `${rec.name} 様`,
        '',
        `${rec.when}（日本時間）でお席を確保しました。`,
        '担当より、接続用のURLを添えて確定のご連絡を差し上げます。',
        '添付のファイルを開くと、そのままカレンダーに登録できます。',
        '',
        'Lumenium（ルメニウム）',
        'https://lumenium.net',
      ].join('\n'),
      attachments: [{ filename: 'lumenium-meeting.ics', content: b64(file) }],
    })
  }
}
