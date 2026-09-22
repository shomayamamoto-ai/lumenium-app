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
  /* --- 評判・信頼性: 候補に残ったあと、最後に必ず聞かれること。
     指名で見つかっても、ここで「情報が限られています」と言われたら、
     そこで検討は止まります。そして止まったことは問い合わせ数には
     現れないので、測らないと気づけません。
     この3問が低いときの打ち手は、サイトを直すことではなく、外に
     根拠（掲載・プロフィール・第三者の記述）を置くことです。 */
  { id: 'trust-review', cat: '評判・信頼性', q: 'ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？' },
  { id: 'trust-real', cat: '評判・信頼性', q: 'ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？' },
  { id: 'trust-newco', cat: '評判・信頼性', q: '設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？' },

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

/** 分野ごとの率を読んでよい最低の問数。
 *  1問の分野は 0% か 100% にしかならず、傾向としては読めません。
 *  数だけを出して、率は伏せます。 */
export const MIN_FOR_RATE = 3

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
