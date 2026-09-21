export const config = { runtime: 'edge' }

// /robots.txt — and a record of who asked for it.
//
// This is the first request almost every crawler makes, which is why it is
// served from here instead of from the CDN: it is the one place we can see
// whether GPTBot, ClaudeBot, PerplexityBot and Googlebot come at all. See
// _crawlers.js for why that number is worth having.
//
// The rule this file follows: the text comes back no matter what. It is a
// constant in the bundle, the recording is wrapped and raced against a timer,
// and nothing between the request and the response can throw. A robots file
// that fails is read as 「全部禁止」 by crawlers, so no measurement is worth
// risking one.

import { ROBOTS_TXT } from './_crawl-assets.js'
import { storeConfig } from './_analytics-store.js'
import { recordCrawl } from './_crawlers.js'

export async function GET(req) {
  try {
    await recordCrawl(storeConfig(), { ua: req.headers.get('user-agent'), path: '/robots.txt' })
  } catch (_) { /* the file still has to come back */ }
  return new Response(ROBOTS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Not cached: a cached copy is served by the CDN without reaching this
      // function, which is exactly the visit we are here to count. The file
      // is 1KB and the traffic is a few hundred requests a day.
      'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
    },
  })
}

export const HEAD = GET
