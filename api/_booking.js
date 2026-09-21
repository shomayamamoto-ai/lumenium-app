// 商談枠の作り方と、予約の記録。カレンダーの種類には依存しません。
//
// ここが決めるのは「いつなら出せるか」だけです。実際に空いているかは
// _google-cal.js が答え、予定を作るのも向こう側。分けてあるのは、Google が
// 未接続でも枠の提示はできるようにするためで、その場合は仮予約（.ics 付き）
// として扱います。
//
// 時刻はすべて JST。日本には夏時間が無いので UTC+9 の固定で正確です。

const JST = 9 * 3600 * 1000
const MIN = 60 * 1000

/** 出せる枠の決まり。数字を変えればそのまま反映されます。 */
export const RULES = {
  days: [1, 2, 3, 4, 5],   // 月〜金
  startHour: 10,
  endHour: 18,             // 18:00 開始は作らない（17:00〜18:00 が最後）
  slotMin: 60,
  // いま から この時間 より先の枠しか出さない。押した直後に「1時間後」を
  // 提示されても人は動けません。
  leadHours: 20,
  horizonDays: 14,
  // 最初に見せる数と、「全ての候補日程を見る」で出す数。
  first: 6,
  max: 24,
}

const parts = (ms) => {
  const d = new Date(ms + JST)
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), min: d.getUTCMinutes(), dow: d.getUTCDay(),
  }
}
const at = (y, m, d, h) => Date.UTC(y, m - 1, d, h) - JST
const WD = ['日', '月', '火', '水', '木', '金', '土']

/** 「1月24日(土) 09:00〜10:00」 */
export function label(startMs, endMs) {
  const s = parts(startMs)
  const e = parts(endMs)
  const p = (n) => String(n).padStart(2, '0')
  return `${s.m}月${s.d}日(${WD[s.dow]}) ${p(s.h)}:${p(s.min)}〜${p(e.h)}:${p(e.min)}`
}

export const dayLabel = (startMs) => {
  const s = parts(startMs)
  return `${s.m}/${s.d}(${WD[s.dow]})`
}
export const timeLabel = (startMs, endMs) => {
  const s = parts(startMs), e = parts(endMs)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(s.h)}:${p(s.min)}〜${p(e.h)}:${p(e.min)}`
}

/** 営業時間の決まりだけから作った候補。空きの確認はまだしていません。 */
export function candidates(now = Date.now(), rules = RULES) {
  const out = []
  const earliest = now + rules.leadHours * 3600 * 1000
  const last = now + rules.horizonDays * 86400 * 1000
  const today = parts(now)
  for (let day = 0; day <= rules.horizonDays; day++) {
    const base = at(today.y, today.m, today.d, 0) + day * 86400 * 1000
    const p = parts(base)
    if (!rules.days.includes(p.dow)) continue
    for (let h = rules.startHour; h < rules.endHour; h++) {
      const start = at(p.y, p.m, p.d, h)
      const end = start + rules.slotMin * MIN
      if (start < earliest || start > last) continue
      out.push({ start, end })
    }
  }
  return out
}

/** 埋まっている時間帯と重なる枠を落とす。 */
export function removeBusy(slots, busy) {
  if (!busy || !busy.length) return slots
  return slots.filter((s) => !busy.some((b) => b.start < s.end && b.end > s.start))
}

/** 画面に出す形。UTCのISO文字列を鍵にして、クライアントから戻ってきた値を
 *  そのまま信用せずに検証できるようにしています。 */
export const toWire = (s) => ({
  key: new Date(s.start).toISOString(),
  start: s.start,
  end: s.end,
  day: dayLabel(s.start),
  time: timeLabel(s.start, s.end),
  label: label(s.start, s.end),
})

/* ---- 記録 ------------------------------------------------------------ */

const TTL = 180 * 24 * 3600
const LOCK = (key) => `lum:bk:lock:${key}`
const REC = (id) => `lum:bk:rec:${id}`
const INDEX = 'lum:bk:index'

/** 同じ枠を二人が同時に押したときに、後から押した方を弾く。
 *  Google に繋がっていればカレンダー側でも二重には入りませんが、そこまで
 *  行く前に止めたほうが、相手に見えるのは「埋まりました」の一言で済みます。 */
export async function takeSlot(cfg, pipeline, key) {
  if (!cfg) return true
  try {
    const [res] = await pipeline(cfg, [['SET', LOCK(key), '1', 'NX', 'EX', 60 * 60 * 24 * 30]])
    return res === 'OK' || res === true
  } catch (_) {
    // 保存先が落ちているだけで予約を断るのは、損のほうが大きい。
    return true
  }
}

export async function releaseSlot(cfg, pipeline, key) {
  if (!cfg) return
  try { await pipeline(cfg, [['DEL', LOCK(key)]]) } catch (_) { /* 放っておく */ }
}

export async function saveBooking(cfg, pipeline, rec) {
  if (!cfg) return
  try {
    await pipeline(cfg, [
      ['SET', REC(rec.id), JSON.stringify(rec), 'EX', TTL],
      ['LPUSH', INDEX, rec.id],
      ['LTRIM', INDEX, 0, 199],
    ])
  } catch (_) { /* 予約そのものは成立している */ }
}

export async function recentBookings(cfg, pipeline, n = 20) {
  if (!cfg) return []
  try {
    const [ids] = await pipeline(cfg, [['LRANGE', INDEX, 0, n - 1]])
    if (!Array.isArray(ids) || !ids.length) return []
    const rows = await pipeline(cfg, ids.map((id) => ['GET', REC(id)]))
    return rows.map((r) => { try { return JSON.parse(r) } catch (_) { return null } }).filter(Boolean)
  } catch (_) {
    return []
  }
}

/* ---- カレンダーに入れてもらうためのファイル -------------------------- */

const ics = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Google が未接続のときに添付する .ics。Google・Outlook・iPhone の
 *  どれでも開けます（Meet のURLだけは入りません）。 */
export function icsFile({ id, startMs, endMs, summary, description, organizer, attendee }) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lumenium//Booking//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${id}@lumenium.net`,
    `DTSTAMP:${ics(Date.now())}`,
    `DTSTART:${ics(startMs)}`,
    `DTEND:${ics(endMs)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `ORGANIZER;CN=Lumenium:mailto:${organizer}`,
    `ATTENDEE;CN=${esc(attendee)};RSVP=TRUE:mailto:${attendee}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
