/* 自動生成: scripts/build-social-plan.mjs が api/_social-plan-core.js から作ります。直接は直さないでください。 */
(function () {
// SNS（文章）の「運用プラン」の計算。画面とサーバーの両方で同じものを使います。
//
// 柱（テーマ）・投稿のペース・今週やること・保存されやすい投稿・LINE の送りすぎ・
// 月次の振り返り。どれも「決まった数え方で数えて、目安と比べる」だけの計算です。
//
// 数字の言い方は控えめにします。目安はどれも一般的な調査（Buffer など）から
// 取った「目安」で、このお店に当てはまるとは限りません。件数が少ないうちは
// 「判断できません」「参考程度」と出し、たまたまの差を結論のように見せません。
//
// このファイルは import を持ちません。ビルドのとき scripts/build-social-plan.mjs
// が export を外して public/social-plan-core.js（管理画面が読むファイル）を作ります。
// 直すのはこのファイルだけにしてください。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

/* 柱の色。管理画面ですでに使っている色から選びます。 */
var PILLAR_COLORS = ['#0f766e', '#3d3fbf', '#be185d', '#9a3412', '#6d28d9', '#0e7490', '#047857']
var PILLAR_MIN = 3
var PILLAR_MAX = 5
/* 宣伝の割合の目安（80/20 の考え方。役立つ・共感の投稿が8割、宣伝は2割まで）。 */
var PROMO_MAX = 0.2
/* 柱の配分を見る期間（日）。 */
var MIX_DAYS = 30

var NET_LABELS = {
  x: 'X', facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', linkedin: 'LinkedIn',
  line: 'LINE公式アカウント', gbp: 'Googleビジネスプロフィール', bluesky: 'Bluesky',
}

/* 柱の例（はじめての人が「おすすめの柱で始める」を押したとき）。お店向け。 */
var SAMPLE_PILLARS = [
  { name: 'お役立ち', desc: 'お客さまの困りごとに答える小さなコツ', ideas: ['よくある質問に答える', '選び方のコツを3つ', '季節の楽しみ方'], promo: false },
  { name: '裏側', desc: '仕込み・準備・スタッフの様子', ideas: ['朝の仕込みの様子', 'こだわりの道具', 'スタッフ紹介'], promo: false },
  { name: 'お客さまの声', desc: 'いただいた感想や、よく選ばれるもの', ideas: ['いただいた感想を紹介', '人気の組み合わせ'], promo: false },
  { name: 'お知らせ・宣伝', desc: '新メニュー・イベント・営業日', ideas: ['新メニューのお知らせ', '定休日・営業時間'], promo: true },
]

function str(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) }

/** 柱の id。英数字とハイフンだけ。 */
function cleanPillarId(v) {
  var s = String(v == null ? '' : v)
  return /^[a-z0-9-]{1,40}$/i.test(s) ? s : ''
}

function newId(seed) {
  var n = 0
  var s = String(seed || '') + ':' + Date.now() + ':' + Math.random()
  for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0
  return 'p' + n.toString(36)
}

/** 保存する前に、形を確かめます。直せないものは捨てて、理由を problems に入れます。 */
function validatePlan(input) {
  var b = input && typeof input === 'object' ? input : {}
  var problems = []
  var pillars = []
  var seen = {}
  var list = Array.isArray(b.pillars) ? b.pillars : []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!p || typeof p !== 'object') continue
    var name = str(p.name, 20)
    if (!name) { problems.push('名前の無い柱は保存しません。'); continue }
    if (pillars.length >= PILLAR_MAX) { problems.push('柱は' + PILLAR_MAX + 'つまでです。'); break }
    var id = cleanPillarId(p.id) || newId(name)
    if (seen[id]) id = newId(name + i)
    seen[id] = true
    var ideas = (Array.isArray(p.ideas) ? p.ideas : String(p.ideas || '').split(/\n/))
      .map(function (x) { return str(x, 60) }).filter(Boolean).slice(0, 10)
    var color = PILLAR_COLORS.indexOf(p.color) !== -1 ? p.color : PILLAR_COLORS[pillars.length % PILLAR_COLORS.length]
    pillars.push({ id: id, name: name, desc: str(p.desc, 80), ideas: ideas, promo: p.promo === true, color: color })
  }
  var targets = {}
  var t = b.targets && typeof b.targets === 'object' ? b.targets : {}
  for (var net in DEFAULT_TARGETS) {
    var d = DEFAULT_TARGETS[net]
    var x = t[net] && typeof t[net] === 'object' ? t[net] : {}
    var per = x.per === 'month' || x.per === 'week' ? x.per : d.per
    var n = Math.round(Number(x.n))
    if (!isFinite(n) || n < 0) n = d.n
    targets[net] = { on: typeof x.on === 'boolean' ? x.on : d.on, per: per, n: Math.min(per === 'week' ? 21 : 31, n) }
  }
  var tags = {}
  var tg = b.tags && typeof b.tags === 'object' ? b.tags : {}
  var keys = Object.keys(tg).slice(-300)
  for (var k = 0; k < keys.length; k++) {
    if (!/^[a-z0-9:.-]{1,60}$/i.test(keys[k])) continue
    var pv = cleanPillarId(tg[keys[k]])
    if (pv) tags[keys[k]] = pv
  }
  return { plan: { pillars: pillars, targets: targets, tags: tags }, problems: problems }
}

/* ---------------------------------------------------------------- dates -- */

var DAY = 86400000
var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 日本時間の日付（YYYY-MM-DD）。 */
function jstDay(iso) {
  var t = typeof iso === 'number' ? iso : Date.parse(iso)
  if (!isFinite(t)) return ''
  return new Date(t + 9 * 3600000).toISOString().slice(0, 10)
}
function addDays(day, n) {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
}
function weekdayOf(day) { return new Date(day + 'T00:00:00Z').getUTCDay() }
/** その日を含む週の月曜日（日本時間の日付で）。週は月曜〜日曜。 */
function weekStart(day) { return addDays(day, -((weekdayOf(day) + 6) % 7)) }
function monthStart(day) { return day.slice(0, 8) + '01' }
function monthEnd(day) {
  var y = Number(day.slice(0, 4))
  var m = Number(day.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/* ------------------------------------------------------------ the posts -- */

/** 履歴と予約を、同じ形の「投稿」の並びにします。
 *  history: [{ id, at, pillar, nets:[送れた先], ... }]（GET /api/social-plan の posts）
 *  queue:   [{ id, date, targets, pillar }]
 *  tags:    { 投稿id: 柱id }（あとから付けた柱） */
function itemsOf(history, queue, tags) {
  var out = []
  var tg = tags || {}
  ;(history || []).forEach(function (p) {
    if (!p || !p.at) return
    var nets = Array.isArray(p.nets) ? p.nets : []
    if (!nets.length) return // どこにも出なかったものは、投稿に数えません
    out.push({ id: p.id || p.at, day: jstDay(p.at), at: p.at, nets: nets, pillar: cleanPillarId(p.pillar) || tg[p.id] || '', scheduled: false, src: p })
  })
  ;(queue || []).forEach(function (q) {
    if (!q || !q.date) return
    out.push({ id: 'q:' + q.id, day: q.date, at: '', nets: Array.isArray(q.targets) ? q.targets : [], pillar: cleanPillarId(q.pillar) || tg['q:' + q.id] || '', scheduled: true, src: q })
  })
  return out
}

/* -------------------------------------------------------------- 1. mix -- */

/** 柱ごとの割合（直近30日に出したもの＋これからの予約）。
 *  宣伝の柱が2割を超えていないか、使っていない柱は無いかを、やさしい言葉で返します。 */
function pillarMix(items, pillars, today, days) {
  var span = days || MIX_DAYS
  var from = addDays(today, -(span - 1))
  var rows = (pillars || []).map(function (p) { return { id: p.id, name: p.name, color: p.color, promo: !!p.promo, n: 0, share: 0 } })
  var byId = {}
  rows.forEach(function (r) { byId[r.id] = r })
  var total = 0
  var untagged = 0
  var scheduled = 0
  ;(items || []).forEach(function (it) {
    if (it.day < from) return
    if (!it.scheduled && it.day > today) return
    total++
    if (it.scheduled) scheduled++
    if (it.pillar && byId[it.pillar]) byId[it.pillar].n++
    else untagged++
  })
  var tagged = total - untagged
  var promo = 0
  rows.forEach(function (r) {
    r.share = tagged ? r.n / tagged : 0
    if (r.promo) promo += r.n
  })
  var promoShare = tagged ? promo / tagged : 0
  var warnings = []
  var good = []
  if (!rows.length) warnings.push('まだ柱（テーマ）が決まっていません。3〜5つ決めると、何を書くか迷いにくくなります。')
  else {
    if (!rows.some(function (r) { return r.promo })) good.push('宣伝用の柱がありません。お知らせを出すときは、宣伝の柱を1つ作っておくと割合が見えます。')
    if (tagged && promoShare > PROMO_MAX) {
      warnings.push('宣伝の投稿が ' + Math.round(promoShare * 100) + '% です（目安は20%まで）。宣伝ばかりだと、見る人が離れやすくなります。次の数本は役立つ話や、お店の裏側にしてみましょう。')
    } else if (tagged >= 3) {
      good.push('宣伝の投稿は ' + Math.round(promoShare * 100) + '% で、目安（20%まで）の範囲です。')
    }
    var idle = rows.filter(function (r) { return r.n === 0 && !r.promo })
    if (tagged >= 3 && idle.length) {
      warnings.push('「' + idle.map(function (r) { return r.name }).join('」「') + '」の投稿が、この30日にありません。')
    }
    var top = rows.slice().sort(function (a, b) { return b.n - a.n })[0]
    if (tagged >= 5 && top && top.share > 0.6) {
      warnings.push('「' + top.name + '」が ' + Math.round(top.share * 100) + '% を占めています。ほかの柱も混ぜると、いろいろな人に届きやすくなります。')
    }
    if (untagged && total) {
      good.push(untagged + ' 件は柱が付いていません（割合には入れていません）。')
    }
  }
  return {
    from: from, to: today, total: total, tagged: tagged, untagged: untagged, scheduled: scheduled,
    rows: rows, promoShare: promoShare, promoOver: tagged > 0 && promoShare > PROMO_MAX,
    reliability: reliability(tagged), warnings: warnings, notes: good,
  }
}

/* --------------------------------------------------------- reliability -- */

/** 件数が少ないときの言い方（3件未満は判断できない、6件未満は参考程度）。 */
function reliability(n) {
  if (n < 3) return { level: 'none', label: '判断できません', note: '件数が ' + n + ' 件なので、まだ判断できません（3件から）。' }
  if (n < 6) return { level: 'low', label: '参考程度', note: '件数が ' + n + ' 件なので、参考程度に見てください（6件からある程度言えます）。' }
  return { level: 'ok', label: '', note: '' }
}

/* ---------------------------------------------------------- 2. cadence -- */

/* 投稿のペースの目安（Buffer などの調査から。週5本以上出すアカウントは
   伸びが2〜3倍速い、という結果があります）。on は最初から目標に入れるか。 */
var DEFAULT_TARGETS = {
  instagram: { on: true, per: 'week', n: 5, note: '週5〜6本。リールとカルーセル（複数枚）を混ぜる' },
  x: { on: true, per: 'week', n: 7, note: 'ほぼ毎日' },
  threads: { on: true, per: 'week', n: 4, note: '週3〜5本' },
  facebook: { on: true, per: 'week', n: 3, note: '週3本' },
  gbp: { on: true, per: 'week', n: 1, note: '週1本' },
  line: { on: true, per: 'month', n: 3, note: '月2〜4通（多くても週1通まで）' },
  linkedin: { on: false, per: 'week', n: 2, note: '週2本' },
  bluesky: { on: false, per: 'week', n: 3, note: '週3本' },
}

window.lumSocialPlan = { PILLAR_COLORS, PILLAR_MIN, PILLAR_MAX, PROMO_MAX, MIX_DAYS, NET_LABELS, SAMPLE_PILLARS, cleanPillarId, validatePlan, WEEKDAYS, jstDay, addDays, weekdayOf, weekStart, monthStart, monthEnd, itemsOf, pillarMix, reliability, DEFAULT_TARGETS };
})();
