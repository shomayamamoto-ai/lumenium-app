// 文章編集で付けられる書式の読み方。サイト（React）・静的ページ（scripts/）・
// 管理画面の見え方の3か所で、同じこのファイルを使います（画面用は
// scripts/build-markup.mjs が public/markup.js に写します）。
//
// 書式は文章の中の短い印で持ちます。値は文字のままなので、これまでどおり
// 文章編集の欄で読め、印の無い文章は前とまったく同じに出ます。
//
//   文の中:  **太字**  *斜体*  ***太字の斜体***  [リンクの文字](https://…)  改行
//   段落:    ## 見出し  ### 小見出し
//            - 箇条書き  1. 番号付き
//            | 表 | の行 |（2行目を |---|---| にすると1行目が見出しの行）
//            ![画像の説明](https://… または /img/…)
//
// 印以外はすべて文字として出します（HTML は書けません）。リンクと画像は、
// https・http・サイトの中（/ や #）・mailto・tel のものだけを通します。
//
// このファイルは import を持ちません（画面でも読むため）。

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ESC[c])
}

/** 通してよいリンク先か。だめなら ''。画像は https とサイトの中だけ。 */
export function safeUrl(u, img) {
  const s = String(u || '').trim()
  if (!s || /[\s<>"'`]/.test(s)) return ''
  if (img) return /^(https:\/\/|\/(?!\/))/i.test(s) ? s : ''
  return /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(s) ? s : ''
}

/* ---------------------------------------------------------------- 文の中 -- */

// [文字](url) / **太字** / *斜体*。斜体の * は、前後が空白でないものだけ
// （「※」や「5 * 3」のような * を斜体と取り違えないように）。
const INLINE = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*\*([^*\n]+?)\*\*\*|\*\*([^*\n]+?)\*\*|(?<![*\w])\*(?![\s*])([^*\n]+?)(?<!\s)\*(?![*\w])/g

/** 文の中の印を、部品の並びにします。
 *  [{ t:'text', v } | { t:'b'|'i', c:[…] } | { t:'a', href, c:[…] } | { t:'br' }] */
export function inlineTokens(text) {
  const out = []
  String(text == null ? '' : text).split('\n').forEach((line, li) => {
    if (li) out.push({ t: 'br' })
    let last = 0
    let m
    // 中身（太字の中のリンクなど）も同じ関数で読むので、印の探し方は呼ぶたびに作ります
    // （1つを使い回すと、内側の呼び出しが外側の読み位置を戻してしまいます）。
    const re = new RegExp(INLINE.source, 'g')
    while ((m = re.exec(line))) {
      if (m.index > last) out.push({ t: 'text', v: line.slice(last, m.index) })
      if (m[1] !== undefined) {
        const href = safeUrl(m[2])
        out.push(href ? { t: 'a', href, c: inlineTokens(m[1]) } : { t: 'text', v: m[1] })
      } else if (m[3] !== undefined) out.push({ t: 'b', c: [{ t: 'i', c: inlineTokens(m[3]) }] })
      else if (m[4] !== undefined) out.push({ t: 'b', c: inlineTokens(m[4]) })
      else out.push({ t: 'i', c: inlineTokens(m[5]) })
      last = m.index + m[0].length
    }
    if (last < line.length) out.push({ t: 'text', v: line.slice(last) })
  })
  return out
}

/** よそのサイトへのリンクは新しいタブで開きます。 */
export function isExternal(href) { return /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?lumenium\.net(\/|$)/i.test(href) }

function tokensHtml(list) {
  return list.map((k) => {
    if (k.t === 'text') return esc(k.v)
    if (k.t === 'br') return '<br>'
    if (k.t === 'b') return `<strong>${tokensHtml(k.c)}</strong>`
    if (k.t === 'i') return `<em>${tokensHtml(k.c)}</em>`
    return `<a href="${esc(k.href)}"${isExternal(k.href) ? ' target="_blank" rel="noopener"' : ''}>${tokensHtml(k.c)}</a>`
  }).join('')
}

/** 文の中の書式だけを HTML に（見出しや表は読まず、改行は <br>）。
 *  印の無い文章は esc() と同じものを返します。 */
export function inlineHtml(text) { return tokensHtml(inlineTokens(text)) }

/* ------------------------------------------------------------------ 段落 -- */

const H = /^(#{2,3})\s+(.+)$/
const UL = /^[-*]\s+(.+)$/
const OL = /^(\d{1,3})[.)．]\s*(.+)$/
const IMG = /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/
const ROW = /^\|(.*)\|?$/
const SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/

/** 段落の書式（見出し・箇条書き・番号・表・画像）が入っているか。 */
export function hasBlock(text) {
  return String(text == null ? '' : text).split('\n').some((raw) => {
    const l = raw.trim()
    return H.test(l) || /^[-*]\s+\S/.test(l) || OL.test(l) && /^\d{1,3}[.)．]\s/.test(l) || IMG.test(l) || (ROW.test(l) && l.length > 2)
  })
}

const cells = (l) => l.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())

/** 段落ごとの部品にします。
 *  perLine: 1行ずつ別の段落にする（ブログ記事の書き方）。false なら、続く行は改行でつなげて1段落。 */
export function blocks(text, perLine) {
  const lines = String(text == null ? '' : text).split('\n')
  const out = []
  let para = null
  const flush = () => { if (para) { out.push({ t: 'p', text: para.join('\n') }); para = null } }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (!l) { flush(); continue }
    let m
    if ((m = H.exec(l))) { flush(); out.push({ t: 'h', level: m[1].length, text: m[2] }); continue }
    if ((m = IMG.exec(l))) {
      flush()
      const src = safeUrl(m[2], true)
      out.push(src ? { t: 'img', src, alt: m[1] } : { t: 'p', text: m[1] })
      continue
    }
    if (ROW.test(l) && l.length > 2) {
      flush()
      const rows = []
      while (i < lines.length && ROW.test(lines[i].trim()) && lines[i].trim().length > 2) rows.push(lines[i++].trim())
      i--
      const head = rows.length > 1 && SEP.test(rows[1]) ? cells(rows[0]) : null
      const body = (head ? rows.slice(2) : rows).filter((r) => !SEP.test(r)).map(cells)
      out.push({ t: 'table', head, rows: body })
      continue
    }
    const um = UL.exec(l)
    const om = OL.exec(l)
    if ((um && /^[-*]\s/.test(l)) || (om && /^\d{1,3}[.)．]\s/.test(l))) {
      flush()
      const ordered = !um
      const items = []
      while (i < lines.length) {
        const x = lines[i].trim()
        const xm = ordered ? (/^\d{1,3}[.)．]\s/.test(x) && OL.exec(x)) : (/^[-*]\s/.test(x) && UL.exec(x))
        if (!xm) break
        items.push(ordered ? xm[2] : xm[1])
        i++
      }
      i--
      out.push({ t: ordered ? 'ol' : 'ul', items })
      continue
    }
    if (perLine) { flush(); out.push({ t: 'p', text: l }) } else (para = para || []).push(l)
  }
  flush()
  return out
}

/** 段落の書式まで HTML に。
 *  opts.h: いちばん上の見出し（##）を何番の見出しにするか（ブログ記事は 2、ほかの欄は 3）。
 *  opts.perLine: 1行ずつ段落に（ブログ記事）。 */
export function blockHtml(text, opts) {
  const o = opts || {}
  const base = o.h || 3
  return blocks(text, o.perLine).map((b) => {
    if (b.t === 'h') { const n = Math.min(6, base + b.level - 2); return `<h${n}>${inlineHtml(b.text)}</h${n}>` }
    if (b.t === 'ul' || b.t === 'ol') return `<${b.t}>${b.items.map((x) => `<li>${inlineHtml(x)}</li>`).join('')}</${b.t}>`
    if (b.t === 'img') return `<figure class="mk-img"><img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy" decoding="async">${b.alt ? `<figcaption>${esc(b.alt)}</figcaption>` : ''}</figure>`
    if (b.t === 'table') {
      return '<div class="mk-table"><table>' +
        (b.head ? `<thead><tr>${b.head.map((c) => `<th>${inlineHtml(c)}</th>`).join('')}</tr></thead>` : '') +
        `<tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    }
    return `<p>${inlineHtml(b.text)}</p>`
  }).join('\n')
}

/** 文章の中身だけ（検索結果の説明・構造化データ・読み上げの名前など、書式を出せない所に）。 */
export function plain(text) {
  return String(text == null ? '' : text)
    .split('\n')
    .map((raw) => {
      let l = raw.trim()
      if (SEP.test(l) && l.includes('-')) return null
      const im = IMG.exec(l)
      if (im) return im[1]
      if (ROW.test(l) && l.length > 2) l = cells(l).join(' / ')
      return l.replace(/^#{2,3}\s+/, '').replace(/^[-*]\s+/, '・')
    })
    .filter((l) => l !== null)
    .filter((l, i, a) => l || (i && a[i - 1]))
    .join('\n')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/(?<![*\w])\*(?![\s*])([^*\n]+?)(?<!\s)\*(?![*\w])/g, '$1')
    .trim()
}
