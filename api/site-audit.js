export const config = { runtime: 'edge' }

// What the site itself is missing, checked against the pages it actually ships.
//
// The AIO probe asks an answer engine whether we come back. It never looks at
// the other half: whether there is anything on our pages for an answer to be
// built from. 「非指名 0%」 is a result with no instruction in it — this is the
// part that can be acted on without spending anything, so it costs nothing to
// run: no model, no API key, just the site reading itself.
//
// Every check is something an engine or a search result actually uses:
//   ・説明文     the snippet that gets quoted
//   ・FAQ        the question-and-answer pairs an engine can lift whole
//   ・会社情報   who this is, where, since when — the answer to 「実在するか」
//   ・パンくず   where the page sits
//   ・更新日     whether this was true recently
//   ・金額/地域  the two facts every one of the measured questions asks for
//   ・本文量     whether there is an answer at all
//   ・計測タグ   whether we would even see the visit

import { requireAdmin, json } from './_admin-auth.js'
import { QUESTIONS } from './_aio-catalog.js'

/* Which page is supposed to answer each measured question. The two halves of
   this screen never met: the probe reported 「動画制作 0%」 and the audit
   reported 「/services/video.html にFAQが無い」 on the same page, and nobody
   joined them. Joined here, a miss reads as an instruction — this question
   has no page, or has one that does not answer it. */
const ANSWERS = {
  'ブランド指名': ['/about.html', '/profile.html'],
  '動画制作': ['/services/video.html'],
  'AI導入・研修': ['/services/ai.html'],
  'SNS・LINE': ['/services/sns.html'],
  'Web制作・システム開発': ['/services/web.html'],
  'キャスト手配': ['/services/cast.html'],
  'クリエイティブ': ['/services/creative.html'],
  '横断・比較': ['/onestop.html', '/choose.html'],
}

const SITE = 'https://lumenium.net'
const LIMIT = 45

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

function typesIn(html) {
  const out = new Set()
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
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

/** What a page is for, which decides what it is missing. A blog post with no
 *  price list is not a defect; a service page with no price is the whole
 *  reason the measured questions go to somebody else. Checking every page
 *  against every rule produced a report where nothing passed, which is the
 *  same as no report at all. */
function kindOf(path) {
  if (/^\/services\/[a-z]+\.html$/.test(path)) return 'service'
  if (path === '/' || /^\/(pricing|about|profile|services\/index)\.html$/.test(path)) return 'sales'
  // Proof pages: they carry the story, not the price list.
  if (/^\/(works|voice|story|pain|positioning|flow|faq)\.html$/.test(path)) return 'article'
  if (/^\/blog\//.test(path)) return 'article'
  return 'support'
}

const WANTED = {
  service: ['説明文', 'タイトルの長さ', '見出しH1', 'FAQ', '会社情報', 'パンくず', '更新日', '金額', '対応地域', '本文量', '計測タグ'],
  sales: ['説明文', 'タイトルの長さ', '見出しH1', 'FAQ', '会社情報', 'パンくず', '更新日', '金額', '対応地域', '本文量', '計測タグ'],
  article: ['説明文', 'タイトルの長さ', '見出しH1', '会社情報', 'パンくず', '更新日', '本文量', '計測タグ'],
  support: ['説明文', 'タイトルの長さ', '見出しH1', '会社情報', '更新日', '計測タグ'],
}

/** One page, read the way a crawler would. */
function check(url, html) {
  const body = strip(html)
  const types = typesIn(html)
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1]
  const title = (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1]
  const h1 = [...html.matchAll(/<h1[^>]*>/g)].length
  const path = url.replace(SITE, '') || '/'
  const kind = kindOf(path)
  const found = {
    '説明文': desc.length >= 60 && desc.length <= 160,
    'タイトルの長さ': title.length >= 15 && title.length <= 62,
    '見出しH1': h1 === 1,
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
  const missing = WANTED[kind].filter((k) => !found[k])
  return { url: path, kind, chars: body.length, desc: desc.length, missing }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const origin = new URL(req.url).origin
  let urls = []
  try {
    const xml = await (await fetch(origin + '/sitemap.xml', { cf: { cacheTtl: 0 } })).text()
    urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  } catch (_) { /* fall through to the one page we know exists */ }
  if (!urls.length) urls = [origin + '/']
  // The games are not marketing pages; they are measured elsewhere.
  urls = urls
    .filter((u) => !/\/(game|racing|runner|hitblow)\.html/.test(u))
    .slice(0, LIMIT)
    .map((u) => u.replace(SITE, origin))

  const pages = []
  const BATCH = 8
  for (let i = 0; i < urls.length; i += BATCH) {
    const group = await Promise.all(urls.slice(i, i + BATCH).map(async (u) => {
      try {
        const res = await fetch(u, { headers: { 'user-agent': 'LumeniumAudit/1' } })
        if (!res.ok) return { url: u.replace(origin, '') || '/', error: `HTTP ${res.status}` }
        const html = await res.text()
        // A page deliberately kept out of the index is not failing at being
        // found; nagging about it is noise.
        // Attribute order is not fixed: this site writes content before name.
        if (/<meta[^>]*noindex[^>]*>/i.test(html) && /<meta[^>]*robots[^>]*>/i.test(html)) return null
        return check(u.replace(origin, SITE), html)
      } catch (e) {
        return { url: u.replace(origin, '') || '/', error: String((e && e.message) || e).slice(0, 80) }
      }
    }))
    pages.push(...group.filter(Boolean))
  }

  const ok = pages.filter((p) => !p.error)
  const tally = {}
  for (const p of ok) for (const m of p.missing) tally[m] = (tally[m] || 0) + 1
  const issues = Object.entries(tally)
    .map(([name, count]) => ({ name, count, share: ok.length ? count / ok.length : 0 }))
    .sort((a, b) => b.count - a.count)

  // Per measured question: is there a page for it, and does that page answer
  // in the form an engine can lift?
  const byPath = new Map(ok.map((p) => [p.url, p]))
  const seen = new Set()
  const coverage = []
  for (const q of QUESTIONS) {
    if (seen.has(q.cat)) continue
    seen.add(q.cat)
    const wants = ANSWERS[q.cat] || []
    const rows = wants.map((w) => byPath.get(w)).filter(Boolean)
    coverage.push({
      cat: q.cat,
      asked: QUESTIONS.filter((x) => x.cat === q.cat).length,
      pages: wants,
      exists: rows.length > 0,
      ready: rows.length > 0 && rows.every((r) => !r.missing.includes('FAQ') && !r.missing.includes('金額')),
      missing: [...new Set(rows.flatMap((r) => r.missing))],
    })
  }

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    coverage,
    pages: pages.sort((a, b) => (b.missing || []).length - (a.missing || []).length).slice(0, 40),
    total: pages.length,
    clean: ok.filter((p) => !p.missing.length).length,
    issues,
  })
}
