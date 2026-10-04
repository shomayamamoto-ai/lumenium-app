// Thin Upstash Redis REST client for the pageview counters.
//
// Redis rather than the GitHub-file trick used for news and copy: those are
// edited a few times a month, whereas this takes a write on every pageview,
// which a commit-per-write store cannot do. Upstash speaks plain HTTPS, so it
// works from the edge runtime with no driver and no connection pool.
//
// Requires env: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.

import { KV } from './_brand.js'

export const KEEP_DAYS = 400
const TTL = KEEP_DAYS * 24 * 60 * 60

/* 同じものが2通りの名前で置かれます。
   Vercel の Storage から Upstash をつないだ場合、作られる環境変数は
   KV_REST_API_URL と KV_REST_API_TOKEN。Upstash の画面から手で入れた場合は
   UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN。中身は同じ REST の
   アドレスとトークンです。
   前者しか無い環境で「保存先が未設定です」と言い続けていました——入って
   いるのに動かない、が一番たちが悪いので、どちらの名前でも読みます。

   ただし URL とトークンは必ず「同じ組」から取ります。片方の名前だけが
   古い設定として残っていることがあり（例: 手で入れた
   UPSTASH_REDIS_REST_TOKEN だけが残り、URL は新しい KV_REST_API_URL）、
   名前ごとに別々に選ぶと、別のデータベースのトークンで新しい URL を
   叩くことになります。認証エラーになるだけならまだしも、原因が
   「名前の取り違え」だと気づけません。 */
export const STORE_ENV_PAIRS = [
  { url: 'UPSTASH_REDIS_REST_URL', token: 'UPSTASH_REDIS_REST_TOKEN' },
  { url: 'KV_REST_API_URL', token: 'KV_REST_API_TOKEN' },
]

/** 画面表示用の、名前の一覧（組をほどいたもの）。 */
export const STORE_ENV = {
  url: STORE_ENV_PAIRS.map((p) => p.url),
  token: STORE_ENV_PAIRS.map((p) => p.token),
}

const env = (name) => (process.env[name] || '').trim()

/** 2つとも揃っている最初の組。揃っていない名前は無視します。 */
const wholePair = () => STORE_ENV_PAIRS.find((p) => env(p.url) && env(p.token)) || null

/** どの名前で見つかったか。画面に「この名前で入っています」と出すため。
 *  組が揃っていないときは、値のある名前だけを返します（「片方しか
 *  入っていません」と正しく言えるように）。 */
export function storeEnvNames() {
  const pair = wholePair()
  if (pair) return { url: pair.url, token: pair.token }
  return {
    url: STORE_ENV.url.find((n) => env(n)) || null,
    token: STORE_ENV.token.find((n) => env(n)) || null,
  }
}

export function storeConfig() {
  const pair = wholePair()
  return pair ? { url: env(pair.url).replace(/\/$/, ''), token: env(pair.token) } : null
}

/** The same, but also accepting the pair the admin pasted into their own
 *  browser. Every other key has a box on the settings screen; these two had
 *  none at all, because the place saved keys live is this very store — there
 *  is nowhere to put the store's own address except the environment or the
 *  browser holding it.
 *
 *  What this does and does not turn on: admin screens make their own requests
 *  and carry the admin's cookie, so history, saved settings and the AIO
 *  reports can all use a pair held here. Pageview recording cannot — it runs
 *  on visitors' requests, which carry nothing of the admin's — so counting
 *  visits still needs the two environment variables. The settings row says so
 *  rather than letting the admin discover it from an empty chart. */
export async function storeFor(req) {
  const env = storeConfig()
  if (env || !req) return env
  const { bag } = await import('./_keybag.js')
  const mine = await bag(req)
  const url = String(mine.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '')
  const token = String(mine.UPSTASH_REDIS_REST_TOKEN || '').trim()
  return url && token ? { url, token } : null
}

/** Is this pair usable? Asked before it is trusted, so the settings screen can
 *  answer 「つながりました」 rather than leaving it to be discovered later. */
export async function storePing(cfg) {
  if (!cfg) return { ok: false, message: '値が足りません。' }
  try {
    const out = await pipeline(cfg, [['SET', `${KV}ping`, String(Date.now()), 'EX', 60], ['GET', `${KV}ping`]])
    return out && out.length === 2 && out[1] ? { ok: true } : { ok: false, message: '応答が想定と違います。' }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e).slice(0, 120) }
  }
}

/** Run several Redis commands in one HTTPS round trip. */
export async function pipeline(cfg, commands) {
  if (!commands.length) return []
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!res.ok) throw new Error(`upstash ${res.status}`)
  const out = await res.json()
  // Upstash answers [{result}|{error}, ...] in command order.
  return out.map((r) => (r && Object.prototype.hasOwnProperty.call(r, 'result') ? r.result : null))
}

/** Dates are bucketed in JST — the audience and the operator are both there. */
export function jstDate(offsetDays = 0) {
  const t = Date.now() + 9 * 3600 * 1000 - offsetDays * 86400 * 1000
  return new Date(t).toISOString().slice(0, 10)
}

/** いまの時刻（日本時間の 0〜23）。日付と同じ足し方で揃えています。 */
export function jstHour() {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCHours()
}

export function lastDays(n) {
  return Array.from({ length: n }, (_, i) => jstDate(n - 1 - i))
}

export const K = {
  totalViews: `${KV}pv:total`,
  dayViews: (d) => `${KV}pv:d:${d}`,
  dayVisitors: (d) => `${KV}uv:d:${d}`,   // HyperLogLog — counts uniques, stores no ids
  dayPaths: (d) => `${KV}pv:p:${d}`,
  dayRefs: (d) => `${KV}pv:r:${d}`,
  dayDevices: (d) => `${KV}pv:dev:${d}`,
  // Beacons per visitor in the current minute (track.js). Lives 60 seconds.
  rate: (id) => `${KV}pv:rl:${id}`,
  // Conversion steps. Kept in the same daily hash shape as the rest so the
  // report reads them the same way.
  dayEvents: (d) => `${KV}ev:d:${d}`,
  // …and the same steps counted in people rather than in times. A funnel
  // measured in event counts cannot be read as a conversion rate: one visitor
  // opening three services is three service_view against one arrival. Same
  // HyperLogLog as the visitor count, so the unit on both sides matches and
  // nothing identifying is kept.
  dayEventUsers: (d, e) => `${KV}evu:d:${d}:${e}`,
  /* 「どのページが最後まで読まれたか」。
     読了は全体の率だけでも意味がありますが、それだけでは直す場所が
     決まりません。「半分で離れる人が多い」は分かっても、どのページを
     書き直せばいいのかが分からないからです。ページごとに数えます。
     増え方はページ数に比例するだけなので、際限なく太りません。 */
  dayEventPaths: (d, e) => `${KV}evp:d:${d}:${e}`,
  /* いつ見られているか（JSTの時間帯、0〜23）。
     お知らせや SNS を出す時刻、問い合わせに気づくべき時間帯を、
     勘ではなく実際の山で決められるようにするためです。 */
  dayHours: (d) => `${KV}pv:h:${d}`,
  /* 出ていったリンク。電話・LINE・メール・外部サイト。
     問い合わせフォームを通らずに直接連絡する人は、導線の数字に一切
     出てきません。いちばん取りこぼしの大きいところが見えないままに
     なるので、押された先を数えます（tel / line / mail / 相手のホスト名）。 */
  dayLinks: (d) => `${KV}lk:d:${d}`,
  /* AIアシスタントから来た訪問が、どのページから始まったか。
     「AIから来た 3人」だけでは、どの回答で紹介されたのかが分かりません。
     着いたページが分かれば、AIがどのページを根拠にしたかの見当が付き、
     そのページを厚くすれば済みます。流入元と同じく訪問の最初の1ページで
     だけ、「紹介元<TAB>ページ」の形で数えます（上限は他と同じ300）。 */
  dayAiLandings: (d) => `${KV}pv:ai:${d}`,
  // Enquiry outcomes, so a form that has stopped working is visible.
  dayContact: (d) => `${KV}ct:d:${d}`,
  contactLastError: `${KV}ct:lasterr`,
  expire: TTL,

  /* ---- 訪問（セッション）。書くのは _visit.js、読むのは _analytics-report.js ----
     訪問ごとの記録は持ちません。日ごとの数を足していくだけなので、
     「誰が」「どの順に」は、ここからは読み出せません。 */
  // 訪問の数（訪問の最初の1ページで +1）。
  daySessions: (d) => `${KV}ss:d:${d}`,
  // 直帰ではなくなった訪問の数。直帰 = 訪問 − これ。
  dayEngaged: (d) => `${KV}ss:g:${d}`,
  // 最初に見られたページ → 訪問数 / そのうち直帰しなかった数。
  dayLanding: (d) => `${KV}ss:l:${d}`,
  dayLandingEngaged: (d) => `${KV}ss:lg:${d}`,
  // 見ていた時間。hash の sum（ミリ秒の合計）と n（件数）。
  dayTime: (d) => `${KV}tm:d:${d}`,
  // ページごとの、見ていた時間の合計と件数（同じ欄名で2つの hash）。
  dayPathTime: (d) => `${KV}tm:p:${d}`,
  dayPathTimeN: (d) => `${KV}tm:pn:${d}`,
  // 成果（問い合わせ・電話など）ごとの、その訪問の流入元 → 回数。
  dayEventSources: (d, e) => `${KV}evs:d:${d}:${e}`,
  // 計測用リンク・広告の名前（source/medium/campaign）→ 訪問数、→ 成果の回数。
  dayCampaigns: (d) => `${KV}cp:d:${d}`,
  dayCampaignEvents: (d, e) => `${KV}cpe:d:${d}:${e}`,
  // 週次メール。止めたときの印と、最後に送った結果。
  weeklyOff: `${KV}wr:off`,
  weeklyLast: `${KV}wr:last`,
  weeklySent: (d) => `${KV}wr:sent:${d}`,
}
