// SNS（文章）の「季節のネタ帳」と「反応の良かった投稿」の数え方。
// 画面とサーバー（テスト）で同じものを使います。
//
// ネタ帳は、小さなお店が投稿のきっかけにしやすい行事・記念日を、決まった
// 一覧で持ちます。日付は「毎年同じ日」（ひな祭り 3/3 など）と「何月の第何
// 何曜日」（母の日＝5月の第2日曜 など）の2通りで、土用の丑の日だけは
// 十二支の数え方で出します。どれも日本時間の日付（YYYY-MM-DD）です。
//
// 「書き始める目安」（lead）は、その行事の何日前から一覧に出すか。
// 「出す目安」（post）は、行事の何日前に投稿すると良いか（予約日の候補）。
// 贈り物の行事（母の日・クリスマスなど）は、選んで買う時間があるので早めです。
//
// このファイルは import を持ちません。ビルドのとき scripts/build-social-text.mjs
// が export を外して public/social-season.js（管理画面が読むファイル）を作ります。
// 直すのはこのファイルだけにしてください。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

/* rule の書き方:
     { m: 3, d: 3 }              毎年3月3日
     { m: 5, nth: 2, wd: 0 }     5月の第2日曜（wd は 0=日〜6=土）
     { m: 11, last: true, wd: 5 } 11月の最後の金曜
     { doyo: true }              夏の土用の丑の日（7/19〜8/6 のうち最初の丑の日） */
export var SEASON_EVENTS = [
  { id: 'shogatsu', name: 'お正月', rule: { m: 1, d: 1 }, lead: 21, post: 0, idea: '新年のあいさつと、年始の営業日・初売りのお知らせ' },
  { id: 'seijin', name: '成人の日', rule: { m: 1, nth: 2, wd: 1 }, lead: 14, post: 3, idea: '新成人へのお祝いのひとこと。成人式の前後に使えるメニューやサービス' },
  { id: 'setsubun', name: '節分', rule: { m: 2, d: 3 }, lead: 14, post: 3, idea: '恵方巻き・豆まきにちなんだ商品や、季節の話題' },
  { id: 'valentine', name: 'バレンタインデー', rule: { m: 2, d: 14 }, lead: 30, post: 10, idea: '贈り物に選ばれている商品と、予約・取り置きの案内' },
  { id: 'hinamatsuri', name: 'ひな祭り', rule: { m: 3, d: 3 }, lead: 21, post: 5, idea: '桃の節句にちなんだ限定メニューや、ご家族でのご来店のおすすめ' },
  { id: 'whiteday', name: 'ホワイトデー', rule: { m: 3, d: 14 }, lead: 21, post: 7, idea: 'お返しにぴったりの商品と、迷ったときの選び方' },
  { id: 'sotsugyo', name: '卒業シーズン', rule: { m: 3, d: 15 }, lead: 21, post: 5, idea: '卒業・送別の贈り物や、打ち上げ・送別会のご予約' },
  { id: 'kessan', name: '年度末・決算期', rule: { m: 3, d: 31 }, lead: 21, post: 10, idea: '年度内に済ませたい方への案内（決算セール・年度内のご依頼の締め切り）' },
  { id: 'nyugaku', name: '入学・新生活', rule: { m: 4, d: 1 }, lead: 21, post: 5, idea: '新しく始める方への応援と、新生活に役立つ商品・サービス' },
  { id: 'gw', name: 'ゴールデンウィーク', rule: { m: 4, d: 29 }, lead: 30, post: 7, idea: '連休中の営業日・営業時間のお知らせと、連休のおでかけに合う話題' },
  { id: 'hahanohi', name: '母の日', rule: { m: 5, nth: 2, wd: 0 }, lead: 30, post: 10, idea: '感謝を伝える贈り物のおすすめと、予約・配送の締め切り' },
  { id: 'tsuyu', name: '梅雨入り', rule: { m: 6, d: 7 }, lead: 14, post: 0, idea: '雨の日でも来たくなる理由（雨の日の特典・お手入れのコツなど）' },
  { id: 'bonus-summer', name: '夏のボーナス時期', rule: { m: 6, d: 30 }, lead: 21, post: 3, idea: '自分へのごほうびに選ばれている商品や、少し良いコースの案内' },
  { id: 'chichinohi', name: '父の日', rule: { m: 6, nth: 3, wd: 0 }, lead: 30, post: 10, idea: '父の日の贈り物のおすすめと、予約・配送の締め切り' },
  { id: 'tanabata', name: '七夕', rule: { m: 7, d: 7 }, lead: 14, post: 3, idea: '願いごとにちなんだ話題や、店内の七夕飾り・季節の限定品' },
  { id: 'doyo', name: '土用の丑の日', rule: { doyo: true }, lead: 21, post: 5, idea: '夏バテ対策・スタミナにちなんだ商品や、季節のおすすめ' },
  { id: 'obon', name: 'お盆', rule: { m: 8, d: 13 }, lead: 21, post: 7, idea: 'お盆休みの営業日のお知らせと、帰省・手土産の話題' },
  { id: 'keiro', name: '敬老の日', rule: { m: 9, nth: 3, wd: 1 }, lead: 21, post: 7, idea: 'おじいちゃん・おばあちゃんへの贈り物や、ご家族でのご来店のおすすめ' },
  { id: 'halloween', name: 'ハロウィン', rule: { m: 10, d: 31 }, lead: 21, post: 7, idea: 'ハロウィン限定の商品・飾りつけ・仮装での来店特典など' },
  { id: 'shichigosan', name: '七五三', rule: { m: 11, d: 15 }, lead: 30, post: 10, idea: 'お祝いの日の食事・写真・贈り物のご予約の案内' },
  { id: 'iifufu', name: 'いい夫婦の日', rule: { m: 11, d: 22 }, lead: 14, post: 3, idea: 'ご夫婦・カップルで楽しめるメニューやペアの特典' },
  { id: 'blackfriday', name: 'ブラックフライデー', rule: { m: 11, last: true, wd: 5 }, lead: 21, post: 5, idea: 'この時期だけのセールやお得なセットの案内' },
  { id: 'bonus-winter', name: '冬のボーナス時期', rule: { m: 12, d: 10 }, lead: 21, post: 3, idea: '一年がんばった自分へのごほうびや、少し良い贈り物の提案' },
  { id: 'christmas', name: 'クリスマス', rule: { m: 12, d: 25 }, lead: 40, post: 14, idea: 'クリスマスの限定商品・ご予約の締め切り・当日の営業時間' },
  { id: 'nenmatsu', name: '年末年始', rule: { m: 12, d: 28 }, lead: 30, post: 7, idea: '年末年始の営業日のお知らせと、一年のお礼のあいさつ' },
]

var DAY_MS = 86400000

function pad(n) { return (n < 10 ? '0' : '') + n }
function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d) }
function utc(day) { return Date.parse(day + 'T00:00:00Z') }
function addDays(day, n) { return new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10) }
function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / DAY_MS) }

/* 十二支の「丑」の日。2026-07-26 が丑の日なので、そこからの日数が12で割り切れる日。
   （2024-07-24・2025-07-19 も丑の日で、同じ数え方で合います） */
var USHI_ANCHOR = '2026-07-26'
export function isUshiDay(day) {
  var n = daysBetween(USHI_ANCHOR, day)
  return ((n % 12) + 12) % 12 === 0
}

/** その年の行事の日（YYYY-MM-DD）。決まりが分からなければ ''。 */
export function eventDate(ev, year) {
  var r = ev && ev.rule
  if (!r) return ''
  if (r.doyo) {
    // 夏の土用（立秋の前の約18日間）のうち、最初の丑の日。
    for (var i = 0; i < 19; i++) {
      var day = addDays(ymd(year, 7, 19), i)
      if (isUshiDay(day)) return day
    }
    return ''
  }
  if (r.d) return ymd(year, r.m, r.d)
  if (r.last) {
    var lastDay = new Date(Date.UTC(year, r.m, 0)).getUTCDate()
    var lw = new Date(Date.UTC(year, r.m - 1, lastDay)).getUTCDay()
    return ymd(year, r.m, lastDay - ((lw - r.wd + 7) % 7))
  }
  if (r.nth) {
    var fw = new Date(Date.UTC(year, r.m - 1, 1)).getUTCDay()
    return ymd(year, r.m, 1 + ((r.wd - fw + 7) % 7) + (r.nth - 1) * 7)
  }
  return ''
}

/** ある月（'YYYY-MM'）の行事。{ day: [ev, ...] } の形。カレンダーに出す用。 */
export function seasonInMonth(month) {
  var y = Number(String(month).slice(0, 4))
  var out = {}
  SEASON_EVENTS.forEach(function (ev) {
    var day = eventDate(ev, y)
    if (day && day.slice(0, 7) === month) (out[day] = out[day] || []).push(ev)
  })
  return out
}

/** 近づいている行事。今日から within 日先まで、行事ごとの「書き始める目安」に入った
 *  ものを、近い順に。postBy は投稿の目安の日（今日より前なら明日）。 */
export function upcomingEvents(today, within) {
  within = within || 60
  var y = Number(String(today).slice(0, 4))
  var out = []
  SEASON_EVENTS.forEach(function (ev) {
    ;[y, y + 1].forEach(function (yy) {
      var day = eventDate(ev, yy)
      if (!day) return
      var left = daysBetween(today, day)
      if (left < 0 || left > within || left > (ev.lead || 21)) return
      var postBy = postDayFor(ev, day, today)
      out.push({ id: ev.id, name: ev.name, day: day, daysLeft: left, postBy: postBy, idea: ev.idea })
    })
  })
  return out.sort(function (a, b) { return a.daysLeft - b.daysLeft || (a.id < b.id ? -1 : 1) })
}

/** 行事（day の日）の投稿の目安の日。予約は明日からなので、目安の日が過ぎていれば
 *  明日に。当日の行事と、もう過ぎた行事は ''（今すぐ出す）。 */
export function postDayFor(ev, day, today) {
  var left = daysBetween(today, day)
  if (left < 1) return ''
  var postBy = addDays(day, -(ev.post || 0))
  return postBy <= today ? addDays(today, 1) : postBy
}

/** 「このネタで書く」で、AIの下書き欄（何について書くか）に入れるメモ。 */
export function seasonTopic(ev, day) {
  var md = day ? Number(day.slice(5, 7)) + '/' + Number(day.slice(8)) : ''
  return ev.name + (md ? '（' + md + '）' : '') + 'にちなんだ投稿。' + ev.idea + '。' +
    'うちのお店の（商品・サービスの名前）とからめて、押しつけがましくない一言で。'
}

/* ---- 反応の良かった投稿 ----
   「これをもとに作る」で、同じ型の投稿をもう一度作るための並べ方です。
   問い合わせ＞サイトへの訪問＞SNSの中の反応、の順に重く数えます。お店に
   とって大事なのは「いいね」より「来てくれた・問い合わせてくれた」なので。
   重み（問い合わせ20・訪問2・コメント／共有3・クリック2・いいね1）は目安です。 */
export var SCORE_WEIGHTS = { inquiries: 20, visits: 2, comments: 3, shares: 3, clicks: 2, likes: 1 }

/** 1件の投稿の点数と、その内訳（画面に「問い合わせ1・訪問12」のように出す）。
 *  results: その投稿の SNSごとのサイトの数字（/api/social?insights=1 の results[id]）。 */
export function postScore(p, results) {
  var sum = { inquiries: 0, visits: 0, likes: 0, comments: 0, shares: 0, clicks: 0 }
  ;(p && p.results || []).forEach(function (r) {
    var m = r && r.metrics
    if (!m || !m.ok) return
    ;['likes', 'comments', 'shares', 'clicks'].forEach(function (k) { sum[k] += Number(m[k]) || 0 })
  })
  Object.keys(results || {}).forEach(function (k) {
    var g = results[k]
    if (!g || g.untagged) return
    sum.visits += Number(g.visits) || 0
    sum.inquiries += Number(g.inquiries) || 0
  })
  var score = 0
  Object.keys(SCORE_WEIGHTS).forEach(function (k) { score += sum[k] * SCORE_WEIGHTS[k] })
  var LABEL = { inquiries: '問い合わせ', visits: '訪問', likes: 'いいね', comments: 'コメント', shares: '共有', clicks: 'クリック' }
  var why = ['inquiries', 'visits', 'likes', 'comments', 'shares', 'clicks']
    .filter(function (k) { return sum[k] > 0 }).map(function (k) { return LABEL[k] + sum[k] }).join('・')
  return { score: score, sum: sum, why: why }
}

/** 反応の良かった投稿の上位 n 件。中身（payload）が残っていて、点数が0より大きいものだけ。 */
export function topPosts(posts, insightResults, n) {
  var list = []
  ;(Array.isArray(posts) ? posts : []).forEach(function (p, i) {
    if (!p || !p.payload) return
    var s = postScore(p, insightResults && insightResults[p.id || p.at])
    if (s.score > 0) list.push({ post: p, score: s.score, why: s.why, i: i })
  })
  list.sort(function (a, b) { return b.score - a.score || a.i - b.i })
  return list.slice(0, n || 3)
}
