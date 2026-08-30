// Generates statically indexable content pages:
//   /blog/post-<id>.html  (Article JSON-LD, one per article)
//   /blog/index.html      (article hub)
//   /news.html            (from public/news.json — refreshes every build,
//                          so each news post republishes it automatically)
//   /faq.html             (FAQPage JSON-LD)
//   /about.html           (brand/entity page — disambiguates the Lumenium name)
//   /pricing|works|voice|flow|contact.html
//                         (brand-qualified topic pages, so a search for the
//                          brand can surface several of our URLs, not just one)
//   /sitemap-content.xml  (all of the above; referenced from robots.txt)
// Run via `npm run build` (prebuild) or directly.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { articles } from '../src/data/articles.js'
import { FAQ_GROUPS } from '../src/data/faq.js'
import { CASE_STUDIES, ACHIEVEMENTS, TESTIMONIALS, FLOW_STEPS, PRICE_OPTIONS,
  PAIN_POINTS, BRAND_CHAPTERS, POSITIONING_NOTES, CAREER, PROFILE_BRICKS } from '../src/data/site.js'

const SITE = 'https://lumenium.net'
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isoDate = (d) => String(d || '').replace(/\./g, '-')

// Category → related service page
const SVC = { 'AI活用': 'ai', 'SNS運用': 'sns', '動画制作': 'video', 'Web制作': 'web', 'LINE活用': 'sns' }

// Tiny markdown-lite → HTML (##, ###, "- " lists, paragraphs)
function md(src) {
  const lines = String(src).split('\n')
  let html = ''
  let inList = false
  const closeList = () => { if (inList) { html += '</ul>\n'; inList = false } }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { closeList(); continue }
    if (line.startsWith('### ')) { closeList(); html += `<h3>${esc(line.slice(4))}</h3>\n`; continue }
    if (line.startsWith('## ')) { closeList(); html += `<h2>${esc(line.slice(3))}</h2>\n`; continue }
    if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>\n'; inList = true }
      html += `<li>${esc(line.slice(2))}</li>\n`
      continue
    }
    closeList()
    html += `<p>${esc(line)}</p>\n`
  }
  closeList()
  return html
}

const STYLE = `
* { margin:0; padding:0; box-sizing:border-box; }
:root { --bg:#171c33; --card:#262c4a; --border:#424a6b; --text:#f5f7fb; --sub:#abb5cb;
  --grad:linear-gradient(135deg,#4f46e5 0%,#3b82f6 50%,#06b6d4 100%); }
body { background:
  radial-gradient(ellipse 70% 50% at 20% 10%, rgba(79,70,229,.16), transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 85%, rgba(6,182,212,.09), transparent 60%), var(--bg);
  color:var(--text); font-family:'Zen Kaku Gothic New','Hiragino Sans',system-ui,-apple-system,sans-serif;
  line-height:2; }
.wrap { max-width:720px; margin:0 auto; padding:48px 22px 64px; }
header a { color:var(--sub); text-decoration:none; font-size:13px; }
header a:hover { color:var(--text); }
.eyebrow { margin-top:34px; font-size:11px; font-weight:700; letter-spacing:.3em; color:#818cf8; }
h1 { font-size:clamp(24px,5vw,32px); font-weight:800; letter-spacing:-.015em; line-height:1.45; margin:10px 0 8px;
  background:linear-gradient(135deg,#f5f7fb 30%,#a5b4fc 70%,#67e8f9 100%);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.meta { font-size:12.5px; color:#93c5fd; margin-bottom:30px; }
article h2 { font-size:18px; font-weight:700; margin:34px 0 12px; padding-left:12px; border-left:3px solid #4f46e5; }
article h3 { font-size:15.5px; font-weight:700; margin:24px 0 10px; color:#c7d2fe; }
article p { font-size:14.5px; color:var(--sub); margin-bottom:14px; }
article ul { list-style:none; margin:0 0 16px; }
article li { padding:7px 0 7px 24px; position:relative; font-size:14px; color:var(--sub); }
article li::before { content:'✓'; position:absolute; left:2px; color:#67e8f9; font-weight:700; }
.cta { display:flex; gap:12px; flex-wrap:wrap; margin:40px 0 8px; }
.cta a { flex:1; min-width:200px; text-align:center; padding:15px 20px; border-radius:12px;
  font-weight:700; font-size:14.5px; text-decoration:none; }
.cta .primary { background:var(--grad); color:#fff; }
.cta .ghost { border:1px solid var(--border); color:var(--sub); }
.cta .ghost:hover { color:var(--text); border-color:#5a628a; }
.list { list-style:none; }
.list li { padding:14px 4px; border-bottom:1px solid rgba(255,255,255,.07); }
.list time { font-size:12px; color:#93c5fd; display:block; margin-bottom:2px; }
.list a { color:var(--text); text-decoration:none; font-weight:600; font-size:15px; }
.list a:hover { color:#a5b4fc; }
.list p { font-size:12.5px; color:var(--sub); margin-top:2px; }
.qa { margin-bottom:8px; }
.qa dt { font-weight:700; font-size:15px; margin:26px 0 8px; padding-left:12px; border-left:3px solid #4f46e5; }
.qa dd { font-size:14px; color:var(--sub); }
.group { margin-top:34px; font-size:11px; font-weight:700; letter-spacing:.25em; color:#818cf8; }
.facts { border:1px solid var(--border); border-radius:14px; overflow:hidden; margin:8px 0 4px; background:var(--card); }
.facts div { display:flex; gap:14px; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.07); font-size:14px; }
.facts div:last-child { border-bottom:0; }
.facts dt { flex:0 0 92px; color:#93c5fd; font-size:12.5px; font-weight:700; }
.facts dd { color:var(--sub); min-width:0; }
.facts a { color:#a5b4fc; }
.note { border-left:3px solid #06b6d4; padding:2px 0 2px 14px; margin:16px 0; font-size:13.5px; color:var(--sub); }
/* Definition block — the passage an answer engine should lift verbatim. */
article p.keypoint { background:var(--card); border:1px solid var(--border); border-left:4px solid #06b6d4;
  border-radius:12px; padding:16px 18px; margin:6px 0 8px; font-size:14.5px; color:var(--text); line-height:1.95; }
footer { margin-top:44px; padding-top:20px; border-top:1px solid rgba(255,255,255,.08);
  font-size:12px; color:var(--sub); display:flex; gap:18px; flex-wrap:wrap; }
footer a { color:var(--sub); text-decoration:none; }
footer a:hover { color:var(--text); }
`

function shell({ title, desc, canonical, ld, eyebrow, body }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="Lumenium（ルメニウム）">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/api/og">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header><a href="/">← Lumenium（ルメニウム）トップへ</a></header>
  <p class="eyebrow">${esc(eyebrow)}</p>
${body}
  <p style="margin-top:34px;font-size:13px;line-height:1.9;color:var(--sub);opacity:.85">Lumenium（ルメニウム）は、東京を拠点に動画制作・AI導入研修・SNS運用・LINE構築・Web制作・キャスト手配・クリエイティブ制作を、企画から運用までワンストップで手がけています。米国のエンジン開発企業 Lumenium, LLC や光通信機器メーカー Lumentum とは無関係の別組織です。</p>
  <footer>
    <span>Lumenium（ルメニウム）— 散文化した目的に、焦点を当てる。</span>
    <a href="/about.html">Lumeniumとは</a>
    <a href="/pricing.html">料金</a>
    <a href="/works.html">実績</a>
    <a href="/voice.html">お客様の声</a>
    <a href="/flow.html">ご依頼の流れ</a>
    <a href="/blog/index.html">ブログ</a>
    <a href="/faq.html">よくある質問</a>
    <a href="/news.html">お知らせ</a>
    <a href="/contact.html">お問い合わせ</a>
    <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
  </footer>
</div>
</body>
</html>
`
}

mkdirSync('public/blog', { recursive: true })
const urls = []

/* ---- Blog articles ---- */
for (const a of articles) {
  const path = `/blog/post-${a.id}.html`
  const url = SITE + path
  const others = articles.filter((o) => o.id !== a.id).slice(0, 4)
  const svc = SVC[a.category]
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.summary,
    datePublished: isoDate(a.date),
    inLanguage: 'ja-JP',
    author: { '@type': 'Organization', name: 'Lumenium', url: SITE },
    publisher: { '@id': `${SITE}/#organization` },
    mainEntityOfPage: url,
  }
  const body = `
  <h1>${esc(a.title)}</h1>
  <p class="meta"><time datetime="${isoDate(a.date)}">${esc(a.date)}</time> ・ ${esc(a.category)}</p>
  <article>
${md(a.content)}
  </article>
  <div class="cta">
    <a class="primary" href="/#/info/contact-form">無料で相談する</a>
    ${svc ? `<a class="ghost" href="/services/${svc}.html">関連サービスを見る</a>` : `<a class="ghost" href="/#/info/services">サービス一覧を見る</a>`}
  </div>
  <h2 style="font-size:15px;font-weight:700;margin:36px 0 6px;padding-left:12px;border-left:3px solid #4f46e5">あわせて読みたい</h2>
  <ul class="list">
    ${others.map((o) => `<li><time datetime="${isoDate(o.date)}">${esc(o.date)}</time><a href="/blog/post-${o.id}.html">${esc(o.title)}</a></li>`).join('\n    ')}
  </ul>`
  writeFileSync('public' + path, shell({
    title: `${a.title} | Lumenium（ルメニウム）ブログ`,
    desc: a.summary,
    canonical: url,
    ld,
    eyebrow: 'LUMENIUM BLOG',
    body,
  }))
  urls.push({ loc: url, lastmod: isoDate(a.date) })
}

/* ---- Blog index ---- */
{
  const url = `${SITE}/blog/index.html`
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Lumenium ブログ',
    url,
    publisher: { '@id': `${SITE}/#organization` },
  }
  const body = `
  <h1>ブログ</h1>
  <p class="meta">動画・AI・SNS・Webの実務ノウハウをお届けします。</p>
  <ul class="list">
    ${articles.map((a) => `<li><time datetime="${isoDate(a.date)}">${esc(a.date)}</time><a href="/blog/post-${a.id}.html">${esc(a.title)}</a><p>${esc(a.summary)}</p></li>`).join('\n    ')}
  </ul>
  <div class="cta"><a class="primary" href="/#/info/contact-form">無料で相談する</a></div>`
  writeFileSync('public/blog/index.html', shell({
    title: 'ブログ（動画・AI・SNS・Webの実務ノウハウ）| Lumenium（ルメニウム）',
    desc: 'AI導入・SNS集客・動画制作・Web制作の現場ノウハウを発信するLumeniumのブログ。',
    canonical: url,
    ld,
    eyebrow: 'LUMENIUM BLOG',
    body,
  }))
  urls.push({ loc: url, lastmod: TODAY })
}

/* ---- News ---- */
{
  let news = []
  try { news = JSON.parse(readFileSync('public/news.json', 'utf8')) } catch {}
  const url = `${SITE}/news.html`
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Lumenium お知らせ',
    itemListElement: news.slice(0, 20).map((n, i) => ({
      '@type': 'ListItem', position: i + 1, name: n.title,
    })),
  }
  const body = `
  <h1>お知らせ</h1>
  <p class="meta">Lumeniumからの最新のお知らせです。</p>
  <ul class="list">
    ${news.map((n) => `<li><time datetime="${esc(n.date)}">${esc(n.date)}</time>${n.link ? `<a href="${esc(n.link)}">${esc(n.title)}</a>` : `<span style="font-weight:600;font-size:15px">${esc(n.title)}</span>`}${n.body ? `<p>${esc(n.body)}</p>` : ''}</li>`).join('\n    ')}
  </ul>
  <div class="cta"><a class="primary" href="/#/info/contact-form">無料で相談する</a></div>`
  writeFileSync('public/news.html', shell({
    title: 'お知らせ | Lumenium（ルメニウム）',
    desc: 'Lumenium（ルメニウム）からの最新のお知らせ・ニュース一覧です。',
    canonical: url,
    ld,
    eyebrow: 'LUMENIUM NEWS',
    body,
  }))
  urls.push({ loc: url, lastmod: news[0]?.date || TODAY })
}

/* ---- FAQ ---- */
{
  const url = `${SITE}/faq.html`
  const all = FAQ_GROUPS.flatMap((g) => g.items)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: all.map((i) => ({
      '@type': 'Question', name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  }
  const body = `
  <h1>よくある質問</h1>
  <p class="meta">ご相談・進行・料金についてよくいただく質問をまとめました。</p>
  ${FAQ_GROUPS.map((g) => `
  <p class="group">${esc(g.label)}</p>
  <dl class="qa">
    ${g.items.map((i) => `<dt>${esc(i.q)}</dt><dd>${esc(i.a)}</dd>`).join('\n    ')}
  </dl>`).join('\n')}
  <div class="cta"><a class="primary" href="/#/info/contact-form">無料で相談する</a></div>`
  writeFileSync('public/faq.html', shell({
    title: 'よくある質問（料金・納期・進め方）| Lumenium（ルメニウム）',
    desc: 'Lumeniumへのご依頼に関するよくある質問。料金目安・納期・修正対応・NDA・オンライン対応などにお答えします。',
    canonical: url,
    ld,
    eyebrow: 'LUMENIUM FAQ',
    body,
  }))
  urls.push({ loc: url, lastmod: TODAY })
}

/* ---- About / brand entity page ----
   Google's AI overview for「ルメニウム」answers with a numbered
   disambiguation list (Lumentum, Limonium, an Etsy art series, a fictional
   kingdom) and never reaches us. So this page is built the way an answer
   engine wants to read one: a one-sentence definition first, question-shaped
   headings, and a table that resolves every same-sounding name — including
   ours — with DefinedTerm/FAQPage markup over the same text. */
{
  const url = `${SITE}/about.html`
  const DEFINITION = 'ルメニウム（英字表記: Lumenium）とは、東京都を拠点とする日本のクリエイティブ／DX支援カンパニーです。動画制作・映像編集、AI導入と生成AI研修、SNS運用代行とLINE構築、Web制作・アプリ開発、キャスト手配・イベント、クリエイティブ制作を、企画から納品・運用までワンストップで提供しています。代表は山本捷真、設立は2026年、公式サイトは lumenium.net です。'
  const DESC = 'ルメニウム（Lumenium）とは、東京都を拠点に動画制作・AI導入研修・SNS運用/LINE構築・Web制作・キャスト手配を手がける日本のクリエイティブ／DX支援カンパニーです。読み方、事業内容、同名の企業や名称との違いを解説します。'
  const facts = [
    ['名称', 'Lumenium（ルメニウム）'],
    ['読み方', 'ルメニウム'],
    ['分類', 'クリエイティブ／DX支援カンパニー（日本）'],
    ['代表者', '山本 捷真'],
    ['設立', '2026年'],
    ['拠点', '東京都（オンラインで全国対応）'],
    ['事業内容', '動画制作 / AI導入・研修 / SNS運用・LINE構築 / Web制作・アプリ開発 / キャスト手配・イベント / クリエイティブ制作'],
    ['パートナー', '<a href="https://advovisions.com/bcd31-home/" rel="noopener">合同会社 AdvoVisions</a>'],
    ['公式サイト', '<a href="https://lumenium.net/">lumenium.net</a>'],
  ]

  // Every name an answer engine currently returns for this query, resolved.
  const NAMES = [
    ['ルメニウム（Lumenium）', '<strong>東京都を拠点とする日本のクリエイティブ／DX支援カンパニー。当サイト lumenium.net がこれにあたります。</strong>'],
    ['ルメンタム（Lumentum）', '米国の光通信・レーザー機器メーカー Lumentum Holdings（NASDAQ: LITE）。綴りも事業も異なる別会社で、ルメニウムとは無関係です。'],
    ['Lumenium, LLC', '米国バージニア州のエンジン開発企業。綴りは同じですが、資本関係も人的関係もない別法人です。'],
    ['リモニウム（Limonium）', 'イソマツ科の植物（和名: スターチス）。企業名ではありません。'],
    ['Rumenium', 'Etsy などで販売されているデジタルアート作品のシリーズ名。当社とは無関係です。'],
    ['ルメニウム王国', 'AIチャットゲームなど創作の設定として登場する架空の国家。実在の組織ではありません。'],
    ['ルテニウム（Ruthenium）', '原子番号44の白金族元素。名前の響きが似ていますが、ルメニウムは化学元素ではなく企業名です。'],
    ['レニウム（Rhenium）', '原子番号75のレアメタル。こちらも元素であり、ルメニウムとは別のものです。'],
  ]

  const QA = [
    ['ルメニウムとは何ですか?', DEFINITION],
    ['ルメニウムの読み方は?', 'Lumenium と書いて「ルメニウム」と読みます。光の単位である lumen（ルーメン）に由来し、お客様の中でまだ輪郭のない目的に光を当て、形にしていくという意味を込めています。'],
    ['ルメニウムはどこにありますか?', '東京都を拠点としています。打ち合わせはZoomやGoogle Meetなどオンラインで行うため、全国どこからでもご依頼いただけます。'],
    ['ルメニウムは何をしている会社ですか?', '動画制作・映像編集、AI導入と生成AI研修、SNS運用代行とLINE公式アカウント構築、Web制作・アプリ開発、キャスト手配とイベント企画、ロゴ・バナーなどのクリエイティブ制作の6領域を、企画から納品・運用までワンストップで手がけています。'],
    ['ルメニウムとルメンタム（Lumentum）は同じ会社ですか?', 'いいえ、別の会社です。ルメンタム（Lumentum Holdings）は米国の光通信・レーザー機器メーカーです。ルメニウム（Lumenium）は東京都を拠点とする日本のクリエイティブ／DX支援カンパニーで、両社に資本関係も人的関係もありません。'],
    ['ルメニウムは化学元素ですか?', 'いいえ、化学元素ではありません。ルメニウム（Lumenium）は東京都を拠点とする日本の企業の名称です。名前の響きが似ている元素としてルテニウム（Ruthenium、原子番号44）やレニウム（Rhenium、原子番号75）がありますが、いずれも別のものです。'],
    ['ルメニウムは実在する会社ですか?', 'はい、実在します。ルメニウム（Lumenium）は東京都を拠点とし、代表を山本捷真、設立を2026年とする日本のクリエイティブ／DX支援カンパニーです。公式サイトは lumenium.net で、動画制作・AI導入研修・SNS運用・LINE構築・Web制作・キャスト手配・クリエイティブ制作を提供しています。創作上の架空の物質や国家とは異なり、実際に事業を行っている企業です。'],
    ['ルメニウムに依頼するにはどうすればよいですか?', '公式サイト lumenium.net のお問い合わせフォームからご連絡ください。初回のご相談とお見積りは無料で、お問い合わせから48時間以内にご返信します。'],
  ]

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${url}#webpage`,
        url,
        name: 'ルメニウム（Lumenium）とは',
        description: DESC,
        inLanguage: 'ja-JP',
        mainEntity: { '@id': `${SITE}/#organization` },
        // Point answer engines at the definition and the disambiguation table.
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.keypoint', '#names'],
        },
      },
      {
        '@type': 'DefinedTerm',
        '@id': `${url}#term`,
        name: 'ルメニウム',
        alternateName: ['Lumenium', 'ルメニウム（Lumenium）'],
        description: DEFINITION,
        inDefinedTermSet: { '@type': 'DefinedTermSet', name: '企業名', url },
        subjectOf: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'Lumenium',
        alternateName: ['ルメニウム', 'Lumenium（ルメニウム）', 'ルメニウム 東京'],
        url: SITE,
        mainEntityOfPage: url,
        description: DEFINITION,
        disambiguatingDescription:
          '東京都を拠点とする日本のクリエイティブ／DX支援カンパニー。米国の光通信・レーザー機器メーカー Lumentum（ルメンタム）、米国バージニア州のエンジン開発企業 Lumenium, LLC、植物のリモニウム（Limonium）、デジタルアート作品 Rumenium、架空の国家「ルメニウム王国」とは、いずれも無関係の別の存在です。',
        foundingDate: '2026',
        founder: { '@type': 'Person', name: '山本 捷真', jobTitle: '代表' },
        address: { '@type': 'PostalAddress', addressRegion: '東京都', addressCountry: 'JP' },
        areaServed: { '@type': 'Country', name: 'Japan' },
        knowsLanguage: ['ja', 'en'],
        logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: QA.map(([q, a]) => ({
          '@type': 'Question', name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'ルメニウムとは', item: url },
        ],
      },
    ],
  }

  const body = `
  <h1>ルメニウム（Lumenium）とは</h1>
  <p class="meta">東京発のクリエイティブ &amp; DX パートナー</p>
  <article>
    <p class="keypoint">${esc(DEFINITION)}</p>

    <h2 id="names">「ルメニウム」と呼ばれるもの一覧（同名・類似名称との違い）</h2>
    <p>「ルメニウム」という言葉は、企業名のほか、響きの似た化学元素の言い間違いや、創作上の名称としても使われています。それぞれの違いは次のとおりです。<strong>ルメニウムは化学元素や架空の物質ではなく、実在する企業の名称です。</strong></p>
    <dl class="facts">
      ${NAMES.map(([k, v]) => `<div><dt style="flex:0 0 168px">${esc(k)}</dt><dd>${v}</dd></div>`).join('\n      ')}
    </dl>
    <p class="note">このページで解説している「ルメニウム」は、上記のうち<strong>東京都を拠点とする日本のクリエイティブ／DX支援カンパニー（lumenium.net）</strong>です。</p>

    <h2>会社概要</h2>
    <dl class="facts">
      ${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v.startsWith('<a') ? v : esc(v)}</dd></div>`).join('\n      ')}
    </dl>

    <h2>ルメニウムに依頼できること</h2>
    <ul>
      <li>動画制作・映像編集 — PR動画、採用動画、SNS縦型動画、AI動画</li>
      <li>AI導入・研修 — 生成AIの社内導入支援、企業研修、教材制作</li>
      <li>SNS運用・LINE構築 — 運用代行、企画構成、LINE公式アカウント / Bot制作</li>
      <li>Web制作・アプリ開発 — コーポレートサイト、LP、Webアプリ、スマホアプリ</li>
      <li>キャスト手配・イベント — モデル・アクター手配、MC、イベント企画運営</li>
      <li>クリエイティブ制作 — ロゴ、バナー、ポスター、イラスト、作詞作曲</li>
    </ul>

    <h2>ルメニウムについてよくある質問</h2>
    <dl class="qa">
      ${QA.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('\n      ')}
    </dl>
  </article>
  <div class="cta">
    <a class="primary" href="/#/info/contact-form">無料で相談する</a>
    <a class="ghost" href="/#/info/services">サービス一覧を見る</a>
  </div>
  <h2 style="font-size:15px;font-weight:700;margin:36px 0 6px;padding-left:12px;border-left:3px solid #4f46e5">サービス詳細</h2>
  <ul class="list">
    <li><a href="/services/video.html">動画制作・映像編集</a></li>
    <li><a href="/services/ai.html">AI導入・研修</a></li>
    <li><a href="/services/sns.html">SNS運用・LINE構築</a></li>
    <li><a href="/services/web.html">Web制作・アプリ開発</a></li>
    <li><a href="/services/cast.html">キャスト手配・イベント</a></li>
    <li><a href="/services/creative.html">クリエイティブ制作</a></li>
  </ul>`
  writeFileSync('public/about.html', shell({
    title: 'ルメニウム（Lumenium）とは | 東京の動画制作・AI導入・Web制作会社',
    desc: DESC,
    canonical: url,
    ld,
    eyebrow: 'ABOUT LUMENIUM',
    body,
  }))
  urls.push({ loc: url, lastmod: TODAY })
}

/* ---- Brand-qualified topic pages ----
   One indexable URL per thing people search alongside the brand name
   (「ルメニウム 料金」「ルメニウム 実績」…), each with the brand in its
   <title>, so the first page of a brand search can hold several of our URLs
   rather than a single one. */
const yen = (n) => '¥' + n.toLocaleString('ja-JP')
const priceMin = PRICE_OPTIONS.reduce((a, o) => a + o.min, 0)

const TOPIC_PAGES = [
  {
    file: 'pricing.html',
    eyebrow: 'LUMENIUM PRICING',
    title: '料金・費用の目安 | Lumenium（ルメニウム）',
    h1: 'Lumenium（ルメニウム）の料金・費用の目安',
    desc: 'ルメニウム（Lumenium）の料金目安。動画制作3万円〜、AI導入・研修10万円〜、SNS/LINE構築20万円〜、Web制作30万円〜、キャスト手配5,000円〜。お見積りは無料です。',
    lead: '内容と規模によって変わるため、まずは下の目安レンジをご覧ください。お見積りは無料で、内容を伺った上で正確にご提案します。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'OfferCatalog',
      name: 'Lumenium 料金の目安',
      itemListElement: PRICE_OPTIONS.map((o) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: o.label, description: o.sub },
        priceCurrency: 'JPY',
        priceSpecification: {
          '@type': 'PriceSpecification',
          minPrice: o.min, maxPrice: o.max, priceCurrency: 'JPY',
        },
      })),
    }),
    body: () => `
    <h2>サービス別の料金レンジ</h2>
    <dl class="facts">
      ${PRICE_OPTIONS.map((o) => `<div><dt>${esc(o.label)}</dt><dd>${yen(o.min)} 〜 ${yen(o.max)}<br><span style="font-size:12.5px;opacity:.75">${esc(o.sub)}</span></dd></div>`).join('\n      ')}
    </dl>
    <p class="note">複数サービスをまとめてご依頼の場合、全部入りでも最小構成なら ${yen(priceMin)} 前後から組めます。ご予算を先に伺って、その中で優先順位をつけたプランを作ることも可能です。</p>
    <h2>料金について、よくいただく質問</h2>
    <ul>
      <li>お見積りは無料です。他社比較・社内稟議用の概算だけでも承ります</li>
      <li>見積り段階での強引な営業は一切いたしません</li>
      <li>通常2〜3回の修正は見積りに含まれています</li>
      <li>着手前のキャンセルは無償です</li>
    </ul>`,
  },
  {
    file: 'works.html',
    eyebrow: 'LUMENIUM WORKS',
    title: '実績・制作事例 | Lumenium（ルメニウム）',
    h1: 'Lumenium（ルメニウム）の実績・制作事例',
    desc: 'ルメニウム（Lumenium）の制作実績。塾教材4万ページを1ヶ月で制作、登録者数十万人規模チャンネルの動画制作、企業公式LINE構築、AI研修など12業界以上で対応しています。',
    lead: '規模やジャンルを問わず、案件ごとに最適なチーム体制を組んで対応してきました。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Lumenium 制作実績',
      itemListElement: [...CASE_STUDIES.map((c) => c.title), ...ACHIEVEMENTS]
        .map((name, i) => ({ '@type': 'ListItem', position: i + 1, name })),
    }),
    body: () => `
    <h2>主な事例</h2>
    ${CASE_STUDIES.map((c) => `<h3>${esc(c.title)}（${esc(c.tag)}）</h3>\n    <p>${esc(c.desc)}${c.metric ? `　<strong>${c.metric.toLocaleString('ja-JP')} ${esc(c.metricLabel)}</strong>` : ''}</p>`).join('\n    ')}
    <h2>その他の実績</h2>
    <ul>
      ${ACHIEVEMENTS.map((a) => `<li>${esc(a)}</li>`).join('\n      ')}
    </ul>
    <p class="note">飲食・IT・美容・教育・広告・士業など12以上の業界で実績があります。同業種の実績がない領域でも、リサーチから入るため支援可能です。</p>`,
  },
  {
    file: 'voice.html',
    eyebrow: 'LUMENIUM VOICE',
    title: 'お客様の声・評判 | Lumenium（ルメニウム）',
    h1: 'Lumenium（ルメニウム）をご利用いただいたお客様の声',
    desc: 'ルメニウム（Lumenium）にご依頼いただいたお客様の声。飲食店、IT企業、美容サロン、教育系企業、士業事務所などから寄せられた評価をご紹介します。',
    lead: '実際にご依頼いただいた方からいただいた言葉です。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Lumenium お客様の声',
      itemListElement: TESTIMONIALS.map((t, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: {
          '@type': 'Review',
          reviewBody: t.text,
          author: { '@type': 'Person', name: t.name },
          itemReviewed: { '@id': `${SITE}/#organization` },
        },
      })),
    }),
    body: () => `
    ${TESTIMONIALS.map((t) => `<h3>${esc(t.name)}</h3>\n    <p>「${esc(t.text)}」</p>\n    <p style="font-size:12.5px;opacity:.7">${esc(t.detail)}</p>`).join('\n    ')}`,
  },
  {
    file: 'flow.html',
    eyebrow: 'LUMENIUM FLOW',
    title: 'ご依頼の流れ・進め方 | Lumenium（ルメニウム）',
    h1: 'Lumenium（ルメニウム）へのご依頼の流れ',
    desc: 'ルメニウム（Lumenium）へのご依頼の流れ。ご相談から、ヒアリング・お見積り、ご契約、制作、納品・運用サポートまでの5ステップと、各段階の所要時間をご説明します。',
    lead: 'ご相談から納品・運用まで、5つのステップで進めます。所要時間の目安も合わせてご覧ください。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Lumeniumへのご依頼の流れ',
      step: FLOW_STEPS.map((s, i) => ({
        '@type': 'HowToStep', position: i + 1, name: s.title, text: s.desc,
      })),
    }),
    body: () => FLOW_STEPS.map((s, i) => `
    <h2>STEP ${i + 1}｜${esc(s.title)}</h2>
    <p>${esc(s.desc)}</p>
    <p style="font-size:12.5px;opacity:.75">目安: ${esc(s.meta.time)}　／　ご準備: ${esc(s.meta.prep)}</p>
    <ul>
      ${s.checks.map((c) => `<li>${esc(c)}</li>`).join('\n      ')}
    </ul>`).join('\n'),
  },
  {
    file: 'contact.html',
    eyebrow: 'LUMENIUM CONTACT',
    title: 'お問い合わせ・無料相談 | Lumenium（ルメニウム）',
    h1: 'Lumenium（ルメニウム）へのお問い合わせ',
    desc: 'ルメニウム（Lumenium）へのご相談・お見積りは無料です。動画制作、AI導入・研修、SNS運用、LINE構築、Web制作のご相談は48時間以内にご返信します。',
    lead: 'まずは30分のオンライン相談から。「何から手をつければいいか分からない」段階のご相談も歓迎です。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Lumenium お問い合わせ',
      mainEntity: {
        '@id': `${SITE}/#organization`,
      },
    }),
    body: () => `
    <h2>ご相談の前に知っておいていただきたいこと</h2>
    <ul>
      <li>初回相談・お見積りは無料です</li>
      <li>お問い合わせから48時間以内にご返信します</li>
      <li>秘密厳守。NDAは貴社フォーマットでの締結にも対応します</li>
      <li>個人・個人事業主の方からのご依頼も歓迎しています</li>
      <li>打ち合わせはオンライン対応のため、全国どこからでもご依頼いただけます</li>
    </ul>
    <h2>ご相談内容の例</h2>
    <ul>
      <li>採用動画・PR動画を作りたい（<a href="/services/video.html">動画制作</a>）</li>
      <li>社内に生成AIを導入したい・研修を頼みたい（<a href="/services/ai.html">AI導入・研修</a>）</li>
      <li>SNSやLINEで集客を仕組み化したい（<a href="/services/sns.html">SNS運用・LINE構築</a>）</li>
      <li>ホームページやLPをリニューアルしたい（<a href="/services/web.html">Web制作</a>）</li>
      <li>イベントのキャスト・MCを手配したい（<a href="/services/cast.html">キャスト手配</a>）</li>
    </ul>
    <p class="note">下のボタンからお問い合わせフォームに移動できます。料金の目安は<a href="/pricing.html">料金ページ</a>、進め方は<a href="/flow.html">ご依頼の流れ</a>をご覧ください。</p>`,
  },
]

TOPIC_PAGES.push(
  {
    file: 'pain.html',
    eyebrow: 'LUMENIUM PAIN POINTS',
    title: 'こんなお困りごとはありませんか | Lumenium（ルメニウム）',
    h1: 'こんなお困りごと、ありませんか？',
    desc: 'SNS集客が進まない、動画を作る時間がない、公式LINEの始め方が分からない。ルメニウム（Lumenium）は、言葉にならないモヤモヤを一緒に言語化し、動画・AI・Webという打ち手に翻訳します。',
    lead: '「何から手をつければいいか分からない」「やりたいことはあるのに、時間も人手も足りない」——事業の次の一手は、たいてい言葉にならないモヤモヤから始まります。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Lumeniumが解決するお困りごと',
      itemListElement: PAIN_POINTS.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.title })),
    }),
    body: () => `
    <p>その曖昧な想いを一緒に<strong>言語化</strong>し、動画・AI・Webという最適な打ち手に翻訳するのが、ルメニウム（Lumenium）の仕事です。</p>
    ${PAIN_POINTS.map((x) => `
    <h2>${esc(x.num)}｜${esc(x.title)}</h2>
    <p><strong>お困りごと:</strong> ${esc(x.pain)}</p>
    <p><strong>ルメニウムの対応:</strong> ${esc(x.solution)}</p>`).join('\n')}
    <p class="note">上のどれにも当てはまらないご相談も歓迎です。抽象的な段階からご一緒します。</p>`,
  },
  {
    file: 'positioning.html',
    eyebrow: 'LUMENIUM POSITIONING',
    title: 'ルメニウムの立ち位置（他社との違い）| Lumenium（ルメニウム）',
    h1: 'ルメニウム（Lumenium）はどんな会社か — 他社との違い',
    desc: '大手制作会社・広告代理店とも、クラウドソーシング・フリーランスとも違う、ルメニウム（Lumenium）の立ち位置。クオリティ・対応力とコストパフォーマンスの両立について説明します。',
    lead: '大手制作会社・広告代理店、クラウドソーシング——どれとも違う、ルメニウムの立ち位置を整理しました。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Lumeniumのポジショニング',
      itemListElement: POSITIONING_NOTES.map((n, i) => ({ '@type': 'ListItem', position: i + 1, name: n.k, description: n.v })),
    }),
    body: () => `
    <p>ルメニウムは、<strong>クオリティ・対応力が高く、かつコストパフォーマンスも高い</strong>領域に立つことを狙っています。同じ課題を頼める先を並べると、違いは次のようになります。</p>
    <dl class="facts">
      ${POSITIONING_NOTES.map((n) => `<div><dt style="flex:0 0 178px">${esc(n.k)}</dt><dd>${esc(n.v)}</dd></div>`).join('\n      ')}
    </dl>
    <h2>なぜワンストップにこだわるのか</h2>
    <p>動画・AI・Web・SNSは、実際のプロジェクトでは一つの目的のもとで絡み合います。複数社に分けて発注すると、その調整をお客様側が抱えることになります。ルメニウムは窓口を一本化し、企画から納品・運用までを一貫して担当します。</p>
    <h2>必要な規模だけで頼める</h2>
    <p>大手のような最低発注額・最低契約期間を設けていません。動画1本、LP1枚といった単位からご依頼いただけます。</p>`,
  },
  {
    file: 'story.html',
    eyebrow: 'LUMENIUM STORY',
    title: '社名の由来と考え方 | Lumenium（ルメニウム）',
    h1: 'ルメニウム（Lumenium）という社名と、その考え方',
    desc: 'ルメニウム（Lumenium）という社名の由来、対応領域の考え方、制作後の伴走姿勢について。社名はラテン語で光を意味する Lumen に由来します。',
    lead: '社名の由来、事業の考え方、取り組み方をご紹介します。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'ルメニウム（Lumenium）という社名と、その考え方',
      inLanguage: 'ja-JP',
      author: { '@type': 'Organization', name: 'Lumenium', url: SITE },
      publisher: { '@id': `${SITE}/#organization` },
    }),
    body: () => BRAND_CHAPTERS.map((c) => `
    <h2>${esc(c.no)}｜${esc(c.title)}</h2>
    ${c.body.map((line) => `<p>${esc(line)}</p>`).join('\n    ')}`).join('\n'),
  },
  {
    file: 'profile.html',
    eyebrow: 'LUMENIUM FOUNDER',
    title: '代表紹介 山本捷真 | Lumenium（ルメニウム）',
    h1: 'ルメニウム（Lumenium）代表 山本 捷真',
    desc: 'ルメニウム（Lumenium）代表・山本捷真の経歴と得意領域。慶應義塾大学文学部卒業、在学中から個人事業主として動画・AI・Web・SNSを横断し、企業向けAI研修の講師も歴任。',
    lead: '慶應義塾大学 文学部 卒業。在学中から個人事業主として活動開始。動画、AI、Web、SNSなど幅広く活動し、企業向けAI研修の講師も歴任しています。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: '山本 捷真',
      alternateName: 'Shoma Yamamoto',
      jobTitle: 'Lumenium（ルメニウム）代表',
      worksFor: { '@id': `${SITE}/#organization` },
      alumniOf: { '@type': 'CollegeOrUniversity', name: '慶應義塾大学' },
      knowsAbout: ['AI研修', '動画制作', 'LINE Bot開発', 'Webアプリ開発', 'キャスト手配', '作詞作曲'],
    }),
    body: () => `
    ${PROFILE_BRICKS.map((k) => `
    <h2>${esc(k.title)}</h2>
    <p>${esc(k.text)}</p>
    <ul>
      ${k.list.map((i) => `<li>${esc(i)}</li>`).join('\n      ')}
    </ul>`).join('\n')}
    <h2>経歴</h2>
    <dl class="facts">
      ${CAREER.map((c) => `<div><dt>${esc(c.year)}</dt><dd>${esc(c.detail)}${c.sub ? `<br><span style="font-size:12.5px;opacity:.75">${esc(c.sub)}</span>` : ''}</dd></div>`).join('\n      ')}
    </dl>`,
  },
)

for (const t of TOPIC_PAGES) {
  const url = `${SITE}/${t.file}`
  const body = `
  <h1>${esc(t.h1)}</h1>
  <p class="meta">${esc(t.lead)}</p>
  <article>
${t.body()}
  </article>
  <div class="cta">
    <a class="primary" href="/#/info/contact-form">無料で相談する</a>
    <a class="ghost" href="/about.html">Lumeniumとは</a>
  </div>
  <h2 style="font-size:15px;font-weight:700;margin:36px 0 6px;padding-left:12px;border-left:3px solid #4f46e5">Lumeniumの他のページ</h2>
  <ul class="list">
    ${TOPIC_PAGES.filter((o) => o.file !== t.file).map((o) => `<li><a href="/${o.file}">${esc(o.h1)}</a></li>`).join('\n    ')}
    <li><a href="/faq.html">よくある質問 | Lumenium（ルメニウム）</a></li>
    <li><a href="/blog/index.html">ブログ | Lumenium（ルメニウム）</a></li>
  </ul>`
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: t.h1, description: t.desc, inLanguage: 'ja-JP',
        isPartOf: { '@id': `${SITE}/#website` },
        about: { '@id': `${SITE}/#organization` },
      },
      t.ld(),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: t.h1, item: url },
        ],
      },
    ],
  }
  writeFileSync('public/' + t.file, shell({
    title: t.title, desc: t.desc, canonical: url, ld, eyebrow: t.eyebrow, body,
  }))
  urls.push({ loc: url, lastmod: TODAY })
}

/* ---- Human-readable site index ----
   One page that links every sub-page. Readers use it to find things; a
   crawler uses it as a single hub that reaches the whole site in one hop. */
{
  const url = `${SITE}/sitemap.html`
  const SECTIONS = [
    ['事業内容', [
      ['/services/video.html', '動画制作・映像編集'],
      ['/services/ai.html', 'AI導入・生成AI研修'],
      ['/services/sns.html', 'SNS運用・LINE構築'],
      ['/services/web.html', 'Web制作・アプリ開発'],
      ['/services/cast.html', 'キャスト手配・イベント'],
      ['/services/creative.html', 'クリエイティブ制作'],
    ]],
    ['ご検討の方へ', [
      ['/pain.html', 'こんなお困りごと、ありませんか？'],
      ['/pricing.html', '料金・費用の目安'],
      ['/works.html', '実績・制作事例'],
      ['/voice.html', 'お客様の声・評判'],
      ['/flow.html', 'ご依頼の流れ・進め方'],
      ['/faq.html', 'よくある質問'],
      ['/contact.html', 'お問い合わせ・無料相談'],
    ]],
    ['Lumeniumについて', [
      ['/about.html', 'ルメニウム（Lumenium）とは'],
      ['/story.html', '社名の由来と考え方'],
      ['/positioning.html', 'ルメニウムの立ち位置（他社との違い）'],
      ['/profile.html', '代表紹介 山本 捷真'],
      ['/specified-commerce.html', '特定商取引法に基づく表記'],
    ]],
    ['読みもの', [
      ['/blog/index.html', 'ブログ記事一覧'],
      ['/news.html', 'お知らせ'],
      ...articles.map((a) => [`/blog/post-${a.id}.html`, a.title]),
    ]],
    ['ミニゲーム', [
      ['/game.html', 'シューティング'],
      ['/runner.html', 'ランナー'],
      ['/racing.html', 'ディフェンス'],
    ]],
  ]
  const total = SECTIONS.reduce((n, [, items]) => n + items.length, 0)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'サイトマップ | Lumenium（ルメニウム）',
    url,
    inLanguage: 'ja-JP',
    isPartOf: { '@id': `${SITE}/#website` },
    hasPart: SECTIONS.flatMap(([, items]) =>
      items.map(([href, label]) => ({ '@type': 'WebPage', name: label, url: SITE + href }))),
  }
  const body = `
  <h1>サイトマップ</h1>
  <p class="meta">Lumenium（ルメニウム）のページ一覧（全${total}ページ）</p>
  <article>
${SECTIONS.map(([label, items]) => `    <h2>${esc(label)}</h2>
    <ul class="list">
      ${items.map(([href, text]) => `<li><a href="${href}">${esc(text)}</a></li>`).join('\n      ')}
    </ul>`).join('\n')}
  </article>
  <div class="cta">
    <a class="primary" href="/#/info/contact-form">無料で相談する</a>
    <a class="ghost" href="/">トップページへ</a>
  </div>`
  writeFileSync('public/sitemap.html', shell({
    title: 'サイトマップ | Lumenium（ルメニウム）',
    desc: 'Lumenium（ルメニウム）のページ一覧。サービス、料金、実績、お客様の声、ご依頼の流れ、会社情報、ブログ記事へのリンクをまとめています。',
    canonical: url,
    ld,
    eyebrow: 'LUMENIUM SITEMAP',
    body,
  }))
  urls.push({ loc: url, lastmod: TODAY })
}

/* ---- Full sitemap ----
   Regenerated every build so lastmod is always the deploy date. A stale
   lastmod is read as "nothing changed here", which pushes the recrawl of
   these pages further out — exactly what we cannot afford right now. */
{
  const SERVICE_IDS = ['video', 'ai', 'sns', 'web', 'cast', 'creative']
  const core = [
    { loc: `${SITE}/`, lastmod: TODAY, changefreq: 'daily', priority: '1.0', images: true },
    { loc: `${SITE}/about.html`, lastmod: TODAY, changefreq: 'weekly', priority: '0.9' },
    ...SERVICE_IDS.map((id) => ({ loc: `${SITE}/services/${id}.html`, lastmod: TODAY, changefreq: 'weekly', priority: '0.8' })),
    ...urls
      .filter((u) => u.loc !== `${SITE}/about.html`)
      .map((u) => ({ loc: u.loc, lastmod: u.lastmod, changefreq: 'weekly', priority: '0.7' })),
    { loc: `${SITE}/specified-commerce.html`, lastmod: TODAY, changefreq: 'yearly', priority: '0.2' },
    { loc: `${SITE}/runner.html`, lastmod: TODAY, changefreq: 'monthly', priority: '0.3' },
    { loc: `${SITE}/game.html`, lastmod: TODAY, changefreq: 'monthly', priority: '0.3' },
    { loc: `${SITE}/racing.html`, lastmod: TODAY, changefreq: 'monthly', priority: '0.3' },
  ]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/0.9">
${core.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.images ? `
    <image:image>
      <image:loc>${SITE}/lumenium-logo.png</image:loc>
      <image:title>Lumenium（ルメニウム）ロゴ</image:title>
    </image:image>` : ''}
  </url>`).join('\n')}
</urlset>
`
  writeFileSync('public/sitemap.xml', xml)
  writeFileSync('public/sitemap-urls.txt', core.map((u) => u.loc).join('\n') + '\n')
  console.log(`sitemap.xml written: ${core.length} URLs`)
}

/* ---- Content sitemap ---- */
{
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
</urlset>
`
  writeFileSync('public/sitemap-content.xml', xml)
}

console.log(`content pages written: ${urls.length} URLs (blog ${articles.length} + index + news + faq + about + ${TOPIC_PAGES.length} topic)`)
