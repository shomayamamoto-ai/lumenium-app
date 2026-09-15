// Admin-key auth for the new SEO/AIO endpoints — the same scheme the existing
// admin endpoints use (Bearer ADMIN_KEY, HMAC compare, per-IP fail limiting),
// factored out so it is written once rather than a third and fourth time.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

const enc = new TextEncoder()

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compare via digests so neither length nor content leaks through timing. */
async function keyMatches(submitted, configured) {
  const a = await hmacHex(String(submitted), 'lumenium-admin-compare')
  const b = await hmacHex(String(configured), 'lumenium-admin-compare')
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const fails = new Map()

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Returns null when the caller is authorised, or a Response to return as-is. */
export async function requireAdmin(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const adminKey = (process.env.ADMIN_KEY || '').trim()
  if (!adminKey) {
    return json({ ok: false, code: 'NOT_CONFIGURED', message: 'ADMIN_KEY が未設定です。' }, 503)
  }

  const rec = fails.get(ip)
  const limited = !!rec && Date.now() <= rec.resetAt && rec.count >= MAX_FAILS

  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  const submitted = ((auth.startsWith('Bearer ') ? auth.slice(7) : '') || url.searchParams.get('key') || '').trim()

  if (limited || !submitted || !(await keyMatches(submitted, adminKey))) {
    const now = Date.now()
    const r = fails.get(ip)
    if (!r || now > r.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    else r.count += 1
    if (fails.size > 1000) fails.clear()
    return json({ ok: false, code: 'UNAUTHORIZED', message: '管理キーが正しくありません。' }, 401)
  }

  fails.delete(ip)
  return null
}

export function apiKey() {
  return (process.env.ANTHROPIC_API_KEY || '').trim()
}

export const NO_AI = {
  ok: false,
  code: 'AI_NOT_CONFIGURED',
  message:
    'AI機能が未設定です。console.anthropic.com で API キーを発行し、Vercel の環境変数に ANTHROPIC_API_KEY として設定して再デプロイしてください。',
}
