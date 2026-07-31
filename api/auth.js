export const config = { runtime: 'edge' }

import { issueSession, memberCodeMatches } from './_session.js'

// Account-enumeration-resistant by design: every failure (wrong code, locked,
// malformed input) collapses into the single code AUTH_FAILED with one shared
// message, mirroring the login spec's aggregation principle.
const FAIL = { ok: false, code: 'AUTH_FAILED' }

// Best-effort per-instance rate limit: 5 failures / 15 min per IP.
// (Edge isolates are ephemeral — this is a speed bump, not a guarantee.)
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const fails = new Map() // ip -> { count, resetAt }

function limited(ip) {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now > rec.resetAt) return false
  return rec.count >= MAX_FAILS
}

function recordFail(ip) {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now > rec.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  else rec.count += 1
  if (fails.size > 1000) fails.clear() // memory guard
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  let payload
  try {
    payload = await req.json()
  } catch {
    return json(FAIL, 401)
  }

  const code = String(payload?.code ?? '')
  const remember = payload?.remember === true // strict — "false" string must not opt in

  if (limited(ip) || !code || code.length > 64) {
    recordFail(ip)
    return json(FAIL, 401)
  }

  if (!(await memberCodeMatches(code))) {
    recordFail(ip)
    return json(FAIL, 401)
  }

  fails.delete(ip)
  const { token, maxAge } = await issueSession(remember)

  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  const base = `Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`
  headers.append('Set-Cookie', `lum_session=${token}; ${base}; HttpOnly`)
  // JS-readable flag for UI state only — carries no authority.
  headers.append('Set-Cookie', `lum_member=1; ${base}`)

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
