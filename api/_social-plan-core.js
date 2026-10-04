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
export var PILLAR_COLORS = ['#0f766e', '#3d3fbf', '#be185d', '#9a3412', '#6d28d9', '#0e7490', '#047857']
export var PILLAR_MIN = 3
export var PILLAR_MAX = 5
/* 宣伝の割合の目安（80/20 の考え方。役立つ・共感の投稿が8割、宣伝は2割まで）。 */
export var PROMO_MAX = 0.2
/* 柱の配分を見る期間（日）。 */
export var MIX_DAYS = 30

export var NET_LABELS = {
  x: 'X', facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', linkedin: 'LinkedIn',
  line: 'LINE公式アカウント', gbp: 'Googleビジネスプロフィール', bluesky: 'Bluesky',
}

/* 柱の例（はじめての人が「おすすめの柱で始める」を押したとき）。お店向け。 */
export var SAMPLE_PILLARS = [
  { name: 'お役立ち', desc: 'お客さまの困りごとに答える小さなコツ', ideas: ['よくある質問に答える', '選び方のコツを3つ', '季節の楽しみ方'], promo: false },
  { name: '裏側', desc: '仕込み・準備・スタッフの様子', ideas: ['朝の仕込みの様子', 'こだわりの道具', 'スタッフ紹介'], promo: false },
  { name: 'お客さまの声', desc: 'いただいた感想や、よく選ばれるもの', ideas: ['いただいた感想を紹介', '人気の組み合わせ'], promo: false },
  { name: 'お知らせ・宣伝', desc: '新メニュー・イベント・営業日', ideas: ['新メニューのお知らせ', '定休日・営業時間'], promo: true },
]

function str(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) }

/** 柱の id。英数字とハイフンだけ。 */
export function cleanPillarId(v) {
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
export function validatePlan(input) {
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
export var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 日本時間の日付（YYYY-MM-DD）。 */
export function jstDay(iso) {
  var t = typeof iso === 'number' ? iso : Date.parse(iso)
  if (!isFinite(t)) return ''
  return new Date(t + 9 * 3600000).toISOString().slice(0, 10)
}
export function addDays(day, n) {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
}
export function weekdayOf(day) { return new Date(day + 'T00:00:00Z').getUTCDay() }
/** その日を含む週の月曜日（日本時間の日付で）。週は月曜〜日曜。 */
export function weekStart(day) { return addDays(day, -((weekdayOf(day) + 6) % 7)) }
export function monthStart(day) { return day.slice(0, 8) + '01' }
export function monthEnd(day) {
  var y = Number(day.slice(0, 4))
  var m = Number(day.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/* ------------------------------------------------------------ the posts -- */

/** 履歴と予約を、同じ形の「投稿」の並びにします。
 *  history: [{ id, at, pillar, nets:[送れた先], ... }]（GET /api/social-plan の posts）
 *  queue:   [{ id, date, targets, pillar }]
 *  tags:    { 投稿id: 柱id }（あとから付けた柱） */
export function itemsOf(history, queue, tags) {
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
export function pillarMix(items, pillars, today, days) {
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
export function reliability(n) {
  if (n < 3) return { level: 'none', label: '判断できません', note: '件数が ' + n + ' 件なので、まだ判断できません（3件から）。' }
  if (n < 6) return { level: 'low', label: '参考程度', note: '件数が ' + n + ' 件なので、参考程度に見てください（6件からある程度言えます）。' }
  return { level: 'ok', label: '', note: '' }
}

/* ---------------------------------------------------------- 2. cadence -- */

/* 投稿のペースの目安（Buffer などの調査から。週5本以上出すアカウントは
   伸びが2〜3倍速い、という結果があります）。on は最初から目標に入れるか。 */
export var DEFAULT_TARGETS = {
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
export function cadence(items, targets, today) {
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
export function suggestDays(items, net, today, left, prefer, per) {
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
export var LINE_MIN = 2
export var LINE_MAX = 4

/** その月の LINE の一斉送信の数（送った分＋予約）。day はその月の任意の日。 */
export function lineMonth(items, day) {
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
export function isAnswered(c) {
  if (!c || typeof c !== 'object') return true
  if (c.replied === true || c.answered === true || c.done === true || c.hidden === true) return true
  if (/^(replied|answered|done|closed|hidden|ignored)$/i.test(String(c.status || ''))) return true
  return timeOf(c, REPLIED) != null
}

/* ------------------------------------------------------- 3. this week -- */

/** AI の下書きに渡すメモ（/api/social-write の topic）。柱と書き方の目安を、言葉で添えます。 */
export function draftTopic(pillar, idea, nets) {
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
export function weekChecklist(input) {
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
  cd.rows.forEach(function (r) { if (r.per === 'week') defaultNets.push(r.net) })
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
