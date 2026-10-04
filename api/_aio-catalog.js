// The question set the AIO probe runs, and the rules for scoring an answer.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// What this measures, and what it does not: Google does not publish whether a
// given site appeared in an AI Overview, and scraping the SERP to find out is
// both fragile and against their terms. So the probe does not claim to read
// Google. It asks answer engines the questions a customer would actually
// type, with live web search switched on, and records whether the company
// comes back — which is the same job an AI Overview does, and is reproducible,
// timestamped, and comparable run over run. Treat it as "how visible are we to
// an AI that searches the web right now", not as a Google metric.

import { BRAND as SITE } from './_brand.js'

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* 社名まわりは _brand.js から作ります。ここに Lumenium と直に書いてあると、
   別の会社のサイトに載せたとき、計測が他社の名前を「自社」と数えます。 */
export const BRAND = {
  name: SITE.name,
  kana: SITE.kana,
  host: SITE.host,
  // Without "www.", because that is how hostOf() reports a host.
  domain: SITE.host.replace(/^www\./, ''),
  // Matched case-insensitively against the answer text.
  names: [...new Set([SITE.name, SITE.kana].map((n) => String(n || '').trim()).filter(Boolean))],
  // Same spelling, different companies — a mention of these is not a hit.
  // "Lumenium LLC" has to match "Lumenium, LLC" as well, hence the loose gap.
  notUs: SITE.lookalikes.map((n) => new RegExp(escapeRe(n).replace(/\s+/g, ',?\\s*'), 'i')),
}

const BRANDED_CAT = 'ブランド指名'
const NAME = `${BRAND.kana}（${BRAND.name}）`

/** The questions a run asks when nobody has saved their own list.
 *
 *  `branded: true` marks the questions that contain our name. Those cannot
 *  tell us whether we are found by someone who does not know us yet, so every
 *  "non-branded" rate leaves them out. This used to be decided by the
 *  category alone, and two 評判 questions that name us were counted as
 *  non-branded — which flattered the number that matters most. isBranded()
 *  below also checks the text, so a question typed in from the admin without
 *  the flag is still caught. */
export const DEFAULT_QUESTIONS = [
  // --- 指名: the floor. If we lose here we are invisible even to people
  //     who already know the name.
  { id: 'brand-what', cat: BRANDED_CAT, branded: true, q: `${NAME}とはどんな会社ですか？事業内容と拠点を教えてください。` },
  { id: 'brand-real', cat: BRANDED_CAT, branded: true, q: `${BRAND.name} という日本の制作会社は実在しますか？公式サイトはどこですか？` },
  // 似た名前の会社が無ければ、この問いは意味を持たないので出しません。
  ...(SITE.lookalikes.length
    ? [{ id: 'brand-vs', cat: BRANDED_CAT, branded: true, q: `${BRAND.kana}と${SITE.lookalikes[0]}は同じ会社ですか？` }]
    : []),

  /* --- 評判・信頼性: 候補に残ったあと、最後に必ず聞かれること。
     指名で見つかっても、ここで「情報が限られています」と言われたら、
     そこで検討は止まります。そして止まったことは問い合わせ数には
     現れないので、測らないと気づけません。
     この3問が低いときの打ち手は、サイトを直すことではなく、外に
     根拠（掲載・プロフィール・第三者の記述）を置くことです。
     最初の2問は社名入りなので、非指名の率には入れません。 */
  { id: 'trust-review', cat: '評判・信頼性', branded: true, q: `${NAME}という制作会社の評判を教えてください。実際に利用した人の声はありますか？` },
  { id: 'trust-real', cat: '評判・信頼性', branded: true, q: `${BRAND.kana}に制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？` },
  { id: 'trust-newco', cat: '評判・信頼性', q: '設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？' },

  // --- 非指名: the real test. Nobody types our name here.
  { id: 'video-hire', cat: '動画制作', q: '東京で採用動画の制作を依頼できる会社を教えてください。' },
  { id: 'video-cheap', cat: '動画制作', q: '中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。' },
  // 金額を含む質問は、検討がいちばん進んだ人が聞きます。
  { id: 'video-price', cat: '動画制作', q: '会社紹介動画の制作費用はいくらくらいかかりますか？依頼先の候補も挙げてください。' },

  { id: 'ai-train', cat: 'AI導入・研修', q: '社員向けの生成AI研修をやってくれる会社を教えてください。' },
  { id: 'ai-intro', cat: 'AI導入・研修', q: '中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？' },
  { id: 'ai-rule', cat: 'AI導入・研修', q: 'ChatGPTを社内で使えるようにしたいのですが、社内ルールづくりから支援してくれる会社はありますか？' },

  { id: 'sns-line', cat: 'SNS・LINE', q: '企業のLINE公式アカウントの構築を代行してくれる会社はありますか？' },
  { id: 'sns-ops', cat: 'SNS・LINE', q: 'SNS運用代行を依頼できる東京の会社を教えてください。' },
  { id: 'sns-short', cat: 'SNS・LINE', q: 'InstagramやTikTokの短い動画を、撮影から投稿までまとめて任せられる会社はありますか？' },

  { id: 'web-make', cat: 'Web制作・システム開発', q: '企業のホームページ制作を依頼できる会社を東京で探しています。' },
  { id: 'web-sys', cat: 'Web制作・システム開発', q: '業務システムの開発を小規模から相談できる会社はありますか？' },
  { id: 'web-renew', cat: 'Web制作・システム開発', q: '古い会社のホームページを作り直したいのですが、相談できる制作会社を教えてください。' },

  /* この2つは、これまで1問ずつしかありませんでした。1問の結果は
     0% か 100% にしかならず、分野の傾向としては読めません。
     （少ない標本に率を付けない、というのはアクセス解析と同じ話です。） */
  { id: 'cast-book', cat: 'キャスト手配', q: 'イベントのMCやキャストを手配してくれる会社を教えてください。' },
  { id: 'cast-expo', cat: 'キャスト手配', q: '展示会の司会やコンパニオンを手配したいのですが、東京で相談できる会社はありますか？' },
  { id: 'cast-shoot', cat: 'キャスト手配', q: '撮影に出演するモデルやナレーターの手配も含めて、動画制作を任せられる会社はありますか？' },

  { id: 'cre-logo', cat: 'クリエイティブ', q: '会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。' },
  { id: 'cre-brand', cat: 'クリエイティブ', q: 'ロゴから名刺・会社案内まで、まとめてデザインを頼める会社を教えてください。' },
  { id: 'cre-pamph', cat: 'クリエイティブ', q: '会社案内のパンフレットや展示会のパネルを作ってくれる制作会社を探しています。' },

  // --- 横断: the questions that decide a shortlist.
  { id: 'cross-onestop', cat: '横断・比較', q: '動画もWebもAI研修もまとめて頼める制作会社はありますか？' },
  { id: 'cross-dx', cat: '横断・比較', q: '中小企業のDXを一社でまとめて支援してくれる会社を教えてください。' },
  { id: 'cross-choose', cat: '横断・比較', q: '制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。' },
  // 予算を言う質問は、候補を3社くらいに絞る場面で出ます。
  { id: 'cross-budget', cat: '横断・比較', q: '予算100万円以内で、動画制作とホームページ制作の両方を相談できる会社はありますか？' },
]

/** The default set. Other modules (the site audit, the advisor) read this;
 *  a run itself reads the saved list first — see aio.js loadQuestions(). */
export const QUESTIONS = DEFAULT_QUESTIONS

/** 分野ごとの率を読んでよい最低の問数。
 *  1問の分野は 0% か 100% にしかならず、傾向としては読めません。
 *  同じ質問を何度聞いても、質問の数は増えません——ここで数えるのは
 *  標本の数ではなく、違う質問の数です。 */
export const MIN_FOR_RATE = 3

export const categoriesOf = (list) => [...new Set((list || []).map((q) => q.cat))]
export const CATEGORIES = categoriesOf(DEFAULT_QUESTIONS)

/** Does this question contain our name? The flag is what the author meant;
 *  the text check is the safety net for a list edited by hand. */
export function isBranded(item) {
  return !!(item && (item.branded === true || namesBrand(item.q)))
}

/* 管理画面から保存できる質問の上限。多すぎると1回の計測が数時間になり、
   費用も読めなくなります。 */
export const LIMITS = { questions: 60, q: 200, cat: 30, id: 40 }

/** Check a list typed in from the admin. Returns the cleaned list or the
 *  reason it was refused, in Japanese, naming the row. */
export function validateQuestions(input) {
  if (!Array.isArray(input) || !input.length) return { ok: false, message: '質問が1つもありません。' }
  if (input.length > LIMITS.questions) return { ok: false, message: `質問は${LIMITS.questions}問までです（いま${input.length}問）。` }
  const out = []
  const ids = new Set()
  for (let i = 0; i < input.length; i++) {
    const row = input[i] || {}
    const n = i + 1
    const q = String(row.q || '').trim()
    const cat = String(row.cat || '').trim() || 'その他'
    let id = String(row.id || '').trim().toLowerCase()
    if (!q) return { ok: false, message: `${n}行目: 質問文が空です。` }
    if (q.length > LIMITS.q) return { ok: false, message: `${n}行目: 質問文は${LIMITS.q}字までです（いま${q.length}字）。` }
    if (cat.length > LIMITS.cat) return { ok: false, message: `${n}行目: カテゴリは${LIMITS.cat}字までです。` }
    // An id is what ties this run's answers to the last run's, so it is kept
    // when the browser sends one; a new row gets one made from its position.
    if (!id) id = `q${n}`
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id.length > LIMITS.id) {
      return { ok: false, message: `${n}行目: IDは英小文字・数字・ハイフンのみ、${LIMITS.id}字までです。` }
    }
    if (ids.has(id)) return { ok: false, message: `${n}行目: ID「${id}」が重複しています。` }
    ids.add(id)
    out.push({ id, cat, q, branded: row.branded === true || namesBrand(q) })
  }
  return { ok: true, questions: out }
}

/** A short fingerprint of a question set. Two runs are compared only when
 *  they asked the same questions — a rate over a different set of questions
 *  is a different number, however similar it looks. */
export function questionSetHash(list) {
  const s = JSON.stringify((list || []).map((q) => [q.id, q.q, isBranded(q) ? 1 : 0]))
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/* 計測に使うモデル。
 *
 *  Opus ではなく Sonnet を使います。ここで測っているのは「ウェブを検索
 *  した回答に自社が出てくるか」であって、モデルの思考力ではありません。
 *  そして1問ずつ時間内に返ってくることが、そのまま計測の成否を決めます
 *  ——Opus で回していた頃は、16問中15問が時間内に返ってきませんでした。
 *  速いほうを使うのは、精度を落とす判断ではなく、計測が成立するための
 *  条件です。 */
export const ASK_MODEL = 'claude-sonnet-5-5'
export const JUDGE_MODEL = 'claude-sonnet-5-5'

/** How many answers one judge call reads. Four fit in its reply with room
 *  to spare; see analyseBatch in aio.js for why this is not "all of them". */
export const JUDGE_BATCH = 4

// 見積り表示のためだけの単価（100万トークンあたりドル・目安）。
const PRICE = { in: 2, out: 10, search: 0.01 }

/** Rough cost of one judge call over JUDGE_BATCH answers. */
export const JUDGE_EST_USD = (JUDGE_BATCH * 900 / 1e6) * PRICE.in + (JUDGE_BATCH * 160 / 1e6) * PRICE.out

/** Rough cost of one web-searched Claude answer: about 12k in, 1.5k out and
 *  two searches. Shown before anyone spends money; it is an estimate. */
export const CLAUDE_EST_USD = (12000 / 1e6) * PRICE.in + (1500 / 1e6) * PRICE.out + 2 * PRICE.search

/** What a run will cost before it starts: how many calls, and roughly how
 *  much. `perCall` maps each engine to its estimate (see _engines.js). */
export function planRun(questions, samples, engines, perCall) {
  const answers = questions * samples * engines.length
  const judgeCalls = Math.ceil(answers / JUDGE_BATCH)
  const usd = engines.reduce((sum, e) => sum + questions * samples * ((perCall && perCall[e]) || CLAUDE_EST_USD), 0) +
    judgeCalls * JUDGE_EST_USD
  return { answers, judgeCalls, calls: answers + judgeCalls, usd }
}

/** Kept for callers that only want "what does the default run cost". */
export function costEstimateUsd(n = QUESTIONS.length) {
  return planRun(n, 1, ['claude']).usd
}

/** Does the name appear in the answer at all?
 *
 *  This is a pre-filter, not the verdict. "Appears in the text" and "appeared
 *  as a company you could hire" are different things, and for a site that is
 *  not yet indexed they are usually opposites: the answers that name us are
 *  the ones saying 「ルメニウムという会社は見つかりませんでした」. Scoring on
 *  the text alone reported the 指名 questions as 100% when the truth was 0%.
 *  VERDICTS below is what decides, and it is decided by reading the answer. */
export function namesBrand(text) {
  const t = String(text || '')
  const cleaned = BRAND.notUs.reduce((acc, re) => acc.replace(new RegExp(re.source, 'gi'), ' '), t)
  const low = cleaned.toLowerCase()
  return BRAND.names.some((n) => low.includes(n.toLowerCase()))
}

/** How the answer actually treated us. Ordered from best to worst. */
export const VERDICTS = {
  recommended: { label: '候補として挙がった', hit: true, good: true },
  mentioned: { label: '実在の会社として言及', hit: true, good: false },
  denied: { label: '見つからないと回答', hit: false, good: false },
  other_company: { label: '同名の別会社の話', hit: false, good: false },
  absent: { label: '出てこない', hit: false, good: false },
}

export const SENTIMENTS = { positive: '好意的', neutral: '中立', negative: '否定的' }

/** Did the answer count as us appearing? Unknown verdicts are not guesses —
 *  they are excluded from the rates rather than counted either way. */
export function isHit(verdict) {
  const v = VERDICTS[verdict]
  return !!(v && v.hit)
}

/** Is this host ours? Matched on the host, not on the whole URL — someone
 *  else's page at /review-lumenium.net is not a citation of ours. */
export function isOwnHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  return !!h && (h === BRAND.domain || h.endsWith('.' + BRAND.domain))
}

/** Was our own site among these URLs? Kept for the callers that pass plain
 *  URL strings. */
export function citesBrand(urls) {
  return (urls || []).some((u) => isOwnHost(hostOf(u)))
}

export function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase()
  } catch (_) {
    return ''
  }
}

/* 会社名の表記ゆれ。
   「株式会社サンプル」「（株）サンプル」「サンプル」「ｻﾝﾌﾟﾙ」は、回答の中では
   別々の文字列として返ってきます。そのまま数えると、同じ会社が3社に割れて
   それぞれ1回ずつになり、「よく挙がる競合」が見えなくなります。法人格・
   全角半角・大文字小文字・空白をそろえてから数えます。 */
const LEGAL_FORMS = [
  /株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|特定非営利活動法人|NPO法人/g,
  /\((株|有|同)\)/g,
  /\b(co\.?,?\s*ltd\.?|inc\.?|llc\.?|l\.l\.c\.|corp\.?|corporation|company|limited|ltd\.?|k\.k\.|kk|gmbh|plc)(?=\W|$)/gi,
]

/** The key a company is tallied under. Two spellings of one company give the
 *  same key; the empty string means "not a usable name". */
export function companyKey(name) {
  let s = String(name || '').normalize('NFKC').toLowerCase()
  for (const re of LEGAL_FORMS) s = s.replace(re, ' ')
  return s.replace(/[\s　・･.,、。'"’“”「」『』()（）\-‐–—_/]+/g, '')
}

const OWN_KEYS = new Set(BRAND.names.map(companyKey).filter(Boolean))

/** Is this extracted company name us? Never tallied as a competitor. */
export function isOwnCompany(name) {
  if (namesBrand(name)) return true
  const k = companyKey(name)
  return !!k && OWN_KEYS.has(k)
}
