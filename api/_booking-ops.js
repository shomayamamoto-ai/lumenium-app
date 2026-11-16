// 入った予約を変える操作。お客様のリンク（booking-manage.js）と管理画面
// （booking.js の PATCH）の両方がここを通ります。
//
//   取り消し … 区切りを返し、Google の予定を消し（つないでいれば）、両方にメール
//   日時の変更 … 新しい区切りを先に取ってから前の分を返す（間に他の人が
//                入れないように）。Google の予定は日時だけ動かします。
//   状態     … 確定・来店済み・無断キャンセルと、メモ。

import { storeConfig, pipeline } from './_analytics-store.js'
import { creds, connected, moveEvent, deleteEvent, createEvent } from './_google-cal.js'
import { recCells, releaseCells, takeCells, cellsFor, saveBooking, label, recSpan, recStatus, gcalAddUrl } from './_booking.js'
import { mailCancelled, mailMoved, mailConfirmed, summaryOf, descriptionOf } from './_booking-mail.js'

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

/** 管理画面で、日時と長さを自分で入れて直す（空いている枠からは選ばない）。
 *
 *  使いどころ: 予約とは別の日時に面談した・話が延びて長くなった・電話で日時を決め直した。
 *  店の人が自分で決めた日時なので、受付時間・何時間後から・カレンダーの空きは見ません。
 *  ただし、ほかの予約と重なる先の日時は断ります（二重予約を作らないため）。
 *
 *  opts.notify: お客様に変更のメールを送る（カレンダーの招待の更新も送る）
 *  opts.done:   終わった面談として記録する（来店済み）
 *  返す calendar: 'moved'（予定を動かした）/ 'added'（予定を作った）/ 'failed' / ''（つないでいない） */
export async function setBookingTime(req, rec, rules, span, opts = {}) {
  const store = storeConfig()
  const now = Date.now()
  const future = span.end > now
  const cells = future ? cellsFor(span.start, span.end, rules.bufferMin) : []
  if (cells.length && !(await takeCells(store, pipeline, cells, rec.id, span.end))) return { error: 'slot_taken' }
  const oldCells = recCells(rec, rules.bufferMin)
  const old = recSpan(rec)
  const oldWhen = label(old.start, old.end)
  const notify = !!opts.notify

  const next = {
    ...rec,
    start: span.start, end: span.end, key: new Date(span.start).toISOString(), when: label(span.start, span.end),
    seq: (rec.seq || 0) + 1, reminded: !future,
    history: log(rec, 'move', 'owner', { from: oldWhen, manual: true }),
  }
  if (cells.length) next.cells = [cells[0], cells[cells.length - 1]]; else delete next.cells

  // Google とつながっていれば、カレンダーの予定も同じ日時にします。予定がまだ無ければ作ります。
  let calendar = ''
  try {
    const c = await creds(req)
    if (connected(c)) {
      if (rec.eventId) {
        await moveEvent(c, rec.eventId, { startMs: span.start, endMs: span.end, notify })
        calendar = 'moved'
      } else {
        const ev = await createEvent(c, {
          startMs: span.start, endMs: span.end,
          summary: summaryOf(next, rules), description: descriptionOf(next),
          // 終わった面談に、あとから招待や会議URLは付けません。
          attendee: notify && future ? next.email || '' : '', attendeeName: next.name,
          online: future && rules.online, notify,
        })
        next.eventId = ev.id
        if (ev.meet) next.meet = ev.meet
        next.mode = 'google'
        calendar = 'added'
      }
    }
  } catch (_) {
    calendar = 'failed'
  }
  // カレンダーに入っていない予約は、「Googleカレンダーに追加」のリンクを新しい日時に作り直します。
  next.addUrl = next.eventId ? '' : gcalAddUrl({ startMs: span.start, endMs: span.end, summary: summaryOf(next, rules), description: descriptionOf(next) })

  if (opts.done) {
    next.status = 'visited'
    next.history = [...next.history, { at: new Date().toISOString(), what: 'visited', by: 'owner' }].slice(-30)
  }
  await releaseCells(store, pipeline, oldCells.filter((n) => !cells.includes(n)), rec.id)
  await saveBooking(store, pipeline, next, false)
  const mail = notify ? await mailMoved(req, next, rules, oldWhen, 'owner') : null
  return { rec: next, calendar, mail }
}

/** 管理画面の「確定にする」「来店済み」「無断キャンセル」「メモ」。 */
export async function markBooking(req, rec, rules, status, memo) {
  const store = storeConfig()
  const next = { ...rec }
  let mail = null
  // calendar: 'added'（この操作でカレンダーに入れた）/ 'failed'（入れられなかった）/ ''（対象外）
  let calendar = ''
  if (status && status !== recStatus(rec)) {
    next.status = status
    next.history = log(rec, status, 'owner')
    if (status === 'confirmed') {
      /* 仮予約（カレンダーに入っていない予約）を確定するとき、Google とつながっていれば、
         ここで予定を作ります（オンラインなら Meet のURLも）。簡易接続のあいだに入った予約を、
         あとから手で入れ直さなくて済むように。予定を作れなくても、確定は止めません。 */
      if (!next.eventId) {
        const c = await creds(req)
        const span = recSpan(rec)
        if (connected(c) && span.end > Date.now()) {
          try {
            const ev = await createEvent(c, {
              startMs: span.start, endMs: span.end,
              summary: summaryOf({ ...next, start: span.start, end: span.end }, rules), description: descriptionOf({ ...next, start: span.start, end: span.end }),
              attendee: next.email || '', attendeeName: next.name, online: rules.online,
            })
            next.eventId = ev.id
            if (ev.meet) next.meet = ev.meet
            next.mode = 'google'
            next.addUrl = ''
            calendar = 'added'
          } catch (_) { calendar = 'failed' }
        }
      }
      mail = await mailConfirmed(req, next, rules)
    }
  }
  if (typeof memo === 'string') next.memo = memo.slice(0, 1000)
  await saveBooking(store, pipeline, next, false)
  return { rec: next, mail, calendar }
}
