export const config = { runtime: 'edge' }

import { verifySessionCookie } from './_session.js'
import STATES_HTML from './_states-html.js'

// Fourth members-only game (LUMEN STATES), gated exactly like the other
// three: the HTML never exists under public/, so this function is the only
// way in.
export async function GET(req) {
  const ok = await verifySessionCookie(req.headers.get('cookie'))
  if (!ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login.html?next=states', 'Cache-Control': 'no-store' },
    })
  }
  return new Response(STATES_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
