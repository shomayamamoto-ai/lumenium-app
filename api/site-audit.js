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
//   4. 点検結果         — every problem found, as 「必ず直す」 (keeps a page out
//      of search, or breaks a search engine's rule) and 「直すと良い」, each
//      with the page and one sentence on what to do (findings), and the
//      checks that found nothing (passed).
//
// The per-page rules live in _audit-rules.js so they can be run offline
// against the built files as well as over the live site.

import { requireAdmin, json } from './_admin-auth.js'
import { storeFor } from './_analytics-store.js'
import { readCrawls } from './_crawlers.js'
import { QUESTIONS } from './_aio-catalog.js'
import { SITE, CHECKS, auditSite, questionCoverage } from './_audit-rules.js'
import { BRAND } from './_brand.js'

/* Which page is supposed to answer each measured question. The two halves of
   this screen never met: the probe reported 「動画制作 0%」 and the audit
   reported 「/services/video.html にFAQが無い」 on the same page, and nobody
   joined them. Joined here, a miss reads as an instruction — this question
   has no page, or has one that does not answer it. */
export const ANSWERS = {
  'ブランド指名': ['/about.html', '/profile.html'],
  /* 評判・信頼性。候補に残ったあと最後に確かめられることで、ここで
     止まったことは問い合わせ数には出ません。答える材料は1ページでは
     足りず、お客様の声・実績・事業者情報の3つに分かれています。 */
  '評判・信頼性': ['/voice.html', '/works.html', '/about.html'],
  '動画制作': ['/services/video.html'],
  'AI導入・研修': ['/services/ai.html'],
  'SNS・LINE': ['/services/sns.html'],
  'Web制作・システム開発': ['/services/web.html'],
  'キャスト手配': ['/services/cast.html'],
  'クリエイティブ': ['/services/creative.html'],
  '横断・比較': ['/onestop.html', '/choose.html'],
}

/* Pages that are on the site but are not pages to judge (the mini-games: not
   something anyone searches for, and measured elsewhere). Links to them are
   still checked. Pages that ask not to be indexed need no entry here — they
   are recognised by their noindex. */
const EXCLUDE = [/^\/(game|racing|runner|hitblow)\.html$/]

/* An edge function has to start answering within 25 seconds. The requests
   get 18 of them; what is not reached by then is reported as not checked. */
const BUDGET_MS = 18000

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  // The deployment answering is the one read, so a preview checks itself.
  const origin = new URL(req.url).origin
  const run = await auditSite({
    origin, site: SITE, exclude: EXCLUDE, budgetMs: BUDGET_MS, agent: `${BRAND.slug}-audit/1`,
  })
  const pages = run.pages.filter((p) => !p.excluded)

  const ok = pages.filter((p) => !p.error)
  const tally = {}
  for (const p of ok) for (const m of p.missing) tally[m] = (tally[m] || 0) + 1
  const issues = Object.entries(tally)
    .map(([name, count]) => ({ name, count, share: ok.length ? count / ok.length : 0 }))
    .sort((a, b) => b.count - a.count)

  const site = run.site
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

  // The grams and blocks are used by the joins above; they are not for
  // reading, and some are Sets, which are not JSON.
  for (const p of pages) {
    for (const k of ['headLines', 'bodyGrams', 'descText', 'blocks', 'leadBlocks', 'shingles', 'found', 'fetched']) delete p[k]
  }

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
    // 点検結果: 「必ず直す」「直すと良い」 and what passed. The words for each
    // check travel with it (CHECKS), so the screen and the demo say the same.
    findings: run.findings.map((f) => ({ ...f, problem: CHECKS[f.check].bad, fix: CHECKS[f.check].fix })),
    passed: run.passed,
    counts: run.counts,
    linksChecked: run.linksChecked,
    notes: run.notes,
  })
}
