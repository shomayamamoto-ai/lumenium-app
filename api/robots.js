export const config = { runtime: 'edge' }

// /robots.txt.
//
// Who asked for it is recorded by the root middleware.js, which sees this
// request before vercel.json rewrites it here and records it in the same way
// as every page (see _crawlers.js). This function used to record it itself,
// raced against a timer; now it only answers, so the file never waits on a
// database and nothing is counted twice.
//
// The rule this file follows: the text comes back no matter what. It is a
// constant in the bundle and nothing between the request and the response
// can throw. A robots file that fails is read as 「全部禁止」 by crawlers.

import { ROBOTS_TXT } from './_crawl-assets.js'

export async function GET() {
  return new Response(ROBOTS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Not cached, so an edit to the rules reaches crawlers at once. The
      // file is 1KB and the traffic is a few hundred requests a day.
      'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
    },
  })
}

export const HEAD = GET
