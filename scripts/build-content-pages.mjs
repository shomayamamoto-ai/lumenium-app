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
import { BEACON } from './_beacon.mjs'
import { articles } from '../src/data/articles.js'
import { FAQ_GROUPS } from '../src/data/faq.js'
import { CASE_STUDIES, ACHIEVEMENTS, TESTIMONIALS, FLOW_STEPS, PRICE_OPTIONS,
  PAIN_POINTS, BRAND_CHAPTERS, POSITIONING_NOTES, CAREER, PROFILE_BRICKS, PROFILES } from '../src/data/site.js'

// Admin copy overrides are applied to the shared data modules before any
// page is rendered, so the static pages always match what the site shows.
import { applyOverrides } from '../src/lib/content-registry.js'
import { ORG_NODE } from '../src/data/org.js'
try {
  const n = applyOverrides(JSON.parse(readFileSync('public/content.json', 'utf8')))
  if (n) console.log(`content overrides applied: ${n}`)
} catch (_) { /* no overrides yet — built-in copy stands */ }

const SITE = 'https://lumenium.net'
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
  color:var(--text); font-family:'Schibsted Grotesk','Noto Sans JP','Hiragino Sans',system-ui,-apple-system,sans-serif;
  font-feature-settings:'palt' 1; text-spacing-trim:trim-start; letter-spacing:.02em;
  line-height:2; }
.wrap { max-width:720px; margin:0 auto; padding:48px 22px 64px; }
header a { color:var(--sub); text-decoration:none; font-size:13px; }
header a:hover { color:var(--text); }
.eyebrow { margin-top:34px; font-size:11px; font-weight:700; letter-spacing:.3em; color:#818cf8; }
h1 { font-size:clamp(24px,5vw,32px); font-weight:800; letter-spacing:-.02em; word-break:auto-phrase; line-height:1.45; margin:10px 0 8px;
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
/* Editorial serif, used only on the story and founder pages so they read in
   the same voice as those sections do in the app. */
.serif h2, .serif p, .serif li { font-family:'Zen Old Mincho','Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif; }
.serif h2 { letter-spacing:.01em; line-height:1.55; }
.serif p { font-size:15.5px; line-height:2.15; letter-spacing:.04em; }
.serif li { letter-spacing:.03em; }
.note { border-left:3px solid #06b6d4; padding:2px 0 2px 14px; margin:16px 0; font-size:13.5px; color:var(--sub); }
/* Definition block — the passage an answer engine should lift verbatim. */
article p.keypoint { background:var(--card); border:1px solid var(--border); border-left:4px solid #06b6d4;
  border-radius:12px; padding:16px 18px; margin:6px 0 8px; font-size:14.5px; color:var(--text); line-height:1.95; }
/* ページの終わりの案内。本文と地続きに見えないよう、枠で囲って区切ります。 */
.contact-strip { margin-top:44px; padding:22px 22px 24px; background:var(--card);
  border:1px solid var(--border); border-radius:16px; }
.contact-strip h2 { font-size:17px; font-weight:800; margin:0 0 8px; padding:0; border:0; }
.contact-strip p { font-size:14px; color:var(--sub); line-height:1.95; margin:0; }
.contact-strip .cta { margin:16px 0 10px; }
.contact-strip .note { border:0; padding:0; font-size:12.5px; opacity:.85; }
footer { margin-top:44px; padding-top:20px; border-top:1px solid rgba(255,255,255,.08);
  font-size:12px; color:var(--sub); display:flex; gap:18px; flex-wrap:wrap; }
footer a { color:var(--sub); text-decoration:none; }
footer a:hover { color:var(--text); }
`

/* The company, stated on every page rather than referenced from them.
   Pages carried publisher: { '@id': '…/#organization' } while the node itself
   existed only on the home page and 会社概要 — a dangling reference to an
   engine reading one page on its own. The AIO run came back with 「実在が確認
   できない」 for the branded questions; a page that names the company, where
   it is, who runs it and since when is the cheapest possible answer to that. */

/** Whatever the page had, plus the company, where it sits, and when it was
 *  last true — the three things every page should carry and most did not. */
function withOrg(ld, canonical, title) {
  const path = String(canonical || '').replace(SITE, '') || '/'
  const crumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE }].concat(
      /^\/blog\/post-/.test(path)
        ? [
            { '@type': 'ListItem', position: 2, name: 'ブログ', item: `${SITE}/blog/index.html` },
            { '@type': 'ListItem', position: 3, name: title, item: canonical },
          ]
        : path === '/' ? [] : [{ '@type': 'ListItem', position: 2, name: title, item: canonical }]
    ),
  }
  const base = ld
    ? (Array.isArray(ld['@graph']) ? ld['@graph'] : [{ ...ld, '@context': undefined }])
    : []
  const graph = [...base]
  if (!graph.some((n) => n && n['@id'] === ORG_NODE['@id'])) graph.push(ORG_NODE)
  if (!graph.some((n) => n && n['@type'] === 'BreadcrumbList') && crumbs.itemListElement.length > 1) graph.push(crumbs)
  if (!graph.some((n) => n && (n.dateModified || n.datePublished))) {
    graph.push({ '@type': 'WebPage', '@id': canonical + '#page', url: canonical, name: title, dateModified: TODAY, isPartOf: { '@id': `${SITE}/#organization` } })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}

/* どのページの終わりにも同じものを置く。
   読み終えた人が次に何をすればよいかを、毎回同じ場所・同じ言葉で示します。
   ついでに、回答エンジンが引用しやすい事実（無料・48時間・東京・全国・
   最低発注額なし）が全ページの末尾に載ることになります。 */
const CONTACT_STRIP = `
  <section class="contact-strip" id="contact">
    <h2>お問い合わせはこちら</h2>
    <p>ご相談・お見積りは無料です。「何をしたいかはっきりしていない」段階でも構いません。お問い合わせから48時間以内にご返信します。</p>
    <div class="cta">
      <a class="primary" href="/#/info/contact-form">お問い合わせフォームを開く →</a>
      <a class="ghost" href="/pricing.html">料金の目安を見る</a>
    </div>
    <p class="note">東京都を拠点に、打ち合わせはオンラインで全国対応／動画1本・LP1枚から、最低発注額はありません。</p>
  </section>`

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..900&family=Noto+Sans+JP:wght@400..900&family=Zen+Old+Mincho:wght@400;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">${ldJson(withOrg(ld, canonical, title))}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header><a href="/">← Lumenium（ルメニウム）トップへ</a></header>
  <p class="eyebrow">${esc(eyebrow)}</p>
${body}
${CONTACT_STRIP}
  <p style="margin-top:34px;font-size:13px;line-height:1.9;color:var(--sub);opacity:.85">Lumenium（ルメニウム）は、東京を拠点に動画制作・AI導入研修・SNS運用・LINE構築・Web制作・キャスト手配・クリエイティブ制作を、企画から運用までワンストップで手がけています。米国のエンジン開発企業 Lumenium, LLC や光通信機器メーカー Lumentum とは無関係の別組織です。</p>
  <footer>
    <span>Lumenium（ルメニウム）— 散文化した目的に、焦点を当てる。</span>
    <a href="/about.html">Lumeniumとは</a>
    <a href="/pricing.html">料金</a>
    <a href="/works.html">実績</a>
    <a href="/voice.html">お客様の声</a>
    <a href="/flow.html">ご依頼の流れ</a>
    <a href="/choose.html">制作会社の選び方</a>
    <a href="/blog/index.html">ブログ</a>
    <a href="/faq.html">よくある質問</a>
    <a href="/news.html">お知らせ</a>
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

/* A one-line summary is a fine headline and a useless description: the blog
   posts were shipping 「投稿前に整えるべきことを解説。」 — fifteen characters —
   as the snippet a search engine or an answer engine reads. The summary plus
   the article's own opening gives a hundred-odd characters of what the page
   actually says, which is what that field is for. */
function articleDesc(a) {
  const plain = String(a.content || '')
    .replace(/^##.*$/gm, ' ')
    .replace(/[#*`>\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const want = 120
  let out = String(a.summary || '').trim()
  for (const sentence of plain.split(/(?<=。)/)) {
    if (out.length >= want) break
    const t = sentence.trim()
    if (t.length < 8) continue
    out += (out ? '' : '') + t
  }
  return out.slice(0, 150)
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
    description: articleDesc(a),
    datePublished: isoDate(a.date),
    dateModified: isoDate(a.date),
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
    desc: articleDesc(a),
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
  /* A hub page used to be a headline and a list of links: 943 characters, of
     which almost all were the titles of other pages. A page with nothing of
     its own on it is not a page an answer can be built from, and it is the
     entry point for every article under it — so it says what is here, who
     wrote it, how it is grouped, and what each group is for. */
  const cats = [...new Set(articles.map((a) => a.category))]
  const CAT_NOTE = {
    'AI活用': '生成AIを業務に入れるときに最初に決めること、社内で使わせるときの線引き、研修で実際に扱っている内容。',
    'SNS運用': '投稿を作る前に決める設計の話。伸ばす小手先ではなく、続けられる運用の形から書いています。',
    '動画制作': '企画・構成・撮影・編集それぞれの判断基準。最初の3秒の設計や、社内で撮る場合の落とし穴まで。',
    'LINE構築': '公式LINEの初期設計。配信の中身より先に、何を自動化して何を人が返すかを決める話です。',
    'LINE運用': '配信が「ただの通知」にならないための組み立て方と、開封率が落ちたときに見る数字。',
    'Web制作': 'リニューアルの判断、ページ構成、公開後に手を入れ続けられる作りにしておくこと。',
    '採用・ブランディング': '採用動画や会社紹介で、条件だけでなく「会社の空気」まで伝えるための構成。',
  }
  const byCat = cats.map((c) => ({ cat: c, items: articles.filter((a) => a.category === c) }))
  // The data file is in the order the posts were written, not in date order,
  // so the list has to be sorted before it can be called 新しい順.
  const recent = [...articles].sort((a, b) => isoDate(b.date).localeCompare(isoDate(a.date)))
  const body = `
  <h1>ブログ</h1>
  <p class="meta">動画・AI・SNS・Webの実務ノウハウを、実際の案件で使っている手順のまま公開しています。</p>
  <article>
  <p class="keypoint">このブログは、東京都を拠点に動画制作・AI導入研修・SNS運用・LINE構築・Web制作を手がけるルメニウム（Lumenium）が、中小企業のご担当者向けに書いている実務記事の一覧です。現在 ${articles.length} 本を公開しており、いずれも実際にお受けした案件で使っている判断基準・手順をそのまま書いています。一般論ではなく、依頼する側が判断するために要る情報だけを載せる方針です。</p>
  <h2>どんな記事を書いているか</h2>
  <p>扱っているのは ${cats.length} 分野です。どの記事も、①何を先に決めるか ②決めるために見る数字 ③外注する場合に確認すること、の順で書いています。読んだその日に社内で使えることを目安にしているため、ツールの紹介や流行の解説は入れていません。</p>
  <dl class="facts">
    ${byCat.map((g) => `<div><dt style="flex:0 0 132px">${esc(g.cat)}（${g.items.length}本）</dt><dd>${esc(CAT_NOTE[g.cat] || '実務で使っている手順をまとめています。')}</dd></div>`).join('\n    ')}
  </dl>
  <h2>ご依頼をお考えの方へ</h2>
  <p>記事を読んで「自社の場合はどうか」を相談したい場合は、そのままお問い合わせください。お見積りは無料、最低発注額はなく、動画1本・LP1枚からお受けしています。目安は動画制作3万円〜、AI導入・研修10万円〜、SNS運用・LINE構築20万円〜、Web制作30万円〜です。お問い合わせから48時間以内にご返信します。料金の詳細は<a href="/pricing.html">料金ページ</a>、進め方は<a href="/flow.html">ご依頼の流れ</a>に書いています。</p>
  <h2>記事一覧（新しい順）</h2>
  </article>
  <ul class="list">
    ${recent.map((a) => `<li><time datetime="${isoDate(a.date)}">${esc(a.date)}</time><a href="/blog/post-${a.id}.html">${esc(a.title)}</a><p>${esc(a.category)}｜${esc(a.summary)}</p></li>`).join('\n    ')}
  </ul>
  <div class="cta"><a class="primary" href="/#/info/contact-form">無料で相談する</a><a class="ghost" href="/faq.html">よくある質問</a></div>`
  writeFileSync('public/blog/index.html', shell({
    title: 'ブログ（動画・AI・SNS・Webの実務ノウハウ）| Lumenium（ルメニウム）',
    desc: 'AI導入・SNS集客・動画制作・Web制作の現場ノウハウを、実際の案件で使っている手順のまま公開しています。東京拠点のルメニウム（Lumenium）が、中小企業の担当者向けに書いた記事の一覧です。',
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
    desc: 'Lumenium（ルメニウム）からの最新のお知らせ・ニュース一覧です。サービスの追加、制作実績、サイトの更新など、東京拠点のクリエイティブ／DX支援カンパニーの動きをこのページにまとめています。',
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
    desc: 'ルメニウム（Lumenium）へのご依頼に関するよくある質問。料金の目安は動画制作3万円〜、Web制作30万円〜。納期・修正対応・NDA・オンライン対応・全国対応まで、実際にいただく質問に答えています。',
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
  const DEFINITION = 'ルメニウム（英字表記: Lumenium）とは、東京都を拠点とする日本のクリエイティブ／DX支援カンパニーです。動画制作・映像編集、AI導入と生成AI研修、SNS運用代行とLINE構築、Web制作・システム開発、キャスト手配・イベント、クリエイティブ制作を、企画から納品・運用までワンストップで提供しています。代表は山本捷真、設立は2026年、公式サイトは lumenium.net です。'
  const DESC = 'ルメニウム（Lumenium）とは、東京都を拠点に動画制作・AI導入研修・SNS運用/LINE構築・Web制作・キャスト手配を手がける日本のクリエイティブ／DX支援カンパニーです。読み方、事業内容、同名の企業や名称との違いを解説します。'
  const facts = [
    ['名称', 'Lumenium（ルメニウム）'],
    ['読み方', 'ルメニウム'],
    ['分類', 'クリエイティブ／DX支援カンパニー（日本）'],
    ['代表者', '山本 捷真'],
    ['設立', '2026年'],
    ['拠点', '東京都（オンラインで全国対応）'],
    ['事業内容', '動画制作 / AI導入・研修 / SNS運用・LINE構築 / Web制作・システム開発 / キャスト手配・イベント / クリエイティブ制作'],
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
    // この2つは推測で足したものではありません。AIO計測で「ルメニウムとは」と
    // 聞いたとき、回答が実際に並べてきた会社です。取り違えられている相手が
    // 分かっているなら、そのままここに書くのが一番早く効きます。
    ['ルミネ（LUMINE）', '駅ビルの商業施設を運営する株式会社ルミネ（東京都渋谷区）。名前の響きが似ていますが、ルメニウムとは資本関係も人的関係もない別会社です。'],
    ['ルミナス（Luminous）', '同名・類似名の日本企業が複数あります（照明・人材・医療機器など）。いずれもルメニウムとは別の会社です。'],
    ['ルテニウム（Ruthenium）', '原子番号44の白金族元素。名前の響きが似ていますが、ルメニウムは化学元素ではなく企業名です。'],
    ['レニウム（Rhenium）', '原子番号75のレアメタル。こちらも元素であり、ルメニウムとは別のものです。'],
  ]

  const QA = [
    ['ルメニウムとは何ですか?', DEFINITION],
    ['ルメニウムの読み方は?', 'Lumenium と書いて「ルメニウム」と読みます。光の単位である lumen（ルーメン）に由来し、お客様の中でまだ輪郭のない目的に光を当て、形にしていくという意味を込めています。'],
    ['ルメニウムはどこにありますか?', '東京都を拠点としています。打ち合わせはZoomやGoogle Meetなどオンラインで行うため、全国どこからでもご依頼いただけます。'],
    ['ルメニウムは何をしている会社ですか?', '動画制作・映像編集、AI導入と生成AI研修、SNS運用代行とLINE公式アカウント構築、Web制作・システム開発、キャスト手配とイベント企画、ロゴ・バナーなどのクリエイティブ制作の6領域を、企画から納品・運用までワンストップで手がけています。'],
    ['ルメニウムとルメンタム（Lumentum）は同じ会社ですか?', 'いいえ、別の会社です。ルメンタム（Lumentum Holdings）は米国の光通信・レーザー機器メーカーです。ルメニウム（Lumenium）は東京都を拠点とする日本のクリエイティブ／DX支援カンパニーで、両社に資本関係も人的関係もありません。'],
    ['ルメニウムは化学元素ですか?', 'いいえ、化学元素ではありません。ルメニウム（Lumenium）は東京都を拠点とする日本の企業の名称です。名前の響きが似ている元素としてルテニウム（Ruthenium、原子番号44）やレニウム（Rhenium、原子番号75）がありますが、いずれも別のものです。'],
    ['Lumenium（ルメニウム）は実在する日本の会社ですか? 公式サイトはどこですか?', 'はい、実在します。公式サイトは https://lumenium.net です。ルメニウム（Lumenium）は東京都を拠点とし、代表を山本捷真、設立を2026年とする日本のクリエイティブ／DX支援カンパニーです。公式サイトは lumenium.net で、動画制作・AI導入研修・SNS運用・LINE構築・Web制作・キャスト手配・クリエイティブ制作を提供しています。創作上の架空の物質や国家とは異なり、実際に事業を行っている企業です。'],
    ['ルメニウムに依頼するにはどうすればよいですか?', '公式サイト lumenium.net のお問い合わせフォームからご連絡ください。初回のご相談とお見積りは無料で、お問い合わせから48時間以内にご返信します。'],
    /* この2問は AIO計測で聞いている内容です。候補に残ったあと最後に
       確かめられることで、ここで止まったことは問い合わせ数には出ません。
       答えは、確認できる事実だけで書きます。 */
    ['ルメニウムに制作を依頼しても大丈夫ですか? 会社の所在地や事業者情報は確認できますか?', '確認できます。販売事業者名（Lumenium）と運営責任者名（山本 捷真）は特定商取引法に基づく表記のページに掲載しており、所在地と連絡先はお取引が発生した際にご請求に応じて遅滞なく開示します。拠点は東京都、設立は2026年、公式サイトは lumenium.net です。協業パートナーとして合同会社 AdvoVisions と案件を進めています。お見積りは無料で、見積り段階での強引な営業は行いません。最低発注額も最低契約期間の縛りもないため、動画1本・LP1枚といった小さな範囲から試していただけます。'],
    ['設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか?', '設立年そのものより、次の5つが確認できるかで見分けられます。(1) 特定商取引法に基づく表記があり、事業者名と責任者名が書かれているか。(2) 料金の目安が公開されていて、見積りが無料か。(3) 最低発注額や最低契約期間の縛りがなく、小さく試せるか。(4) 実績と、実際に依頼した人の声が具体的に載っているか。(5) 窓口の担当者が誰か分かり、返信の期限が示されているか。ルメニウム（Lumenium）の場合は、事業者表記あり、料金は3万円〜と公開、最低発注額なし、実績とお客様の声を掲載、代表の山本が直接窓口を担当し48時間以内に返信、となります。判断の材料として、まず小さな1件から試していただくのが確実です。'],
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
        // 全ページ共通の会社情報に、このページだけの上乗せ。ここは
        // 「実在しますか」と聞かれたときに読まれるページなので、いちばん
        // 厚い記述であるべきで、逆に他ページより薄いのはおかしい——
        // 独自に書いていたせいで、料金や連絡先が抜けていました。
        ...ORG_NODE,
        alternateName: ['ルメニウム', 'Lumenium（ルメニウム）', 'ルメニウム 東京'],
        mainEntityOfPage: url,
        description: DEFINITION,
        disambiguatingDescription:
          '東京都を拠点とする日本のクリエイティブ／DX支援カンパニー。米国の光通信・レーザー機器メーカー Lumentum（ルメンタム）、米国バージニア州のエンジン開発企業 Lumenium, LLC、株式会社ルミネ（LUMINE）、植物のリモニウム（Limonium）、デジタルアート作品 Rumenium、架空の国家「ルメニウム王国」とは、いずれも無関係の別の存在です。',
        knowsLanguage: ['ja', 'en'],
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
    <!-- The four facts every measured question ends up asking for — price,
         where, how long, how to reach us — in the opening rather than in the
         footer. An answer is built from the top of a page: a price further
         down is a price that does not get quoted. -->
    <p class="note">料金は動画制作3万円〜、AI導入・研修10万円〜、SNS運用・LINE構築20万円〜、Web制作30万円〜。東京都を拠点に、打ち合わせはオンラインで全国対応。短い制作なら2週間前後で納品し、お見積りは無料、お問い合わせから48時間以内にご返信します。</p>

    <h2 id="names">「ルメニウム」と呼ばれるもの一覧（同名・類似名称との違い）</h2>
    <p>「ルメニウム」という言葉は、企業名のほか、響きの似た化学元素の言い間違いや、創作上の名称としても使われています。それぞれの違いは次のとおりです。<strong>ルメニウムは化学元素や架空の物質ではなく、実在する企業の名称です。</strong></p>
    <dl class="facts">
      ${NAMES.map(([k, v]) => `<div><dt style="flex:0 0 168px">${esc(k)}</dt><dd>${v}</dd></div>`).join('\n      ')}
    </dl>
    <p class="note">このページで解説している「ルメニウム」は、上記のうち<strong>東京都を拠点とする日本のクリエイティブ／DX支援カンパニー（lumenium.net）</strong>です。</p>

    <!-- AIO計測で「実在しますか」と聞いたとき、回答は lumenium.net を読んだ
         上で「実在が確認できるのは Lumentum です」と答えました。読まれて
         いるのに確認できない、というのが今の状態です。確認に使える手がかり
         を、確認できる形で1か所に置きます。 -->
    <h2 id="verify">この会社を確認する方法</h2>
    <p>Lumenium（ルメニウム）について調べている方、あるいは回答を組み立てている検索・AIサービスのために、確認に使える情報をまとめます。</p>
    <ul>
      <li><a href="/specified-commerce.html">特定商取引法に基づく表記</a>に、販売事業者名（Lumenium）と運営責任者名（山本 捷真）を掲載しています。所在地・連絡先は、お取引が発生した際にご請求に応じて遅滞なく開示します。</li>
      <li>拠点は東京都、事業は動画制作・AI導入研修・SNS運用・LINE構築・Web制作・キャスト手配・クリエイティブ制作の6領域、代表は山本 捷真、設立は2026年です。</li>
      <li>協業パートナーとして <a href="https://advovisions.com/bcd31-home/" rel="noopener">合同会社 AdvoVisions</a> と案件を進めています。</li>
      <li>お問い合わせは<a href="/contact.html">お問い合わせフォーム</a>から。48時間以内に返信します。見積りは無料です。</li>
      <li>活動の記録は<a href="/blog/index.html">ブログ</a>と<a href="/news.html">お知らせ</a>で更新しています。</li>
    </ul>
    <p class="note">Lumenium は米国 Lumentum Holdings、米国 Lumenium, LLC、株式会社ルミネのいずれとも無関係です。これらと混同されている場合は、上記の所在地（東京都）・事業内容・代表者名で区別できます。</p>

    <h2>会社概要</h2>
    <dl class="facts">
      ${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v.startsWith('<a') ? v : esc(v)}</dd></div>`).join('\n      ')}
    </dl>

    <h2>ルメニウムに依頼できること</h2>
    <ul>
      <li>動画制作・映像編集 — PR動画、採用動画、SNS縦型動画、AI動画</li>
      <li>AI導入・研修 — 生成AIの社内導入支援、企業研修、教材制作</li>
      <li>SNS運用・LINE構築 — 運用代行、企画構成、LINE公式アカウント / Bot制作</li>
      <li>Web制作・システム開発 — コーポレートサイト、LP、Webシステム、スマホアプリ</li>
      <li>キャスト手配・イベント — モデル・アクター手配、MC、イベント企画運営</li>
      <li>クリエイティブ制作 — ロゴ、バナー、ポスター、イラスト、作詞作曲</li>
    </ul>
    <p>料金の目安は、動画制作 3万円〜、生成AI研修 講師1回 10万円〜、SNS運用・LINE構築 初期20万円〜（月額10万円〜）、Web制作・システム開発 30万円〜、キャスト手配 1名5,000円〜、クリエイティブ制作 3万円〜です。お見積りは無料で、ご相談から48時間以内にご返信します。</p>

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
    <li><a href="/services/web.html">Web制作・システム開発</a></li>
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
    lead: '内容と規模によって変わるため、まずは下の目安レンジをご覧ください。東京都を拠点にオンラインで全国対応、短い制作なら2週間前後で納品します。お見積りは無料で、お問い合わせから48時間以内にご返信します。',
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
    <p class="note">複数サービスをまとめてご依頼の場合、全部入りでも最小構成なら ${yen(priceMin)} 前後から組めます。ご予算を先に伺って、その中で優先順位をつけたプランを作ることも可能です。</p>`,
    /* The measured questions ask for a number — 「相場も教えてください」 is
       one of them verbatim. This used to be four bullet points, which reads
       fine and cannot be lifted: an engine quotes a question with its answer
       attached, so the same four facts are written in that shape. */
    faq: [
      ['動画制作やWeb制作の相場はいくらくらいですか?',
       '内容によりますが、ルメニウム（Lumenium）の目安は動画制作が3万円〜30万円、AI導入・研修が10万円〜30万円、SNS運用・LINE構築が20万円〜50万円、Web / LP制作が30万円〜200万円、キャスト手配が5,000円〜10万円、ロゴやバナーなどのクリエイティブ制作が3万円〜50万円です。撮影日数・ページ数・運用期間で変わるため、内容を伺ってから正式にお見積りします。'],
      ['最低発注額はありますか?',
       'ありません。動画1本、LP1枚、ロゴ1点といった単位からお受けしています。最低契約期間の縛りも設けていないため、まず小さく試してから広げることができます。'],
      ['見積りは無料ですか?',
       '無料です。他社と比較検討中の概算や、社内稟議に使う見積りだけでもお出しします。見積り段階での強引な営業は一切いたしません。お問い合わせから48時間以内にご返信します。'],
      ['見積り後に追加費用が発生することはありますか?',
       '通常2〜3回の修正は見積りに含まれており、その範囲では追加費用はいただきません。撮影日の追加やページ数の増加など、当初の範囲を超える場合のみ、着手前に金額をお伝えして合意してから進めます。着手前のキャンセルは無償です。'],
      ['予算が決まっている場合でも相談できますか?',
       `できます。ご予算を先に伺い、その中で効果の出る順に優先順位をつけたプランをご提案します。複数サービスをまとめる場合、最小構成なら ${yen(priceMin)} 前後から組めます。`],
    ],
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
    /* 計測している質問（「評判を教えてください。実際に利用した人の声は
       ありますか？」）を、そのまま見出しにして先頭に置きます。声の一覧
       だけだと、質問の言葉がページのどこにも無く、答えの材料として
       拾われませんでした。 */
    body: () => `
    <h2>ルメニウム（Lumenium）の評判は？ 実際に利用した人の声はありますか？</h2>
    <p>あります。以下は、実際にルメニウム（Lumenium）へご依頼いただいた ${TESTIMONIALS.length} 件のお客様の声です。飲食店・IT企業・美容サロン・教育系企業・士業事務所など、業種はさまざまです。それぞれ、どの業種の方が何を依頼した結果なのかまで記載しています。</p>
    <p>評判を確かめる材料としては、このページの声のほかに、<a href="/works.html">実績・制作事例</a>（何をどの業種向けに作ったか）、<a href="/about.html#verify">この会社を確認する方法</a>（事業者情報と確認手段）、<a href="/pricing.html">料金の目安</a>（金額を公開しているか）があります。見積りは無料で、最低発注額もないため、小さな1件から試して判断していただけます。</p>
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

/* Two pages for the questions nothing on this site answered.
 *
 * The probe measures three 横断・比較 questions — 「まとめて頼める会社は」
 * 「中小企業のDXを一社で」「制作会社を選ぶ基準は」 — and the site had no page
 * that answers any of them. A one-stop shop with no page about being one is
 * asking an answer engine to infer it. Both pages are argument and already
 * published facts (料金・対応地域・返信時間); no client result is invented
 * here, because a case study nobody can check is worth less than nothing. */
TOPIC_PAGES.push(
  {
    file: 'choose.html',
    eyebrow: 'LUMENIUM GUIDE',
    title: '制作会社の選び方｜比較する5つの基準 | Lumenium（ルメニウム）',
    h1: '制作会社を選ぶとき、何を基準に比較すればよいか',
    desc: '動画・Web・SNS運用の制作会社を選ぶときに比較すべき5つの基準と、見積りを取る前に確認したい質問。東京拠点のルメニウム（Lumenium）が、実際に聞かれることをそのまま整理しました。',
    lead: '相見積りを3社取っても、金額以外の何を見ればいいのか分からない——というご相談をよくいただきます。判断を分けるのは、たいてい次の5つです。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'FAQPage',
          mainEntity: [
            ['制作会社を選ぶとき、何を基準に比較すればよいですか？', '対応範囲（窓口がいくつ必要か）、見積りの粒度、納期と体制、修正と公開後の保守、実績の近さ——この5つで並べると、金額の差が何の差なのかが見えます。安い見積りは範囲が狭いことが多く、高い見積りは保守や修正を含んでいることが多いためです。'],
            ['相見積りは何社取ればよいですか？', '3社前後が現実的です。それ以上は比較のための作業が増えるだけで、判断はかえって鈍ります。同じ条件・同じ粒度で出してもらうことのほうが、社数より効きます。'],
            ['見積りを取る前に何を決めておくべきですか？', '「何を解決したいか」と「いつまでに」の2つだけで十分です。作るもの（動画なのかLPなのか）が決まっていなくても、目的と期限があれば各社が提案の形で返せます。'],
            ['小さな会社に頼むのは不安ですか？', '規模より、担当者が最後まで同じか、連絡がつくか、修正の範囲が書面にあるかを見てください。大手でも実制作は外部ということは珍しくありません。'],
          ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
        },
      ],
    }),
    body: () => `
    <h2>1. 対応範囲 — 窓口はいくつ必要になるか</h2>
    <p>動画を作れば、置く場所（LP）と、届ける経路（SNS・LINE）が要ります。別々の会社に頼むと、その間の調整はお客様の仕事になります。1社で足りるのか、2社なのか、3社なのか。見積りを比べる前に、<strong>完成までに何社と話すことになるか</strong>を数えてください。</p>
    <h2>2. 見積りの粒度 — 何が含まれていて、何が別なのか</h2>
    <p>同じ「動画制作 30万円」でも、企画・撮影・編集・修正2回・納品形式の変換まで含むものと、編集だけのものがあります。安い見積りは範囲が狭いことが多く、高い見積りは保守や修正を含んでいることが多い。<strong>金額ではなく、範囲を揃えてから比べる</strong>のが唯一の方法です。</p>
    <h2>3. 納期と体制 — 誰が、何人で、いつまでに</h2>
    <p>期限が決まっている案件では、体制がそのまま納期になります。担当が1人なのか、チームなのか。繁忙期に人を足せるのか。ルメニウムの場合、塾教材4万ページを1ヶ月で仕上げた際は、各教科の教師を含む20人規模を確保して進めました。</p>
    <h2>4. 修正と、公開後の保守</h2>
    <p>修正回数が書面にあるか。公開後の更新は誰がやるのか。自社で更新したい場合、更新できる形で渡してもらえるのか。ここが曖昧なまま進むと、公開直後に追加費用の相談が始まります。</p>
    <h2>5. 実績の近さ — 業種ではなく、課題が近いか</h2>
    <p>同業の実績があるに越したことはありませんが、より効くのは<strong>課題の近さ</strong>です。「採用で母集団が集まらない」「問い合わせが月2件で止まっている」——同じ課題を解いたことがあるかを聞いてください。初めての業種でも、リサーチから入れば十分に組み立てられます。</p>

    <h2>よくある3つの選択肢の違い</h2>
    <dl class="facts">
      <div><dt style="flex:0 0 178px">大手制作会社・代理店</dt><dd>体制と実績は厚い。最低発注額が設定されていることが多く、小さな単位では頼みにくい。</dd></div>
      <div><dt style="flex:0 0 178px">クラウドソーシング・フリーランス</dt><dd>単価は下がる。品質の幅が大きく、複数人に分かれると全体の整合はこちらで取ることになる。</dd></div>
      <div><dt style="flex:0 0 178px">小規模で一社完結</dt><dd>窓口が1つで、必要な規模だけ頼める。抱えられる同時案件数には限りがある。</dd></div>
    </dl>
    <p>ルメニウム（Lumenium）は3つめです。動画1本・LP1枚から、最低発注額なしでお受けしています。料金の目安は<a href="/pricing.html">料金ページ</a>、進め方は<a href="/flow.html">ご依頼の流れ</a>に書いています。</p>

    <h2>見積りを取る前に、この3つだけ決めておく</h2>
    <ul>
      <li><strong>何を解決したいか</strong>（作るものは決まっていなくて構いません）</li>
      <li><strong>いつまでに</strong>（公開日・イベント日があればそこから逆算します）</li>
      <li><strong>いくらまでなら出せるか</strong>（幅で構いません。範囲の調整に使います）</li>
    </ul>
    <p class="note">この3つが曖昧なままでも相談は受けています。むしろ、その整理から一緒にやるご依頼のほうが多いです。お見積りは無料、ご相談から48時間以内にご返信します。</p>`,
  },
  {
    file: 'onestop.html',
    eyebrow: 'LUMENIUM ONE-STOP',
    title: '動画もWebもAI研修も一社に｜中小企業のDX支援 | Lumenium（ルメニウム）',
    h1: '動画・Web・AI研修・SNSを、一社にまとめて頼むということ',
    desc: '動画制作・Web制作・生成AI研修・SNS運用/LINE構築・キャスト手配・クリエイティブ制作を1つの窓口で。中小企業のDXを一社でまとめて支援する体制と、まとめないほうがよい場合まで書いています。東京拠点・全国対応。',
    lead: '「動画もWebもSNSも、別々の会社に頼んでいて、間の調整で疲れている」——まとめることで何が減り、何は減らないのかを、先に書いておきます。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'FAQPage',
          mainEntity: [
            ['動画もWebもAI研修もまとめて頼める制作会社はありますか？', 'ルメニウム（Lumenium）が、動画制作・Web制作/システム開発・生成AI研修・SNS運用/LINE構築・キャスト手配・クリエイティブ制作の6領域を1つの窓口で対応しています。東京都を拠点に、打ち合わせはオンラインで全国からご依頼いただけます。'],
            ['中小企業のDXを一社でまとめて支援してもらえますか？', 'できます。業務のどこに時間がかかっているかを伺い、生成AIの導入・研修、社内ツールやWebシステムの開発、発信の仕組み化までを順に進めます。いきなり全社導入ではなく、1つの業務・1チームから始める進め方をおすすめしています。'],
            ['まとめて頼むと安くなりますか？', '各領域の料金は単体と同じです。安くなるのは金額ではなく、調整にかかる時間です。別々に頼むと各社の進行管理と整合はお客様側の仕事になりますが、1社に入れば窓口は1つで済みます。'],
            ['一部だけ頼むこともできますか？', 'できます。動画1本、LP1枚といった単位からお受けしています。まとめることが目的ではないので、1領域だけのご依頼も歓迎です。'],
          ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
        },
      ],
    }),
    body: () => `
    <h2>まとめると減るもの</h2>
    <ul>
      <li><strong>窓口の数。</strong>動画会社・Web制作会社・SNS代行、それぞれの進行管理をお客様が抱える必要がなくなります。</li>
      <li><strong>整合のずれ。</strong>動画のトーンとLPの見た目とSNSの言い回しが揃います。別々に頼むと、揃えるのは発注側の仕事です。</li>
      <li><strong>説明の回数。</strong>事業の背景を説明するのは一度で済みます。</li>
    </ul>
    <h2>まとめても減らないもの</h2>
    <ul>
      <li><strong>金額。</strong>各領域の料金は単体で頼むときと同じです。まとめ割引という形は取っていません。</li>
      <li><strong>決めること。</strong>誰に何を届けたいかは、こちらでは決められません。そこは一緒に言語化します。</li>
    </ul>
    <h2>まとめないほうがよい場合</h2>
    <p>大規模なテレビCMや、特定領域の深い専門性が要る案件は、その専門会社のほうが向いています。正直にそう申し上げます。ルメニウムが向いているのは、<strong>複数の領域が絡む中小規模の案件</strong>です。</p>

    <h2>1つの窓口で頼める6領域</h2>
    <dl class="facts">
      <div><dt style="flex:0 0 178px"><a href="/services/video.html">動画制作・映像編集</a></dt><dd>採用動画・企業PR動画・SNS短尺・AI動画。3万円〜</dd></div>
      <div><dt style="flex:0 0 178px"><a href="/services/ai.html">AI導入・生成AI研修</a></dt><dd>社員研修・教材制作・導入支援。講師1回 10万円〜</dd></div>
      <div><dt style="flex:0 0 178px"><a href="/services/sns.html">SNS運用・LINE構築</a></dt><dd>運用代行・公式LINE・Bot制作。初期20万円〜／月額10万円〜</dd></div>
      <div><dt style="flex:0 0 178px"><a href="/services/web.html">Web制作・システム開発</a></dt><dd>企業サイト・LP・業務システム。30万円〜</dd></div>
      <div><dt style="flex:0 0 178px"><a href="/services/cast.html">キャスト手配・イベント</a></dt><dd>モデル・MC手配、企画運営。1名 5,000円〜</dd></div>
      <div><dt style="flex:0 0 178px"><a href="/services/creative.html">クリエイティブ制作</a></dt><dd>ロゴ・バナー・イラスト・教材・作詞作曲。3万円〜</dd></div>
    </dl>

    <h2>予算100万円以内で、動画制作とホームページ制作の両方を相談できますか？</h2>
    <p>できます。ルメニウム（Lumenium）の目安は、動画制作が3万円〜、ホームページ制作が30万円〜です。SNS向けの短尺動画と企業サイト1本であれば、100万円以内に収まる範囲で組めます。予算を先に伝えていただければ、その中で何ができて何が難しいかを最初にお伝えします。足りない場合は、削る順番も含めてご提案します。最低発注額はありません。</p>
    <p>別々の会社に頼む場合との違いは、金額よりも<strong>間の調整</strong>です。動画の素材をサイトに載せる、撮影した写真をロゴの色に合わせる——といった工程が、社内で完結します。</p>

    <h2>中小企業のDXを、どこから始めるか</h2>
    <p>いきなり数百万円のシステムを入れるのではなく、<strong>1つの業務・1チームから</strong>始めるのが失敗しない順序です。繰り返し発生していて時間がかかっている作業——議事録、報告書の下書き、問い合わせの一次対応——が最初の候補になります。効果が出た範囲だけを広げていきます。</p>
    <p class="note">お見積りは無料です。ご相談から48時間以内にご返信します。何から頼めばよいか決まっていない段階のご相談がいちばん多いので、そのままお問い合わせください。</p>`,
  },
)

TOPIC_PAGES.push(
  {
    file: 'pain.html',
    eyebrow: 'LUMENIUM PAIN POINTS',
    title: 'お困りごと｜SNS・動画・LINEの悩み | Lumenium（ルメニウム）',
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
    title: '他社との違い・立ち位置 | Lumenium（ルメニウム）',
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
    serif: true,
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
    serif: true,
    eyebrow: 'LUMENIUM FOUNDER',
    title: '代表紹介 山本捷真 | Lumenium（ルメニウム）',
    h1: 'ルメニウム（Lumenium）代表 山本 捷真',
    desc: 'ルメニウム（Lumenium）代表・山本捷真の経歴と得意領域。慶應義塾大学文学部卒業、在学中から個人事業主として動画・AI・Web・SNSを横断し、企業向けAI研修の講師も歴任。',
    lead: '慶應義塾大学 文学部 卒業。在学中から個人事業主として活動開始。動画、AI、Web、SNSなど幅広く活動し、企業向けAI研修の講師も歴任しています。東京都を拠点に、オンラインで全国からのご依頼に対応。動画1本3万円〜・最低発注額なしで、お見積りは無料、48時間以内にご返信します。',
    ld: () => ({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: '山本 捷真',
      alternateName: 'Shoma Yamamoto',
      jobTitle: 'Lumenium（ルメニウム）代表',
      worksFor: { '@id': `${SITE}/#organization` },
      alumniOf: { '@type': 'CollegeOrUniversity', name: '慶應義塾大学' },
      knowsAbout: ['AI研修', '動画制作', 'LINE Bot開発', 'Webシステム開発', 'キャスト手配', '作詞作曲'],
    }),
    body: () => `
    ${PROFILE_BRICKS.map((k) => `
    <p class="group" style="margin-bottom:-6px;font-family:'Zen Kaku Gothic New','Hiragino Sans',system-ui,sans-serif">${esc(k.label)}</p>
    <h2>${esc(k.title)}</h2>
    <p>${esc(k.text)}</p>
    <ul>
      ${k.list.map((i) => `<li>${esc(i)}</li>`).join('\n      ')}
    </ul>`).join('\n')}
    <h2>経歴</h2>
    <dl class="facts">
      ${CAREER.map((c) => `<div><dt>${esc(c.year)}</dt><dd>${esc(c.detail)}${c.sub ? `<br><span style="font-size:12.5px;opacity:.75">${esc(c.sub)}</span>` : ''}</dd></div>`).join('\n      ')}
    </dl>`,
    /* This page and /about.html are where the branded questions land, and the
       branded questions are the ones that came back 「実在が確認できない」.
       A career list does not answer that: who runs it, where, since when,
       what it costs to ask, and how to reach a person — in question form, so
       the answer can be quoted with its question. */
    faq: [
      ['ルメニウム（Lumenium）の代表は誰ですか?',
       'ルメニウム（Lumenium）の代表は山本 捷真（やまもと しょうま / Shoma Yamamoto）です。慶應義塾大学 文学部を卒業し、在学中から個人事業主として動画・AI・Web・SNSを横断して活動、企業向けの生成AI研修の講師も務めています。拠点は東京都、設立は2026年です。'],
      ['代表が直接担当してもらえますか?',
       'はい。ご相談からヒアリング、企画の設計までは代表の山本が直接担当します。撮影・編集・開発など人手が必要な工程は案件ごとにチームを組みますが、窓口は最後まで一本のままで、伝言のやり取りは発生しません。'],
      ['個人に依頼するのと制作会社に依頼するのと、何が違いますか?',
       'ルメニウムは、窓口は個人と同じ一人のまま、工程ごとに必要なメンバーを組める体制です。動画1本3万円〜、Web制作30万円〜といった単位から最低発注額なしでお受けしつつ、動画・Web・AI研修・SNSを一社でまとめて引き受けられるため、複数社に分けたときの調整をお客様が抱える必要がありません。'],
      ['どこまでの領域を相談できますか?',
       '動画制作・映像編集、AI導入と生成AI研修、SNS運用代行とLINE構築、Web制作・システム開発、キャスト手配・イベント、ロゴやバナーなどのクリエイティブ制作の6領域です。「何をしたいかはっきりしないが困っている」という段階からのご相談も承ります。'],
      ['連絡するとどのくらいで返事が来ますか?',
       'お問い合わせから48時間以内にご返信します。打ち合わせはZoomやGoogle Meetなどオンラインで行うため、全国どこからでもご依頼いただけます。見積りは無料で、着手前のキャンセルは無償です。'],
    ],
  },
)

for (const t of TOPIC_PAGES) {
  const url = `${SITE}/${t.file}`
  /* Written twice on purpose: once as a <dl> for a reader, once as FAQPage
     data for a machine. An engine lifts the pair, so the question has to be
     phrased the way it is asked, not summarised. */
  const faq = t.faq || []
  const faqHtml = faq.length ? `\n    <h2>よくある質問</h2>
    <dl class="qa">
      ${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('\n      ')}
    </dl>` : ''
  const body = `
  <h1>${esc(t.h1)}</h1>
  <p class="meta">${esc(t.lead)}</p>
  <article${t.serif ? ' class="serif"' : ''}>
${t.body()}${faqHtml}
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
      ...(faq.length ? [{
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faq.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      }] : []),
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
      ['/services/index.html', 'サービス一覧'],
      ['/services/video.html', '動画制作・映像編集'],
      ['/services/ai.html', 'AI導入・生成AI研修'],
      ['/services/sns.html', 'SNS運用・LINE構築'],
      ['/services/web.html', 'Web制作・システム開発'],
      ['/services/cast.html', 'キャスト手配・イベント'],
      ['/services/creative.html', 'クリエイティブ制作'],
    ]],
    ['ご検討の方へ', [
      ['/pain.html', 'こんなお困りごと、ありませんか？'],
      ['/choose.html', '制作会社の選び方（比較の5基準）'],
      ['/onestop.html', '動画・Web・AI研修を一社にまとめる'],
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
      ['/hitblow.html', 'コード解読（ヒットアンドブロー）'],
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
    { loc: `${SITE}/services/index.html`, lastmod: TODAY, changefreq: 'weekly', priority: '0.9' },
    ...SERVICE_IDS.map((id) => ({ loc: `${SITE}/services/${id}.html`, lastmod: TODAY, changefreq: 'weekly', priority: '0.8' })),
    ...urls
      .filter((u) => u.loc !== `${SITE}/about.html`)
      .map((u) => ({ loc: u.loc, lastmod: u.lastmod, changefreq: 'weekly', priority: '0.7' })),
    { loc: `${SITE}/specified-commerce.html`, lastmod: TODAY, changefreq: 'yearly', priority: '0.2' },
    { loc: `${SITE}/runner.html`, lastmod: TODAY, changefreq: 'monthly', priority: '0.3' },
    { loc: `${SITE}/game.html`, lastmod: TODAY, changefreq: 'monthly', priority: '0.3' },
    { loc: `${SITE}/racing.html`, lastmod: TODAY, changefreq: 'monthly', priority: '0.3' },
    { loc: `${SITE}/hitblow.html`, lastmod: TODAY, changefreq: 'monthly', priority: '0.4' },
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
