// Generates static, individually-indexable landing pages for each service
// at public/services/<id>.html — unique title/description, Service +
// BreadcrumbList JSON-LD, crawlable body copy, cross-links, and CTAs into
// the app. Run via `npm run build` (prebuild) or directly.
import { mkdirSync, writeFileSync } from 'node:fs'

const SITE = 'https://lumenium.net'

const SERVICES = [
  {
    id: 'video',
    name: '動画制作・映像編集',
    keyword: '動画制作',
    title: '動画制作・映像編集（採用動画・企業PR動画・SNS動画）| Lumenium',
    desc: '採用動画・企業PR動画・SNS向け短尺動画・AI動画を、企画から撮影・編集・納品までワンストップで制作。東京拠点・オンライン全国対応。料金は3万円〜。',
    lead: '採用動画・企業PR動画・SNSの短尺動画・AI動画まで。企画構成から撮影・編集・納品後の運用まで、一貫してお任せいただけます。',
    highlights: ['社内に映像チームがなく外注先を探している', 'SNS向けの短尺動画を量産したい', '企業紹介・採用動画を丁寧に作りたい'],
    examples: ['登録者数十万人規模のYouTubeチャンネル動画制作', '有名飲食店での企画・映像制作', 'AI企業PR動画', '就業支援・研修動画'],
    price: '3万円〜（案件規模に応じてご提案）',
  },
  {
    id: 'ai',
    name: 'AI導入・生成AI研修',
    keyword: '生成AI研修',
    title: '生成AI研修・AI導入支援（企業向け・IT講師派遣）| Lumenium',
    desc: '企業向け生成AI研修・AIリテラシー教育・教材制作・IT講師派遣。現場目線でChatGPT等の業務活用を指導。講師1回10万円〜、オンライン対応。',
    lead: '「AIを業務に取り入れたいが何から始めるか分からない」に、現場目線で伴走します。社員研修・教材制作・導入コンサルティングまで対応。',
    highlights: ['AIを業務に取り入れたいが何から始めるか迷っている', '社員向けAIリテラシー研修を検討している', 'AI教材・メルマガを内製化したい'],
    examples: ['企業向けAI活用メルマガ制作', 'AI教材制作', '研修・就業支援動画のAI活用'],
    price: '講師1回 10万円〜（教材費込）/ 交通費別途',
  },
  {
    id: 'sns',
    name: 'SNS運用・LINE構築',
    keyword: 'SNS運用代行',
    title: 'SNS運用代行・LINE公式アカウント構築（Bot制作）| Lumenium',
    desc: 'SNS運用代行・企画構成・LINE公式アカウント構築・シナリオ型Bot制作。集客の仕組み化を初期20万円〜、月額10万円〜で支援します。',
    lead: '「何を投稿すればいいか分からない」「公式LINEを作りたいがやり方が不明」——集客の仕組み化を企画から運用まで代行します。',
    highlights: ['公式LINEで配信したいがやり方がわからない', 'SNSで集客したいが何を投稿すべきか分からない', 'シナリオ配信・セグメント配信を設計したい'],
    examples: ['企業公式LINE構築', 'シナリオ型Bot制作', 'SNS運用代行（月数十本投稿）'],
    price: '初期 20万円〜 / 月額 10万円〜',
  },
  {
    id: 'web',
    name: 'Web制作・アプリ開発',
    keyword: 'ホームページ制作',
    title: 'ホームページ制作・LP制作・アプリ開発 | Lumenium',
    desc: '企業ホームページ・LP・Webアプリ・スマホアプリの開発。リニューアルから短納期LPまで30万円〜。東京・オンライン全国対応。',
    lead: '古いHPのリニューアル、キャンペーンLPの短納期制作、業務効率化のWebアプリまで。設計から公開後の運用まで伴走します。',
    highlights: ['古いホームページをリニューアルしたい', 'キャンペーン用LPを短納期で作りたい', '業務効率化のための社内ツールを開発したい'],
    examples: ['企業ホームページ制作', '業務用Webアプリ開発', 'スマートフォンアプリ開発'],
    price: '30万円〜（規模に応じてご提案）',
  },
  {
    id: 'cast',
    name: 'キャスト手配・イベント企画',
    keyword: 'キャスト手配',
    title: 'モデル・MC・キャスト手配、イベント企画運営 | Lumenium',
    desc: '在籍150名のモデル・アクター・MCの手配、イベントの企画運営、配信者・アイドルのプロデュース。キャスト1名5,000円〜。',
    lead: '撮影・配信・イベントに必要なキャストを、在籍150名のネットワークからスピーディに手配。企画運営ごとお任せいただけます。',
    highlights: ['撮影や配信にキャストを手配したい', 'MC・司会付きのイベントを企画している', '配信者・アイドルのプロデュースを相談したい'],
    examples: ['アイドルイベント主催', '配信者のプロデュース', '企業イベントのキャスト手配・MC'],
    price: 'キャスト1名 5,000円〜 / イベント企画別途',
  },
  {
    id: 'creative',
    name: 'クリエイティブ制作',
    keyword: 'ロゴ制作',
    title: 'ロゴ・バナー・ポスター・イラスト・教材制作 | Lumenium',
    desc: 'ロゴ・バナー・ポスター・イラスト・教材制作・ライティング・作詞作曲まで、クリエイティブ全般を3万円〜で制作します。',
    lead: 'ブランドの顔となるロゴから、バナー・ポスター・イラスト・教材・楽曲まで。「作りたい」をかたちにします。',
    highlights: ['新ブランドのロゴ・アイデンティティを作りたい', '書籍・ブログ用のライターを探している', 'イベント用の作詞・作曲を依頼したい'],
    examples: ['企業ロゴ・バナー・ポスター制作', '塾教材4万ページ制作（1ヶ月）', '作詞作曲・楽曲提供'],
    price: '3万円〜（内容に応じてご提案）',
  },
]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(s) {
  const others = SERVICES.filter((o) => o.id !== s.id)
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${SITE}/services/${s.id}.html#service`,
        name: s.name,
        description: s.desc,
        provider: { '@id': `${SITE}/#organization` },
        areaServed: { '@type': 'Country', name: 'Japan' },
        offers: { '@type': 'Offer', description: s.price, priceCurrency: 'JPY' },
        url: `${SITE}/services/${s.id}.html`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'サービス', item: `${SITE}/#/info/services` },
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
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(s.desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/services/${s.id}.html">
<meta property="og:image" content="${SITE}/api/og">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
:root { --bg:#171c33; --card:#262c4a; --border:#424a6b; --text:#f5f7fb; --sub:#abb5cb;
  --grad:linear-gradient(135deg,#4f46e5 0%,#3b82f6 50%,#06b6d4 100%); }
body { background:
  radial-gradient(ellipse 70% 50% at 20% 10%, rgba(79,70,229,.16), transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 85%, rgba(6,182,212,.09), transparent 60%), var(--bg);
  color:var(--text); font-family:'Zen Kaku Gothic New','Hiragino Sans',system-ui,-apple-system,sans-serif;
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
.price { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px 22px;
  font-size:15px; font-weight:700; margin-top:8px; }
.price small { display:block; font-size:11.5px; color:var(--sub); font-weight:500; margin-top:4px; }
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
</style>
</head>
<body>
<div class="wrap">
  <header><a href="/">← Lumenium トップへ</a></header>
  <p class="eyebrow">LUMENIUM SERVICE</p>
  <h1>${esc(s.name)}</h1>
  <p class="lead">${esc(s.lead)}</p>

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

  <div class="cta">
    <a class="primary" href="/#/info/contact-form">無料で相談する</a>
    <a class="ghost" href="/#/info/services">サービス一覧を見る</a>
  </div>

  <h2>その他のサービス</h2>
  <div class="others">
    ${others.map((o) => `<a href="/services/${o.id}.html">${esc(o.name)}</a>`).join('\n    ')}
  </div>

  <footer>
    <span>Lumenium（ルメニウム）— 散文化した目的に、焦点を当てる。</span>
    <a href="/">lumenium.net</a>
    <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
  </footer>
</div>
</body>
</html>
`
}

mkdirSync('public/services', { recursive: true })
for (const s of SERVICES) {
  writeFileSync(`public/services/${s.id}.html`, page(s))
  console.log(`public/services/${s.id}.html written`)
}
