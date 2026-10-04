// Vercel Routing Middleware: records which crawlers read which pages.
//
// Until now a crawler was only seen when it asked for robots.txt or llms.txt,
// because those two are served by a function. That says 「来た」 but not
// 「読んだ」, and the two need different fixes (see api/_crawlers.js). Every
// other page is a static file the CDN answers without running any of our
// code, so the only place a page request can be seen is here, in front of it.
//
// The rules this file follows, in order of importance:
//
//   1. It never changes the response. It returns nothing, which tells Vercel
//      to carry on exactly as if this file did not exist. It never returns a
//      Response, never rewrites, never adds a header.
//   2. It never delays the page. The write to Redis is handed to waitUntil,
//      which runs after the response has gone; the page does not wait for it.
//   3. It never throws. Everything is inside one try/catch, and the promise
//      given to waitUntil swallows its own failure. A broken store, a missing
//      store, a malformed agent string — the page comes back the same.
//   4. An ordinary visitor costs one regular expression. No I/O, no hashing,
//      no allocation beyond reading one header.
//
// Runs on Vercel's default (edge) runtime. The `context` argument carries
// waitUntil for frameworks other than Next.js; @vercel/functions' own
// waitUntil reads the same per-request context through a global symbol, which
// is used as the fallback so this file needs no extra dependency.
//
// What it does not do: check that a request calling itself GPTBot is GPTBot.
// That needs a reverse DNS lookup or the provider's IP list, neither of which
// belongs on the path of every page; the admin labels the counts accordingly.

import { storeConfig } from './api/_analytics-store.js'
import { looksLikeBot, classify, recordCrawl } from './api/_crawlers.js'

/* Which requests reach this file at all. Unmatched paths never invoke it, so
   images, scripts, styles, fonts, video and the API cost nothing.

   Kept: every page, the sitemaps, and robots.txt / llms.txt. Those two are
   answered by functions (vercel.json rewrites them to /api/robots and
   /api/llms), but this runs before the rewrite, sees the original path, and
   is now the only place either is recorded — the functions just answer.
   Which crawler fetched the sitemap, and when, is exactly the kind of thing
   this is for. Other .txt files are left out with the rest of the assets. */
export const config = {
  matcher: [
    '/((?!api/|assets/|_vercel/|.*\\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|json|txt|webmanifest|gz|br)$).*)',
    '/robots.txt',
    '/llms.txt',
  ],
}

// The same exclusion, checked again in code. If the matcher above is ever
// read differently by the platform than intended, this keeps the behaviour
// the same: an asset request is never recorded as a page read.
const SKIP = /^\/(?:api|assets|_vercel)\/|\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|json|webmanifest|gz|br)$/i
const TXT = /\.txt$/i
const KEEP_TXT = /^\/(?:robots|llms)\.txt$/i

const REQ_CONTEXT = Symbol.for('@vercel/request-context')

function keepAlive(context, promise) {
  const fromArg = context && typeof context.waitUntil === 'function' ? context : null
  let fromGlobal = null
  if (!fromArg) {
    try {
      const c = globalThis[REQ_CONTEXT] && globalThis[REQ_CONTEXT].get && globalThis[REQ_CONTEXT].get()
      if (c && typeof c.waitUntil === 'function') fromGlobal = c
    } catch (_) { /* no context available */ }
  }
  const ctx = fromArg || fromGlobal
  // With no context the write is simply started and left to finish if it
  // can. It is already detached from the response either way.
  if (ctx) ctx.waitUntil(promise)
}

export default function middleware(request, context) {
  try {
    const ua = request.headers.get('user-agent')
    if (!ua || !looksLikeBot(ua)) return undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') return undefined

    const path = new URL(request.url).pathname
    if (SKIP.test(path) || (TXT.test(path) && !KEEP_TXT.test(path))) return undefined

    const bot = classify(ua)
    if (!bot) return undefined
    const cfg = storeConfig()
    if (!cfg) return undefined

    keepAlive(context, recordCrawl(cfg, { bot, path }).catch(() => false))
  } catch (_) {
    /* Measurement is never worth a broken page. */
  }
  return undefined
}
