export const config = { runtime: 'edge' }

// 予約の毎朝の仕事。
//   ・明日の予約のお客様に、前日のお知らせメール（変更・取り消しのリンク付き）
//   ・オーナーの LINE に、今日の予約の一覧（予約管理で LINE のユーザーIDを
//     入れたときだけ。予約が無い日は送りません）
//
// 毎朝の自動処理（/api/social-cron、日本時間 9:00）の中から呼ばれます。
// Vercel の無料プランは定期実行の数に限りがあるので、別の枠は足していません。
// 手で動かすときは、social-cron と同じく CRON_SECRET を付けて GET します。
//
// お客様あての LINE のお知らせはしていません。LINE でお客様に送るには、
// その人の LINE のユーザーIDが要り、それを知るには予約を LINE の中（LIFF）で
// 受ける仕組みが別に要るためです。

import { json } from './_admin-auth.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { setting } from './_settings.js'
import { KV } from './_brand.js'
import { readRules, bookingsBetween, dueReminders, agendaText, tomorrowRange, dayStart, saveBooking } from './_booking.js'
import { mailReminder } from './_booking-mail.js'

export const BOOKING_CRON_LAST = `${KV}bk:cron:last`

async function pushLine(token, to, text) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    })
    return res.ok ? { ok: true } : { ok: false, message: `LINE ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e).slice(0, 120) }
  }
}

export async function runBookingCron(req, now = Date.now()) {
  const store = storeConfig()
  if (!store) return { ok: false, message: '保存先がありません。' }
  const rules = await readRules(store, pipeline)
  const [, t1] = tomorrowRange(now)
  const list = await bookingsBetween(store, pipeline, dayStart(now), t1)

  const due = rules.remind ? dueReminders(list, now) : []
  let sent = 0
  let failed = 0
  for (const rec of due.slice(0, 40)) {
    if (await mailReminder(req, rec, rules)) {
      sent++
      await saveBooking(store, pipeline, { ...rec, reminded: new Date(now).toISOString() }, false)
    } else failed++
  }

  let line = null
  const text = rules.lineUserId ? agendaText(list, now) : ''
  if (text) {
    const token = await setting('LINE_CHANNEL_TOKEN', '', req)
    line = token ? await pushLine(token, rules.lineUserId, text) : { ok: false, message: 'LINE_CHANNEL_TOKEN がありません。' }
  }

  const summary = { ok: true, at: new Date(now).toISOString(), reminders: { due: due.length, sent, failed, off: !rules.remind }, line }
  try { await pipeline(store, [['SET', BOOKING_CRON_LAST, JSON.stringify(summary), 'EX', 30 * 86400]]) } catch (_) {}
  return summary
}

async function same(a, b) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s)))))
  const u = new Uint8Array(x)
  const v = new Uint8Array(y)
  let d = 0
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]
  return d === 0
}

export async function GET(req) {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return json({ ok: false, code: 'NO_CRON_SECRET', message: 'CRON_SECRET が未設定のため動きません。' }, 503)
  if (!(await same(req.headers.get('authorization') || '', `Bearer ${secret}`))) return json({ ok: false, message: '認証できませんでした。' }, 401)
  if (!storeConfig()) return json({ ok: false, message: '保存先（Upstash Redis）の環境変数がありません。' }, 503)
  return json(await runBookingCron(req))
}
