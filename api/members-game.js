export const config = { runtime: 'edge' }

import { verifySessionCookie } from './_session.js'
import ARENA_HTML from './_arena-html.js'

// Members-only game, gated server-side: the HTML never exists under public/,
// so there is no static URL to bypass — this function is the only way in.
export async function GET(req) {
  const ok = await verifySessionCookie(req.headers.get('cookie'))
  if (!ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login.html?next=arena', 'Cache-Control': 'no-store' },
    })
  }
  return new Response(ARENA_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
