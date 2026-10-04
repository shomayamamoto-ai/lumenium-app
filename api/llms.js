export const config = { runtime: 'edge' }

// /llms.txt — the page written for answer engines.
//
// Same arrangement as robots.js: the text is a constant in the bundle and
// comes back no matter what. Who read it is recorded by the root
// middleware.js, which sees the request before the rewrite to here. A fetch
// of this file is the strongest single signal on the SEO screen — it is an
// answer engine reading the document we wrote specifically for it.

import { LLMS_TXT } from './_crawl-assets.js'

export async function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
    },
  })
}

export const HEAD = GET
