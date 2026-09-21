export const config = { runtime: 'edge' }

// What the site itself is missing, checked against the pages it actually ships.
//
// The AIO probe asks an answer engine whether we come back. It never looks at
// the other half: whether there is anything on our pages for an answer to be
// built from. 「非指名 0%」 is a result with no instruction in it — this is the
// part that can be acted on without spending anything, so it costs nothing to
// run: no model, no API key, just the site reading itself.
//
// Three things come back, and they are meant to be read in this order:
//
//   1. クローラーの来訪 — who actually fetched anything. Recorded by
//      /api/robots and /api/llms (see _crawlers.js). This comes first
//      because it decides which of the other two matters: a site nothing
//      crawls does not have a content problem yet.
//   2. 質問ごとの距離   — for every measured question, the page nominated to
//      answer it, how much of the question's vocabulary that page uses, and
//      what it is missing.
//   3. サイト全体       — duplicates, orphans, slow pages, thin openings.
//
// The per-page rules live in _audit-rules.js so they can be run offline
// against the built files as well as over the live site.

import { requireAdmin, json } from './_admin-auth.js'
import { storeFor } from './_analytics-store.js'
import { readCrawls } from './_crawlers.js'
import { QUESTIONS } from './_aio-catalog.js'
import { SITE, extract, crossCheck, questionCoverage } from './_audit-rules.js'

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

const LIMIT = 45

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
      const path = u.replace(origin, '') || '/'
      const t0 = Date.now()
      try {
        const res = await fetch(u, { headers: { 'user-agent': 'LumeniumAudit/1' } })
        if (!res.ok) return { url: path, error: `HTTP ${res.status}` }
        const html = await res.text()
        // A page deliberately kept out of the index is not failing at being
        // found; nagging about it is noise.
        // Attribute order is not fixed: this site writes content before name.
        if (/<meta[^>]*noindex[^>]*>/i.test(html) && /<meta[^>]*robots[^>]*>/i.test(html)) return null
        return extract(path, html, { ms: Date.now() - t0 })
      } catch (e) {
        return { url: path, error: String((e && e.message) || e).slice(0, 80) }
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

  const site = crossCheck(pages)
  const questions = questionCoverage(pages, ANSWERS)

  // Per category, as before — the row a person reads first — now carrying the
  // weakest question under it, which is the one to write for.
  const byPath = new Map(ok.map((p) => [p.url, p]))
  const seen = new Set()
  const coverage = []
  for (const q of QUESTIONS) {
    if (seen.has(q.cat)) continue
    seen.add(q.cat)
    const wants = ANSWERS[q.cat] || []
    const rows = wants.map((w) => byPath.get(w)).filter(Boolean)
    const mine = questions.filter((x) => x.cat === q.cat)
    const weakest = mine.slice().sort((a, b) => a.head - b.head)[0] || null
    coverage.push({
      cat: q.cat,
      asked: mine.length,
      pages: wants,
      exists: rows.length > 0,
      ready: rows.length > 0 && rows.every((r) => !r.missing.includes('FAQ') && !r.missing.includes('金額')),
      missing: [...new Set(rows.flatMap((r) => r.missing))],
      // 語の一致率: the average over this category's questions, and the one
      // that scores worst.
      fit: mine.length ? Math.round(mine.reduce((a, x) => a + x.head, 0) / mine.length) : 0,
      weakest: weakest ? { q: weakest.q, head: weakest.head, page: weakest.page } : null,
    })
  }

  // Crawl evidence. Needs the store, and says so rather than showing zero:
  // 「まだ誰も来ていない」 and 「記録していない」 are different answers and
  // only one of them is about the site.
  const cfg = await storeFor(req)
  const crawlers = cfg ? await readCrawls(cfg, 30) : null

  // The grams are Sets used by the join above; they are not JSON and not for
  // reading.
  for (const p of pages) { delete p.headLines; delete p.bodyGrams; delete p.descText }

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    coverage,
    questions,
    site,
    crawlers,
    crawlStore: !!cfg,
    pages: pages.sort((a, b) => (b.missing || []).length - (a.missing || []).length).slice(0, 40),
    total: pages.length,
    clean: ok.filter((p) => !p.missing.length).length,
    issues,
  })
}
