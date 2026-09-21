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

import { QUESTIONS } from './_aio-catalog.js'

export const SITE = 'https://lumenium.net'

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
  for (const m of String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let parsed
    try { parsed = JSON.parse(m[1]) } catch (_) { continue }
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

/* The four things every measured question ends up asking for. An answer
   engine quotes the top of a page; a price that only appears in the footer is
   a price it will not find. */
const LEAD_FACTS = [
  { id: '金額', re: /(万円|円|¥|[0-9０-９]+\s*万)/ },
  { id: '地域', re: /(東京|全国|オンライン|関東|都内)/ },
  { id: '期間', re: /([0-9０-９]+\s*(日|週間|週|ヶ月|か月|カ月|ヵ月)|即日|最短)/ },
  { id: '連絡', re: /(問い合わせ|問合せ|ご相談|無料相談|見積)/ },
]
const LEAD_CHARS = 500

/** One page, read the way a crawler would. */
export function extract(path, html, extra = {}) {
  const body = strip(html)
  const types = typesIn(html)
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1]
  const title = (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1]
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => strip(m[1]))
  const heads = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => strip(m[2]))
  const dts = [...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>/g)].map((m) => strip(m[1]))
  const faqs = faqQuestions(html)
  const links = [...html.matchAll(/<a[^>]+href="(\/[^"#?][^"]*)"/g)].map((m) => m[1].replace(/\/$/, '') || '/')
  const kind = kindOf(path)
  // The opening of the page: the h1 and whatever follows it, which is the
  // part an engine reads before deciding what the page says.
  const lead = body.slice(0, LEAD_CHARS)

  const found = {
    '説明文': desc.length >= 60 && desc.length <= 160,
    'タイトルの長さ': title.length >= 15 && title.length <= 62,
    '見出しH1': h1s.length === 1,
    'FAQ': types.has('FAQPage'),
    '会社情報': ['Organization', 'ProfessionalService', 'LocalBusiness'].some((t) => types.has(t)),
    'パンくず': types.has('BreadcrumbList'),
    '更新日': /dateModified|datePublished|最終更新/.test(html),
    '金額': /(万円|円|¥)/.test(body),
    '対応地域': /(東京|全国|オンライン)/.test(body),
    '本文量': body.length >= 1000,
    // The home page is the app: its beacon is in the bundle, not in the HTML,
    // and it was verified firing. Flagging it here would be a false alarm.
    '計測タグ': path === '/' ? true : /api\/track/.test(html),
  }

  return {
    url: path,
    kind,
    chars: body.length,
    desc: desc.length,
    descText: desc,
    title,
    ms: extra.ms || 0,
    links: [...new Set(links)],
    missing: WANTED[kind].filter((k) => !found[k]),
    // 冒頭で答えているか: which of the four facts appear in the first screen.
    leadFacts: LEAD_FACTS.filter((f) => f.re.test(lead)).map((f) => f.id),
    leadMissing: LEAD_FACTS.filter((f) => !f.re.test(lead)).map((f) => f.id),
    headings: heads.slice(0, 40),
    faqCount: faqs.length,
    // Kept out of the JSON response — only the join uses these, and one of
    // them is a Set. site-audit drops them before answering.
    // The lines a question could be asked in: headings, FAQ questions, the
    // terms of a definition list, and the page's own title and snippet.
    headLines: [...heads, ...dts, ...faqs, title, desc].filter(Boolean),
    bodyGrams: grams(body),
  }
}

/* ---- サイト全体 ------------------------------------------------------- */

/** The defects that only exist between pages. */
export function crossCheck(pages) {
  const ok = pages.filter((p) => !p.error)

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
  for (const p of ok) for (const l of p.links || []) linked.add(l)
  const orphans = ok
    .filter((p) => p.url !== '/' && !linked.has(p.url.replace(/\/$/, '')))
    .map((p) => p.url)

  const slow = ok.filter((p) => p.ms > 1200).map((p) => ({ url: p.url, ms: p.ms })).sort((a, b) => b.ms - a.ms)

  return {
    duplicateTitles: group('title'),
    duplicateDescs: group('descText'),
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
