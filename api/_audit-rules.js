// What an answer engine needs from a page, expressed as checks over its HTML.
//
// Split out of site-audit.js so the same rules can be run offline against the
// built files as well as over the live site — a rule that only exists inside
// an edge function can only be tested by deploying it.
//
// The checks are in three layers, and they answer different questions:
//
//   1. ページ単体   — does this page carry the parts an engine lifts?
//      (説明文・FAQ・会社情報・金額…)  This layer was already here.
//   2. 質問との距離 — does the page use the words of the question it is
//      supposed to answer, and does it answer in the first screen?
//      A page can pass every check in layer 1 and still have nothing to do
//      with the question it was nominated for, which is how 「FAQ あり」 and
//      「出現率 0%」 sat next to each other on the same screen.
//   3. サイト全体   — duplicate titles, pages nothing links to, slow pages.
//      These are invisible from inside a single page, and they are the
//      reasons a page that is fine never gets read.
//   4. 検索に載る条件 — canonical, noindex vs. the sitemap, broken links,
//      structured data that does not parse or says what the page does not.
//      These are the ones that can keep a page out of search entirely, so
//      they are reported as 「必ず直す」 (auditSite, at the end).
//
// Everything about a page's content is measured on its own content: inside
// <main>, without the header, menus, footer and side panels, and without the
// blocks that every page repeats (finalize). Measured on the whole HTML,
// every page 「had」 a region and a price because the footer did.

import { QUESTIONS } from './_aio-catalog.js'
import { BRAND } from './_brand.js'

export const SITE = BRAND.url

export const strip = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** Every @type in the page's JSON-LD, however deeply nested. */
export function typesIn(html) {
  const out = new Set()
  for (const { value: parsed } of jsonLd(html)) {
    if (parsed === undefined) continue
    const walk = (o) => {
      if (!o || typeof o !== 'object') return
      if (o['@type']) [].concat(o['@type']).forEach((t) => out.add(String(t)))
      for (const v of Object.values(o)) {
        if (Array.isArray(v)) v.forEach(walk)
        else if (v && typeof v === 'object') walk(v)
      }
    }
    ;[].concat(parsed).forEach(walk)
  }
  return out
}

/** The questions a page states in its FAQ data — the text an engine can quote
 *  with its answer attached. */
export function faqQuestions(html) {
  const out = []
  for (const m of String(html).matchAll(/"@type"\s*:\s*"Question"\s*,\s*"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    try { out.push(JSON.parse(`"${m[1]}"`)) } catch (_) { out.push(m[1]) }
  }
  return out
}

/** What a page is for, which decides what it is missing. A blog post with no
 *  price list is not a defect; a service page with no price is the whole
 *  reason the measured questions go to somebody else. */
export function kindOf(path) {
  if (/^\/services\/[a-z]+\.html$/.test(path)) return 'service'
  if (path === '/' || /^\/(pricing|about|profile|services\/index)\.html$/.test(path)) return 'sales'
  if (/^\/(works|voice|story|pain|positioning|flow|faq)\.html$/.test(path)) return 'article'
  if (/^\/blog\//.test(path)) return 'article'
  return 'support'
}

export const WANTED = {
  service: ['説明文', 'タイトルの長さ', '見出しH1', 'FAQ', '会社情報', 'パンくず', '更新日', '金額', '対応地域', '本文量', '計測タグ'],
  sales: ['説明文', 'タイトルの長さ', '見出しH1', 'FAQ', '会社情報', 'パンくず', '更新日', '金額', '対応地域', '本文量', '計測タグ'],
  article: ['説明文', 'タイトルの長さ', '見出しH1', '会社情報', 'パンくず', '更新日', '本文量', '計測タグ'],
  support: ['説明文', 'タイトルの長さ', '見出しH1', '会社情報', '更新日', '計測タグ'],
}

/* ---- 質問とページの距離 ---------------------------------------------- */

/* Words that are in every question and on every page, so counting them tells
   us nothing about whether this page answers this question. */
const STOP = new Set([
  '会社', '企業', '教え', '相談', '依頼', '場合', '方法', '内容', '対応', '可能',
  '一社', '制作会社', '中小企業', '日本', '公式', '公式サイト',
])

/** Runs of kanji / katakana / latin — Japanese content words, with the
 *  grammar between them thrown away. */
const tokens = (text) => String(text)
  .split(/[^一-鿿々゠-ヿｦ-ﾟA-Za-z0-9ー]+/)
  .map((t) => t.trim())
  .filter((t) => t.length >= 2)

/** A phrase, as the set of two-character pieces it is made of.
 *
 *  Compared piece by piece rather than whole because 「動画制作会社」 and a
 *  page saying 「動画制作」「会社」 are the same subject, and an exact-phrase
 *  test would call that a miss and send someone to rewrite a page that is
 *  already right. Latin words are kept whole — SNS split into SN and NS is
 *  not a word in anything. */
function grams(text, skipStop = true) {
  const out = new Set()
  for (const t of tokens(text)) {
    if (skipStop && STOP.has(t)) continue
    if (/^[A-Za-z0-9ー]+$/.test(t)) { out.add(t.toLowerCase()); continue }
    if (t.length === 2) { out.add(t); continue }
    for (let i = 0; i + 2 <= t.length; i++) out.add(t.slice(i, i + 2))
  }
  return out
}

const share = (want, have) => {
  if (!want.size) return 1
  let n = 0
  for (const g of want) if (have.has(g)) n++
  return n / want.size
}

/** How close this page gets to a question, in two numbers.
 *
 *  `head` is the best single heading — the most question-shaped line on the
 *  page — not the union of all of them. Measured against the union, a page
 *  with thirty headings scores full marks on every question by accident: the
 *  words are all somewhere, spread across sections that each answer something
 *  else, and every row read 100% whatever the page said. An engine quotes one
 *  passage, so the thing worth measuring is the best one.
 *
 *  `body` is whether the words appear on the page at all. Word overlap, not
 *  meaning — the report says so, because a number that looks like
 *  comprehension and is not would be worse than none. */
export function questionFit(page, question) {
  const want = grams(question)
  let head = 0
  for (const line of page.headLines || []) {
    const s = share(want, grams(line, false))
    if (s > head) head = s
  }
  return {
    head: Math.round(head * 100),
    body: Math.round(share(want, page.bodyGrams) * 100),
  }
}


/* ---- HTMLの読み取り ----------------------------------------------------
   Attribute order and quoting are not fixed — this site writes some tags
   content-first, some generators single-quote, minifiers drop quotes — so
   tags are read into an attribute map instead of matched as one string. */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export const decode = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
  }
  return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m
})

/** <tag a="1" b='2' c=3 d> → { a: '1', b: '2', c: '3', d: '' } (names lowercased). */
export function attrs(tag) {
  const out = {}
  const inner = String(tag).replace(/^<[a-z0-9-]+/i, '').replace(/\/?>$/, '')
  for (const m of inner.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = decode(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '')
  }
  return out
}

const tags = (html, name) => [...String(html).matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => attrs(m[0]))

/** The content of <meta name|property="key">, or null when the tag is absent. */
export function metaContent(html, key) {
  const k = key.toLowerCase()
  const m = tags(html, 'meta').find((a) => (a.name || a.property || '').toLowerCase() === k)
  return m ? String(m.content || '').trim() : null
}

/** Every JSON-LD block: { value } when it parses, { error } when it does not. */
export function jsonLd(html) {
  const out = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  for (const m of String(html).matchAll(re)) {
    if (!/application\/ld\+json/i.test(attrs('<s ' + m[1] + '>').type || '')) continue
    const text = m[2].trim().replace(/^<!--|-->$/g, '')
    try { out.push({ value: JSON.parse(text) }) } catch (e) { out.push({ error: String(e.message || e).slice(0, 80) }) }
  }
  return out
}

/** The nodes a JSON-LD block describes at the top level (its @graph members,
 *  or itself). Nested objects (an author, an offer) are parts of a node, not
 *  nodes, and are not held to the required-property rules. */
const topNodes = (value) => [].concat(value).flatMap((v) => (v && Array.isArray(v['@graph']) ? v['@graph'] : [v])).filter((v) => v && typeof v === 'object')

const typesOf = (node) => [].concat(node['@type'] || []).map(String)

/* The parts of a page that are the same on every page — header, menus,
   footer, side panels — are not what the page says. Measured with them, the
   opening of every page was the menu, and every page had the same 「東京」. */
const CHROME = /<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const NOT_TEXT = /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

/** The page's own content: inside <main> when there is one, without the
 *  header, menus, footer and side panels. */
export function contentHtml(html) {
  let s = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(NOT_TEXT, ' ')
  const main = s.match(/<main\b[^>]*>([\s\S]*)<\/main\s*>/i)
  if (main) s = main[1]
  else { const b = s.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i); if (b) s = b[1] }
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(CHROME, ' ') }
  return s
}

const BLOCK = /<\/?(p|div|section|article|li|ul|ol|dl|dt|dd|h[1-6]|tr|td|th|table|br|blockquote|figure|figcaption|details|summary|form|label|button)\b[^>]*>/gi

/** Content as a list of text blocks (paragraphs, list items, headings…), so
 *  the blocks repeated on every page can be told apart and set aside. */
export function textBlocks(html) {
  return decode(String(html).replace(BLOCK, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 2)
}

/** For "is this sentence on the page": no spaces, no punctuation, no
 *  emphasis marks — a question rendered with a line break or in bold is
 *  still the same question. */
const squash = (s) => String(s).replace(/[\s　、。，．,.!?！？「」『』（）()［］[\]・:：\-–—〜~'"“”‘’*＊_]/g, '').toLowerCase()

/* ---- ページ単体 --------------------------------------------------------- */

/* The four things every measured question ends up asking for. An answer
   engine quotes the top of a page; a price that only appears in the footer is
   a price it will not find.
   金額 is a number followed by 円 (「5万円」「¥30,000」), not any 円 — 「円滑」
   and 「円形」 are not prices. */
const PRICE = /([0-9０-９][0-9０-９,，.．]*\s*(万|千|億)?\s*円|[¥￥]\s*[0-9０-９])/
const LEAD_FACTS = [
  { id: '金額', re: PRICE },
  { id: '地域', re: /(東京|全国|オンライン|関東|都内)/ },
  { id: '期間', re: /([0-9０-９]+\s*(日|週間|週|ヶ月|か月|カ月|ヵ月)|即日|最短)/ },
  { id: '連絡', re: /(問い合わせ|問合せ|ご相談|無料相談|見積)/ },
]
const LEAD_CHARS = 500

const REQUIRED = {
  Article: ['headline', 'datePublished', 'author'],
  BlogPosting: ['headline', 'datePublished', 'author'],
  NewsArticle: ['headline', 'datePublished', 'author'],
  Service: ['name', 'provider'],
  Organization: ['name', 'url'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
}
const present = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length)

/** One page, read the way a crawler would.
 *  `extra`: { ms, url (the address it was fetched from), xRobots (header) }.
 *  Facts that depend on the other pages (what is boilerplate, so how long the
 *  page's own text is) are filled in by finalize(). */
export function extract(path, html, extra = {}) {
  html = String(html)
  const body = strip(html)
  const lds = jsonLd(html)
  const types = typesIn(html)
  const desc = metaContent(html, 'description') || ''
  const title = decode(strip((html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i) || [, ''])[1]))
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map((m) => strip(m[1]))
  const heads = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((m) => decode(strip(m[2])))
  const dts = [...html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt\s*>/gi)].map((m) => decode(strip(m[1])))
  const faqs = faqQuestions(html)
  const kind = kindOf(path)
  const base = extra.url || SITE + path

  // Links, as paths on this site. Absolute links to the public address count
  // as internal too (the generators write some that way).
  const hosts = new Set([new URL(SITE).host, new URL(base).host])
  const links = []
  for (const a of tags(html, 'a')) {
    if (!a.href || /^(mailto|tel|javascript|data):/i.test(a.href)) continue
    let u
    try { u = new URL(a.href, base) } catch (_) { continue }
    if (!/^https?:$/.test(u.protocol) || !hosts.has(u.host)) continue
    links.push(u.pathname)
  }

  const robots = tags(html, 'meta').filter((a) => /^(robots|googlebot)$/i.test(a.name || '')).map((a) => a.content || '').join(',')
  const noindexRe = /(^|[\s,])(noindex|none)([\s,]|$)/i
  const canonicals = tags(html, 'link').filter((a) => /(^|\s)canonical(\s|$)/i.test(a.rel || '')).map((a) => String(a.href || '').trim())

  // Heading order inside the page's own content: a level skipped on the way
  // down (h2 → h4) leaves a reader of the outline with a missing step.
  const region = contentHtml(html)
  let skip = null
  {
    let prev = 0
    for (const m of region.matchAll(/<h([1-6])\b/gi)) {
      const lv = Number(m[1])
      if (prev && lv > prev + 1 && !skip) skip = `h${prev} の次に h${lv}`
      prev = lv
    }
  }
  const imgs = tags(html, 'img')
  const noAlt = imgs.filter((a) => !('alt' in a))
  const afterH1 = (() => { const i = region.search(/<\/h1\s*>/i); return i < 0 ? region : region.slice(i) })()

  const found = {
    '説明文': desc.length >= 60 && desc.length <= 160,
    'タイトルの長さ': title.length >= 15 && title.length <= 62,
    '見出しH1': h1s.length === 1,
    'FAQ': types.has('FAQPage'),
    '会社情報': ['Organization', 'ProfessionalService', 'LocalBusiness'].some((t) => types.has(t)),
    'パンくず': types.has('BreadcrumbList'),
    '更新日': /dateModified|datePublished|最終更新/.test(html),
    // The home page is the app: its beacon is in the bundle, not in the HTML,
    // and it was verified firing. Flagging it here would be a false alarm.
    // The beacon now posts to /api/p (a name content blockers do not list);
    // pages still cached from before post to /api/track. Either is the tag.
    '計測タグ': path === '/' ? true : /\/api\/(track|p)\b/.test(html),
  }

  // Structured data, held to what Google needs to use it at all.
  const ldErrors = lds.filter((x) => x.error).map((x) => x.error)
  const ldMissing = []
  const faqData = []
  for (const x of lds) {
    if (x.error) continue
    for (const node of topNodes(x.value)) {
      for (const t of typesOf(node)) {
        const need = REQUIRED[t]
        if (!need) continue
        const lack = need.filter((k) => !present(node[k]))
        if (lack.length) ldMissing.push(`${t}: ${lack.join('・')}`)
        if (t === 'FAQPage') {
          for (const q of [].concat(node.mainEntity || [])) {
            const a = q && q.acceptedAnswer && [].concat(q.acceptedAnswer)[0]
            faqData.push({ q: strip(String((q && q.name) || '')), a: strip(String((a && a.text) || '')) })
          }
        }
      }
    }
  }
  const shown = squash(decode(strip(String(html).replace(/<head\b[\s\S]*?<\/head\s*>/i, ' ').replace(NOT_TEXT, ' '))))
  const faqHidden = faqData
    .filter((f) => !f.q || !f.a || !shown.includes(squash(f.q)) || !shown.includes(squash(f.a).slice(0, 60)))
    .map((f) => f.q || '（質問文が空）')

  return {
    url: path,
    kind,
    // 外の面と同じ会社だと示す対応表があるか。1ページでも入っていれば、
    // 全ページに入る作りになっています。
    hasSameAs: /"sameAs"\s*:/.test(html),
    chars: body.length,
    desc: desc.length,
    descText: desc,
    title,
    ms: extra.ms || 0,
    links: [...new Set(links)],
    headings: heads.slice(0, 40),
    faqCount: faqs.length,
    noindex: noindexRe.test(robots) || noindexRe.test(extra.xRobots || ''),
    canonicals,
    og: { title: metaContent(html, 'og:title'), description: metaContent(html, 'og:description'), image: metaContent(html, 'og:image') },
    headingSkip: skip,
    imgCount: imgs.length,
    noAlt: noAlt.length,
    noAltSample: noAlt.slice(0, 2).map((a) => a.src || '').filter(Boolean),
    ldErrors,
    ldMissing: [...new Set(ldMissing)],
    faqHidden: faqHidden.slice(0, 3),
    faqHiddenCount: faqHidden.length,
    // Filled in by finalize(); until then, the whole content counts.
    missing: [],
    leadFacts: [],
    leadMissing: [],
    // Kept out of the JSON response — only the joins use these, and some of
    // them are Sets. site-audit drops them before answering.
    found,
    blocks: textBlocks(region),
    leadBlocks: textBlocks(afterH1),
    // The lines a question could be asked in: headings, FAQ questions, the
    // terms of a definition list, and the page's own title and snippet.
    headLines: [...heads, ...dts, ...faqs, title, desc].filter(Boolean),
    bodyGrams: grams(body),
  }
}

/** Short pieces of a text, sampled (about 1 in 4, chosen by hash so two
 *  pages sample the same pieces) — enough to compare two pages' wording
 *  without holding every piece of every page. */
function shingles(text) {
  const s = String(text).replace(/\s+/g, '')
  const out = new Set()
  for (let i = 0; i + 5 <= s.length; i++) {
    let h = 0x811c9dc5
    for (let j = i; j < i + 5; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 0x01000193) >>> 0 }
    if ((h & 3) === 0) out.add(h)
  }
  return out
}

const jaccard = (a, b) => {
  let n = 0
  const [small, big] = a.size < b.size ? [a, b] : [b, a]
  for (const x of small) if (big.has(x)) n++
  return n / (a.size + b.size - n || 1)
}

/** The facts that need the other pages: what is site-wide boilerplate (a
 *  block that appears on 80% or more of the pages — the contact strip, the
 *  「東京都を拠点に…」 line), and with it set aside, how long each page's own
 *  text is, whether its own text names a price and a region, and what its
 *  opening says. Without this, every page passed 「対応地域」 on the strength
 *  of one line every page carries. */
export function finalize(pages) {
  const ok = pages.filter((p) => !p.error && !p.excluded)
  const seen = new Map()
  for (const p of ok) for (const b of new Set(p.blocks)) seen.set(b, (seen.get(b) || 0) + 1)
  const cut = ok.length >= 5 ? Math.ceil(ok.length * 0.8) : Infinity
  const boiler = new Set([...seen].filter(([, n]) => n >= cut).map(([b]) => b))
  for (const p of ok) {
    const own = p.blocks.filter((b) => !boiler.has(b)).join('\n')
    const lead = p.leadBlocks.filter((b) => !boiler.has(b)).join(' ').slice(0, LEAD_CHARS)
    p.chars = own.replace(/\s+/g, '').length
    p.found['金額'] = PRICE.test(own)
    p.found['対応地域'] = /(東京|全国|オンライン)/.test(own)
    p.found['本文量'] = p.chars >= 1000
    p.missing = WANTED[p.kind].filter((k) => !p.found[k])
    // 冒頭で答えているか: which of the four facts appear in the first screen
    // after the page's own h1.
    p.leadFacts = LEAD_FACTS.filter((f) => f.re.test(lead)).map((f) => f.id)
    p.leadMissing = LEAD_FACTS.filter((f) => !f.re.test(lead)).map((f) => f.id)
    p.shingles = p.chars >= 200 ? shingles(own) : null
  }
  return { boilerplate: boiler.size }
}

/* ---- サイト全体 ------------------------------------------------------- */

/** The defects that only exist between pages. */
export function crossCheck(pages) {
  const ok = pages.filter((p) => !p.error && !p.excluded)

  const group = (key) => {
    const m = new Map()
    for (const p of ok) {
      const v = String(p[key] || '').trim()
      if (!v) continue
      if (!m.has(v)) m.set(v, [])
      m.get(v).push(p.url)
    }
    return [...m.entries()].filter(([, urls]) => urls.length > 1).map(([value, urls]) => ({ value, urls }))
  }

  // Which pages are linked from somewhere else. A page nothing links to is
  // reachable only through the sitemap, and an answer engine following links
  // will never arrive at it.
  const linked = new Set()
  for (const p of ok) for (const l of p.links || []) if (l !== p.url) linked.add(l.replace(/\/$/, '') || '/')
  const orphans = ok
    .filter((p) => p.url !== '/' && !linked.has(p.url.replace(/\/$/, '')))
    .map((p) => p.url)

  const slow = ok.filter((p) => p.ms > 1200).map((p) => ({ url: p.url, ms: p.ms })).sort((a, b) => b.ms - a.ms)

  // Pages whose own text is nearly the same: two pages competing for one
  // search, and neither of them the clear answer.
  const nearDuplicates = []
  const withText = ok.filter((p) => p.shingles && p.shingles.size >= 40)
  for (let i = 0; i < withText.length; i++) {
    for (let j = i + 1; j < withText.length; j++) {
      const s = jaccard(withText[i].shingles, withText[j].shingles)
      if (s >= 0.8) nearDuplicates.push({ urls: [withText[i].url, withText[j].url], share: Math.round(s * 100) })
    }
  }

  return {
    // 公式プロフィールが1つも登録されていない状態。AIO計測で
    // 「実在が確認できない」と返ってくる質問がある限り、これが最初の一手に
    // なります（自社サイトだけが情報源の会社は、裏が取れない）。
    noProfiles: ok.length > 0 && !ok.some((p) => p.hasSameAs),
    duplicateTitles: group('title'),
    duplicateDescs: group('descText'),
    nearDuplicates: nearDuplicates.slice(0, 10),
    orphans,
    slow: slow.slice(0, 8),
    medianMs: median(ok.map((p) => p.ms).filter(Boolean)),
    // 冒頭に事実が無いページ: has all its parts, says nothing in the opening.
    // Only the pages that are supposed to sell: an article that opens
    // without a price is an article, not a defect.
    thinLead: ok.filter((p) => (p.kind === 'service' || p.kind === 'sales') && p.leadMissing.length >= 2)
      .map((p) => ({ url: p.url, missing: p.leadMissing })).slice(0, 10),
  }
}

function median(list) {
  if (!list.length) return 0
  const s = [...list].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/* ---- 結果の言葉 --------------------------------------------------------
   Every check, with what it says when something is wrong (bad), when nothing
   is (good), and the one thing to do about it (fix). 「必ず直す」 is kept for
   what stops a page from being found or breaks a rule a search engine
   enforces; everything that only makes a page better is 「直すと良い」. */
export const CHECKS = {
  sitemap: { level: 'must', bad: 'サイトマップ（sitemap.xml）が読めない', good: 'サイトマップが読める', fix: 'sitemap.xml が公開されているか、書式が壊れていないかを確かめます。' },
  status: { level: 'must', bad: 'サイトマップに載っているのに開けないページ', good: 'サイトマップのページがすべて開ける', fix: 'ページを元に戻すか、サイトマップから外します。' },
  redirect: { level: 'should', bad: 'サイトマップに、別のURLへ転送されるURLが載っている', good: 'サイトマップに転送されるURLが無い', fix: 'サイトマップには転送先の最終的なURLを載せます。' },
  noindex: { level: 'must', bad: '「検索に載せない」設定なのにサイトマップに載っているページ', good: 'サイトマップに「検索に載せない」ページが無い', fix: '載せたいなら noindex を外し、載せたくないならサイトマップから外します。' },
  'canonical-missing': { level: 'should', bad: '正規URL（canonical）が書かれていないページ', good: 'すべてのページに正規URL（canonical）がある', fix: '<head> に <link rel="canonical" href="このページの完全なURL"> を入れます。' },
  'canonical-relative': { level: 'should', bad: '正規URL（canonical）が https:// から始まっていないページ', good: '正規URL（canonical）がすべて完全なURLで書かれている', fix: 'https:// から始まる完全なURLで書きます。' },
  'canonical-other': { level: 'must', bad: '正規URL（canonical）が別のページを指している（このページは検索に出ません）', good: '正規URL（canonical）がすべてそのページ自身を指している', fix: 'このページ自身のURLに直します。わざと別のページに寄せているなら、サイトマップから外します。' },
  'canonical-sitemap': { level: 'must', bad: '正規URL（canonical）とサイトマップのURLの書き方が違う', good: '正規URL（canonical）とサイトマップのURLが一致している', fix: '末尾の「/」や「.html」まで、canonical とサイトマップを同じ書き方に揃えます。' },
  og: { level: 'should', bad: 'SNSで共有したときの表示（og:title・og:description・og:image）が欠けているページ', good: 'SNSで共有したときの表示（タイトル・説明・画像）がそろっている', fix: '欠けている項目を入れます。画像は https:// から始まるURLで指定します。' },
  'img-alt': { level: 'should', bad: '画像に説明（alt）が無い', good: 'すべての画像に説明（alt）がある', fix: '画像が何を表すかを alt に一言で書きます。飾りだけの画像は alt="" にします。' },
  'heading-order': { level: 'should', bad: '見出しの階層が飛んでいる', good: '見出しの階層が順番どおり', fix: '見出しは h1 → h2 → h3 の順に、1段ずつ下げて使います。文字の大きさは見た目の設定で変えます。' },
  'jsonld-parse': { level: 'must', bad: '構造化データ（JSON-LD）の書式が壊れていて読めない', good: '構造化データ（JSON-LD）がすべて読める', fix: 'カンマや引用符の閉じ忘れを直します。壊れたままだと、そのブロック全体が無視されます。' },
  'jsonld-required': { level: 'must', bad: '構造化データに必須の項目が無い', good: '構造化データの必須項目がそろっている', fix: '足りない項目を入れます。入れられないなら、その型は使わないでください。' },
  'faq-visible': { level: 'must', bad: 'FAQの構造化データにある質問・答えが、ページに表示されていない', good: 'FAQの構造化データは、すべてページに表示されている内容と一致している', fix: 'ページに表示している質問と答えだけを構造化データに入れます（Googleのルールです）。' },
  links: { level: 'must', bad: 'リンク切れ（リンク先のページが無い）', good: 'サイト内のリンク切れが無い', fix: 'リンクを正しいURLに直すか、外します。' },
  'link-redirect': { level: 'should', bad: 'リンク先が別のURLへ転送されている', good: 'サイト内のリンクが転送を経由していない', fix: 'リンクを転送先のURLに直接書き換えます。' },
  'dup-title': { level: 'should', bad: '同じタイトルのページがある', good: 'タイトルがすべてのページで違う', fix: '検索結果ではどちらか1つしか出ません。ページごとに内容がわかるタイトルにします。' },
  'dup-desc': { level: 'should', bad: '同じ説明文（meta description）のページがある', good: '説明文がすべてのページで違う', fix: 'ページごとに、そのページだけの内容を60〜160字で書きます。' },
  'near-dup': { level: 'should', bad: '本文がほとんど同じページがある', good: '本文がほとんど同じページは無い', fix: 'どちらかに独自の内容を足すか、1ページにまとめてもう片方から転送します。' },
  orphan: { level: 'should', bad: 'サイト内のどこからもリンクされていないページ', good: 'すべてのページにサイト内からのリンクがある', fix: '関係の近いページから1本リンクを張ります。サイトマップにしか無いページは、リンクをたどるAIに見つかりません。' },
  'thin-lead': { level: 'should', bad: 'ページの冒頭で、料金や地域などの答えを書いていない', good: 'サービスのページは冒頭で答えを書いている', fix: '見出しのすぐ下の2〜3行に、料金の目安・対応地域・期間・連絡方法を書きます。' },
  slow: { level: 'should', bad: '表示に時間がかかるページ', good: '表示が遅いページは無い', fix: '大きな画像を小さくする、使っていない読み込みを外すなどで軽くします。' },
  profiles: { level: 'should', bad: '公式アカウントのURL（sameAs）が構造化データに入っていない', good: '公式アカウントのURL（sameAs）が入っている', fix: 'X・Instagram・YouTube・法人番号公表サイトなど、実在する公式ページのURLを会社情報の sameAs に入れます（持っていないものは入れません）。' },
  // The per-page parts (WANTED). Missing them is never a rule broken, so
  // they are all 「直すと良い」.
  '説明文': { level: 'should', bad: '検索結果に出る説明文（meta description）が無いか、長さが合わない', good: '説明文がすべて60〜160字', fix: '60〜160字で、何を・いくらで・どこで提供しているかを書きます。' },
  'タイトルの長さ': { level: 'should', bad: 'ページタイトルが短すぎるか長すぎる', good: 'タイトルの長さがすべて15〜62字', fix: '15〜62字に収めます。長いと検索結果で途中が切れます。' },
  '見出しH1': { level: 'should', bad: 'いちばん大きな見出し（h1）が無いか、2つ以上ある', good: 'すべてのページに h1 が1つずつある', fix: 'ページの内容を一言で表す h1 を1つだけ置きます。' },
  'FAQ': { level: 'should', bad: 'よくある質問の構造化データ（FAQPage）が無い', good: '売るページにはすべてFAQがある', fix: 'ページに質問と答えを表示し、同じ内容を FAQPage として書きます。AIはこの形をそのまま引用できます。' },
  '会社情報': { level: 'should', bad: '会社情報の構造化データ（Organization）が無い', good: 'すべてのページに会社情報の構造化データがある', fix: '社名・URL・所在地を Organization として入れます。「実在が確認できない」と答えられる原因になります。' },
  'パンくず': { level: 'should', bad: 'パンくず（BreadcrumbList）が無い', good: 'パンくずがそろっている', fix: 'そのページがサイトのどこにあるかを BreadcrumbList で書きます。検索結果の表示にも使われます。' },
  '更新日': { level: 'should', bad: '更新日が書かれていない', good: 'すべてのページに更新日がある', fix: 'ページに「最終更新日」を表示し、構造化データの dateModified にも同じ日付を入れます。' },
  '金額': { level: 'should', bad: '本文に金額（〇〇円）が書かれていない', good: '売るページはすべて本文に金額がある', fix: '「〇万円〜」のように、幅でよいので本文に書きます（全ページ共通の部分は数えていません）。' },
  '対応地域': { level: 'should', bad: '本文に対応地域が書かれていない', good: '売るページはすべて本文に対応地域がある', fix: '「東京都内」「オンラインで全国対応」のように、そのページの本文に書きます（全ページ共通の部分は数えていません）。' },
  '本文量': { level: 'should', bad: 'そのページだけの本文が1000字未満', good: '本文量が足りている', fix: '全ページ共通の部分を除くと1000字未満です。質問への答え・事例・手順を足します。' },
  '計測タグ': { level: 'should', bad: 'アクセス解析のタグが入っていない', good: 'すべてのページにアクセス解析のタグがある', fix: 'このページの訪問がアクセス解析に入りません。ページを作るスクリプトで計測タグを入れます。' },
}

/* ---- 点検の本体 ------------------------------------------------------- */

/** Run fn over items, at most n at a time. */
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k], k) }
  }))
  return out
}

/** One request, never following redirects (a redirect is something to
 *  report), never longer than the time left. */
async function get(url, { fetchImpl, deadline, agent }) {
  const left = deadline - Date.now()
  if (left < 400) return { skipped: true }
  const ctl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), Math.min(8000, left)) : null
  const t0 = Date.now()
  try {
    const res = await fetchImpl(url, { redirect: 'manual', headers: { 'user-agent': agent }, signal: ctl ? ctl.signal : undefined })
    const h = res.headers || { get: () => '' }
    const type = h.get('content-type') || ''
    const redirected = (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect'
    const html = !redirected && res.ok && /html/i.test(type) ? await res.text() : ''
    if (!html && res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {})
    return { status: res.status, redirected, location: h.get('location') || '', xRobots: h.get('x-robots-tag') || '', html, ms: Date.now() - t0 }
  } catch (e) {
    return { error: ctl && ctl.signal.aborted ? '時間切れ' : String((e && e.message) || e).slice(0, 80) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** The URL with the trivial differences taken out — for telling 「別のページ」
 *  from 「同じページの書き方違い」. */
const loose = (u) => {
  try {
    const x = new URL(u)
    return x.host.replace(/^www\./, '') + x.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '')
  } catch (_) { return String(u) }
}
const same = (a, b) => { try { return new URL(a).href === new URL(b).href } catch (_) { return a === b } }

/**
 * Read the whole site from its sitemap and judge it.
 *
 *   origin   where to fetch from (the deployment answering, or a local server
 *            in a test); the public address in the sitemap and in canonicals
 *            is read as this one.
 *   exclude  paths (RegExp) that are not pages to judge, though links to
 *            them are still followed.
 *   budgetMs how long all the requests together may take. A function has a
 *            time limit; past this, what was not reached is reported as not
 *            checked rather than as fine.
 */
export async function auditSite({ origin, site = SITE, fetchImpl = globalThis.fetch, exclude = [], limit = 60, budgetMs = 20000, concurrency = 6, linkCap = 150, agent = 'SiteAudit/1' } = {}) {
  const deadline = Date.now() + budgetMs
  const toLocal = (u) => (u.startsWith(site) ? origin + u.slice(site.length) : u)
  const toPublic = (u) => (u.startsWith(origin) ? site + u.slice(origin.length) : u)
  const findings = []
  const ran = new Set()
  const add = (check, page, detail) => findings.push({ level: CHECKS[check].level, check, page, detail: detail || '' })
  const notes = []
  const opt = { fetchImpl, deadline, agent }

  // The sitemap, or each sitemap a sitemap index lists.
  let urls = []
  ran.add('sitemap')
  {
    const locs = (x) => [...String(x).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]))
    const read = async (u) => {
      try {
        const res = await fetchImpl(u, { headers: { 'user-agent': agent } })
        return res.ok ? { xml: await res.text() } : { why: `HTTP ${res.status}` }
      } catch (e) { return { why: String((e && e.message) || e).slice(0, 80) } }
    }
    const top = await read(origin + '/sitemap.xml')
    if (/<sitemapindex\b/i.test(top.xml || '')) {
      for (const child of locs(top.xml).slice(0, 5)) urls.push(...locs((await read(toLocal(child))).xml || ''))
    } else urls = locs(top.xml || '')
    if (!urls.length) add('sitemap', '/sitemap.xml', top.why || 'URLが1件も載っていません')
  }
  const inSitemap = new Set(urls.map((u) => toLocal(u)))
  if (!urls.length) urls = [site + '/']
  if (urls.length > limit) notes.push(`サイトマップの ${urls.length} 件のうち、先頭の ${limit} 件だけを点検しました。`)
  urls = urls.slice(0, limit)

  // Every page in it.
  ran.add('status'); ran.add('redirect'); ran.add('noindex')
  const status = new Map() // local URL → { status, redirected }
  const pages = (await pool(urls, concurrency, async (u) => {
    const local = toLocal(u)
    const path = new URL(local).pathname
    const r = await get(local, opt)
    status.set(local.replace(/#.*$/, ''), r)
    if (r.skipped) return { url: path, error: '時間内に確かめきれませんでした', skipped: true }
    if (r.error) { add('status', path, r.error); return { url: path, error: r.error } }
    if (r.redirected) { add('redirect', path, r.location ? `→ ${toPublic(new URL(r.location, local).href)}` : ''); return { url: path, error: `転送 HTTP ${r.status}`, excluded: true } }
    if (r.status !== 200) { add('status', path, `HTTP ${r.status}`); return { url: path, error: `HTTP ${r.status}` } }
    const p = extract(path, r.html, { ms: r.ms, url: local, xRobots: r.xRobots })
    if (p.noindex) { add('noindex', path, /noindex|none/i.test(r.xRobots) ? 'X-Robots-Tag ヘッダー' : 'robots メタタグ'); p.excluded = true }
    if (exclude.some((re) => re.test(path))) p.excluded = true
    p.fetched = local
    return p
  })).filter(Boolean)

  const skipped = pages.filter((p) => p.skipped).length
  if (skipped) notes.push(`時間内に開けなかったページが ${skipped} 件あります。もう一度点検すると続きを確かめます。`)
  const judged = pages.filter((p) => !p.error && !p.excluded)
  const info = finalize(pages)

  for (const c of ['canonical-missing', 'canonical-relative', 'canonical-other', 'canonical-sitemap', 'og', 'img-alt', 'heading-order', 'jsonld-parse', 'jsonld-required', 'faq-visible']) if (judged.length) ran.add(c)
  for (const p of judged) {
    // 正規URL
    const c = p.canonicals[0]
    if (!c) add('canonical-missing', p.url)
    else if (!/^https?:\/\//i.test(c)) add('canonical-relative', p.url, c)
    else {
      const local = toLocal(c)
      if (!same(local, p.fetched)) {
        add(loose(local) === loose(p.fetched) ? 'canonical-sitemap' : 'canonical-other', p.url, `→ ${c}`)
      } else if (inSitemap.size && ![...inSitemap].some((s) => same(s, local))) {
        add('canonical-sitemap', p.url, `→ ${c}`)
      }
    }
    if (p.canonicals.length > 1 && new Set(p.canonicals).size > 1) add('canonical-other', p.url, `canonical が ${p.canonicals.length} 個あり、食い違っています`)
    // SNS
    const ogLack = [['og:title', p.og.title], ['og:description', p.og.description], ['og:image', p.og.image]].filter(([, v]) => !v).map(([k]) => k)
    if (p.og.image && !/^https?:\/\//i.test(p.og.image)) ogLack.push('og:image が完全なURLでない')
    if (ogLack.length) add('og', p.url, ogLack.join('・'))
    if (p.noAlt) add('img-alt', p.url, `${p.noAlt}枚${p.noAltSample.length ? '（' + p.noAltSample.join('、') + '）' : ''}`)
    if (p.headingSkip) add('heading-order', p.url, p.headingSkip)
    for (const e of p.ldErrors) add('jsonld-parse', p.url, e)
    if (p.ldMissing.length) add('jsonld-required', p.url, p.ldMissing.join(' ／ '))
    if (p.faqHiddenCount) add('faq-visible', p.url, `${p.faqHiddenCount}問: 「${p.faqHidden.join('」「')}」`)
    for (const k of p.missing) add(k, p.url)
  }
  if (judged.length) for (const k of new Set(Object.values(WANTED).flat())) ran.add(k)

  // Links between pages: every distinct target not already opened above.
  const targets = new Map() // local URL → first page linking to it
  for (const p of judged) {
    for (const l of p.links) {
      const local = origin + l
      if (/^\/api\//.test(l) || status.has(local)) continue
      if (!targets.has(local)) targets.set(local, { from: p.url, n: 0 })
      targets.get(local).n++
    }
  }
  const linkList = [...targets.keys()].slice(0, linkCap)
  if (targets.size > linkCap) notes.push(`リンク先 ${targets.size} 件のうち ${linkCap} 件を確かめました。`)
  let linkSkipped = 0
  const root = origin + '/'
  await pool(linkList, concurrency, async (u) => {
    const r = await get(u, opt)
    const t = targets.get(u)
    const where = `リンク元: ${t.from}${t.n > 1 ? ` ほか${t.n - 1}ページ` : ''}`
    const path = new URL(u).pathname
    if (r.skipped) { linkSkipped++; return }
    ran.add('links'); ran.add('link-redirect')
    if (r.error) return add('links', path, `${r.error}（${where}）`)
    if (r.redirected) return add('link-redirect', path, `${r.location ? '→ ' + toPublic(new URL(r.location, u).href) + '　' : ''}${where}`)
    if (r.status >= 400) return add('links', path, `HTTP ${r.status}（${where}）`)
    // A server that answers every address with the top page (a single-page
    // app) says 200 for pages that do not exist. Such a page names the top
    // page as its canonical — that is how it is recognised.
    if (r.html && path !== '/') {
      const c = tags(r.html, 'link').find((a) => /(^|\s)canonical(\s|$)/i.test(a.rel || ''))
      if (c && /^https?:/i.test(c.href) && same(toLocal(c.href), root)) add('links', path, `存在しないページで、代わりにトップページが表示されます（${where}）`)
    }
  })
  if (linkSkipped) notes.push(`時間内に確かめきれなかったリンク先が ${linkSkipped} 件あります。`)

  // Between pages.
  const s = crossCheck(pages)
  for (const d of s.duplicateTitles) add('dup-title', d.urls.join('、'), d.value)
  for (const d of s.duplicateDescs) add('dup-desc', d.urls.join('、'), d.value.slice(0, 60) + (d.value.length > 60 ? '…' : ''))
  for (const d of s.nearDuplicates) add('near-dup', d.urls.join(' と '), `本文の一致度 ${d.share}%`)
  for (const u of s.orphans) add('orphan', u)
  for (const t of s.thinLead) add('thin-lead', t.url, `最初の500字に ${t.missing.join('・')} が無い`)
  for (const t of s.slow) add('slow', t.url, `${t.ms}ミリ秒`)
  if (s.noProfiles) add('profiles', '全ページの会社情報')
  if (judged.length) for (const c of ['dup-title', 'dup-desc', 'near-dup', 'orphan', 'thin-lead', 'slow', 'profiles']) ran.add(c)

  const bad = new Set(findings.map((f) => f.check))
  const passed = Object.keys(CHECKS).filter((c) => ran.has(c) && !bad.has(c)).map((c) => ({ check: c, label: CHECKS[c].good }))
  const order = { must: 0, should: 1 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  return {
    pages,
    site: s,
    findings,
    passed,
    counts: {
      must: findings.filter((f) => f.level === 'must').length,
      should: findings.filter((f) => f.level === 'should').length,
      ok: passed.length,
    },
    linksChecked: linkList.length - linkSkipped,
    boilerplateBlocks: info.boilerplate,
    notes,
  }
}

/** Every measured question, next to the page that is supposed to answer it
 *  and how close that page actually is to the question. */
export function questionCoverage(pages, answers) {
  const byPath = new Map(pages.filter((p) => !p.error).map((p) => [p.url, p]))
  return QUESTIONS.map((q) => {
    const wants = answers[q.cat] || []
    const rows = wants.map((w) => byPath.get(w)).filter(Boolean)
    const fits = rows.map((r) => ({ url: r.url, ...questionFit(r, q.q) }))
    const best = fits.slice().sort((a, b) => (b.head + b.body) - (a.head + a.body))[0] || null
    return {
      id: q.id,
      cat: q.cat,
      q: q.q,
      page: best ? best.url : null,
      head: best ? best.head : 0,
      body: best ? best.body : 0,
      // What the nominated page is missing that this kind of question needs.
      missing: rows.length ? [...new Set(rows.flatMap((r) => r.missing))] : ['ページが無い'],
      leadMissing: rows.length ? [...new Set(rows.flatMap((r) => r.leadMissing))] : [],
    }
  })
}
