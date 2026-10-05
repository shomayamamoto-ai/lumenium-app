// ページごとの「検索結果の見え方」（タイトルと説明文）を、管理画面の文章編集
// から変えられるようにするための部品。build-content-pages.mjs と
// build-service-pages.mjs が、ページを書き出す直前に通します。
//
//   ・content.json の "seo": { "/pricing.html": { title, description } } があれば、
//     <title>・meta description・og:title・og:description をその文に替える
//   ・替える前の文（元の文）を public/seo-pages.json に一覧で残す。管理画面は
//     これを読んで「元の文」と「いまの文」を並べ、空にすれば元に戻ります
//
// 決まり（文字数）は src/lib/content-extra.js の checkSeo。決まりに合わない
// 指定は無視して、元の文のまま出します（手で壊したファイルでもビルドは通る）。
import { readFileSync, writeFileSync } from 'node:fs'
import { checkSeo } from '../src/lib/content-extra.js'

const FILE = 'public/seo-pages.json'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (s) => String(s ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

let SEO = {}
try {
  const c = JSON.parse(readFileSync('public/content.json', 'utf8'))
  if (c && c.seo && typeof c.seo === 'object') SEO = c.seo
} catch (_) { /* no overrides — every page keeps its own title */ }

const seen = {}

/** Record the page's own title/description, and put the admin's in their place. */
export function seoPage(path, html) {
  const s = String(html)
  const title = unesc((s.match(/<title>([^<]*)<\/title>/) || [, ''])[1])
  const description = unesc((s.match(/<meta name="description" content="([^"]*)">/) || [, ''])[1])
  const h1 = unesc(((s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1]).replace(/<[^>]+>/g, '').trim())
  seen[path] = { title, description, label: h1 || title }
  return applySeo(path, s, SEO[path])
}

/** The replacement itself (no recording), for one page and one setting. */
export function applySeo(path, s, o) {
  if (!o || checkSeo(path, o)) return s
  const t = String(o.title || '').trim()
  const d = String(o.description || '').trim()
  let out = s
  if (t) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(t)}</title>`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(t)}">`)
  }
  if (d) {
    out = out.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(d)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(d)}">`)
  }
  return out
}

/** Write the list of pages this script made, keeping the other script's.
 *  `mine(path)` says which entries belong to the caller. Unchanged → no write. */
export function saveSeoPages(mine) {
  let prev = {}
  let before = ''
  try { before = readFileSync(FILE, 'utf8'); prev = JSON.parse(before).pages || {} } catch (_) {}
  const pages = {}
  for (const [p, v] of Object.entries(prev)) if (!mine(p)) pages[p] = v
  Object.assign(pages, seen)
  const sorted = Object.fromEntries(Object.keys(pages).sort().map((k) => [k, pages[k]]))
  const text = JSON.stringify({
    note: '検索結果の見え方（文章編集の「ページのタイトルと説明」）の元の文。ビルドのたびに作り直します。',
    pages: sorted,
  }, null, 2) + '\n'
  if (text !== before) writeFileSync(FILE, text)
}
