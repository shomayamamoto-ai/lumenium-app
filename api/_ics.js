// Googleカレンダーの「非公開iCal形式のURL」を読んで、埋まっている時間を出す。
//
// なぜこれがあるか:
//   予定の自動登録（Meetの発行まで）には Google Cloud での設定が要りますが、
//   「空いている時間を正しく出す」だけなら、ログインしてURLを1本コピーする
//   だけで足ります。設定の重さと、得られるものが釣り合う地点がここです。
//
// できること: 本当の空きから候補を出す。
// できないこと: 予定を書き込むこと（読み取り専用のURLなので）。確定は
//               仮予約＋.ics のままになります。
//
// 時間帯の扱い: UTC（末尾Z）と TZID=Asia/Tokyo をそのまま解釈します。それ以外の
// 地域指定や、地域の書いていない時刻は日本時間として読みます。このカレンダーの
// 持ち主が東京にいる前提で、そこを厳密にやるには時間帯データベースが要り、
// 得られる精度に見合いません。

const JST = 9 * 3600 * 1000

/** 折り返された行を戻す。iCal は75バイトで折り返し、続きは行頭が空白です。 */
export function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '')
}

/** 20260922T100000Z / 20260922T100000 / 20260922 を、ミリ秒に。 */
export function parseIcsDate(value, params) {
  const v = String(value || '').trim()
  const isUtc = v.endsWith('Z')
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, hh, mm, ss] = m
  const allDay = !hh
  const base = Date.UTC(+y, +mo - 1, +d, +(hh || 0), +(mm || 0), +(ss || 0))
  if (isUtc) return { ms: base, allDay }
  // Z が無い＝現地時刻。TZID があってもここでは日本時間として読みます。
  return { ms: base - JST, allDay }
}

const prop = (block, name) => {
  const re = new RegExp(`^${name}([^:\\n]*):(.*)$`, 'm')
  const m = block.match(re)
  return m ? { params: m[1] || '', value: m[2].trim() } : null
}

/** PT1H30M / P1D のような長さを、ミリ秒に。 */
function parseDuration(text) {
  const m = String(text || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return 0
  const [, d, h, mi, s] = m
  return ((+d || 0) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0)) * 1000
}

/** 繰り返しの展開。よくある形だけ扱います（毎日・毎週・毎月の同日）。
 *  扱えない形は、最初の1回だけを埋まっている時間として数えます——
 *  「読めなかったので空いていることにする」より安全な側に倒します。 */
function expand(startMs, endMs, rrule, fromMs, toMs) {
  const out = []
  const len = endMs - startMs
  if (!rrule) {
    if (endMs > fromMs && startMs < toMs) out.push({ start: startMs, end: endMs })
    return out
  }
  const get = (k) => (rrule.match(new RegExp(`${k}=([^;]+)`)) || [, ''])[1]
  const freq = get('FREQ')
  const interval = Math.max(1, +get('INTERVAL') || 1)
  const count = +get('COUNT') || 0
  const untilRaw = get('UNTIL')
  const until = untilRaw ? (parseIcsDate(untilRaw) || {}).ms : null
  const step = freq === 'DAILY' ? 86400000 * interval
    : freq === 'WEEKLY' ? 7 * 86400000 * interval
      : freq === 'MONTHLY' ? null
        : null

  let t = startMs
  for (let i = 0; i < 400; i++) {
    if (count && i >= count) break
    if (until && t > until) break
    if (t > toMs) break
    if (t + len > fromMs) out.push({ start: t, end: t + len })
    if (step) t += step
    else if (freq === 'MONTHLY') {
      const d = new Date(t + JST)
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + interval, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()) - JST
    } else break   // YEARLY など: 最初の1回だけ
  }
  return out
}

/** iCal本文から、指定期間に重なる「埋まっている時間」を取り出す。 */
export function busyFromIcs(text, fromMs, toMs) {
  const body = unfold(text)
  const blocks = body.split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0])
  const busy = []
  for (const block of blocks) {
    // 取り消された予定と、「予定あり」にしない予定は、埋まっていません。
    if (/^STATUS:CANCELLED/m.test(block)) continue
    if (/^TRANSP:TRANSPARENT/m.test(block)) continue

    const ds = prop(block, 'DTSTART')
    if (!ds) continue
    const start = parseIcsDate(ds.value, ds.params)
    if (!start) continue

    const de = prop(block, 'DTEND')
    const dur = prop(block, 'DURATION')
    let end
    if (de) {
      const parsed = parseIcsDate(de.value, de.params)
      end = parsed ? parsed.ms : null
    } else if (dur) {
      end = start.ms + parseDuration(dur.value)
    }
    if (!end) end = start.ms + (start.allDay ? 86400000 : 3600000)

    const rrule = (prop(block, 'RRULE') || {}).value
    busy.push(...expand(start.ms, end, rrule, fromMs, toMs))
  }
  return busy
    .filter((b) => b.end > fromMs && b.start < toMs)
    .sort((a, b) => a.start - b.start)
    .slice(0, 500)
}

/** URLを読んで、埋まっている時間を返す。読めなければ null（空いている、とは
 *  言いません——嘘の空き枠を出すくらいなら、営業時間のルールだけで出します）。 */
export async function busyFromUrl(url, fromMs, toMs) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'LumeniumBooking/1 (+https://lumenium.net/)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!/BEGIN:VCALENDAR/.test(text)) return null
    return busyFromIcs(text, fromMs, toMs)
  } catch (_) {
    return null
  }
}
