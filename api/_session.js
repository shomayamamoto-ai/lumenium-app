// Shared session helpers for the members area (edge runtime, Web Crypto).
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// Session cookie format: "<expiresMs>.<hmacHex>" — HMAC binds the expiry so
// the token cannot be extended client-side. Secrets come from env with a
// dev fallback; set SESSION_SECRET (and MEMBER_CODE) in Vercel for production.

const SECRET = () => process.env.SESSION_SECRET || 'lumenium-dev-secret-change-me'

const enc = new TextEncoder()

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time-ish string compare (lengths equal first; then full scan).
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function issueSession(remember) {
  const ttlMs = (remember ? 30 * 24 : 12) * 60 * 60 * 1000 // 30 days / 12 hours
  const exp = Date.now() + ttlMs
  const sig = await hmacHex(String(exp), SECRET())
  return { token: `${exp}.${sig}`, maxAge: Math.floor(ttlMs / 1000) }
}

export async function verifySessionCookie(cookieHeader) {
  const raw = (cookieHeader || '')
    .split(/;\s*/)
    .find((c) => c.startsWith('lum_session='))
  if (!raw) return false
  const token = raw.slice('lum_session='.length)
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const exp = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d{10,}$/.test(exp) || Number(exp) < Date.now()) return false
  const expected = await hmacHex(exp, SECRET())
  return safeEqual(sig, expected)
}

// Compare a submitted member code against the configured one without
// leaking length/content timing: HMAC both sides, compare digests.
export async function memberCodeMatches(submitted) {
  const configured = process.env.MEMBER_CODE || 'LUMEN2026'
  const a = await hmacHex(String(submitted), SECRET())
  const b = await hmacHex(configured, SECRET())
  return safeEqual(a, b)
}
