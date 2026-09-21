// The question set the AIO probe runs, and the rules for scoring an answer.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// What this measures, and what it does not: Google does not publish whether a
// given site appeared in an AI Overview, and scraping the SERP to find out is
// both fragile and against their terms. So the probe does not claim to read
// Google. It asks an answer engine the questions a customer would actually
// type, with live web search switched on, and records whether Lumenium comes
// back — which is the same job an AI Overview does, and is reproducible,
// timestamped, and comparable run over run. Treat it as "how visible are we to
// an AI that searches the web right now", not as a Google metric.

export const BRAND = {
  domain: 'lumenium.net',
  // Matched case-insensitively against the answer text.
  names: ['lumenium', 'ルメニウム'],
  // Same spelling, different companies — a mention of these is not a hit.
  // Lumentum is a US optics maker; Lumenium LLC is a Virginia engine firm.
  notUs: [/lumentum/i, /lumenium,?\s*llc/i, /ルメンタム/],
}

/** Each question is asked once per run. `cat` groups them in the report. */
export const QUESTIONS = [
  // --- 指名: the floor. If we lose here we are invisible even to people
  //     who already know the name.
  { id: 'brand-what', cat: 'ブランド指名', q: 'ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。' },
  { id: 'brand-real', cat: 'ブランド指名', q: 'Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？' },
  { id: 'brand-vs', cat: 'ブランド指名', q: 'ルメニウムとルメンタム（Lumentum）は同じ会社ですか？' },

  // --- 非指名: the real test. Nobody types our name here.
  { id: 'video-hire', cat: '動画制作', q: '東京で採用動画の制作を依頼できる会社を教えてください。' },
  { id: 'video-cheap', cat: '動画制作', q: '中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。' },

  { id: 'ai-train', cat: 'AI導入・研修', q: '社員向けの生成AI研修をやってくれる会社を教えてください。' },
  { id: 'ai-intro', cat: 'AI導入・研修', q: '中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？' },

  { id: 'sns-line', cat: 'SNS・LINE', q: '企業のLINE公式アカウントの構築を代行してくれる会社はありますか？' },
  { id: 'sns-ops', cat: 'SNS・LINE', q: 'SNS運用代行を依頼できる東京の会社を教えてください。' },

  { id: 'web-make', cat: 'Web制作・システム開発', q: '企業のホームページ制作を依頼できる会社を東京で探しています。' },
  { id: 'web-sys', cat: 'Web制作・システム開発', q: '業務システムの開発を小規模から相談できる会社はありますか？' },

  { id: 'cast-book', cat: 'キャスト手配', q: 'イベントのMCやキャストを手配してくれる会社を教えてください。' },

  { id: 'cre-logo', cat: 'クリエイティブ', q: '会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。' },

  // --- 横断: the questions that decide a shortlist.
  { id: 'cross-onestop', cat: '横断・比較', q: '動画もWebもAI研修もまとめて頼める制作会社はありますか？' },
  { id: 'cross-dx', cat: '横断・比較', q: '中小企業のDXを一社でまとめて支援してくれる会社を教えてください。' },
  { id: 'cross-choose', cat: '横断・比較', q: '制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。' },
]

export const CATEGORIES = [...new Set(QUESTIONS.map((q) => q.cat))]

/* 計測に使うモデル。
 *
 *  Opus から Sonnet に替えてあります。ここで測っているのは「ウェブを検索
 *  した回答に自社が出てくるか」であって、モデルの思考力ではありません。
 *  そして16問を続けて投げると、1問あたりの所要時間がそのまま成否を決め
 *  ます——実際、16問中15問が時間内に返ってきませんでした。速いほうを使う
 *  のは、精度を落とす判断ではなく、計測が成立するための条件です。 */
export const ASK_MODEL = 'claude-sonnet-5'
export const JUDGE_MODEL = 'claude-sonnet-5'

// 見積り表示のためだけの単価（100万トークンあたりドル・目安）。
const PRICE = { in: 3, out: 15 }

/** Rough per-run cost, shown in the admin UI before anyone spends money.
 *  A web-searched answer runs roughly 12k in and 1.2k out, plus one
 *  extraction pass over every answer. */
export function costEstimateUsd(n = QUESTIONS.length) {
  const perQuestion = (12000 / 1e6) * PRICE.in + (1200 / 1e6) * PRICE.out
  const extraction = (n * 700 / 1e6) * PRICE.in + (n * 120 / 1e6) * PRICE.out
  return n * perQuestion + extraction
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
  return BRAND.names.some((n) => cleaned.toLowerCase().includes(n.toLowerCase()))
}

/** How the answer actually treated us. Ordered from best to worst. */
export const VERDICTS = {
  recommended: { label: '候補として挙がった', hit: true, good: true },
  mentioned: { label: '実在の会社として言及', hit: true, good: false },
  denied: { label: '見つからないと回答', hit: false, good: false },
  other_company: { label: '同名の別会社の話', hit: false, good: false },
  absent: { label: '出てこない', hit: false, good: false },
}

/** Did the answer count as us appearing? Unknown verdicts are not guesses —
 *  they are excluded from the rates rather than counted either way. */
export function isHit(verdict) {
  const v = VERDICTS[verdict]
  return !!(v && v.hit)
}

/** Was our own site one of the sources the answer searched? Citation is a
 *  stronger signal than a mention: it means the page was read, not recalled.
 *  Matched on the host, not on the whole URL — someone else's page at
 *  /review-lumenium.net is not a citation of ours. */
export function citesBrand(urls) {
  return (urls || []).some((u) => {
    const h = hostOf(u)
    return h === BRAND.domain || h.endsWith('.' + BRAND.domain)
  })
}

export function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '')
  } catch (_) {
    return ''
  }
}
