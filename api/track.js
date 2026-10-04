export const config = { runtime: 'edge' }

// Pageview beacon. Deliberately privacy-preserving:
//   - no cookies, no localStorage, nothing written to the visitor's device
//   - the IP is never stored. It is hashed together with the user agent, the
//     date and a server-side salt, and that hash only ever enters a
//     HyperLogLog, which counts distinct values without keeping them. The
//     date in the hash means the id cannot follow anyone across days.
// So the admin page can answer "how many people, on what pages" and cannot
// answer "who", which is the only question worth refusing to answer.

import { storeConfig, pipeline, jstDate, jstHour, K } from './_analytics-store.js'
import { visitPlan, fromOurPages, selfReferrer } from './_visit.js'
import { sourceKey } from './_referrers.js'

const enc = new TextEncoder()

/* 自分で「自動です」と名乗っているものだけを外します。
   以前は pinterest・flipboard・tumblr・whatsapp などの名前も外していて、
   それらのアプリの中のブラウザで実際に読んでいる人まで消えていました
   （アプリ内ブラウザの User-Agent にはアプリ名が入ります）。リンクの
   プレビューを作るだけのロボットは JavaScript を動かさないので、そもそも
   ここへは送ってきません。cubot は bot ではなくスマートフォンの名前です。 */
const BOT = /(?<!cu)bot\b|(?<!cu)bot\/|crawler|spider|crawl|slurp|archiver|headless|phantomjs|selenium|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|curl\/|wget|python|aiohttp|httpx|axios|node-fetch|undici|go-http|java\/|okhttp|libwww|postman|insomnia|scrape|facebookexternalhit|facebookcatalog|embedly|bingpreview|vkshare|flipboardproxy|preview|validator|feedfetcher/i

// Paths that are operational rather than public, so they never enter the stats.
const IGNORED = /^\/(admin-members|login|register|fix|members|api)\b/

function device(ua) {
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return 'mobile'
  return 'desktop'
}

/** その訪問の流入元。計測用リンクから来たなら、紹介元よりそちらを優先します
 *  （アプリ内のリンクやQRは紹介元を送らないため、放っておくと「直接」に
 *  混ざります）。閲覧にも、問い合わせなどの成果にも、同じ決め方を使います。 */
function sourceOf(body, host) {
  // utm_source=chatgpt.com のようなホスト名の形も受け取ります（sourceKey）。
  // ChatGPT のアプリから開かれたときは紹介元が空で、手がかりはこれだけです。
  const key = sourceKey(body?.s)
  if (key && key !== host.replace(/^www\./, '')) return key
  return refHost(body?.r, host)
}

function refHost(ref, selfHost) {
  if (!ref) return 'direct'
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '')
    if (!h || h === selfHost.replace(/^www\./, '')) return 'direct'
    return h.slice(0, 80)
  } catch {
    return 'direct'
  }
}

/** The funnel, in order. Anything not on this list is ignored — the counter
 *  is a Redis hash, and letting callers name their own fields would let one
 *  grow without bound. */
export const EVENTS = new Set([
  // 読まれた深さ。閲覧数は「開かれた」までしか言いません。開いてすぐ
  // 閉じたのか最後まで読んだのかが分からないと、書いた文章が効いて
  // いるのかを判断できません。
  'read_half',       // そのページの半分まで来た
  'read_end',        // 終わりまで来た
  // サイトの外へ出ていく操作。フォームを通らない連絡はここにしか
  // 出てきません。
  'click_tel',       // 電話番号
  'click_line',      // LINE
  'click_mail',      // メール
  'click_out',       // よそのサイトへのリンク
  // そのページを最後にサイトを離れた。
  'exit',
  // 存在しないURLに着いた（404 のページから送られます）。
  'not_found',
  // メニュー・見積りの段（menu_open / estimate_*）は、その画面が無くなった
  // ので受け付けません。
  'service_view',    // a service detail was opened
  'contact_view',    // the enquiry form was reached
  'contact_start',   // the first field was filled
  'contact_submit',  // an enquiry was sent
  'booking_view',    // candidate meeting times were shown
  'booking_confirm', // a meeting was booked
])

/** 出ていった先の呼び名。呼び出し側の文字列をそのまま鍵にすると、
 *  いくらでも増やせてしまいます。電話・LINE・メールは固定、外部リンクは
 *  ホスト名だけを（英数字と記号に限って）通します。 */
function linkLabel(ev, raw) {
  if (ev === 'click_tel') return 'tel'
  if (ev === 'click_line') return 'line'
  if (ev === 'click_mail') return 'mail'
  const h = String(raw || '').toLowerCase().replace(/^www\./, '')
  if (!/^[a-z0-9.-]{3,60}$/.test(h)) return 'other'
  return h
}

/** Keep the path list bounded and free of anything identifying. */
function cleanPath(raw) {
  let p = String(raw || '/').split('?')[0]
  // The app's hash routes are its real pages. The client already folds them
  // into a path, but fold here too: dropping the hash instead would quietly
  // merge every section into "/" if anything ever sends the raw location.
  const h = p.indexOf('#')
  if (h >= 0) {
    const frag = p.slice(h + 1)
    p = frag.startsWith('/') ? frag : p.slice(0, h)
  }
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/{2,}/g, '/')
  if (p.length > 1) p = p.replace(/\/$/, '')
  p = p.slice(0, 120) || '/'
  // A real address arrives percent-encoded, so it only ever holds these
  // characters. Anything else (quotes, spaces, angle brackets) was typed by
  // someone posting here directly, and this string is shown in the admin.
  return /^\/[A-Za-z0-9/_\-.~%]*$/.test(p) ? p : '/(other)'
}

// How many distinct paths / referrers one day may hold. A real site of this
// size sees a few dozen; the cap only stops someone inventing new ones to
// bloat the store and push junk into the report.
const MAX_FIELDS = 300
// Beacons per visitor per minute. Reading a page sends a handful; more than
// this is a script.
const MAX_PER_MIN = 60

/** One round trip before writing: the caller's rate, and whether the hash
 *  the value would go into is already full. A value already in the hash is
 *  always counted; only a new one is folded into "(other)" once it is full. */
async function guard(cfg, rateKey, slots) {
  try {
    const out = await pipeline(cfg, [
      ['INCR', rateKey], ['EXPIRE', rateKey, 60, 'NX'],
      ...slots.flatMap(([hash, field]) => [['HLEN', hash], ['HEXISTS', hash, field]]),
    ])
    if (Number(out[0]) > MAX_PER_MIN) return null
    return slots.map(([, field, other], i) =>
      Number(out[2 + i * 2]) >= MAX_FIELDS && !Number(out[3 + i * 2]) ? other : field)
  } catch (_) {
    return slots.map(([, field]) => field)
  }
}

async function visitorId(ip, ua, date, salt) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${ip}|${ua}|${date}|${salt}`))
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req) {
  // A beacon must never make the page look broken, so every failure path
  // still answers 204.
  const ok = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

  const cfg = storeConfig()
  if (!cfg) return ok()

  const ua = req.headers.get('user-agent') || ''
  if (!ua || BOT.test(ua)) return ok()
  // よそのページに仕込まれた送信は数えません（_visit.js）。
  if (!fromOurPages(req)) return ok()

  /* 自分のアクセスを数えない仕組みは、送る前——訪問者の端末側——に
     あります（src/lib/pageview.js）。ここで cookie を見ないのは、
     この beacon が credentials: 'omit' で送られ、cookie がそもそも
     届かないからです。届かないものを調べる行を置くと、効いている
     ように見えて実は何もしていない、という一番たちの悪いコードに
     なります。 */

  let body
  try {
    body = await req.json()
  } catch {
    return ok()
  }

  const path = cleanPath(body?.p)
  if (IGNORED.test(path)) return ok()

  // A funnel step rather than a pageview. Only names this file knows are
  // counted, so a hostile caller cannot invent unbounded hash fields.
  const date = jstDate()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const salt = (process.env.ADMIN_KEY || 'lumenium') + ':analytics'
  const vid = await visitorId(ip, ua, date, salt)

  // Per address rather than per visitor id: the id changes with the user
  // agent, which a script can rotate freely.
  const rateKey = K.rate((await visitorId(ip, '', date, salt)).slice(0, 16))
  const ev = typeof body?.e === 'string' ? body.e : ''

  /* ---- 訪問（セッション）: 訪問数・直帰・入口・見ていた時間・成果の流入元 ----
     何を書くかは _visit.js が決めます。ここではそれを、下の書き込みに
     相乗りさせるだけです（往復を増やさないため）。 */
  const self = new URL(req.url).hostname
  const plan = visitPlan({
    kind: !ev ? 'view' : ev === 'not_found' ? 'not_found' : ev === 'page_time' ? 'page_time' : 'event',
    ev, body, path, date,
    source: sourceOf(body, self),
    selfRef: selfReferrer(body?.r, self),
    clean: cleanPath,
    hour: jstHour(),
  })
  // サイト内で次のページへ移った。見ていた時間だけを書きます（閲覧でも、
  // 導線の段でもありません）。
  if (ev === 'page_time') {
    const g = await guard(cfg, rateKey, plan.slots)
    if (!g) return ok()
    try { await pipeline(cfg, plan.commands(g)) } catch (_) { /* best-effort */ }
    return ok()
  }

  if (ev) {
    if (!EVENTS.has(ev)) return ok()
    const g = await guard(cfg, rateKey, [[K.dayEventPaths(date, ev), path, '/(other)'], ...plan.slots])
    if (!g) return ok()
    const [evPath, ...visitFields] = g
    /* 出ていった先。tel / line / mail、外部リンクなら相手のホスト名。
       ページ名と同じ hash に混ぜず、専用の一覧に入れます——「どのページで
       押されたか」と「どこへ出ていったか」は別の問いで、混ぜると
       どちらの答えにもならないからです。呼び出し側が好きな文字列を
       入れられないよう、ここで形を決めます。 */
    const dest = /^click_/.test(ev) ? linkLabel(ev, body?.d) : ''
    try {
      await pipeline(cfg, [
        ['HINCRBY', K.dayEvents(date), ev, 1],
        ['EXPIRE', K.dayEvents(date), K.expire],
        // How many times, and separately how many people. Only the second can
        // be divided by the visitor count to get a rate.
        ['PFADD', K.dayEventUsers(date, ev), vid],
        ['EXPIRE', K.dayEventUsers(date, ev), K.expire],
        // …そして、どのページで起きたか。全体の読了率だけでは
        // 「どのページを書き直すか」が決まりません。
        ['HINCRBY', K.dayEventPaths(date, ev), evPath, 1],
        ['EXPIRE', K.dayEventPaths(date, ev), K.expire],
        ...(dest ? [
          ['HINCRBY', K.dayLinks(date), dest, 1],
          ['EXPIRE', K.dayLinks(date), K.expire],
        ] : []),
        ...plan.commands(visitFields),
      ])
    } catch (_) { /* a beacon must never surface an error */ }
    return ok()
  }

  const dev = device(ua)
  // 流入元（pv:r）は訪問の最初の1ページでだけ数えるので、plan の側にあります。
  // サイト内を移るたびに数えていた頃は、移動のぶんだけ「直接」が増えていました。
  const g = await guard(cfg, rateKey, [[K.dayPaths(date), path, '/(other)'], ...plan.slots])
  if (!g) return ok()
  const [pvPath, ...visitFields] = g

  try {
    await pipeline(cfg, [
      ['INCR', K.totalViews],
      ['INCR', K.dayViews(date)],
      ['EXPIRE', K.dayViews(date), K.expire],
      ['PFADD', K.dayVisitors(date), vid],
      ['EXPIRE', K.dayVisitors(date), K.expire],
      ['HINCRBY', K.dayPaths(date), pvPath, 1],
      ['EXPIRE', K.dayPaths(date), K.expire],
      ...plan.commands(visitFields),
      ['HINCRBY', K.dayDevices(date), dev, 1],
      ['EXPIRE', K.dayDevices(date), K.expire],
      ['HINCRBY', K.dayHours(date), String(jstHour()), 1],
      ['EXPIRE', K.dayHours(date), K.expire],
    ])
  } catch {
    /* counting is best-effort; never surface a store outage to a visitor */
  }
  return ok()
}
