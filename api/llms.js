export const config = { runtime: 'edge' }

// /llms.txt — the page written for answer engines, and a record of who read it.
//
// Same arrangement as robots.js: the text is a constant in the bundle, the
// recording is best effort, and the file comes back either way. A fetch of
// this file is the strongest single signal on the SEO screen — it is an
// answer engine reading the document we wrote specifically for it.

import { LLMS_TXT } from './_crawl-assets.js'
import { storeConfig } from './_analytics-store.js'
import { recordCrawl } from './_crawlers.js'

export async function GET(req) {
  try {
    await recordCrawl(storeConfig(), { ua: req.headers.get('user-agent'), path: '/llms.txt' })
  } catch (_) { /* the file still has to come back */ }
  return new Response(LLMS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
    },
  })
}

export const HEAD = GET
