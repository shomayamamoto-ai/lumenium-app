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

import { BRAND } from './_brand.js'

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

/** カレンダーのURLを読めるか確かめ、読めないときは理由を言葉で返します。
 *  { ok: true, busy: [...] } か { ok: false, why: '…' }。
 *  「公開URL」でも、カレンダーを一般公開（時間枠のみで足ります）にしてあれば読めます。
 *  会社用の Google アカウントでは非公開URLが出ないことがあり、そのときはこの道しか
 *  ありません。なので URL の形だけでは断らず、必ず実際に読んでから判断します
 *  （形だけで「公開URLは読めない」と決めつけ、正しく公開した人を通さなかったことがあります）。 */
export async function probeIcs(url, fromMs, toMs) {
  const u = String(url || '').trim()
  if (!/^https:\/\//i.test(u)) return { ok: false, why: 'https:// で始まるURLではありません。Googleカレンダーの「非公開の iCal 形式の URL」をそのまま貼ってください。' }
  const isPublic = /\/public\/[^/]*\.ics/i.test(u)
  if (!/\.ics(\?|$)/i.test(u)) {
    return { ok: false, why: 'カレンダーの画面や埋め込みのURLのようです。必要なのは、末尾が basic.ics の「非公開の iCal 形式の URL」です。' }
  }
  let res
  try {
    res = await fetch(u, {
      headers: { 'user-agent': `${BRAND.name}Booking/1 (+${BRAND.url}/)` },
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    return { ok: false, why: /abort|timeout/i.test(String((e && e.message) || e)) ? 'Google からの返事が時間内に来ませんでした。少しおいてもう一度お試しください。' : 'URL に接続できませんでした。' }
  }
  if (!res.ok && isPublic) {
    return { ok: false, why: `貼ってあるのは「公開URL」で、いまは Google が読ませてくれません（${res.status}）。Googleカレンダーの設定 › 自分のカレンダー › 「予定のアクセス権限」で「一般公開して誰でも利用できるようにする」にチェックを入れ、右の選択を「予定の表示（時間枠のみ、詳細は非表示）」にしてください（公開されるのは埋まっている時間だけです。チェックを入れた直後は、反映まで数分かかることがあります）。「非公開の iCal 形式の URL」が表示されるアカウントなら、そちらを貼っても構いません。` }
  }
  if (!res.ok) {
    return { ok: false, why: `Google がこのURLを受け付けませんでした（${res.status}）。URLをリセットした場合や、コピーが途中で切れた場合に起こります。Googleカレンダーでコピーし直して、貼り直してください。` }
  }
  const text = await res.text()
  if (!/BEGIN:VCALENDAR/.test(text)) return { ok: false, why: '返ってきたものがカレンダーの形式ではありませんでした。「非公開の iCal 形式の URL」を貼り直してください。' }
  return { ok: true, busy: busyFromIcs(text, fromMs, toMs) }
}

/** URLを読んで、埋まっている時間を返す。読めなければ null（空いている、とは
 *  言いません。呼ぶ側は、読めないあいだ枠を出しません）。 */
export async function busyFromUrl(url, fromMs, toMs) {
  const r = await probeIcs(url, fromMs, toMs)
  return r.ok ? r.busy : null
}
