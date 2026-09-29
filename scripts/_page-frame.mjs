// The frame every static page is laid out in (FAQ, 会社概要, サービス詳細,
// 料金, 実績, ブログ…). Both generators build a page as one narrow column;
// this turns it into a page that uses the screen it is on:
//
//   computer  the same header as the top page, a full-width title band,
//             the text on the left and, on the right, a sticky sidebar
//             with the page's contents and a contact box.
//   phone     one column, as before (the sidebar is left out: the page
//             already ends with the contact block).
//
import { SECTION } from '../src/data/text.js'

// It works on the finished HTML, so the page generators keep writing their
// content exactly as they do; only the frame around it changes.

const NAV = [
  ['/#services', 'できること'],
  ['/works.html', '実績'],
  ['/flow.html', 'ご依頼の流れ'],
  ['/faq.html', 'よくある質問'],
  ['/about.html', '会社概要'],
]

const LOGO = '<span class="wm"><span class="wm-t">Lumen</span><span class="wm-iw"><span class="wm-t wm-i">i</span></span><span class="wm-t">um</span></span>'

const stripTags = (s) => s.replace(/<[^>]+>/g, '').trim()
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Admin-editable copy markers: "**bold**" and "\n".
const copy = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')

/* The footer, the same as the top page's: brand and a short note on the
   left, three columns of links. The note reads the admin-editable copy
   (text.js › footer), so an edit reaches every page. */
const FOOT_COLS = [
  ['サービス', [
    ['/services/web.html', 'Web制作・システム開発'],
    ['/services/ai.html', 'AI研修・AI導入支援'],
    ['/services/video.html', '動画制作・映像編集'],
    ['/services/sns.html', 'SNS運用・LINE構築'],
    ['/services/cast.html', 'キャスト手配・イベント'],
    ['/services/creative.html', 'クリエイティブ制作'],
  ]],
  ['情報', [
    ['/pricing.html', '料金'],
    ['/works.html', '実績'],
    ['/voice.html', 'お客様の声'],
    ['/flow.html', 'ご依頼の流れ'],
    ['/faq.html', 'よくある質問'],
    ['/blog/index.html', 'ブログ'],
    ['/news.html', 'お知らせ'],
    ['/profile.html', '代表紹介'],
    ['/about.html', '会社概要（Lumeniumとは）'],
  ]],
  ['その他', [
    ['/#contact', 'お問い合わせ'],
    ['https://advovisions.com/bcd31-home/', 'AdvoVisions ↗'],
    ['/choose.html', '制作会社の選び方'],
    ['/game.html', 'ミニゲーム'],
    ['/sitemap.html', 'サイトマップ'],
  ]],
]
/* 「次に読む」。アクセス解析で、ページを1つ見て帰る人が多かった（トップで
   7割）ため、読み終えたところに次の行き先を3つ置きます。主力（Web制作・
   システム開発、AI研修）と、判断に必要な実績・料金へつなぎます。 */
const PAGES = {
  '/services/web.html': ['Web制作・システム開発', 'サイト・LP・業務システム。公開後も自分たちで回せる管理画面つき。'],
  '/services/ai.html': ['AI研修・AI導入支援', '社員向けの生成AI研修と、業務へのAI導入の支援。'],
  '/works.html': ['実績', 'これまでに手がけた仕事と主な事例。'],
  '/pricing.html': ['料金', 'サービスごとの料金の目安。'],
  '/flow.html': ['ご依頼の流れ', 'ご相談から納品・運用まで、5つのステップ。'],
  '/faq.html': ['よくある質問', '料金・納期・進め方についての質問と答え。'],
  '/blog/index.html': ['ブログ', 'Web・AI・SNS の実務に役立つ記事。'],
}
const NEXT = [
  [/^\/services\/web/, ['/works.html', '/services/ai.html', '/pricing.html']],
  [/^\/services\/ai/, ['/services/web.html', '/works.html', '/pricing.html']],
  [/^\/services\//, ['/services/web.html', '/services/ai.html', '/works.html']],
  [/^\/works/, ['/services/web.html', '/services/ai.html', '/pricing.html']],
  [/^\/pricing/, ['/services/web.html', '/services/ai.html', '/flow.html']],
  [/^\/(faq|flow)/, ['/pricing.html', '/works.html', '/services/web.html']],
  [/^\/blog\//, ['/services/web.html', '/services/ai.html', '/blog/index.html']],
  [/.*/, ['/services/web.html', '/services/ai.html', '/works.html']],
]
function nextReads(path) {
  const list = (NEXT.find(([re]) => re.test(path)) || NEXT[NEXT.length - 1])[1]
    .filter((h) => h !== path).slice(0, 3)
  if (!list.length) return ''
  return `
  <nav class="next-read" aria-label="次に読む">
    <p class="next-read-h">次に読む</p>
    <div class="next-read-grid">${list.map((h) => `
      <a href="${h}"><span class="nr-t">${PAGES[h][0]} →</span><span class="nr-d">${PAGES[h][1]}</span></a>`).join('')}
    </div>
  </nav>`
}

function siteFooter() {
  const f = SECTION.footer || {}
  const cols = FOOT_COLS.map(([h, links]) => `
    <div class="ft-col"><p class="ft-h">${h}</p>${links.map(([href, label]) =>
      `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`).join('')}</div>`).join('')
  return `<footer class="site-ft">
  <div class="site-in ft-grid">
    <div class="ft-brand">
      <a class="ft-logo" href="/" aria-label="Lumenium（ルメニウム）トップへ"><img src="/lumenium-logo.svg?v=3" alt="" width="40" height="40"><span class="ft-name">${LOGO}<small>${esc((SECTION.home && SECTION.home.yomi) || 'ルメニウム')}</small></span></a>
      ${f.tagline ? `<p class="ft-tag">${copy(f.tagline)}</p>` : ''}
      ${f.sub ? `<p class="ft-sub">${copy(f.sub)}</p>` : ''}
      <dl class="ft-facts"><div><dt>ご相談</dt><dd><a href="/#contact">お問い合わせフォーム →</a></dd></div>${f.base ? `<div><dt>拠点</dt><dd>${esc(f.base)}</dd></div>` : ''}</dl>
    </div>${cols}
  </div>
  <div class="site-in ft-bottom">
    <span>© ${new Date().getFullYear()} Lumenium（ルメニウム）. All rights reserved.</span>
    <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
    <a href="/#contact">お問い合わせ</a>
  </div>
</footer>`
}

export function framePage(html, path = '') {
  const open = html.indexOf('<div class="wrap">')
  const footAt = html.indexOf('<footer>', open)
  const footEnd = html.indexOf('</footer>', footAt)
  const wrapEnd = html.indexOf('</div>', footEnd)
  if (open < 0 || footAt < 0 || footEnd < 0 || wrapEnd < 0) return html

  let inner = html.slice(open + '<div class="wrap">'.length, footAt)

  // 次に読む: ページの終わりの相談案内の手前に置きます。
  const nr = nextReads(path)
  if (nr) {
    const at = inner.indexOf('<section class="contact-strip"')
    inner = at >= 0 ? inner.slice(0, at) + nr + '\n' + inner.slice(at) : inner + nr
  }

  // The old brand bar is replaced by the site header.
  inner = inner.replace(/\s*<header class="brandbar">[\s\S]*?<\/header>/, '')

  // Title band: the eyebrow, the h1 and the lead line under it.
  let head = ''
  const eb = inner.match(/\s*<p class="eyebrow">[\s\S]*?<\/p>/)
  if (eb) { head += eb[0].trim(); inner = inner.replace(eb[0], '') }
  const h1 = inner.match(/\s*<h1[\s\S]*?<\/h1>/)
  if (h1) {
    head += '\n    ' + h1[0].trim()
    const after = inner.slice(inner.indexOf(h1[0]) + h1[0].length)
    const lead = after.match(/^\s*<p class="(?:meta|lead)"[^>]*>[\s\S]*?<\/p>/)
    inner = inner.replace(h1[0], '')
    if (lead) { head += '\n    ' + lead[0].trim(); inner = inner.replace(lead[0], '') }
  }

  // Contents: the section headings outside the collapsed reference blocks.
  const toc = []
  const closed = []
  inner.replace(/<details[\s\S]*?<\/details>/g, (m, at) => { closed.push([at, at + m.length]); return m })
  const inClosed = (at) => closed.some(([a, b]) => at >= a && at < b)
  let n = 0
  inner = inner.replace(/<(h2|p class="group")([^>]*)>([\s\S]*?)<\/(h2|p)>/g, (m, tag, attrs, text, close, at) => {
    if (inClosed(at)) return m
    const label = stripTags(text)
    if (!label) return m
    const idm = attrs.match(/\sid="([^"]+)"/)
    const id = idm ? idm[1] : `s${++n}`
    toc.push([id, label])
    return idm ? m : `<${tag}${attrs} id="${id}">${text}</${close}>`
  })

  const nav = NAV.map(([href, label]) =>
    `<a href="${href}"${path && href === path ? ' aria-current="page"' : ''}>${label}</a>`).join('')

  const side = `
    <aside class="page-side" aria-label="このページについて">
      ${toc.length >= 2 ? `<nav class="side-toc" aria-label="このページの内容">
        <p class="side-title">このページの内容</p>
        <ol>${toc.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join('')}</ol>
      </nav>` : ''}
      <div class="side-cta">
        <p class="side-title">ご相談は無料です</p>
        <p>何を作るか決まっていない段階でも大丈夫です。48時間以内にご返信します。</p>
        <a class="side-btn" href="/#contact">無料で相談する</a>
      </div>
    </aside>`

  const framed = `<header class="site-hd"><div class="site-in site-hd-in">
  <a class="site-logo" href="/" aria-label="Lumenium（ルメニウム）トップへ"><img src="/lumenium-logo.svg?v=3" alt="" width="30" height="30">${LOGO}</a>
  <nav class="site-nav" aria-label="メインナビゲーション">${nav}</nav>
  <a class="site-cta" href="/#contact">無料で相談する</a>
</div></header>
<section class="page-head"><div class="site-in">
    ${head}
</div></section>
<div class="site-in page-grid">
  <main class="page-main">
${inner.trim()}
  </main>${side}
</div>
${siteFooter()}`

  return html.slice(0, open) + framed + html.slice(wrapEnd + '</div>'.length)
}
