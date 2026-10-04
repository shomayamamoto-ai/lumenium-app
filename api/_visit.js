// 訪問（セッション）の集計。api/track.js から呼ばれます。
//
// 訪問の区切りは訪問者のブラウザ側で決めます（src/lib/beacon-core.js）。
// サーバーには訪問ごとの記録を置きません。送られてくるのは
//   n  … その訪問の何ページ目か（0 なら訪問の始まり）
//   g  … 「直帰ではなくなった」瞬間に一度だけ付く印（l はその訪問の入口）
//   t  … そのページを見ていた時間（ミリ秒）
//   s / r / m / c … 訪問の流入元（計測用リンクの名前、紹介元、utm）
// で、ここではそれを日ごとの数に足すだけです。だから「誰が」「どの順に」は
// 残りません。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { K } from './_analytics-store.js'
import { refKind } from './_referrers.js'

/** 1ページで数える時間の上限（開きっぱなしで席を外した場合）。 */
export const MAX_TIME_MS = 30 * 60 * 1000

/** 入口が「見つからないページ」だった訪問の入口名。住所そのものは
 *  「見つからなかったURL」の欄にあるので、ここでは1つにまとめます。 */
export const NOT_FOUND_LANDING = '/(404)'

/** 流入元を、成果（問い合わせなど）ごとに数えるもの。 */
export const CONVERSIONS = new Set([
  'contact_view', 'contact_start', 'contact_submit', 'booking_view', 'booking_confirm',
  'click_tel', 'click_line', 'click_mail',
])

/** その訪問の何ページ目か。無ければ null（この仕組みより前のページから
 *  送られたもの。キャッシュに残った古いページはしばらく送ってきます）。 */
export function hitIndex(body) {
  const n = body && body.n
  return Number.isInteger(n) && n >= 0 && n < 100000 ? n : null
}

const bare = (h) => String(h || '').toLowerCase().replace(/^www\./, '')

/** このサイトのページから送られたか。
 *  ブラウザは、ページを開いているサイトと送り先が同じかどうかを
 *  Sec-Fetch-Site と Origin で必ず伝えてきます。違うと言っているものは、
 *  よそのページに仕込まれた送信なので数えません。どちらも無い（古い
 *  ブラウザ）ときは、判断できないので通します。 */
export function fromOurPages(req) {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  const origin = req.headers.get('origin')
  if (!origin) return true
  let oh
  try { oh = bare(new URL(origin).hostname) } catch { return false }
  // 受けた側の名前は、取り方で違うことがあるので（転送の前後）、どれかと
  // 一致すれば同じサイトとみなします。
  const mine = [
    (() => { try { return new URL(req.url).hostname } catch { return '' } })(),
    (req.headers.get('x-forwarded-host') || '').split(',')[0].trim().split(':')[0],
    (req.headers.get('host') || '').split(':')[0],
  ].filter(Boolean).map(bare)
  return mine.includes(oh)
}

/** その訪問の紹介元が、このサイト自身か。古いページは毎回紹介元を送って
 *  くるので、サイト内を移るたびに「直接」が増えていました。 */
export function selfReferrer(ref, host) {
  if (!ref) return false
  try { return bare(new URL(ref).hostname) === bare(host) } catch { return false }
}

const tok = (v, max) => String(v || '').toLowerCase().normalize('NFKC')
  .replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, max)

/** 計測用リンク・広告の名前。「どこに貼ったか / 種類 / キャンペーン名」。
 *  ?ref=instagram だけなら instagram/-/- です。何も無ければ ''。 */
export function campaignOf(body) {
  const s = tok(body && body.s, 32)
  const m = tok(body && body.m, 32)
  const c = tok(body && body.c, 48)
  if (!s && !c) return ''
  return `${s || '-'}/${m || '-'}/${c || '-'}`
}

/** 見ていた時間。おかしな値は捨てます（0 は本物の 0 として残します）。 */
export function timeOf(body) {
  const t = Number(body && body.t)
  return Number.isFinite(t) && t >= 0 && t <= MAX_TIME_MS ? Math.round(t) : null
}

/** この1回の送信で、訪問まわりに何を書くか。
 *
 *  `slots` は track.js の guard() にそのまま渡せる形（hash, 欄, 満杯のときの欄）で、
 *  guard が決めた欄の名前を `commands()` に戻すと、書き込む命令が返ります。
 *  hash が満杯でも新しい欄が無限に増えないよう、上限の確かめは guard に任せます。
 *
 *  kind: 'view'（ページを開いた）、'not_found'、'event'（導線の1段・クリック・離脱）、
 *        'page_time'（サイト内で次のページへ移った） */
export function visitPlan({ kind, ev, body, path, date, source, selfRef, clean, hour }) {
  const n = hitIndex(body)
  const slots = []
  const builders = []
  const ex = (key) => ['EXPIRE', key, K.expire]
  const slot = (hash, field, other, build) => { slots.push([hash, field, other]); builders.push(build) }
  const plain = (build) => builders.push(build)
  const campaign = campaignOf(body)

  // 訪問の始まり。ページを開いたときと、入口が見つからないページだったとき。
  const starts = n === 0 && (kind === 'view' || kind === 'not_found')
  // 流入元は訪問の最初の1回だけ数えます。古いページ（n が無い）は毎回
  // 送ってくるので、紹介元がこのサイト自身のもの（サイト内の移動）だけ外します。
  const countRef = starts || (n === null && kind === 'view' && !selfRef)

  if (countRef) {
    slot(K.dayRefs(date), source, 'other', (f) => [['HINCRBY', K.dayRefs(date), f, 1], ex(K.dayRefs(date))])
    /* AIアシスタントから来た訪問は、どのページに着いたかも数えます。
       流入元と同じ条件（訪問の最初の1回）なので、ここの合計が
       「AIアシスタントから」の訪問数を超えることはありません。 */
    if (refKind(source) === 'ai') {
      const h = K.dayAiLandings(date)
      const landing = kind === 'not_found' ? NOT_FOUND_LANDING : path
      slot(h, `${source}\t${landing}`, `${source}\t/(other)`, (f) => [['HINCRBY', h, f, 1], ex(h)])
    }
  }
  if (starts) {
    plain(() => [['INCR', K.daySessions(date)], ex(K.daySessions(date))])
    const landing = kind === 'not_found' ? NOT_FOUND_LANDING : path
    slot(K.dayLanding(date), landing, '/(other)', (f) => [['HINCRBY', K.dayLanding(date), f, 1], ex(K.dayLanding(date))])
    if (campaign) {
      slot(K.dayCampaigns(date), campaign, 'other', (f) => [['HINCRBY', K.dayCampaigns(date), f, 1], ex(K.dayCampaigns(date))])
    }
    /* ---- SNS（文章）の「いつ出すと良いか」用 ----
       計測用リンク（?ref=x など）から来た訪問が、何時（JST）に始まったか。
       「計測リンクの名前<TAB>時」の形で、1日に最大 名前の数×24 欄です。
       キャンペーン名は入れません（時間帯を見るのに要らず、欄が増えるだけなので）。 */
    const refName = tok(body && body.s, 32)
    if (refName && Number.isInteger(hour) && hour >= 0 && hour < 24) {
      const h = K.dayRefHours(date)
      slot(h, `${refName}\t${hour}`, 'other', (f) => [['HINCRBY', h, f, 1], ex(h)])
    }
  }


  // 直帰ではなくなった（2ページ目を開いた・操作した・10秒以上見た）。
  if (Number(body && body.g) === 1) {
    const l = body.l === NOT_FOUND_LANDING ? NOT_FOUND_LANDING : clean(body.l)
    plain(() => [['INCR', K.dayEngaged(date)], ex(K.dayEngaged(date))])
    slot(K.dayLandingEngaged(date), l, '/(other)', (f) => [['HINCRBY', K.dayLandingEngaged(date), f, 1], ex(K.dayLandingEngaged(date))])
  }

  // 見ていた時間。ページを離れたとき（サイト内の移動も含む）に届きます。
  const t = (ev === 'exit' || kind === 'page_time') ? timeOf(body) : null
  if (t !== null) {
    plain(() => [
      ['HINCRBY', K.dayTime(date), 'sum', t], ['HINCRBY', K.dayTime(date), 'n', 1], ex(K.dayTime(date)),
    ])
    // 合計と件数は同じ欄名で2つの hash に入れます。上限の確かめは合計の
    // 側だけで行い、件数の側も同じ欄を使うので、2つがずれません。
    slot(K.dayPathTime(date), path, '/(other)', (f) => [
      ['HINCRBY', K.dayPathTime(date), f, t], ex(K.dayPathTime(date)),
      ['HINCRBY', K.dayPathTimeN(date), f, 1], ex(K.dayPathTimeN(date)),
    ])
  }

  // 「どこから来た人が問い合わせたか」。
  if (kind === 'event' && CONVERSIONS.has(ev)) {
    const h = K.dayEventSources(date, ev)
    slot(h, source, 'other', (f) => [['HINCRBY', h, f, 1], ex(h)])
    if (campaign) {
      const c = K.dayCampaignEvents(date, ev)
      slot(c, campaign, 'other', (f) => [['HINCRBY', c, f, 1], ex(c)])
    }
  }

  return {
    slots,
    /** guard() が返した欄の名前（slots と同じ順）から、書き込む命令を作ります。 */
    commands(fields) {
      const out = []
      let i = 0
      for (const b of builders) {
        // 欄を持たない命令（INCR など）は、引数を取らない関数です。
        out.push(...(b.length ? b(fields[i++]) : b()))
      }
      return out
    },
  }
}
