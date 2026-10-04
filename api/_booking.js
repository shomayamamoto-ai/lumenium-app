// 予約枠の作り方と、予約の記録。カレンダーの種類には依存しません。
//
// ここが決めるのは「いつなら出せるか」だけです。実際に空いているかは
// _google-cal.js が答え、予定を作るのも向こう側。分けてあるのは、Google が
// 未接続でも枠の提示はできるようにするためで、その場合は仮予約（.ics 付き）
// として扱います。
//
// 営業時間・休みの日・メニューは、管理画面の「予約管理」で決めて Redis
// （`${KV}bk:rules`）に保存します。何も保存していなければ DEFAULT_RULES、
// つまり以前と同じ「平日10〜18時・60分・前後30分あけ」で動きます。
//
// 時刻はすべて JST。日本には夏時間が無いので UTC+9 の固定で正確です。

import { BRAND, KV } from './_brand.js'

const JST = 9 * 3600 * 1000
const MIN = 60 * 1000
const DAY = 86400 * 1000

/** 呼び方。メールと画面の「◯◯のご予約」に入ります。 */
export const WORDINGS = ['商談', '予約', '来店', '相談']

/** 何も決めていないときの決まり（＝以前の動き）。 */
export const DEFAULT_RULES = {
  wording: '商談',
  // 曜日ごとの受付時間（日〜土）。1日に複数の時間帯を持てます（昼休みなど）。
  // 値は 0時からの分。[600, 1080] は 10:00〜18:00。
  week: [[], [[600, 1080]], [[600, 1080]], [[600, 1080]], [[600, 1080]], [[600, 1080]], []],
  // 祝日（下の表）を休みにするか。以前は祝日を見ていなかったので既定は off。
  holidays: false,
  // 臨時休業の日（YYYY-MM-DD）。
  closed: [],
  // いま から この時間 より先の枠しか出さない。押した直後に「1時間後」を
  // 提示されても人は動けません。
  leadHours: 20,
  horizonDays: 14,
  // 予定の前後に空ける時間。埋まっている予定・既に入った予約のどちらの
  // 前後にも、この分だけ余白をとってから枠を出します。
  bufferMin: 30,
  // 開始時刻の刻み。30分刻みにしておくと、予定の30分後から始まる枠も
  // 出せます（1時間刻みだと、余白を取るたびに1時間まるごと消えます）。
  stepMin: 30,
  // お客様が自分で取り消し・変更できるのは、開始のこの時間前まで。
  cutoffHours: 24,
  // Google に接続しているとき、予定に Meet のURLを付けるか（来店型なら off）。
  online: true,
  // 来店型のときの場所（メールに入ります）。
  place: '',
  // 前日のリマインドメール。
  remind: true,
  // オーナーの LINE ユーザーID（毎朝の予定一覧を送る先。空なら送らない）。
  lineUserId: '',
  services: [{ id: 'default', name: 'オンライン相談', minutes: 60, desc: '', price: '', active: true }],
}

// 最初に見せる数と、「全ての候補日程を見る」で出す数。
export const SHOW = { first: 6, max: 24 }

/** 以前の名前。値は DEFAULT_RULES と同じ意味です。 */
export const RULES = { slotMin: 60, ...SHOW }

/* ---- 祝日 ------------------------------------------------------------
   内閣府の「国民の祝日」から 2026・2027 年分（振替休日・国民の休日を含む）。
   表に無い年は祝日として扱いません。年が明ける前に足してください。 */
export const HOLIDAYS = {
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日', '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日', '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日', '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日', '2027-03-22': '振替休日', '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日', '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日', '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
}
export const HOLIDAY_LAST = '2027-12-31'

/* ---- 日付 ------------------------------------------------------------ */

const parts = (ms) => {
  const d = new Date(ms + JST)
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), min: d.getUTCMinutes(), dow: d.getUTCDay(),
  }
}
const at = (y, m, d, h) => Date.UTC(y, m - 1, d, h) - JST
const WD = ['日', '月', '火', '水', '木', '金', '土']
const p2 = (n) => String(n).padStart(2, '0')

/** 日本時間の日付 'YYYY-MM-DD'。 */
export const jstDay = (ms) => { const s = parts(ms); return `${s.y}-${p2(s.m)}-${p2(s.d)}` }
/** 日本時間のその日の 0:00。 */
export const dayStart = (ms) => { const s = parts(ms); return at(s.y, s.m, s.d, 0) }

/** 「1月24日(土) 09:00〜10:00」 */
export function label(startMs, endMs) {
  const s = parts(startMs)
  const e = parts(endMs)
  return `${s.m}月${s.d}日(${WD[s.dow]}) ${p2(s.h)}:${p2(s.min)}〜${p2(e.h)}:${p2(e.min)}`
}

export const dayLabel = (startMs) => {
  const s = parts(startMs)
  return `${s.m}/${s.d}(${WD[s.dow]})`
}
export const timeLabel = (startMs, endMs) => {
  const s = parts(startMs), e = parts(endMs)
  return `${p2(s.h)}:${p2(s.min)}〜${p2(e.h)}:${p2(e.min)}`
}

/* ---- 決まりの検査 -------------------------------------------------------
   管理画面から来た値は、そのまま信じずにここで形を整えます。直せないものは
   既定に戻し、何を直したかを problems で返します（画面にそのまま出ます）。 */

const int = (v, lo, hi, def) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= lo && n <= hi ? n : def
}
const q15 = (n) => n % 15 === 0

function cleanRanges(list) {
  const out = []
  for (const r of Array.isArray(list) ? list : []) {
    const s = Math.round(Number(r && r[0]))
    const e = Math.round(Number(r && r[1]))
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e > 1440 || s >= e) continue
    if (!q15(s) || !q15(e)) continue
    out.push([s, e])
  }
  out.sort((a, b) => a[0] - b[0])
  // 重なり・接している時間帯はまとめる。
  const merged = []
  for (const r of out) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push(r)
  }
  return merged.slice(0, 4)
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24)

export function normalizeRules(input) {
  const src = input && typeof input === 'object' ? input : {}
  const D = DEFAULT_RULES
  const problems = []
  const r = {}
  r.wording = WORDINGS.includes(src.wording) ? src.wording : D.wording

  r.week = []
  for (let i = 0; i < 7; i++) {
    const given = Array.isArray(src.week) ? src.week[i] : D.week[i]
    const clean = cleanRanges(given)
    if (Array.isArray(given) && given.length !== clean.length && Array.isArray(src.week)) {
      problems.push(`${WD[i]}曜日の時間帯のうち、読めないもの（15分単位でない・終わりが始まりより前など）は除くか、まとめました。`)
    }
    r.week.push(clean)
  }
  if (!r.week.some((x) => x.length)) problems.push('受付する曜日が1つもありません。この状態では予約欄はサイトに出ません。')

  r.holidays = src.holidays === undefined ? D.holidays : !!src.holidays
  r.closed = [...new Set((Array.isArray(src.closed) ? src.closed : [])
    .map((s) => String(s).trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))))].sort().slice(-200)

  r.leadHours = int(src.leadHours ?? D.leadHours, 0, 168, D.leadHours)
  r.horizonDays = int(src.horizonDays ?? D.horizonDays, 1, 90, D.horizonDays)
  r.bufferMin = int(src.bufferMin ?? D.bufferMin, 0, 120, D.bufferMin)
  if (!q15(r.bufferMin)) { problems.push('前後の空き時間は15分単位にしました。'); r.bufferMin = Math.round(r.bufferMin / 15) * 15 }
  r.stepMin = [15, 30, 60].includes(Number(src.stepMin)) ? Number(src.stepMin) : D.stepMin
  r.cutoffHours = int(src.cutoffHours ?? D.cutoffHours, 0, 168, D.cutoffHours)
  r.online = src.online === undefined ? D.online : !!src.online
  r.place = String(src.place ?? '').trim().slice(0, 120)
  r.remind = src.remind === undefined ? D.remind : !!src.remind
  const line = String(src.lineUserId ?? '').trim()
  r.lineUserId = /^U[0-9a-f]{32}$/.test(line) ? line : ''
  if (line && !r.lineUserId) problems.push('LINE のユーザーIDは「U」で始まる33文字です。読めなかったので空にしました。')

  const seen = new Set()
  r.services = []
  for (const s of Array.isArray(src.services) ? src.services : D.services) {
    const name = String(s?.name ?? '').trim().slice(0, 40)
    if (!name) continue
    let minutes = int(s.minutes, 15, 480, 60)
    if (!q15(minutes)) minutes = Math.max(15, Math.round(minutes / 15) * 15)
    let id = slug(s.id) || `s${r.services.length + 1}`
    while (seen.has(id)) id += 'x'
    seen.add(id)
    r.services.push({
      id, name, minutes,
      desc: String(s.desc ?? '').trim().slice(0, 200),
      price: String(s.price ?? '').trim().slice(0, 40),
      active: s.active === undefined ? true : !!s.active,
    })
    if (r.services.length >= 12) break
  }
  if (!r.services.some((s) => s.active)) {
    problems.push('受け付けるメニューが無かったので、既定のメニューを足しました。')
    r.services.push({ ...D.services[0], id: seen.has('default') ? 'default2' : 'default' })
  }
  return { rules: r, problems }
}

/** 受け付けているメニュー。id が無い・止めてあるときは先頭のもの。 */
export const activeServices = (rules) => rules.services.filter((s) => s.active)
export function pickService(rules, id) {
  const list = activeServices(rules)
  return list.find((s) => s.id === id) || list[0]
}

/** 「商談のご予約」「ご予約」など。 */
export const bookingNoun = (rules) => (rules.wording === '予約' ? 'ご予約' : `${rules.wording}のご予約`)

/** その日が休みか（曜日の時間帯が無い・臨時休業・祝日）。 */
export function closedOn(ms, rules) {
  const day = jstDay(ms)
  if (rules.closed.includes(day)) return '臨時休業'
  if (rules.holidays && HOLIDAYS[day]) return HOLIDAYS[day]
  if (!rules.week[parts(ms).dow].length) return '定休日'
  return ''
}

/** 営業時間の決まりだけから作った候補。空きの確認はまだしていません。 */
export function candidates(now = Date.now(), rules = DEFAULT_RULES, minutes = 60) {
  const out = []
  const earliest = now + rules.leadHours * 3600 * 1000
  const last = now + rules.horizonDays * DAY
  const today = dayStart(now)
  const step = rules.stepMin || 30
  for (let day = 0; day <= rules.horizonDays; day++) {
    // 12時を足してから日付を取るのは、0時ちょうどの境目で前日に転ばないため。
    const base = dayStart(today + day * DAY + 12 * 3600 * 1000)
    if (closedOn(base, rules)) continue
    for (const [s, e] of rules.week[parts(base).dow]) {
      for (let m = s; m + minutes <= e; m += step) {
        const start = base + m * MIN
        const end = start + minutes * MIN
        if (start < earliest || start > last) continue
        out.push({ start, end })
      }
    }
  }
  return out
}

/** 埋まっている時間帯と重なる枠を落とす。予定の前後には bufferMin 分の
 *  余白をとります（直前・直後に詰めて入れない）。 */
export function removeBusy(slots, busy, bufferMin = DEFAULT_RULES.bufferMin) {
  if (!busy || !busy.length) return slots
  const pad = (bufferMin || 0) * MIN
  return slots.filter((s) => !busy.some((b) => b.start - pad < s.end && b.end + pad > s.start))
}

/** Googleカレンダーに「予定を追加」する画面のURL。押すと中身が入った状態で
 *  開き、保存を押すだけで登録できます（簡易接続では書き込めないため）。 */
export function gcalAddUrl({ startMs, endMs, summary, description }) {
  const f = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const q = new URLSearchParams({ action: 'TEMPLATE', text: summary || '', dates: `${f(startMs)}/${f(endMs)}`, details: description || '', ctz: 'Asia/Tokyo' })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

/** 画面に出す形。UTCのISO文字列を鍵にして、クライアントから戻ってきた値を
 *  そのまま信用せずに検証できるようにしています。 */
export const toWire = (s) => ({
  key: new Date(s.start).toISOString(),
  start: s.start,
  end: s.end,
  minutes: Math.round((s.end - s.start) / MIN),
  day: dayLabel(s.start),
  time: timeLabel(s.start, s.end),
  label: label(s.start, s.end),
})

/* ---- 決まりの保存 ------------------------------------------------------ */

export const RULES_KEY = `${KV}bk:rules`

export async function readRules(cfg, pipeline) {
  if (!cfg) return normalizeRules(null).rules
  try {
    const [raw] = await pipeline(cfg, [['GET', RULES_KEY]])
    return normalizeRules(raw ? JSON.parse(raw) : null).rules
  } catch (_) {
    return normalizeRules(null).rules
  }
}

export async function saveRules(cfg, pipeline, input) {
  const { rules, problems } = normalizeRules(input)
  await pipeline(cfg, [['SET', RULES_KEY, JSON.stringify(rules)]])
  return { rules, problems }
}

/* ---- 記録 ------------------------------------------------------------ */

const TTL = 180 * 24 * 3600
const REC = (id) => `${KV}bk:rec:${id}`
const INDEX = `${KV}bk:index`
// 開始時刻で並べた予約の id（空きの計算と前日のリマインドが使う）。
const BY_START = `${KV}bk:z`

/* ---- 重ならないための鍵 -------------------------------------------------
   以前は「開始時刻」ごとに鍵を1つ取っていました。これだと 10:00 と 10:30 は
   別の鍵なので、60分の枠を二人が同時に押すと、両方とも通って重なります。

   いまは時間を15分の区切り（セル）に分け、予約が使う区切りを全部取ります。
   使うのは「開始 〜 終わり＋前後の空き」。両方の予約が自分の後ろにだけ空きを
   持てば、間が空き時間より短い2件は必ずどこかの区切りを取り合います。

   取り方は「全部取れたら成功、1つでも取れなければ、自分が取った分を返して
   失敗」。同時に押した2人が別々の区切りを取って両方とも失敗することは
   ありますが（その場合はもう一度押せば取れます）、両方とも通ることは
   ありません。区切りの値は予約の id なので、返すときに他人の分は消しません。 */
export const CELL_MIN = 15
const CELL = (n) => `${KV}bk:cell:${n}`

export function cellsFor(startMs, endMs, bufferMin = 0) {
  const c = CELL_MIN * MIN
  const out = []
  for (let i = Math.floor(startMs / c); i < Math.ceil((endMs + bufferMin * MIN) / c); i++) out.push(i)
  return out
}

/** 区切りを全部取る。取れたら true。保存先が無い・落ちているときも true
 *  （保存先が落ちているだけで予約を断るのは、損のほうが大きい）。 */
export async function takeCells(cfg, pipeline, cells, owner, untilMs, now = Date.now()) {
  if (!cfg || !cells.length) return true
  const ttl = Math.max(3600, Math.ceil((untilMs - now) / 1000) + 2 * 86400)
  let res
  try {
    res = await pipeline(cfg, cells.map((n) => ['SET', CELL(n), owner, 'NX', 'EX', ttl]))
  } catch (_) {
    return true
  }
  const got = cells.filter((_, i) => res[i] === 'OK' || res[i] === true)
  if (got.length === cells.length) return true
  if (got.length) {
    try { await pipeline(cfg, got.map((n) => ['DEL', CELL(n)])) } catch (_) { /* 期限で消えます */ }
  }
  return false
}

/** 取消・日時の変更で区切りを返す。自分（owner）の分だけを消します。 */
export async function releaseCells(cfg, pipeline, cells, owner) {
  if (!cfg || !cells.length) return 0
  try {
    const vals = await pipeline(cfg, cells.map((n) => ['GET', CELL(n)]))
    const mine = cells.filter((_, i) => vals[i] === owner)
    if (mine.length) await pipeline(cfg, mine.map((n) => ['DEL', CELL(n)]))
    return mine.length
  } catch (_) {
    return 0
  }
}

/** その予約が取った区切り。記録に無ければ（以前の記録）今の決まりから作り直します。 */
export function recCells(rec, bufferMin = 0) {
  if (Array.isArray(rec.cells) && rec.cells.length === 2) {
    const out = []
    for (let i = rec.cells[0]; i <= rec.cells[1] && out.length < 200; i++) out.push(i)
    return out
  }
  const { start, end } = recSpan(rec)
  return cellsFor(start, end, bufferMin)
}

/* ---- 予約の記録 ---- */

/** 以前の記録には start/end/status がありません。鍵（開始のISO）と方式から補います。 */
export function recSpan(rec) {
  const start = Number(rec.start) || Date.parse(rec.key)
  const end = Number(rec.end) || start + ((rec.service && rec.service.minutes) || 60) * MIN
  return { start, end }
}
export const STATUS = {
  confirmed: '確定', tentative: '仮予約', cancelled: 'キャンセル', visited: '来店済み', noshow: '無断キャンセル',
}
export const recStatus = (rec) => rec.status || (rec.mode === 'google' ? 'confirmed' : 'tentative')
/** 枠を使っている（＝他の人が取れない）予約か。 */
export const occupies = (rec) => ['confirmed', 'tentative', 'visited'].includes(recStatus(rec))

export async function saveBooking(cfg, pipeline, rec, isNew = true) {
  if (!cfg) return
  try {
    const cmds = [['SET', REC(rec.id), JSON.stringify(rec), 'EX', TTL], ['ZADD', BY_START, recSpan(rec).start, rec.id]]
    if (isNew) cmds.push(['LPUSH', INDEX, rec.id], ['LTRIM', INDEX, 0, 499])
    await pipeline(cfg, cmds)
  } catch (_) { /* 予約そのものは成立している */ }
}

export async function getBooking(cfg, pipeline, id) {
  if (!cfg || !/^bk_[\w-]+$/.test(String(id || ''))) return null
  try {
    const [raw] = await pipeline(cfg, [['GET', REC(id)]])
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

/** 開始時刻が from〜to の予約。以前の記録（並びに入っていないもの）も、
 *  新しい順の一覧の先頭から拾います。 */
export async function bookingsBetween(cfg, pipeline, fromMs, toMs) {
  if (!cfg) return []
  try {
    const [zids, lids] = await pipeline(cfg, [
      ['ZRANGEBYSCORE', BY_START, Math.floor(fromMs), Math.ceil(toMs)],
      ['LRANGE', INDEX, 0, 49],
    ])
    const ids = [...new Set([...(Array.isArray(zids) ? zids : []), ...(Array.isArray(lids) ? lids : [])])]
    if (!ids.length) return []
    const rows = await pipeline(cfg, ids.map((id) => ['GET', REC(id)]))
    return rows.map((r) => { try { return JSON.parse(r) } catch (_) { return null } })
      .filter(Boolean)
      .filter((r) => { const s = recSpan(r).start; return s >= fromMs && s <= toMs })
      .sort((a, b) => recSpan(a).start - recSpan(b).start)
  } catch (_) {
    return []
  }
}

/** 空きの計算に使う「もう埋まっている時間」。 */
export async function takenSpans(cfg, pipeline, fromMs, toMs) {
  const list = await bookingsBetween(cfg, pipeline, fromMs - DAY, toMs)
  return list.filter(occupies).map(recSpan)
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
    `PRODID:-//${BRAND.name}//Booking//JA`,
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${id}@${BRAND.host}`,
    `DTSTAMP:${ics(Date.now())}`,
    `DTSTART:${ics(startMs)}`,
    `DTEND:${ics(endMs)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `ORGANIZER;CN=${esc(BRAND.name)}:mailto:${organizer}`,
    `ATTENDEE;CN=${esc(attendee)};RSVP=TRUE:mailto:${attendee}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
