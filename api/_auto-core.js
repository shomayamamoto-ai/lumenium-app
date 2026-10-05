// 自動改善の決まりごと（計算だけ。保存も通信もしません）。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// ここにあるもの
//   ・設定（何を自動でしてよいか）と「すべて止める」
//   ・試してよい文章（実験の対象）と、決して触らないもの（料金・法的な
//     ページ・連絡先）の線引き
//   ・提案のルール（観測の1枚 → 提案の一覧）
//   ・実験の振り分け（訪問者の端末で、1日ごとに決まる A / B）
//   ・実験の判定（最低人数・最低日数・B が A より良い確率）と、
//     採用・停止・元に戻すの判断
//
// 数字の言い方
//   「良くなります」とは言いません。言えるのは「この期間、この人数で、
//   B が A より良い確率が◯%」までです。人数が足りなければ「まだ判断
//   できません」と言い、期限までに差が出なければ元の文章のままにします。
//   毎日結果を見ているので、ごくまれに偶然の差を勝ちと判断することが
//   あります。そのため採用後14日間は見張り、下がっていれば戻します。

import { rateOf } from './_auto-signals.js'

export const DAY = 86400000

/* ---------------- 設定 ---------------- */

/** 何を自動でしてよいか。最初は「提案と下書きを作る」だけが入っています。 */
export const DEFAULT_SETTINGS = {
  paused: false,      // すべて止める（観測だけは続けます。読むだけなので）
  drafts: true,       // 提案と下書きを作る（AIのキーがあり、月の上限内のときだけAIを使う）
  autoStart: false,   // 自動で実験を始める（低リスクの文章だけ・同じページで1つまで）
  autoAdopt: false,   // 勝った案を自動で採用（B が良い確率95%以上・最低人数と日数を満たしたとき）
  autoRevert: false,  // 自動で戻す（採用後14日間、下がっていれば）
  snsToQueue: false,  // SNSの下書きを承認待ちに入れる（投稿はしません）
  monthlyYen: 300,    // AI の月の上限の目安（円）
}

export const SWITCH_LABELS = {
  drafts: '提案と下書きを作る',
  autoStart: '自動で実験を始める',
  autoAdopt: '勝った案を自動で採用',
  autoRevert: '自動で戻す',
  snsToQueue: 'SNSの下書きを承認待ちに入れる',
}

export function cleanSettings(input, base = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...(base || {}) }
  const i = input && typeof input === 'object' ? input : {}
  for (const k of ['paused', 'drafts', 'autoStart', 'autoAdopt', 'autoRevert', 'snsToQueue']) {
    if (k in i) s[k] = i[k] === true
  }
  if ('monthlyYen' in i) {
    const n = Math.floor(Number(String(i.monthlyYen).replace(/[,，円¥\s]/g, '')))
    s.monthlyYen = Number.isFinite(n) && n >= 0 ? Math.min(n, 100000) : DEFAULT_SETTINGS.monthlyYen
  }
  return s
}

/** その自動の動きをしてよいか。「すべて止める」は何よりも先に効きます。 */
export function allowed(settings, what) {
  const s = settings || DEFAULT_SETTINGS
  if (s.paused) return false
  return s[what] === true
}

/* ---------------- 試してよい文章・触らないもの ---------------- */

/** 実験の対象にしてよい文章。どれもトップページの、書き換えても
 *  事実が変わらないもの（見出し・説明・ボタンの言葉）です。
 *  registry: true は content.json（文章編集と同じ場所）で採用します。
 *  予約欄の見出しは content.json の項目ではないので、採用は
 *  「固定」（/api/exp が配る）で行います。 */
export const EXP_KEYS = {
  'text.lp.title': { label: 'トップの大見出し', page: '/', goal: 'lead', registry: true },
  'text.lp.lead': { label: 'トップの説明文', page: '/', goal: 'lead', registry: true },
  'text.lp.ctaPrimary': { label: 'トップのボタン（無料で相談する）', page: '/', goal: 'lead', registry: true },
  'text.lp.ctaSecondary': { label: 'トップのボタン（サービスと料金を見る）', page: '/', goal: 'lead', registry: true },
  'text.contact.desc': { label: '問い合わせ欄の説明文', page: '/', goal: 'form', registry: true },
  'booking.heading': { label: '予約欄の見出し', page: '/', goal: 'book', registry: false },
}

/** 成果として数えるもの（track.js が数える導線の名前）。 */
export const GOALS = {
  lead: ['contact_submit', 'booking_confirm', 'click_tel', 'click_line', 'click_mail'],
  form: ['contact_submit'],
  book: ['booking_confirm'],
}
export const GOAL_LABELS = { lead: '問い合わせ・予約・電話・LINE・メール', form: '問い合わせの送信', book: '予約の確定' }

/** 決して自動で触らない項目。料金・法的なページ・連絡先。
 *  項目名を「.」で区切った1つ1つを見ます（title の中の tel のような
 *  たまたまの一致で止めないため）。 */
const FORBIDDEN_SEGMENT = /^(price|prices|pricing|price_options|fee|fees|cost|costs|plan|plans|legal|privacy|terms|tokusho|law|policy|email|mail|tel|phone|address|line|lineid|company|owner|contact_info)$/i
const FORBIDDEN_PART = /price|料金|legal|privacy|tokusho|特定商取引/i

export function keyBlocked(key) {
  const k = String(key || '')
  if (!k) return 'empty'
  if (FORBIDDEN_PART.test(k)) return 'protected'
  if (k.split('.').some((seg) => FORBIDDEN_SEGMENT.test(seg))) return 'protected'
  if (!EXP_KEYS[k]) return 'not_listed'
  return ''
}

/** 案の文章として出してよいか。金額・連絡先・URL・言い切り（景品表示法で
 *  問題になりやすい言葉）を含むもの、長さが元と大きく違うもの（画面の
 *  ずれのもと）は出しません。理由を日本語で返します（空なら可）。 */
export function textProblem(a, b) {
  const A = String(a || '')
  const B = String(b || '')
  if (!B.trim()) return '案の文章が空です。'
  if (B.length > 200) return '案の文章が長すぎます（200字まで）。'
  if (B === A) return '元の文章と同じです。'
  if (/[0-9０-９][0-9０-９,，]*\s*(円|万円|千円)|[¥￥]\s*[0-9０-９]/.test(B)) return '金額は自動の実験では変えられません。'
  if (/@|https?:|www\.|\b0\d{1,4}-\d{1,4}-\d{3,4}\b/.test(B)) return '連絡先やURLは自動の実験では変えられません。'
  if (/(保証|必ず|絶対|日本一|業界一|No\.?\s*1|ナンバーワン|最安|完全無料)/i.test(B) && !/(保証|必ず|絶対|日本一|業界一|No\.?\s*1|ナンバーワン|最安|完全無料)/i.test(A)) {
    return '言い切りの言葉（保証・必ず・最安など）は、元に無いものは足せません。'
  }
  if (/無料/.test(B) && !/無料/.test(A)) return '「無料」は、元の文章に無いときは足せません（料金に関わるため）。'
  const lenA = [...A].length || 1
  const lenB = [...B].length
  if (lenB < lenA * 0.7 || lenB > lenA * 1.3 + 2) return `長さを元（${lenA}字）に近づけてください（画面がずれないように、±3割まで）。`
  const brA = (A.match(/\n/g) || []).length
  const brB = (B.match(/\n/g) || []).length
  if (brB > brA) return '改行を元より増やすことはできません（画面がずれないように）。'
  return ''
}

/* ---------------- 実験の振り分け ---------------- */

/** FNV-1a（32bit）。訪問者の端末（src/lib/experiments.js）と同じ計算です。 */
export function hash32(s) {
  let h = 0x811c9dc5
  const str = String(s)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** 端末の「その日の種」と実験の名前から A / B。同じ日・同じ端末なら同じ答え。 */
export function assign(seed, expId) {
  return hash32(`${seed}|${expId}`) % 100 < 50 ? 'A' : 'B'
}

export const EXP_ID_RE = /^[a-z0-9]{4,20}$/
export const TAG_RE = /^([a-z0-9]{4,20}):([ABW])$/

export function newExpId(now = Date.now()) {
  return 'x' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')
}

/* ---------------- 実験の判定 ---------------- */

export const MIN = {
  exposures: 200,   // 1案あたり、見た人（人・日）
  conversions: 10,  // 2案あわせての成果
  days: 7,          // 曜日の偏りをならすため、最低1週間
  maxDays: 42,      // 6週間で差が出なければ、元のまま
  probability: 0.95,
  watchDays: 14,    // 採用後に見張る日数
  watchMin: 100,    // 見張りで「下がった」と言うのに要る人数
}

function erf(x) {
  // Abramowitz–Stegun 7.1.26（誤差 1.5e-7 以下）
  const s = Math.sign(x)
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return s * y
}
export const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2))

/** B が A より良い確率（ベイズ。どちらも一様な事前分布、正規近似）。 */
export function probBBeatsA(a, b) {
  const post = (k, n) => {
    const al = 1 + k, be = 1 + n - k
    const s = al + be
    return { m: al / s, v: (al * be) / (s * s * (s + 1)) }
  }
  const A = post(a.k, a.n), B = post(b.k, b.n)
  return normCdf((B.m - A.m) / Math.sqrt(A.v + B.v))
}

/** 2つの割合の差の検定（両側の p 値）。 */
export function twoProportion(a, b) {
  if (!a.n || !b.n) return { z: 0, pValue: 1 }
  const pool = (a.k + b.k) / (a.n + b.n)
  const se = Math.sqrt(pool * (1 - pool) * (1 / a.n + 1 / b.n))
  const z = se ? (b.k / b.n - a.k / a.n) / se : 0
  return { z, pValue: 2 * (1 - normCdf(Math.abs(z))) }
}

/** counts: { A: {x, c}, B: {x, c} }（見た人・成果、人・日） */
export function evaluate(exp, counts, now = Date.now()) {
  const c = counts || {}
  const a = rateOf((c.A || {}).c, (c.A || {}).x)
  const b = rateOf((c.B || {}).c, (c.B || {}).x)
  const days = Math.max(0, Math.floor((now - Date.parse(exp.startedAt)) / DAY))
  const prob = probBBeatsA(a, b)
  const test = twoProportion(a, b)
  const short = []
  if (a.n < MIN.exposures || b.n < MIN.exposures) short.push(`見た人が各案${MIN.exposures}人以上（いまA ${a.n}人・B ${b.n}人）`)
  if (a.k + b.k < MIN.conversions) short.push(`成果が合わせて${MIN.conversions}件以上（いま${a.k + b.k}件）`)
  if (days < MIN.days) short.push(`${MIN.days}日以上（いま${days}日目）`)
  const enough = !short.length
  // あと何日かかりそうか。これまでの増え方がこのまま続くとしたら、の目安。
  const per = (v) => (days >= 1 ? v / days : v)
  const needX = Math.max(0, MIN.exposures - Math.min(a.n, b.n))
  const needC = Math.max(0, MIN.conversions - (a.k + b.k))
  const xRate = per(Math.min(a.n, b.n))
  const cRate = per(a.k + b.k)
  let daysLeft = Math.max(0, MIN.days - days)
  if (needX) daysLeft = xRate > 0 ? Math.max(daysLeft, Math.ceil(needX / xRate)) : null
  if (daysLeft != null && needC) daysLeft = cRate > 0 ? Math.max(daysLeft, Math.ceil(needC / cRate)) : null
  let verdict = 'collecting'
  if (enough && prob >= MIN.probability) verdict = 'b_wins'
  else if (enough && prob <= 1 - MIN.probability) verdict = 'a_wins'
  else if (days >= MIN.maxDays) verdict = 'no_diff'
  const pct = (v) => Math.round(v * 100)
  const text = {
    b_wins: `新しい案（B）の方が良い確率は${pct(prob)}%です。B を採用してよい水準です。`,
    a_wins: `元の文章（A）の方が良い確率が${pct(1 - prob)}%です。元のままにします。`,
    no_diff: enough
      ? `${days}日たっても、はっきりした差は出ませんでした（B が良い確率${pct(prob)}%）。元の文章のままにします。`
      : `${days}日たっても人数が足りず、判断できませんでした。元の文章のままにします。`,
    collecting: enough
      ? `差はまだはっきりしません（B が良い確率${pct(prob)}%。95%以上か5%以下で判断します）。`
      : daysLeft == null
        ? 'まだ判断できません：見た人か成果がまだ無いため、終わりの見込みが立ちません。'
        : `まだ判断できません：あと約${Math.max(1, daysLeft)}日（${short.join('、')}）。`,
  }[verdict]
  return { a, b, days, prob, pValue: test.pValue, enough, short, daysLeft, verdict, text }
}

/** 実験中のものをどうするか。
 *  adopt … 採用する（自動採用が入っているとき）
 *  won   … B が勝った。オーナーの「採用する」を待つ
 *  stop  … 元のままで終える（A が勝った・期限）
 *  continue */
export function decideRunning(evaluation, settings) {
  if (evaluation.verdict === 'b_wins') return allowed(settings, 'autoAdopt') ? 'adopt' : 'won'
  if (evaluation.verdict === 'a_wins' || evaluation.verdict === 'no_diff') return 'stop'
  return 'continue'
}

/** 採用後の見張り。baseline は実験中の A（元の文章）の率と幅。
 *  watch: { x, c }。下がった＝見張りの率が A の幅の下より下。 */
export function decideWatch(exp, watch, now = Date.now(), settings) {
  const w = rateOf((watch || {}).c, (watch || {}).x)
  const days = Math.max(0, Math.floor((now - Date.parse(exp.adoptedAt)) / DAY))
  const base = exp.baseline || {}
  const fell = w.n >= MIN.watchMin && base.lo != null && w.p < base.lo
  if (fell) return { action: allowed(settings, 'autoRevert') ? 'revert' : 'suggest_revert', w, days, fell }
  if (days >= MIN.watchDays) return { action: 'finish', w, days, fell: false, thin: w.n < MIN.watchMin }
  return { action: 'continue', w, days, fell: false }
}

/** 自動で実験を始めてよいか（理由つき）。 */
export function canAutoStart(proposal, running, settings) {
  if (!allowed(settings, 'autoStart')) return '「自動で実験を始める」が切れています。'
  const act = proposal && proposal.action
  if (!act || act.type !== 'experiment') return '実験の提案ではありません。'
  if (proposal.risk !== '低') return 'リスクが「低」ではありません。'
  const blocked = keyBlocked(act.key)
  if (blocked) return 'この項目は自動では試せません。'
  const b = (proposal.draft && proposal.draft.text) || act.b
  const bad = textProblem(act.a, b)
  if (bad) return bad
  const page = EXP_KEYS[act.key].page
  if ((running || []).some((e) => (e.phase === 'running' || e.phase === 'watch') && EXP_KEYS[e.key] && EXP_KEYS[e.key].page === page)) {
    return '同じページで別の実験・見張りが動いています（1ページに1つまで）。'
  }
  return ''
}

/* ---------------- 提案のルール ---------------- */

export const AREA_LABELS = { site: 'サイトの文章', seo: 'SEO（検索）', aio: 'AIでの見え方', sns: 'SNS', inquiry: '問い合わせ', booking: '予約', members: '会員' }
export const RISK = ['低', '中', '高']

const pct1 = (v) => (v == null ? '—' : (Math.round(v * 1000) / 10).toFixed(1) + '%')
const range = (r) => (r && r.n ? `${pct1(r.p)}（${r.k}/${r.n}人、幅 ${pct1(r.lo)}〜${pct1(r.hi)}）` : 'データなし')
const ev = (text, r) => ({ text, ...(r ? { k: r.k, n: r.n, p: r.p, lo: r.lo, hi: r.hi } : {}), label: r ? (r.label || '') : '' })

const EXPERIMENT_EFFECT = '良くなるとは限りません。元の文章と新しい案を半分ずつの人に見せて比べ、はっきり良い方だけを残します。差が出なければ元のままです。'

/** current: 項目 → いまの文章（A）。snapshot から提案の一覧を作ります。 */
export function rulesFor(snap, current = {}) {
  const out = []
  const s = snap || {}
  const A = s.analytics
  const cur = (k) => (current[k] == null ? '' : String(current[k]))
  const experiment = (id, key, title, evidence, why) => ({
    id, rule: id, area: 'site', kind: 'experiment', title, evidence, effect: EXPERIMENT_EFFECT, risk: '低',
    why, action: { type: 'experiment', key, a: cur(key), b: '' },
  })

  if (A) {
    // 1. 問い合わせ画面まで来た人の送信率が、前の30日より誤差を超えて下がった。
    if (A.form && A.form.change === 'down') {
      out.push(experiment('form-copy', 'text.contact.desc', '問い合わせ欄の説明文を、別の言い方と比べる', [
        ev(`問い合わせ画面まで来た人の送信率：いま ${range(A.form.cur)}`, A.form.cur),
        ev(`前の30日 ${range(A.form.prev)}。誤差を超えて下がっています。`, A.form.prev),
      ], 'フォームの手前の一言で、送るかどうかの迷いが変わることがあります。'))
    }
    // 2. 訪問から問い合わせ画面までで大きく減っている → ボタンの言葉。
    const d = A.drop
    if (d && (d.key === 'contact_view' || d.key === 'service_view') && A.arrivals >= 200 && d.drop >= 0.8) {
      out.push(experiment('cta-copy', 'text.lp.ctaPrimary', 'トップの相談ボタンの言葉を、別の言い方と比べる', [
        ev(`「${d.from}」→「${d.label}」で ${pct1(d.drop)} の人が先へ進んでいません（${d.before}人 → ${d.after}人、30日）。`),
      ], '最初に押すボタンの言葉は、押す前の気持ちのハードルに直接効きます。'))
    }
    // 3. トップがあまり読まれていない → 説明文。
    const top = (A.lowRead || []).find((r) => r.path === '/')
    if (top && top.rate < 0.25) {
      const r = rateOf(top.ended, top.opened)
      out.push(experiment('lead-copy', 'text.lp.lead', 'トップの説明文を、別の言い方と比べる', [
        ev(`トップページを終わりまで読んだ人：${range(r)}（30日）。`, r),
      ], '最初の数行で「自分に関係がある」と分かると、先を読んでもらいやすくなります。'))
    }
  }

  // 4. SEO 点検
  const seo = s.seo
  if (seo && seo.must > 0) {
    out.push({
      id: 'seo-must', rule: 'seo-must', area: 'seo', kind: 'fix', title: `SEO点検の「必ず直す」${seo.must}件を直す`,
      evidence: [ev(`最後の点検（${String(seo.at || '').slice(0, 10)}）で「必ず直す」${seo.must}件・「直すと良い」${seo.should}件。`)],
      effect: '検索に出られないページが出られるようになります。順位が上がるかどうかは別の話で、約束はできません。',
      risk: '低', action: { type: 'fix', items: seo.items.filter((i) => i.level === 'must').slice(0, 5) },
    })
  } else if (seo && seo.should >= 3) {
    out.push({
      id: 'seo-should', rule: 'seo-should', area: 'seo', kind: 'fix', title: `SEO点検の「直すと良い」${seo.should}件を見直す`,
      evidence: [ev(`最後の点検（${String(seo.at || '').slice(0, 10)}）で「直すと良い」${seo.should}件。`)],
      effect: '検索結果での見え方が整います。効き目は小さめで、すぐには数字に出ません。',
      risk: '低', action: { type: 'fix', items: seo.items.slice(0, 5) },
    })
  }
  if (!seo || seo.stale) {
    out.push({
      id: 'seo-run', rule: 'seo-run', area: 'seo', kind: 'info', title: 'SEO点検を一度実行する',
      evidence: [ev(seo ? `最後の点検から${seo.ageDays}日たっています。` : 'まだ点検の結果がありません。')],
      effect: '直すべき所が分かります。点検そのものはサイトを変えません。', risk: '低',
      action: { type: 'open', tab: 'seo-admin' },
    })
  }

  // 5. AIでの見え方: 相手が「分からない」と言った情報を、お知らせで出す。
  const aio = s.aio
  if (aio && aio.missing && aio.missing.length) {
    out.push({
      id: 'aio-missing', rule: 'aio-missing', area: 'aio', kind: 'news', title: `AIが「見つからない」と言った情報（${aio.missing.slice(0, 2).join('・')}）を、お知らせで書く`,
      evidence: [
        ev(`AIの回答で名前が出た割合：${range(aio.mention)}`, aio.mention),
        ev(`AIが足りないと言った情報：${aio.missing.join('、')}`),
      ],
      effect: 'AIが参照できる情報が増えます。AIの回答に出るようになるかは、AI側の更新しだいで、時期も約束できません。',
      risk: '低', action: { type: 'news', topics: aio.missing.slice(0, 3) },
    })
  }

  // 6. SNS: 問い合わせにつながっている柱。
  const sns = s.sns
  if (sns && sns.pillars && sns.pillars.length) {
    const [p1, p2] = sns.pillars
    if (p1 && p1.inquiries > 0 && p1.label !== '判断できません' && p1.id &&
        (!p2 || p1.perPost.inquiries >= 1.5 * p2.perPost.inquiries)) {
      out.push({
        id: 'sns-pillar', rule: 'sns-pillar', area: 'sns', kind: 'sns', title: `柱「${p1.name}」の投稿を週1本増やす`,
        evidence: [
          ev(`柱「${p1.name}」：${p1.posts}投稿で問い合わせ${p1.inquiries}件（1投稿あたり${p1.perPost.inquiries.toFixed(2)}件、90日）。${p1.label ? '件数が少ないので' + p1.label + 'です。' : ''}`),
          ...(p2 ? [ev(`次に多い柱「${p2.name}」：${p2.posts}投稿で${p2.inquiries}件。`)] : []),
        ],
        effect: '増やしても、同じ割合で問い合わせが来るとは限りません。投稿は承認待ちに入れるだけで、自動では出しません。',
        risk: '低', action: { type: 'sns', pillar: p1.id, pillarName: p1.name },
      })
    }
  }
  if (sns && sns.cadence && sns.cadence.weekLeft > 0) {
    out.push({
      id: 'sns-cadence', rule: 'sns-cadence', area: 'sns', kind: 'sns', title: `今週の投稿があと${sns.cadence.weekLeft}本足りません`,
      evidence: [ev(sns.cadence.rows.filter((r) => r.left > 0).map((r) => `${r.net}：あと${r.left}本（目標 ${r.per === 'week' ? '週' : '月'}${r.n}本）`).join('、'))],
      effect: '決めたペースに戻ります。反応が増えるかどうかは内容しだいです。',
      risk: '低', action: { type: 'sns', pillar: '', pillarName: '' },
    })
  }

  // 7. 問い合わせの返信が遅い。
  const q = s.inquiries
  if (q && q.median30 != null && q.median30 > 48) {
    if (!q.autoReply) {
      out.push({
        id: 'inq-autoreply', rule: 'inq-autoreply', area: 'inquiry', kind: 'setting', title: '受付確認メール（自動返信）を入れる',
        evidence: [ev(`返信までの時間の中央値：${q.median30}時間（30日・${q.replied30}件${q.label ? '・' + q.label : ''}）。目安の48時間を超えています。`)],
        effect: '「届いたか分からない」不安を減らせます。返信そのものが早くなるわけではなく、問い合わせが増えるかも分かりません。',
        risk: '低', action: { type: 'setting', setting: 'inquiry.autoReply', value: true },
      })
    } else {
      out.push({
        id: 'inq-template', rule: 'inq-template', area: 'inquiry', kind: 'info', title: '返信の文例を使って、最初の返信を早める',
        evidence: [ev(`返信までの時間の中央値：${q.median30}時間（30日・${q.replied30}件${q.label ? '・' + q.label : ''}）。`)],
        effect: '最初の一言を早く返せます。内容の返事は、そのあとで構いません。', risk: '低',
        action: { type: 'open', tab: 'inquiries-admin' },
      })
    }
  }
  if (q && q.late > 0) {
    out.push({
      id: 'inq-late', rule: 'inq-late', area: 'inquiry', kind: 'info', title: `返信の期限を過ぎた問い合わせが${q.late}件あります`,
      evidence: [ev(`約束の${q.promised}時間を過ぎて、まだ返信していないもの：${q.late}件。`)],
      effect: 'すぐ返せば、取りこぼしを減らせます。', risk: '低', action: { type: 'open', tab: 'inquiries-admin' },
    })
  }

  // 8. 予約の無断キャンセル。
  const bk = s.booking
  if (bk && bk.noshow && bk.noshow.n >= 10 && bk.noshow.p >= 0.15) {
    out.push({
      id: 'bk-noshow', rule: 'bk-noshow', area: 'booking', kind: 'info', title: '無断キャンセルを減らす（前日のお知らせを確かめる）',
      evidence: [ev(`来店・無断キャンセルを付けた予約のうち無断キャンセル：${range(bk.noshow)}（90日）。`, bk.noshow)],
      effect: '前日のお知らせが届いていれば、忘れによる無断キャンセルは減ることが多いです。どれだけ減るかは分かりません。',
      risk: '低', action: { type: 'open', tab: 'booking-admin' },
    })
  }

  // 9. 会員の配信停止。
  const m = s.members
  if (m && m.total >= 20 && m.unsubscribed / m.total >= 0.1) {
    out.push({
      id: 'mem-unsub', rule: 'mem-unsub', area: 'members', kind: 'info', title: 'お知らせメールの回数と内容を見直す',
      evidence: [ev(`配信停止した人：${m.unsubscribed}人 / ${m.total}人。`)],
      effect: '止める人が減るかは、内容と回数しだいです。', risk: '低', action: { type: 'open', tab: 'list-view' },
    })
  }
  return out
}

/** 新しく出た提案を、保存してある提案に重ねます。
 *  ・見送った・採用した・済んだものは、30日は同じ提案を出しません
 *  ・実験中のものは、そのまま
 *  ・条件に当てはまらなくなった「未対応」の提案は消します */
export const QUIET_DAYS = 30
export function mergeProposals(existing, fresh, now = Date.now()) {
  const ex = existing || {}
  const out = {}
  const seen = new Set()
  for (const p of fresh) {
    seen.add(p.id)
    const old = ex[p.id]
    if (old && ['dismissed', 'adopted', 'done'].includes(old.status) && now - Date.parse(old.decidedAt || 0) < QUIET_DAYS * DAY) { out[p.id] = old; continue }
    if (old && old.status === 'testing') { out[p.id] = old; continue }
    const keepDraft = old && old.draft && JSON.stringify((old.action || {}).key || '') === JSON.stringify((p.action || {}).key || '')
    out[p.id] = {
      ...p, status: 'open',
      createdAt: old && old.status === 'open' ? old.createdAt : new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      ...(keepDraft ? { draft: old.draft } : {}),
    }
  }
  for (const [id, old] of Object.entries(ex)) {
    if (seen.has(id)) continue
    // もう当てはまらない。ただし AIアドバイザーから入れた案（rule: advisor）は
    // 決まりから出たものではないので、30日は残します。
    if (old.status === 'open' && old.rule !== 'advisor') continue
    if (now - Date.parse(old.decidedAt || old.updatedAt || 0) < QUIET_DAYS * DAY) out[id] = old
  }
  return out
}

/* ---------------- 訪問者に配る設定 ---------------- */

/** /api/exp が配る、いまの実験。
 *  ・「すべて止める」のときは実験を配りません（全員が元の文章に戻ります）。
 *  ・採用済みで content.json に入らない項目（予約欄の見出し）は pins で
 *    配ります。これは止めても残します（採用した文章を戻すのは「元に戻す」）。 */
export function liveConfig(exps, settings) {
  const list = Array.isArray(exps) ? exps : []
  const paused = !!(settings && settings.paused)
  const out = []
  if (!paused) {
    const pages = new Set()
    for (const e of list) {
      if (e.phase !== 'running' && e.phase !== 'watch') continue
      const meta = EXP_KEYS[e.key]
      if (!meta || keyBlocked(e.key)) continue
      if (pages.has(meta.page)) continue // 1ページに1つまで
      pages.add(meta.page)
      out.push({ id: e.id, key: e.key, phase: e.phase, goal: GOALS[meta.goal] || GOALS.lead, ...(e.phase === 'running' ? { b: e.b } : {}) })
    }
  }
  const pins = {}
  for (const e of list) {
    const meta = EXP_KEYS[e.key]
    if (!meta || meta.registry || keyBlocked(e.key)) continue
    if ((e.phase === 'watch' || e.phase === 'adopted') && e.b) pins[e.key] = e.b
  }
  return { v: 1, exps: out, pins }
}

/** 計測（track.js）が数えてよい印か。live は liveConfig の形。
 *  返り値: { id, variant, kind: 'x'（見た）|'c'（成果） } か null。 */
export function countFor(live, tag, ev) {
  const m = TAG_RE.exec(String(tag || ''))
  if (!m || !live || !Array.isArray(live.exps)) return null
  const e = live.exps.find((x) => x.id === m[1])
  if (!e) return null
  const v = m[2]
  if ((v === 'W') !== (e.phase === 'watch')) return null
  if (ev === 'exp_view') return { id: e.id, variant: v, kind: 'x' }
  if ((e.goal || []).includes(ev)) return { id: e.id, variant: v, kind: 'c' }
  return null
}
