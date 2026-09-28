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

export function framePage(html, path = '') {
  const open = html.indexOf('<div class="wrap">')
  const footAt = html.indexOf('<footer>', open)
  const footEnd = html.indexOf('</footer>', footAt)
  const wrapEnd = html.indexOf('</div>', footEnd)
  if (open < 0 || footAt < 0 || footEnd < 0 || wrapEnd < 0) return html

  let inner = html.slice(open + '<div class="wrap">'.length, footAt)
  const footer = html.slice(footAt + '<footer>'.length, footEnd)

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
<footer class="site-ft"><div class="site-in">${footer}</div></footer>`

  return html.slice(0, open) + framed + html.slice(wrapEnd + '</div>'.length)
}
