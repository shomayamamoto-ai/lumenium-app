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

/** 投稿先ごとの、今週・今月の進み具合（出した分＋予約した分と、目標）。
 *  週は月曜〜日曜、日付は日本時間です。 */
function cadence(items, targets, today) {
  var ws = weekStart(today)
  var we = addDays(ws, 6)
  var ms = monthStart(today)
  var me = monthEnd(today)
  var dim = Number(me.slice(8, 10))
  var rows = []
  Object.keys(DEFAULT_TARGETS).forEach(function (net) {
    var t = (targets || {})[net]
    if (!t || !t.on) return
    var w = { done: 0, booked: 0 }
    var m = { done: 0, booked: 0 }
    ;(items || []).forEach(function (it) {
      if (it.nets.indexOf(net) === -1) return
      if (!it.scheduled && it.day > today) return
      var k = it.scheduled ? 'booked' : 'done'
      if (it.day >= ws && it.day <= we) w[k]++
      if (it.day >= ms && it.day <= me) m[k]++
    })
    var weekly = t.per === 'week'
    w.target = weekly ? t.n : null
    m.target = weekly ? Math.round(t.n * dim / 7) : t.n
    var left = weekly ? Math.max(0, t.n - w.done - w.booked) : Math.max(0, t.n - m.done - m.booked)
    rows.push({
      net: net, per: t.per, n: t.n, week: w, month: m, left: left,
      over: !weekly && m.done + m.booked > t.n,
      note: DEFAULT_TARGETS[net].note,
    })
  })
  var weekLeft = rows.reduce(function (s, r) { return s + (r.per === 'week' ? r.left : 0) }, 0)
  return { weekFrom: ws, weekTo: we, monthFrom: ms, monthTo: me, rows: rows, weekLeft: weekLeft }
}

/** まだ何も出していない日から、目標に足りない本数ぶん日を選びます。
 *  おすすめの曜日（prefer）を先に、すでに出した日・選んだ日から離れた日を選びます。
 *  per が 'week' なら今週の残り、'month' なら今月の残りから選びます。 */
function suggestDays(items, net, today, left, prefer, per) {
  if (!left) return []
  var end = per === 'month' ? monthEnd(today) : addDays(weekStart(today), 6)
  var start = per === 'month' ? monthStart(today) : weekStart(today)
  var used = []
  ;(items || []).forEach(function (it) {
    if (it.nets.indexOf(net) !== -1 && it.day >= start && it.day <= end) used.push(it.day)
  })
  var cands = []
  for (var d = today; d <= end; d = addDays(d, 1)) if (used.indexOf(d) === -1) cands.push(d)
  var pref = Array.isArray(prefer) ? prefer : []
  var picked = []
  var gap = function (x) {
    var all = used.concat(picked)
    if (!all.length) return 3
    var g = Infinity
    all.forEach(function (u) { g = Math.min(g, Math.abs(Date.parse(u) - Date.parse(x)) / DAY) })
    return Math.min(3, g)
  }
  while (picked.length < left && cands.length) {
    var best = null
    var bestScore = -1
    cands.forEach(function (x) {
      var s = gap(x) + (pref.indexOf(weekdayOf(x)) !== -1 ? 1.5 : 0)
      if (s > bestScore) { best = x; bestScore = s }
    })
    picked.push(best)
    cands.splice(cands.indexOf(best), 1)
  }
  return picked.sort()
}

/* ------------------------------------------------------- 6. LINE (count) -- */

/* LINE 公式アカウントの一斉送信の目安。月2〜4通（多くても週1通まで）。
   送りすぎるとブロックされやすくなります。 */
var LINE_MIN = 2
var LINE_MAX = 4

/** その月の LINE の一斉送信の数（送った分＋予約）。day はその月の任意の日。 */
function lineMonth(items, day) {
  var ms = monthStart(day)
  var me = monthEnd(day)
  var sent = 0
  var booked = 0
  ;(items || []).forEach(function (it) {
    if (it.nets.indexOf('line') === -1 || it.day < ms || it.day > me) return
    if (it.scheduled) booked++
    else sent++
  })
  var count = sent + booked
  return {
    month: day.slice(0, 7), sent: sent, booked: booked, count: count, min: LINE_MIN, max: LINE_MAX,
    state: count > LINE_MAX ? 'over' : count === LINE_MAX ? 'full' : count < LINE_MIN ? 'few' : 'ok',
    nextIsOver: count + 1 > LINE_MAX,
  }
}

/* ---------------------------------------------- 4. saved and shared -- */

/* Instagram で重く見られるのは「送られた（DMで共有）」と「保存」です。
   カルーセル（複数枚）は1枚の画像より、届く数が5割ほど、保存が7割ほど多い
   という調査があります（目安）。 */
var CAROUSEL_MIN = 3
var CAROUSEL_MAX = 8
/* 1枚に載せる文字の目安。スマホで読み切れる長さ。 */
var SLIDE_CHARS = 60
var SAVE_CTA = '保存して見返してね'

var CTA_RE = /(保存|シェア|見返|送って|送ってあげ|友だちに|友達に|ブックマーク|スクショ)/
var USEFUL_WORDS = /(コツ|方法|手順|やり方|ポイント|ステップ|STEP|チェック|選び方|まとめ|保存版|レシピ|使い方|見分け方|注意|しないこと|理由)/i
var COUNT_RE = /[0-9０-９一二三四五六七八九十]+\s*(つ|個|選|ステップ|か条|ヶ条|項目|分で|のコツ|の方法)/
var LIST_LINE = /^\s*([0-9０-９]+[.．、)）]|[①-⑳]|[・●■□✓✔☑-]\s*)/
var PROMO_RE = /(セール|割引|[%％]\s*(OFF|オフ)|今だけ|限定|クーポン|ご予約はこちら|お買い求め|キャンペーン|特価|値下げ|販売開始|発売|ご注文|お申し込みはこちら)/i

function charLen(s) { return Array.from(String(s || '').replace(/\s+/g, '')).length }
function sentences(s) { return String(s || '').split(/[。！？!?]+/).filter(function (x) { return x.trim() }).length }

/** 保存・シェアされやすい要素があるか（助言だけ。送るのを止めはしません）。 */
function saveShareScore(text) {
  var t = String(text || '')
  if (!t.trim()) return null
  var lines = t.split(/\n/)
  var listLines = lines.filter(function (l) { return LIST_LINE.test(l) }).length
  var useful = listLines >= 2 || USEFUL_WORDS.test(t) || COUNT_RE.test(t)
  var cta = CTA_RE.test(t)
  var promo = PROMO_RE.test(t)
  var pureAd = promo && !useful
  var items = [
    { id: 'useful', ok: useful, label: '役立つ形になっている（手順・リスト・数字・やり方・チェックリスト）', tip: '「〇〇のコツ3つ」「〜の手順」のように、あとで見返したくなる形にしてみましょう。' },
    { id: 'cta', ok: cta, label: '「保存して見返してね」「友だちに送ってね」など、保存・シェアをお願いしている', tip: '最後に「保存して見返してね」「友だちにも送ってあげてね」と一言添えましょう。' },
    { id: 'notad', ok: !pureAd, label: '宣伝だけの投稿になっていない', tip: '宣伝だけだと保存やシェアはされにくいです。選び方や楽しみ方など、役立つ一言を足してみましょう。' },
  ]
  var score = items.filter(function (x) { return x.ok }).length
  return {
    score: score, max: items.length, items: items, pureAd: pureAd,
    label: score === 3 ? '保存・シェアされやすい形です' : score === 2 ? 'あと一歩です' : '保存・シェアの要素が少なめです',
    tips: items.filter(function (x) { return !x.ok }).map(function (x) { return x.tip }),
  }
}

/** カルーセルの確認。c: { cover, slides: [..], last, caption } */
function carouselCheck(c) {
  var cover = String((c && c.cover) || '').trim()
  var slides = ((c && c.slides) || []).map(function (s) { return String(s || '').trim() }).filter(Boolean)
  var last = String((c && c.last) || '').trim()
  var caption = String((c && c.caption) || '')
  var checks = []
  checks.push({
    id: 'count', ok: slides.length >= CAROUSEL_MIN && slides.length <= CAROUSEL_MAX,
    label: '中身の枚数が ' + CAROUSEL_MIN + '〜' + CAROUSEL_MAX + ' 枚',
    detail: '中身は ' + slides.length + ' 枚です（表紙と最後の1枚は別）。',
  })
  var promise = !!cover && charLen(cover) <= 30 && (/[0-9０-９]/.test(cover) || USEFUL_WORDS.test(cover) || /(知らない|しない|できる|簡単|失敗|だけ|前に|ために)/.test(cover))
  checks.push({
    id: 'cover', ok: promise, label: '表紙で「見ると何が分かるか」を約束している',
    detail: !cover ? '表紙の一言がまだありません。' : charLen(cover) > 30 ? '表紙の一言が長めです（30字までが目安）。' : promise ? '' : '「〇〇のコツ3つ」「〜する前に見て」のように、得られることを一言で。',
  })
  var many = []
  slides.forEach(function (s, i) { if (sentences(s) > 2) many.push(i + 2) })
  checks.push({ id: 'one', ok: slides.length > 0 && !many.length, label: '1枚に1つのことだけ', detail: many.length ? many.join('・') + '枚目に、言いたいことが多めです（2文までが目安）。' : '' })
  var long = []
  ;[cover].concat(slides, [last]).forEach(function (s, i) { if (charLen(s) > SLIDE_CHARS) long.push(i + 1) })
  checks.push({ id: 'length', ok: !long.length, label: '1枚の文字が読み切れる長さ（' + SLIDE_CHARS + '字まで）', detail: long.length ? long.join('・') + '枚目が長めです。' : '' })
  var cta = CTA_RE.test(last) || CTA_RE.test(caption)
  checks.push({ id: 'cta', ok: cta, label: '最後に保存・シェアのお願いがある', detail: cta ? '' : '最後の1枚かキャプションに「' + SAVE_CTA + '」などを入れましょう。' })
  return { checks: checks, ok: checks.filter(function (x) { return x.ok }).length, total: checks.length, slides: slides.length + 2 }
}

/** キャプションのたたき台（表紙・中身の頭・保存のお願い）。 */
function carouselCaption(c) {
  var cover = String((c && c.cover) || '').trim()
  var slides = ((c && c.slides) || []).map(function (s) { return String(s || '').trim().split(/\n/)[0] }).filter(Boolean)
  var parts = []
  if (cover) parts.push(cover)
  if (slides.length) parts.push(slides.map(function (s) { return '・' + s.slice(0, 40) }).join('\n'))
  parts.push('あとで見返せるように、保存しておいてね。役に立ったら、友だちにも送ってみてください。')
  return parts.join('\n\n')
}

/** 書き出し用のテキスト（1枚ずつ）。 */
function carouselText(c) {
  var slides = ((c && c.slides) || []).map(function (s) { return String(s || '').trim() }).filter(Boolean)
  var out = ['【1枚目（表紙）】', String((c && c.cover) || '').trim(), '']
  slides.forEach(function (s, i) { out.push('【' + (i + 2) + '枚目】', s, '') })
  out.push('【' + (slides.length + 2) + '枚目（最後）】', String((c && c.last) || '').trim(), '')
  out.push('【キャプション】', String((c && c.caption) || '').trim())
  return out.join('\n') + '\n'
}

/** ブロックの割合。LINE が blocks を返していればそれを、無ければ
 *  「友だち − 届く人数」から出します（届く人数は LINE が数えた targetedReaches）。 */
function lineBlockRate(q) {
  if (!q || typeof q !== 'object') return null
  var f = Number(q.followers)
  if (!isFinite(f) || f <= 0 || q.followers == null) return null
  if (q.blocks != null && isFinite(Number(q.blocks))) return Math.max(0, Number(q.blocks)) / f
  if (q.reach == null || !isFinite(Number(q.reach))) return null
  return Math.max(0, f - Number(q.reach)) / f
}

/** ブロックの割合の目安（20%以下は良好、20〜30%は平均的、30%を超えたら見直し）。 */
function blockBand(rate) {
  if (rate == null) return null
  if (rate <= 0.2) return { level: 'good', label: '良好', note: 'ブロックの割合は低めです。今のペースで大丈夫です。' }
  if (rate <= 0.3) return { level: 'avg', label: '平均的', note: 'よくある範囲です。送る回数を増やす前に、内容が友だちに役立つかを見直しましょう。' }
  return { level: 'act', label: '見直しが必要', note: 'ブロックが多めです。送る回数を減らし、クーポンや役立つ情報など「受け取ってうれしい」内容にしましょう。' }
}

/** 友だちの人数の移り変わり（1日1回のメモから）。2日分ないときは null。 */
function lineTrend(rows) {
  var r = (rows || []).filter(function (x) { return x && x.date && x.followers != null && isFinite(Number(x.followers)) })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1 })
  if (r.length < 2) return null
  var first = r[0]
  var last = r[r.length - 1]
  return {
    from: first.date, to: last.date, first: Number(first.followers), last: Number(last.followers),
    diff: Number(last.followers) - Number(first.followers), points: r.slice(-60).map(function (x) { return { date: x.date, n: Number(x.followers) } }),
  }
}

/* ---------------------------------------------------- 7. the month -- */

function per(a, b) { return b ? a / b : 0 }

/** 月次の振り返り。month は 'YYYY-MM'。予約は入れず、出した投稿だけで数えます。
 *  反応（いいね・コメント・共有）と、サイトに来た人・問い合わせ（計測リンク）は、
 *  取れている投稿の分だけ足します。 */
function monthlyReview(items, pillars, month) {
  var posts = (items || []).filter(function (it) { return !it.scheduled && it.day.slice(0, 7) === month })
  var mk = function (id, name, color, promo) {
    return { id: id, name: name, color: color || '', promo: !!promo, posts: 0, reacted: 0, reactions: 0, measured: 0, visits: 0, inquiries: 0 }
  }
  var rows = (pillars || []).map(function (p) { return mk(p.id, p.name, p.color, p.promo) })
  var none = mk('', '柱なし', '', false)
  var byId = {}
  rows.forEach(function (r) { byId[r.id] = r })
  var nets = {}
  posts.forEach(function (it) {
    var r = byId[it.pillar] || none
    var s = it.src || {}
    r.posts++
    if (s.reactions != null) { r.reacted++; r.reactions += Number(s.reactions) || 0 }
    if (s.outcome) { r.measured++; r.visits += Number(s.outcome.visits) || 0; r.inquiries += Number(s.outcome.inquiries) || 0 }
    it.nets.forEach(function (net) {
      var x = nets[net] || (nets[net] = { net: net, posts: 0, measured: 0, visits: 0, inquiries: 0 })
      x.posts++
      var o = s.outcome && s.outcome.byNet && s.outcome.byNet[net]
      if (o) { x.measured++; x.visits += Number(o.visits) || 0; x.inquiries += Number(o.inquiries) || 0 }
    })
  })
  if (none.posts) rows.push(none)
  rows.forEach(function (r) { r.reliability = reliability(r.posts) })
  var netRows = Object.keys(nets).map(function (k) { nets[k].reliability = reliability(nets[k].posts); return nets[k] })
    .sort(function (a, b) { return b.posts - a.posts })

  var tips = []
  var ok = rows.filter(function (r) { return r.id && r.posts >= 3 && (r.measured || r.reacted) })
  if (!ok.length) {
    tips.push('まだ件数が少ないため、どの柱が良いかは判断できません（1つの柱で3本以上から比べます）。今の配分で続けて、来月また見ましょう。')
  } else {
    var score = function (r) { return per(r.inquiries, r.measured) * 1000 + per(r.visits, r.measured) + per(r.reactions, r.reacted) / 1000 }
    var sorted = ok.slice().sort(function (a, b) { return score(b) - score(a) })
    var best = sorted[0]
    var lbl = function (r) { return r.reliability.label ? '（' + r.reliability.label + '）' : '' }
    if (best.inquiries > 0) tips.push('「' + best.name + '」の投稿が、問い合わせにいちばんつながっています（' + best.posts + '本で ' + best.inquiries + ' 件）' + lbl(best) + '。来月は「' + best.name + '」を週1本増やしてみましょう。')
    else if (best.visits > 0) tips.push('サイトに来た人がいちばん多いのは「' + best.name + '」の投稿です（' + best.posts + '本で ' + best.visits + ' 人）' + lbl(best) + '。来月は「' + best.name + '」を週1本増やしてみましょう。')
    else if (best.reactions > 0) tips.push('反応（いいね・コメント・共有）がいちばん多いのは「' + best.name + '」です' + lbl(best) + '。来月も続けましょう。')
    var worst = sorted[sorted.length - 1]
    if (sorted.length > 1 && worst !== best && worst.inquiries === 0 && per(worst.visits, worst.measured) < per(best.visits, best.measured) / 3) {
      tips.push('「' + worst.name + '」は反応が少なめでした' + lbl(worst) + '。本数を減らすか、出し方（カルーセル・写真・書き出しの一言）を変えてみましょう。')
    }
  }
  var tagged = rows.filter(function (r) { return r.id }).reduce(function (s, r) { return s + r.posts }, 0)
  var promo = rows.filter(function (r) { return r.promo }).reduce(function (s, r) { return s + r.posts }, 0)
  if (tagged >= 3 && promo / tagged > PROMO_MAX) tips.push('宣伝の投稿が ' + Math.round(promo / tagged * 100) + '% でした。来月は20%以内（5本に1本まで）を目安にしましょう。')
  var bestNet = netRows.filter(function (x) { return x.posts >= 3 && x.inquiries > 0 }).sort(function (a, b) { return per(b.inquiries, b.measured) - per(a.inquiries, a.measured) })[0]
  if (bestNet) tips.push((NET_LABELS[bestNet.net] || bestNet.net) + ' からの問い合わせが ' + bestNet.inquiries + ' 件ありました' + (bestNet.reliability.label ? '（' + bestNet.reliability.label + '）' : '') + '。')
  return { month: month, total: posts.length, rows: rows, nets: netRows, tips: tips, reliability: reliability(posts.length) }
}

/* ------------------------------------------------------ 5. the inbox -- */

/* コメントの受信箱の1件から、届いた時刻・返事をした時刻を読みます。
   受信箱の形は決まっていないので、ありそうな名前を順に見ます。 */
function timeOf(c, names) {
  for (var i = 0; i < names.length; i++) {
    var v = names[i].split('.').reduce(function (o, k) { return o && o[k] }, c)
    var t = typeof v === 'number' ? v : Date.parse(v)
    if (v && isFinite(t)) return t
  }
  return null
}
var GOT = ['receivedAt', 'createdAt', 'created_at', 'timestamp', 'at', 'time']
var REPLIED = ['repliedAt', 'replied_at', 'reply.at', 'reply.createdAt', 'answeredAt']

/** 返事が済んでいるか。 */
function isAnswered(c) {
  if (!c || typeof c !== 'object') return true
  if (c.replied === true || c.answered === true || c.done === true || c.hidden === true) return true
  if (/^(replied|answered|done|closed|hidden|ignored)$/i.test(String(c.status || ''))) return true
  return timeOf(c, REPLIED) != null
}

/* 返事までの時間の目安。64% の人が SNS での返事を1時間以内に期待している
   という調査があります（目安）。 */
var REPLY_TARGET_MIN = 60

/** 返事の早さ。届いた時刻と返事をした時刻の両方が分かるものだけで数えます。
 *  どちらも分からないときは null（「数えられません」と出すため）。 */
function replySpeed(list) {
  var mins = []
  var open = 0
  ;(list || []).forEach(function (c) {
    if (!isAnswered(c)) { open++; return }
    var a = timeOf(c, GOT)
    var b = timeOf(c, REPLIED)
    if (a != null && b != null && b >= a) mins.push((b - a) / 60000)
  })
  if (!mins.length) return null
  mins.sort(function (x, y) { return x - y })
  var mid = mins.length % 2 ? mins[(mins.length - 1) / 2] : (mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2
  var fast = mins.filter(function (m) { return m <= REPLY_TARGET_MIN }).length
  return { n: mins.length, median: Math.round(mid), within: fast / mins.length, open: open, reliability: reliability(mins.length) }
}

/* ----------------------------------------------------- 5. first hour -- */

/* 投稿してすぐの反応（最初の30〜60分）が、その後の広がりに効くと言われています。 */
var FIRST_HOUR_MIN = 60

/** いまから60分以内に出した投稿（新しい順）と、残り分数。 */
function firstHour(posts, nowMs) {
  var out = []
  ;(posts || []).forEach(function (p) {
    var t = Date.parse(p && p.at)
    if (!isFinite(t)) return
    var age = (nowMs - t) / 60000
    if (age < 0 || age >= FIRST_HOUR_MIN) return
    if (!(p.nets || []).length) return
    out.push({ post: p, minutesLeft: Math.max(1, Math.ceil(FIRST_HOUR_MIN - age)) })
  })
  return out.sort(function (a, b) { return b.minutesLeft - a.minutesLeft })
}

/* ------------------------------------------------------- 3. this week -- */

/** AI の下書きに渡すメモ（/api/social-write の topic）。柱と書き方の目安を、言葉で添えます。 */
function draftTopic(pillar, idea, nets) {
  var lines = []
  if (pillar) lines.push('テーマ：' + pillar.name + (pillar.desc ? '（' + pillar.desc + '）' : ''))
  if (idea) lines.push('書くこと：' + idea)
  if (pillar && pillar.promo) lines.push('書き方：お知らせの投稿です。いつ・何が・いくらかを、はっきり短く。')
  else lines.push('書き方：宣伝は控えめにして、読む人の役に立つこと・お店の雰囲気が伝わることを中心に。')
  if ((nets || []).indexOf('instagram') !== -1) lines.push('Instagram は、ポイントを3つほどに分けて、最後に「保存して見返してね」と一言添える。')
  return lines.join('\n')
}

function ideaFor(pillar, salt) {
  var ideas = (pillar && pillar.ideas) || []
  if (!ideas.length) return ''
  return ideas[Math.abs(salt) % ideas.length]
}

/** 今週やることの一覧。
 *  input: { items, plan, today, recommend, inbox: { unanswered } | null }
 *  戻り値: [{ id, kind, title, why, draft: { topic, pillar, nets } | null, go }] */
function weekChecklist(input) {
  var o = input || {}
  var plan = o.plan || { pillars: [], targets: {} }
  var items = o.items || []
  var today = o.today
  var pillars = plan.pillars || []
  var out = []
  var ws = weekStart(today)
  var we = addDays(ws, 6)
  var salt = Math.floor(Date.parse(ws) / (7 * DAY))
  if (!pillars.length) {
    out.push({ id: 'setup', kind: '準備', title: 'まず柱（テーマ）を3〜5つ決める', why: '何を書くかが決まっていると、続けやすくなります。「おすすめの柱で始める」からでも大丈夫です。', draft: null, go: 'pillars' })
  }
  // この週の、柱ごとの本数（予約を含む）
  var weekBy = {}
  items.forEach(function (it) {
    if (it.day >= ws && it.day <= we && it.pillar && (it.scheduled || it.day <= today)) weekBy[it.pillar] = (weekBy[it.pillar] || 0) + 1
  })
  var mix = pillarMix(items, pillars, today)
  var helpful = pillars.filter(function (p) { return !p.promo })
  var by30 = {}
  mix.rows.forEach(function (r) { by30[r.id] = r.n })
  var calm = helpful.slice().sort(function (a, b) { return (weekBy[a.id] || 0) - (weekBy[b.id] || 0) || (by30[a.id] || 0) - (by30[b.id] || 0) })
  var defaultNets = []
  var cd = cadence(items, plan.targets, today)
  // 柱の投稿の出し先：週の目標があるSNSのうち、ふだんの投稿向きのもの（Googleの
  // お店の情報と LINE の一斉送信は、お知らせ向きなので外します）を3つまで。
  cd.rows.forEach(function (r) { if (r.per === 'week' && r.net !== 'gbp' && r.net !== 'line') defaultNets.push(r.net) })
  defaultNets = defaultNets.slice(0, 3)
  if (!defaultNets.length) defaultNets = ['instagram']

  if (mix.promoOver && helpful.length) {
    var p0 = calm[0]
    out.push({
      id: 'mix', kind: 'バランス', title: '次の投稿は宣伝以外にする',
      why: '直近30日の宣伝の割合が ' + Math.round(mix.promoShare * 100) + '% です（目安は20%まで）。',
      draft: { topic: draftTopic(p0, ideaFor(p0, salt), defaultNets), pillar: p0.id, nets: defaultNets }, go: '',
    })
  }
  calm.filter(function (p) { return !weekBy[p.id] }).slice(0, 2).forEach(function (p, i) {
    var idea = ideaFor(p, salt + i)
    out.push({
      id: 'pillar-' + p.id, kind: '柱', title: '「' + p.name + '」の投稿を1本' + (idea ? '（例：' + idea + '）' : ''),
      why: '今週はまだ「' + p.name + '」の投稿がありません。',
      draft: { topic: draftTopic(p, idea, defaultNets), pillar: p.id, nets: defaultNets }, go: '',
    })
  })
  cd.rows.forEach(function (r, i) {
    if (r.per !== 'week' || !r.left) return
    var days = suggestDays(items, r.net, today, r.left, ((o.recommend || {})[r.net] || {}).weekdays, 'week')
    var p = calm.length ? calm[i % calm.length] : null
    var label = NET_LABELS[r.net] || r.net
    out.push({
      id: 'cadence-' + r.net, kind: 'ペース',
      title: label + '：今週あと ' + r.left + ' 本' + (days.length ? '（おすすめ：' + days.map(function (d) { return d === today ? '今日' : WEEKDAYS[weekdayOf(d)] + '曜' }).join('・') + '）' : ''),
      why: '目標は週' + r.n + '本です（目安）。いまは出した分 ' + r.week.done + ' 本＋予約 ' + r.week.booked + ' 本。',
      draft: { topic: draftTopic(p, ideaFor(p, salt + i + 1), [r.net]), pillar: p ? p.id : '', nets: [r.net] }, go: '',
    })
  })
  var lineT = (plan.targets || {}).line
  if (lineT && lineT.on) {
    var lm = lineMonth(items, today)
    var dom = Number(today.slice(8, 10))
    if (lm.count >= LINE_MAX) {
      out.push({ id: 'line-stop', kind: 'LINE', title: 'LINE は今月これ以上送らない', why: '今月はもう ' + lm.count + ' 通（予約を含む）です。送りすぎると、ブロックされやすくなります（目安は月2〜4通）。', draft: null, go: 'line' })
    } else if (lm.count < LINE_MIN && dom >= 8) {
      var lp = calm[0] || null
      out.push({
        id: 'line-send', kind: 'LINE', title: 'LINE を今月あと ' + (LINE_MIN - lm.count) + ' 通',
        why: '今月はまだ ' + lm.count + ' 通です。友だちに忘れられない程度（月2〜4通が目安）に送りましょう。',
        draft: { topic: draftTopic(lp, ideaFor(lp, salt + 3), ['line']), pillar: lp ? lp.id : '', nets: ['line'] }, go: '',
      })
    }
  }
  if (o.inbox && o.inbox.unanswered > 0) {
    out.push({ id: 'inbox', kind: '返事', title: '返事を待っているコメントが ' + o.inbox.unanswered + ' 件', why: '多くの人が、SNS での返事は1時間以内を期待しています。早い返事ほど、来店や問い合わせにつながりやすくなります。', draft: null, go: 'inbox' })
  }
  if (pillars.length && !out.length) {
    var pi = calm[0] || pillars[0]
    var id2 = ideaFor(pi, salt + 5)
    out.push({ id: 'idea', kind: 'ネタ', title: '今週の目標は達成しています。次のネタを1つ書きためておく' + (id2 ? '（例：' + id2 + '）' : ''), why: '余裕のある週に予約しておくと、忙しい週も続けられます。', draft: { topic: draftTopic(pi, id2, defaultNets), pillar: pi.id, nets: defaultNets }, go: '' })
  }
  return out
}

window.lumSocialPlan = { PILLAR_COLORS, PILLAR_MIN, PILLAR_MAX, PROMO_MAX, MIX_DAYS, NET_LABELS, SAMPLE_PILLARS, cleanPillarId, validatePlan, WEEKDAYS, jstDay, addDays, weekdayOf, weekStart, monthStart, monthEnd, itemsOf, pillarMix, reliability, DEFAULT_TARGETS, cadence, suggestDays, LINE_MIN, LINE_MAX, lineMonth, CAROUSEL_MIN, CAROUSEL_MAX, SLIDE_CHARS, SAVE_CTA, saveShareScore, carouselCheck, carouselCaption, carouselText, lineBlockRate, blockBand, lineTrend, monthlyReview, isAnswered, REPLY_TARGET_MIN, replySpeed, FIRST_HOUR_MIN, firstHour, draftTopic, weekChecklist };
})();
