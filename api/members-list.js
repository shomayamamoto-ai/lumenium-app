export const config = { runtime: 'edge' }

import { listContacts } from './_resend-audience.js'

// Admin-only member list. Handles personal data (names + emails), so unlike
// the game gate this endpoint has NO dev fallback: ADMIN_KEY must be set in
// the environment or the endpoint refuses to serve.

const enc = new TextEncoder()

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function keyMatches(submitted, configured) {
  // HMAC both sides with a fixed context key → constant-time comparison
  const a = await hmacHex(String(submitted), 'lumenium-admin-compare')
  const b = await hmacHex(String(configured), 'lumenium-admin-compare')
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Best-effort per-instance rate limit on failed attempts: 5 / 15 min per IP.
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const fails = new Map()

function limited(ip) {
  const rec = fails.get(ip)
  return !!rec && Date.now() <= rec.resetAt && rec.count >= MAX_FAILS
}
function recordFail(ip) {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now > rec.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  else rec.count += 1
  if (fails.size > 1000) fails.clear()
}

export async function GET(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return json({ ok: false, code: 'NOT_CONFIGURED' }, 503)

  const auth = req.headers.get('authorization') || ''
  const submitted = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  if (limited(ip) || !submitted || !(await keyMatches(submitted, adminKey))) {
    recordFail(ip)
    return json({ ok: false, code: 'UNAUTHORIZED' }, 401)
  }
  fails.delete(ip)

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
