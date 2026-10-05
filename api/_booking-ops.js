// 入った予約を変える操作。お客様のリンク（booking-manage.js）と管理画面
// （booking.js の PATCH）の両方がここを通ります。
//
//   取り消し … 区切りを返し、Google の予定を消し（つないでいれば）、両方にメール
//   日時の変更 … 新しい区切りを先に取ってから前の分を返す（間に他の人が
//                入れないように）。Google の予定は日時だけ動かします。
//   状態     … 確定・来店済み・無断キャンセルと、メモ。

import { storeConfig, pipeline } from './_analytics-store.js'
import { creds, connected, moveEvent, deleteEvent } from './_google-cal.js'
import { recCells, releaseCells, takeCells, cellsFor, saveBooking, label, recSpan, recStatus } from './_booking.js'
import { mailCancelled, mailMoved, mailConfirmed } from './_booking-mail.js'

const now = () => new Date().toISOString()
const log = (rec, what, by, extra) => [...(rec.history || []), { at: now(), what, by, ...(extra || {}) }].slice(-30)

export async function cancelBooking(req, rec, rules, by) {
  const store = storeConfig()
  let calendar = ''
  if (rec.eventId) {
    try {
      const c = await creds(req)
      if (connected(c)) { await deleteEvent(c, rec.eventId); calendar = 'deleted' }
    } catch (_) { calendar = 'failed' }
  }
  await releaseCells(store, pipeline, recCells(rec, rules.bufferMin), rec.id)
  const next = { ...rec, status: 'cancelled', seq: (rec.seq || 0) + 1, cancelledAt: now(), cancelledBy: by, history: log(rec, 'cancel', by) }
  await saveBooking(store, pipeline, next, false)
  const mail = await mailCancelled(req, next, rules, by)
  return { rec: next, calendar, mail }
}

/** slot は openSlots が作り直した枠（{start, end}）。 */
export async function moveBooking(req, rec, rules, slot, by) {
  const store = storeConfig()
  const cells = cellsFor(slot.start, slot.end, rules.bufferMin)
  if (!(await takeCells(store, pipeline, cells, rec.id, slot.end))) return { error: 'slot_taken' }
  const oldCells = recCells(rec, rules.bufferMin)
  let calendar = ''
  if (rec.eventId) {
    try {
      const c = await creds(req)
      if (connected(c)) { await moveEvent(c, rec.eventId, { startMs: slot.start, endMs: slot.end }); calendar = 'moved' }
    } catch (_) {
      await releaseCells(store, pipeline, cells.filter((n) => !oldCells.includes(n)), rec.id)
      return { error: 'calendar_failed' }
    }
  }
  await releaseCells(store, pipeline, oldCells.filter((n) => !cells.includes(n)), rec.id)
  const old = recSpan(rec)
  const oldWhen = label(old.start, old.end)
  const next = {
    ...rec,
    start: slot.start, end: slot.end, key: new Date(slot.start).toISOString(), when: label(slot.start, slot.end),
    cells: [cells[0], cells[cells.length - 1]], seq: (rec.seq || 0) + 1, reminded: false,
    history: log(rec, 'move', by, { from: oldWhen }),
  }
  await saveBooking(store, pipeline, next, false)
  const mail = await mailMoved(req, next, rules, oldWhen, by)
  return { rec: next, calendar, mail }
}

/** 管理画面の「確定にする」「来店済み」「無断キャンセル」「メモ」。 */
export async function markBooking(req, rec, rules, status, memo) {
  const store = storeConfig()
  const next = { ...rec }
  let mail = null
  if (status && status !== recStatus(rec)) {
    next.status = status
    next.history = log(rec, status, 'owner')
    if (status === 'confirmed') mail = await mailConfirmed(req, next, rules)
  }
  if (typeof memo === 'string') next.memo = memo.slice(0, 1000)
  await saveBooking(store, pipeline, next, false)
  return { rec: next, mail }
}
