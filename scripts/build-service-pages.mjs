// Generates static, individually-indexable landing pages for each service
// at public/services/<id>.html — unique title/description, Service +
// BreadcrumbList JSON-LD, crawlable body copy, cross-links, and CTAs into
// the app. Run via `npm run build` (prebuild) or directly.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { BEACON } from './_beacon.mjs'
import { SERVICES as SERVICE_COPY } from '../src/data/services.js'
import { PROFILES } from '../src/data/site.js'
import { applyOverrides } from '../src/lib/content-registry.js'
import { ORG_NODE } from '../src/data/org.js'
try { applyOverrides(JSON.parse(readFileSync('public/content.json', 'utf8'))) } catch (_) {}

const SITE = 'https://lumenium.net'
// Answer engines prefer a page that says when it was last true.
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

const SERVICES = [
  {
    id: 'video',
    name: '動画制作・映像編集',
    keyword: '動画制作',
    title: '動画制作・映像編集（採用動画・企業PR動画・SNS動画）| Lumenium（ルメニウム）',
    desc: '採用動画・企業PR動画・SNS向け短尺動画・AI動画を、企画から撮影・編集・納品までワンストップで制作。料金は3万円〜。ルメニウム（Lumenium）が東京拠点・オンラインで全国対応します。',
    lead: '採用動画・企業PR動画・SNSの短尺動画・AI動画まで。企画構成から撮影・編集・納品後の運用まで、一貫してお任せいただけます。',
    highlights: ['社内に映像チームがなく外注先を探している', 'SNS向けの短尺動画を量産したい', '企業紹介・採用動画を丁寧に作りたい'],
    examples: ['登録者数十万人規模のYouTubeチャンネル動画制作', '有名飲食店での企画・映像制作', 'AI企業PR動画', '就業支援・研修動画'],
    price: '3万円〜（案件規模に応じてご提案）',
  },
  {
    id: 'ai',
    name: 'AI導入・生成AI研修',
    keyword: '生成AI研修',
    title: '生成AI研修・AI導入支援（企業向け・IT講師派遣）| Lumenium（ルメニウム）',
    desc: '企業向け生成AI研修・AIリテラシー教育・教材制作・IT講師派遣。現場目線でChatGPT等の業務活用を指導。講師1回10万円〜。ルメニウム（Lumenium）が東京拠点・オンラインで全国対応します。',
    lead: '「AIを業務に取り入れたいが何から始めるか分からない」に、現場目線で伴走します。社員研修・教材制作・導入コンサルティングまで対応。',
    highlights: ['AIを業務に取り入れたいが何から始めるか迷っている', '社員向けAIリテラシー研修を検討している', 'AI教材・メルマガを内製化したい'],
    examples: ['企業向けAI活用メルマガ制作', 'AI教材制作', '研修・就業支援動画のAI活用'],
    price: '講師1回 10万円〜（教材費込）/ 交通費別途',
  },
  {
    id: 'sns',
    name: 'SNS運用・LINE構築',
    keyword: 'SNS運用代行',
    title: 'SNS運用代行・LINE公式アカウント構築（Bot制作）| Lumenium（ルメニウム）',
    desc: 'SNS運用代行・企画構成・LINE公式アカウント構築・シナリオ型Bot制作。集客の仕組み化を初期20万円〜、月額10万円〜で支援します。ルメニウム（Lumenium）が東京拠点・オンラインで全国対応します。',
    lead: '「何を投稿すればいいか分からない」「公式LINEを作りたいがやり方が不明」——集客の仕組み化を企画から運用まで代行します。',
    highlights: ['公式LINEで配信したいがやり方がわからない', 'SNSで集客したいが何を投稿すべきか分からない', 'シナリオ配信・セグメント配信を設計したい'],
    examples: ['企業公式LINE構築', 'シナリオ型Bot制作', 'SNS運用代行（月数十本投稿）'],
    price: '初期 20万円〜 / 月額 10万円〜',
  },
  {
    id: 'web',
    name: 'Web制作・システム開発',
    keyword: 'ホームページ制作',
    title: 'ホームページ制作・LP制作・システム開発 | Lumenium（ルメニウム）',
    desc: '企業ホームページ・LP・Webアプリ・スマホアプリの開発。リニューアルから短納期LPまで30万円〜。ルメニウム（Lumenium）が東京拠点・オンラインで全国対応します。',
    lead: '古いHPのリニューアル、キャンペーンLPの短納期制作、業務効率化のWebアプリまで。設計から公開後の運用まで伴走します。',
    highlights: ['古いホームページをリニューアルしたい', 'キャンペーン用LPを短納期で作りたい', '業務効率化のための社内ツールを開発したい'],
    examples: ['企業ホームページ制作', '業務システム開発', 'スマートフォンアプリ'],
    price: '30万円〜（規模に応じてご提案）',
  },
  {
    id: 'cast',
    name: 'キャスト手配・イベント企画',
    keyword: 'キャスト手配',
    title: 'モデル・MC・キャスト手配、イベント企画運営 | Lumenium（ルメニウム）',
    desc: '在籍150名のモデル・アクター・MCの手配、イベントの企画運営、配信者・アイドルのプロデュース。キャスト1名5,000円〜。ルメニウム（Lumenium）が東京拠点・オンラインで全国対応します。',
    lead: '撮影・配信・イベントに必要なキャストを、在籍150名のネットワークからスピーディに手配。企画運営ごとお任せいただけます。',
    highlights: ['撮影や配信にキャストを手配したい', 'MC・司会付きのイベントを企画している', '配信者・アイドルのプロデュースを相談したい'],
    examples: ['アイドルイベント主催', '配信者のプロデュース', '企業イベントのキャスト手配・MC'],
    price: 'キャスト1名 5,000円〜 / イベント企画別途',
  },
  {
    id: 'creative',
    name: 'クリエイティブ制作',
    keyword: 'ロゴ制作',
    title: 'ロゴ・バナー・ポスター・イラスト・教材制作 | Lumenium（ルメニウム）',
    desc: 'ロゴ・バナー・ポスター・イラスト・教材制作・ライティング・作詞作曲まで、クリエイティブ全般を3万円〜で制作します。ルメニウム（Lumenium）が東京拠点・オンラインで全国対応します。',
    lead: 'ブランドの顔となるロゴから、バナー・ポスター・イラスト・教材・楽曲まで。「作りたい」をかたちにします。',
    highlights: ['新ブランドのロゴ・アイデンティティを作りたい', '書籍・ブログ用のライターを探している', 'イベント用の作詞・作曲を依頼したい'],
    examples: ['企業ロゴ・バナー・ポスター制作', '塾教材4万ページ制作（1ヶ月）', '作詞作曲・楽曲提供'],
    price: '3万円〜（内容に応じてご提案）',
  },
]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** JSON for embedding inside a <script> block.
 *
 *  JSON.stringify does not escape "<", so a "</script>" anywhere in an
 *  admin-editable string — a service description, an FAQ answer — closes the
 *  block early and everything after it becomes live HTML. Escaping the three
 *  characters as unicode leaves the JSON identical to a parser while making it
 *  impossible to break out of the tag. U+2028/29 are escaped too: they are
 *  legal in JSON but not in a JavaScript string literal. */
const ldJson = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

const STYLE = `
* { margin:0; padding:0; box-sizing:border-box; }
:root { --bg:#171c33; --card:#262c4a; --border:#424a6b; --text:#f5f7fb; --sub:#abb5cb;
  --grad:linear-gradient(135deg,#4f46e5 0%,#3b82f6 50%,#06b6d4 100%); }
body { background:
  radial-gradient(ellipse 70% 50% at 20% 10%, rgba(79,70,229,.16), transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 85%, rgba(6,182,212,.09), transparent 60%), var(--bg);
  color:var(--text); font-family:'Schibsted Grotesk','Noto Sans JP','Hiragino Sans',system-ui,-apple-system,sans-serif;
  font-feature-settings:'palt' 1; text-spacing-trim:trim-start; letter-spacing:.02em;
  line-height:1.9; }
.wrap { max-width:760px; margin:0 auto; padding:48px 22px 64px; }
header a { color:var(--sub); text-decoration:none; font-size:13px; }
header a:hover { color:var(--text); }
.eyebrow { margin-top:34px; font-size:11px; font-weight:700; letter-spacing:.3em; color:#818cf8; }
h1 { font-size:clamp(26px,5.5vw,36px); font-weight:800; letter-spacing:-.015em; line-height:1.35; margin:10px 0 16px;
  background:linear-gradient(135deg,#f5f7fb 30%,#a5b4fc 70%,#67e8f9 100%);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.lead { color:var(--sub); font-size:15px; margin-bottom:34px; }
h2 { font-size:17px; font-weight:700; margin:36px 0 14px; padding-left:12px; border-left:3px solid #4f46e5; }
ul { list-style:none; }
li { padding:10px 0 10px 26px; position:relative; border-bottom:1px solid rgba(255,255,255,.06); font-size:14.5px; }
li::before { content:'✓'; position:absolute; left:2px; color:#67e8f9; font-weight:700; }
.contact-strip { margin-top:44px; padding:22px 22px 24px; background:var(--card);
  border:1px solid var(--border); border-radius:16px; }
.contact-strip h2 { font-size:17px; font-weight:800; margin:0 0 8px; padding:0; border:0; }
.contact-strip p { font-size:14px; color:var(--sub); line-height:1.95; margin:0; }
.contact-strip .cta { margin:16px 0 4px; }
.price { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px 22px;
  font-size:15px; font-weight:700; margin-top:8px; }
.price small { display:block; font-size:11.5px; color:var(--sub); font-weight:500; margin-top:4px; }
/* 事業者情報カード。ディレクトリの1件分と同じ読み方ができる形に。 */
.facts { border:1px solid var(--border); border-radius:14px; overflow:hidden; margin:8px 0 4px; background:var(--card); }
.facts div { display:flex; gap:14px; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.07); font-size:14px; }
.facts div:last-child { border-bottom:0; }
.facts dt { flex:0 0 104px; color:#93c5fd; font-size:12.5px; font-weight:700; }
.facts dd { color:var(--sub); min-width:0; }
.facts a { color:#a5b4fc; }
.cta { display:flex; gap:12px; flex-wrap:wrap; margin:38px 0 8px; }
.cta a { flex:1; min-width:200px; text-align:center; padding:15px 20px; border-radius:12px;
  font-weight:700; font-size:14.5px; text-decoration:none; }
.cta .primary { background:var(--grad); color:#fff; }
.cta .ghost { border:1px solid var(--border); color:var(--sub); }
.cta .ghost:hover { color:var(--text); border-color:#5a628a; }
.others { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.others a { font-size:12px; color:var(--sub); text-decoration:none; padding:7px 13px;
  border:1px solid var(--border); border-radius:999px; }
.others a:hover { color:#a5b4fc; border-color:#5a628a; }
footer { margin-top:44px; padding-top:20px; border-top:1px solid rgba(255,255,255,.08);
  font-size:12px; color:var(--sub); display:flex; gap:18px; flex-wrap:wrap; }
footer a { color:var(--sub); text-decoration:none; }
footer a:hover { color:var(--text); }
`

/* The questions a customer actually types, with answers that carry the facts
   an answer engine can quote: what it costs, where we work, how fast we reply.
   The AIO probe measures exactly these questions and this site scored 0% on
   the non-branded ones — a page that does not answer the question in the
   question's own words gives an engine nothing to lift. Visible on the page
   and repeated as FAQPage data, because both are read. */
/* The company, on every page of this generator too. A page that references
   an organization defined somewhere else is, to an engine reading that page
   alone, a page that says nothing about who is behind it. */

/* 事業者情報カードに出す納期。FAQに明記してあるものだけを持ちます。
   書いていないサービスに「目安」を作ると、それは新しい約束になります。 */
/* 内容は build-content-pages.mjs の CONTACT_STRIP と同じものです。
   生成器が2本に分かれているので、文言だけ持ってきています。片方を直したら
   もう片方も、という状態は良くないので、変えるときは両方まとめて。 */
const CONTACT_STRIP = `
  <section class="contact-strip" id="contact">
    <h2>お問い合わせはこちら</h2>
    <p>ご相談・お見積りは無料です。「何をしたいかはっきりしていない」段階でも構いません。お問い合わせから48時間以内にご返信します。</p>
    <div class="cta">
      <a class="primary" href="/#/info/contact-form">お問い合わせフォームを開く →</a>
      <a class="ghost" href="/pricing.html">料金の目安を見る</a>
    </div>
    <p class="lead" style="margin-top:10px;font-size:12.5px;opacity:.85">東京都を拠点に、打ち合わせはオンラインで全国対応／動画1本・LP1枚から、最低発注額はありません。</p>
  </section>`

const LEAD_TIME = {
  video: '短尺動画は1〜2週間、撮影を伴う採用動画は3〜4週間',
  ai: '1〜2週間',
  web: 'LPは2週間前後、企業サイトは1〜2ヶ月',
}

const FAQ = {
  video: [
    ['東京で採用動画の制作を依頼できる会社はありますか？', '東京都を拠点とするルメニウム（Lumenium）が、採用動画の企画・撮影・編集・納品まで一貫して対応します。オンライン打ち合わせで全国からご依頼いただけます。料金は3万円〜、お見積りは無料です。'],
    ['中小企業でも頼める安い動画制作会社を探しています。相場はどれくらいですか？', '中小企業のご依頼が中心で、最低発注額は設けていません。SNS向けの短尺動画は3万円前後から、採用動画・企業PR動画は10万円前後からが目安です。撮影日数・出演者の有無・編集の作り込みで変わるため、内容を伺ってから確定したお見積りをお出しします。'],
    ['納期はどれくらいかかりますか？', '短尺動画で1〜2週間、企画から撮影を伴う採用動画で3〜4週間が目安です。公開日が決まっている場合はその日から逆算して進行表をお出しします。'],
    ['撮影は東京以外でも対応できますか？', '対応します。打ち合わせはオンライン、撮影は現地へ伺う形で全国のご依頼を受けています。交通費は別途お見積りに含めてご提示します。'],
  ],
  ai: [
    ['社員向けの生成AI研修を依頼できる会社はありますか？', 'ルメニウム（Lumenium）が企業向けの生成AI研修・AIリテラシー教育を行っています。現場の業務を伺ったうえで、その会社の仕事に即した教材を作って実施します。講師1回10万円〜（教材費込）です。'],
    ['中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？何から始めればよいですか？', '業務の中身を聞いたうえで教材から作る会社に相談するのが近道です。ルメニウム（Lumenium）は中小企業向けに、研修と導入支援の両方を1社で行っています。進め方としては「何を解決したいか」を先に決め、1つの業務・1チームから小さく始めるのが失敗しない順序です。議事録作成や下書き生成など、繰り返し発生して時間がかかっている作業が最初の候補になります。'],
    ['研修はオンラインでも実施できますか？', '可能です。オンライン・対面のどちらにも対応し、録画の共有や、受講後の質問対応もあわせてご提案します。'],
    ['費用はどれくらいかかりますか？', '講師派遣は1回10万円〜（教材費込・交通費別途）。教材制作のみ、導入コンサルティングのみのご依頼も承ります。お見積りは無料です。'],
  ],
  sns: [
    ['企業のLINE公式アカウントの構築を代行してもらえますか？', 'ルメニウム（Lumenium）が公式LINEの開設から、シナリオ配信・セグメント配信・Bot制作まで代行します。初期20万円〜、運用は月額10万円〜です。'],
    ['SNS運用代行の費用はどれくらいですか？', '初期費用20万円〜、月額10万円〜が目安です。投稿本数・撮影の有無・レポートの頻度によって変わるため、目的を伺ってからご提案します。'],
    ['どのSNSに対応していますか？', 'Instagram・X・Facebook・Threads・LINE公式アカウントに対応します。企画構成から投稿、効果の振り返りまで一貫して代行します。'],
    ['何を投稿すればよいか決まっていなくても相談できますか？', 'その状態からのご相談がほとんどです。誰に何を届けたいかを整理するところから一緒に決め、投稿の型を作ってお渡しします。'],
  ],
  web: [
    ['企業のホームページ制作を東京の会社に依頼したいのですが', '東京都を拠点とするルメニウム（Lumenium）が、企業サイト・LP・Webアプリの設計から公開・運用まで対応します。30万円〜、オンラインで全国からご依頼いただけます。'],
    ['費用と納期はどれくらいですか？', '企業サイトは30万円〜・1〜2ヶ月、キャンペーンLPは短納期で2週間前後が目安です。内容を伺ったうえで、確定したお見積りと進行表をお出しします。'],
    ['業務システムの開発を小規模から相談できますか？', 'できます。予算に合わせて、まず1つの業務だけを自動化する小さな範囲から作り、効果を見て広げる進め方をおすすめしています。'],
    ['公開後の運用も任せられますか？', '更新・改修・計測まで継続して対応します。自社で運用したい場合は、更新できる形でお渡しし、操作の説明も行います。'],
  ],
  cast: [
    ['イベントのMCやキャストを手配してくれる会社はありますか？', 'ルメニウム（Lumenium）が在籍150名のモデル・アクター・MCのネットワークから手配します。キャスト1名5,000円〜、イベントの企画運営ごとお任せいただけます。'],
    ['料金はどれくらいですか？', 'キャスト1名5,000円〜が目安です。拘束時間・役割・人数によって変わるため、実施内容を伺ってからお見積りします。イベント企画の費用は別途です。'],
    ['何名まで手配できますか？', '在籍150名のネットワークから、撮影の数名規模からイベントの大人数まで対応します。ご希望の条件（年齢層・雰囲気・経験）を伺って候補をお出しします。'],
    ['地方のイベントでも対応できますか？', '対応します。打ち合わせはオンライン、当日は現地へ伺う形で全国のご依頼を受けています。'],
  ],
  creative: [
    ['会社のロゴやバナーのデザインを依頼できる制作会社はありますか？', 'ルメニウム（Lumenium）がロゴ・バナー・ポスター・イラスト・教材までクリエイティブ全般を制作します。3万円〜、オンラインで全国からご依頼いただけます。'],
    ['料金はどれくらいですか？', '3万円〜が目安です。ロゴは用途の広さ（名刺・看板・Web）で、バナーは点数で変わります。内容に応じてご提案します。'],
    ['修正は何回まで対応してもらえますか？', '通常2〜3回の修正をお見積りに含めています。大きな方針転換の場合は別途ご相談となりますが、納得いただけるまで丁寧に対応します。'],
    ['作詞作曲も依頼できますか？', 'できます。イベント用の楽曲やブランドのテーマソングなど、用途を伺って制作します。'],
  ],
}

function page(s) {
  const others = SERVICES.filter((o) => o.id !== s.id)
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      ORG_NODE,
      {
        '@type': 'Service',
        '@id': `${SITE}/services/${s.id}.html#service`,
        name: s.name,
        description: s.desc,
        provider: { '@id': `${SITE}/#organization` },
        areaServed: { '@type': 'Country', name: 'Japan' },
        offers: { '@type': 'Offer', description: s.price, priceCurrency: 'JPY' },
        url: `${SITE}/services/${s.id}.html`,
        dateModified: TODAY,
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE}/services/${s.id}.html#faq`,
        mainEntity: (FAQ[s.id] || []).map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'サービス', item: `${SITE}/services/index.html` },
          { '@type': 'ListItem', position: 3, name: s.name, item: `${SITE}/services/${s.id}.html` },
        ],
      },
    ],
  }
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(s.title)}</title>
<meta name="description" content="${esc(s.desc)}">
<link rel="canonical" href="${SITE}/services/${s.id}.html">
<meta property="og:site_name" content="Lumenium（ルメニウム）">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(s.desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/services/${s.id}.html">
<meta property="og:image" content="${SITE}/api/og">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..900&family=Noto+Sans+JP:wght@400..900&family=Zen+Old+Mincho:wght@400;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">${ldJson(ld)}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header><a href="/">← Lumenium（ルメニウム）トップへ</a></header>
  <p class="eyebrow">LUMENIUM SERVICE</p>
  <h1>${esc(s.name)}｜Lumenium（ルメニウム）</h1>
  <p class="lead">${esc(s.lead)}</p>
  <p class="lead">東京拠点のクリエイティブ&amp;DXパートナー Lumenium（ルメニウム）が、オンラインで全国のご依頼に対応します。</p>

  <!-- 事業者情報。ディレクトリの1件分と同じ形を、ページの先頭に置きます。
       回答エンジンが「この会社に頼める」と判断するために要るのは、提供元・
       所在地・料金・納期・連絡手段の5つで、それが1か所に揃っている面が
       引用されます。中の数字はすべて料金ページと特商法表記と同じです。 -->
  <h2 id="provider">事業者情報</h2>
  <dl class="facts">
    <div><dt>提供元</dt><dd>Lumenium（ルメニウム）／代表 山本 捷真</dd></div>
    <div><dt>所在地</dt><dd>東京都（打ち合わせはオンライン、全国対応）</dd></div>
    <div><dt>料金</dt><dd>${esc(s.price)}</dd></div>
    ${LEAD_TIME[s.id] ? `<div><dt>納期</dt><dd>${esc(LEAD_TIME[s.id])}</dd></div>` : ''}
    <div><dt>最低発注額</dt><dd>なし（1本・1点からお受けしています）</dd></div>
    <div><dt>お見積り</dt><dd>無料。お問い合わせから48時間以内にご返信します</dd></div>
    <div><dt>お問い合わせ</dt><dd><a href="/contact.html">お問い合わせフォーム</a></dd></div>
  </dl>

  <h2>こんな方におすすめ</h2>
  <ul>
    ${s.highlights.map((h) => `<li>${esc(h)}方</li>`).join('\n    ')}
  </ul>

  <h2>代表的な実績</h2>
  <ul>
    ${s.examples.map((e) => `<li>${esc(e)}</li>`).join('\n    ')}
  </ul>

  <h2>料金目安</h2>
  <div class="price">${esc(s.price)}<small>お見積り無料・ご相談から48時間以内にご提案します。</small></div>

  <h2>よくある質問</h2>
  ${(FAQ[s.id] || []).map(([q, a]) => `<h3 style="font-size:14.5px;font-weight:700;margin:18px 0 6px">${esc(q)}</h3>
  <p style="font-size:13.5px;line-height:2;color:var(--sub)">${esc(a)}</p>`).join('\n  ')}

  <div class="cta">
    <a class="primary" href="/#/info/contact-form">無料で相談する</a>
    <a class="ghost" href="/#/info/services">サービス一覧を見る</a>
  </div>

  <h2>その他のサービス</h2>
  <div class="others">
    ${others.map((o) => `<a href="/services/${o.id}.html">${esc(o.name)}</a>`).join('\n    ')}
  </div>

${CONTACT_STRIP}
  <p class="lead" style="margin-top:34px;font-size:13px;opacity:.8">Lumenium（ルメニウム）は、東京を拠点に動画制作・AI導入研修・SNS運用・LINE構築・Web制作・キャスト手配・クリエイティブ制作を手がけています。米国のエンジン開発企業 Lumenium, LLC や Lumentum とは無関係の別組織です。</p>
  <p style="font-size:12px;color:var(--sub);margin-top:26px">最終更新: ${TODAY}　／　東京都を拠点に、オンラインで全国対応しています。</p>
  <footer>
    <span>Lumenium（ルメニウム）— 散文化した目的に、焦点を当てる。</span>
    <a href="/">lumenium.net</a>
    <a href="/about.html">Lumeniumとは</a>
    <a href="/pricing.html">料金</a>
    <a href="/works.html">実績</a>
    <a href="/voice.html">お客様の声</a>
    <a href="/flow.html">ご依頼の流れ</a>
    <a href="/choose.html">制作会社の選び方</a>
    <a href="/onestop.html">一社にまとめる</a>
    <a href="/faq.html">よくある質問</a>
    <a href="/contact.html">お問い合わせ</a>
    <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
  </footer>
</div>
<!-- The backslash is doubled on purpose: this template is a JS template
     literal, where \/ collapses to /. It used to be written as \/ and reached
     the page as //$/ — a comment, which made the whole tag a syntax error and
     every static page record nothing at all. -->
${BEACON}
</body>
</html>
`
}

// Hub page for the six services. Also the middle level of every service
// page's breadcrumb — that used to point at a '#/…' hash, which is not a
// page a crawler can visit, so the hierarchy stopped at one level.
function hub() {
  const DESC = '動画制作・映像編集、AI導入と生成AI研修、SNS運用代行とLINE構築、Web制作・システム開発、キャスト手配・イベント、クリエイティブ制作の6領域。ルメニウム（Lumenium）が企画から納品・運用までワンストップで対応します。'
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      ORG_NODE,
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/services/index.html#webpage`,
        url: `${SITE}/services/index.html`,
        name: 'サービス一覧',
        description: DESC,
        inLanguage: 'ja-JP',
        dateModified: TODAY,
        isPartOf: { '@id': `${SITE}/#website` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE}/services/index.html#faq`,
        mainEntity: [
          ['どのサービスから相談すればよいですか？', '決まっていない状態でのご相談がほとんどです。困っていることを伺ったうえで、動画・AI研修・SNS/LINE・Web制作・キャスト手配・クリエイティブのどれが要るか、あるいは要らないかからご提案します。お見積りは無料、48時間以内にご返信します。'],
          ['複数のサービスをまとめて依頼できますか？', 'できます。動画とWebとSNSを別々の会社に頼むと、窓口も進行もばらばらになります。6領域すべてを社内で対応しているため、一社にまとめてお任せいただけます。'],
          ['東京以外からでも依頼できますか？', '東京都を拠点に、打ち合わせはオンラインで全国からご依頼いただいています。撮影やイベントなど現地対応が必要な場合は伺います。'],
        ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
      {
        '@type': 'ItemList',
        name: 'Lumeniumのサービス',
        itemListElement: SERVICES.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: s.name,
          url: `${SITE}/services/${s.id}.html`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'サービス', item: `${SITE}/services/index.html` },
        ],
      },
    ],
  }
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>サービス一覧（動画・AI・SNS・Web・キャスト・クリエイティブ）| Lumenium（ルメニウム）</title>
<meta name="description" content="${esc(DESC)}">
<link rel="canonical" href="${SITE}/services/index.html">
<meta property="og:site_name" content="Lumenium（ルメニウム）">
<meta property="og:title" content="サービス一覧 | Lumenium（ルメニウム）">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/services/index.html">
<meta property="og:image" content="${SITE}/api/og">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">${ldJson(ld)}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header><a href="/">← Lumenium（ルメニウム）トップへ</a></header>
  <p class="eyebrow">LUMENIUM SERVICES</p>
  <h1>サービス一覧</h1>
  <p class="lead">${esc(DESC)}</p>
  <!-- 地域・期間・連絡手段を冒頭に。回答エンジンはページの先頭から答えを
       組み立てるため、下にしか無い事実は引用されません。 -->
  <p class="lead">東京都を拠点に、打ち合わせはオンラインで全国対応。動画1本・LP1枚から最低発注額なしでお受けし、短い制作なら2週間前後、企業サイトは1〜2ヶ月が納期の目安です。お見積りは無料で、お問い合わせから48時間以内にご返信します。</p>

${SERVICES.map((s) => `  <h2><a href="/services/${s.id}.html" style="color:inherit;text-decoration:none">${esc(s.name)}</a></h2>
  <p>${esc(s.lead)}</p>
  <p class="price">${esc(s.price)}</p>
  <p><a href="/services/${s.id}.html" style="color:#a5b4fc">${esc(s.name)}の詳細を見る →</a></p>`).join('\n\n')}

  <div class="cta">
    <a class="primary" href="/#/info/contact-form">無料で相談する</a>
    <a class="ghost" href="/pricing.html">料金の目安を見る</a>
  </div>

  <h2>よくある質問</h2>
  <h3 style="font-size:14.5px;font-weight:700;margin:18px 0 6px">どのサービスから相談すればよいですか？</h3>
  <p style="font-size:13.5px;line-height:2;color:var(--sub)">決まっていない状態でのご相談がほとんどです。困っていることを伺ったうえで、動画・AI研修・SNS/LINE・Web制作・キャスト手配・クリエイティブのどれが要るか、あるいは要らないかからご提案します。お見積りは無料、48時間以内にご返信します。</p>
  <h3 style="font-size:14.5px;font-weight:700;margin:18px 0 6px">複数のサービスをまとめて依頼できますか？</h3>
  <p style="font-size:13.5px;line-height:2;color:var(--sub)">できます。動画とWebとSNSを別々の会社に頼むと、窓口も進行もばらばらになります。6領域すべてを社内で対応しているため、一社にまとめてお任せいただけます。</p>
  <h3 style="font-size:14.5px;font-weight:700;margin:18px 0 6px">東京以外からでも依頼できますか？</h3>
  <p style="font-size:13.5px;line-height:2;color:var(--sub)">東京都を拠点に、打ち合わせはオンラインで全国からご依頼いただいています。撮影やイベントなど現地対応が必要な場合は伺います。</p>

  <p style="font-size:12px;color:var(--sub);margin-top:22px">最終更新: ${TODAY}　／　東京都を拠点に、オンラインで全国対応しています。</p>

${CONTACT_STRIP}

  <h2>Lumeniumの他のページ</h2>
  <div class="others">
    <a href="/about.html">ルメニウムとは</a>
    <a href="/pricing.html">料金</a>
    <a href="/works.html">実績</a>
    <a href="/voice.html">お客様の声</a>
    <a href="/flow.html">ご依頼の流れ</a>
    <a href="/faq.html">よくある質問</a>
    <a href="/contact.html">お問い合わせ</a>
    <a href="/sitemap.html">サイトマップ</a>
  </div>

  <footer>
    <span>Lumenium（ルメニウム）— 散文化した目的に、焦点を当てる。</span>
    <a href="/">lumenium.net</a>
    <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
  </footer>
</div>
${BEACON}
</body>
</html>
`
}

mkdirSync('public/services', { recursive: true })
for (const s of SERVICES) {
  writeFileSync(`public/services/${s.id}.html`, page(s))
  console.log(`public/services/${s.id}.html written`)
}
writeFileSync('public/services/index.html', hub())
console.log('public/services/index.html written')
