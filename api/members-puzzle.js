export const config = { runtime: 'edge' }

import { verifySessionCookie } from './_session.js'
import PUZZLE_HTML from './_puzzle-html.js'

// Second members-only game (LUMEN 2048), gated exactly like the breaker:
// the HTML never exists under public/, so this function is the only way in.
export async function GET(req) {
  const ok = await verifySessionCookie(req.headers.get('cookie'))
  if (!ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login.html?next=puzzle', 'Cache-Control': 'no-store' },
    })
  }
  return new Response(PUZZLE_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
