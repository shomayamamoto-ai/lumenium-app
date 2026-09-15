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

import { storeConfig, pipeline, jstDate } from './_analytics-store.js'

const WINDOW_S = 15 * 60
const MAX_FAILS = 5
// In-memory is the fallback only. A serverless instance gets a fresh Map, so
// counting failures here alone means the limit resets whenever the platform
// starts a new one — far weaker than "5 attempts per 15 minutes" sounds. When
// Redis is configured the count is shared across every instance.
const fails = new Map()

async function failState(ip, cfg) {
  if (!cfg) {
    const rec = fails.get(ip)
    if (!rec || Date.now() > rec.resetAt) return { count: 0, retryAfter: 0 }
    return { count: rec.count, retryAfter: Math.ceil((rec.resetAt - Date.now()) / 1000) }
  }
  try {
    const [count, ttl] = await pipeline(cfg, [['GET', `lum:rl:${ip}`], ['TTL', `lum:rl:${ip}`]])
    return { count: Number(count) || 0, retryAfter: Math.max(0, Number(ttl) || 0) }
  } catch (_) {
    return { count: 0, retryAfter: 0 }
  }
}

async function recordFail(ip, cfg) {
  if (!cfg) {
    const now = Date.now()
    const rec = fails.get(ip)
    if (!rec || now > rec.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_S * 1000 })
    else rec.count += 1
    if (fails.size > 1000) fails.clear()
    return
  }
  try {
    await pipeline(cfg, [['INCR', `lum:rl:${ip}`], ['EXPIRE', `lum:rl:${ip}`, WINDOW_S, 'NX']])
  } catch (_) { /* never block a login on the limiter being unavailable */ }
}

async function clearFails(ip, cfg) {
  fails.delete(ip)
  if (!cfg) return
  try { await pipeline(cfg, [['DEL', `lum:rl:${ip}`]]) } catch (_) {}
}

export function json(body, status = 200, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(extra || {}),
    },
  })
}

/** Returns null when the caller is authorised, or a Response to return as-is.
 *
 *  A locked-out caller gets 429 and a retry-after, not 401. Returning the same
 *  "key is wrong" for both meant a correct key looked wrong for fifteen
 *  minutes, with nothing on screen to say why. */
export async function requireAdmin(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const adminKey = (process.env.ADMIN_KEY || '').trim()
  if (!adminKey) {
    return json({ ok: false, code: 'NOT_CONFIGURED', message: 'ADMIN_KEY が未設定です。' }, 503)
  }

  const cfg = storeConfig()
  const state = await failState(ip, cfg)
  if (state.count >= MAX_FAILS) {
    const mins = Math.max(1, Math.ceil(state.retryAfter / 60))
    return json({
      ok: false, code: 'RATE_LIMITED', retryAfter: state.retryAfter,
      message: `試行回数の上限に達しました。あと約${mins}分お待ちください（正しいキーでもこの間は開きません）。`,
    }, 429, { 'retry-after': String(state.retryAfter || WINDOW_S) })
  }

  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  const submitted = ((auth.startsWith('Bearer ') ? auth.slice(7) : '') || url.searchParams.get('key') || '').trim()

  if (!submitted || !(await keyMatches(submitted, adminKey))) {
    await recordFail(ip, cfg)
    const left = MAX_FAILS - (state.count + 1)
    return json({
      ok: false, code: 'UNAUTHORIZED',
      message: left > 0
        ? `管理キーが正しくありません。（あと${left}回でロックされます）`
        : '管理キーが正しくありません。回数上限に達したため、15分間ロックされます。',
    }, 401)
  }

  await clearFails(ip, cfg)
  return null
}

/** A day's ceiling on the endpoints that cost money, so a leaked share link
 *  cannot run the API bill up. Counted in Redis; without it there is nothing
 *  durable to count in, and the caller is let through. */
export async function spendGuard(kind, limit) {
  const cfg = storeConfig()
  if (!cfg) return null
  const key = `lum:aispend:${kind}:${jstDate()}`
  try {
    const [used] = await pipeline(cfg, [['INCR', key], ['EXPIRE', key, 2 * 24 * 3600, 'NX']])
    if (Number(used) > limit) {
      return json({
        ok: false, code: 'DAILY_LIMIT',
        message: `本日の上限（${limit}回）に達しました。日付が変わると再開します。`,
      }, 429)
    }
  } catch (_) { /* the guard must not take the feature down */ }
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
