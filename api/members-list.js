export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'

import { listContacts } from './_resend-audience.js'

// Admin-only member list. Handles personal data (names + emails), so unlike
// the game gate this endpoint has NO dev fallback: ADMIN_KEY must be set in
// the environment or the endpoint refuses to serve.

// Best-effort per-instance rate limit on failed attempts: 5 / 15 min per IP.

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return json({ ok: false, code: 'NOT_CONFIGURED' }, 503)

  const members = await listContacts(apiKey)
  if (members === null) return json({ ok: false, code: 'UPSTREAM_ERROR' }, 502)

  // Newest first
  members.sort((a, b) => (b.created || '').localeCompare(a.created || ''))
  return json({ ok: true, count: members.length, members })
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
