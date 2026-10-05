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
import { setting } from './_settings.js'
import { useShare } from './_share.js'
import { KV } from './_brand.js'
import { decide, endpointOf, isRead, areaOf } from './_permissions.js'
import {
  OWNER, getStaff, putStaff, verifyKey, verifySession, keyId, isStaffKey, isSessionToken,
  userFailState, recordUserFail, clearUserFails, userLocked,
} from './_staff.js'
import { entry, record, targetOf, ipHash } from './_audit.js'

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
    const [count, ttl] = await pipeline(cfg, [['GET', `${KV}rl:${ip}`], ['TTL', `${KV}rl:${ip}`]])
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
    await pipeline(cfg, [['INCR', `${KV}rl:${ip}`], ['EXPIRE', `${KV}rl:${ip}`, WINDOW_S, 'NX']])
  } catch (_) { /* never block a login on the limiter being unavailable */ }
}

async function clearFails(ip, cfg) {
  fails.delete(ip)
  if (!cfg) return
  try { await pipeline(cfg, [['DEL', `${KV}rl:${ip}`]]) } catch (_) {}
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

/** Who passed requireAdmin for this request: { id, name, role, via }.
 *  Kept beside the request rather than on it, so nothing about a request
 *  object has to change. A share-link visitor is { id: 'share', role: 'share' }. */
const WHO = new WeakMap()
export function whoOf(req) {
  return WHO.get(req) || null
}

/** The body's `action` (and the fields the audit log may name), read from a
 *  copy so the handler can still read the body itself. Only for JSON. */
async function peekBody(req) {
  if (isRead(req.method) || req.bodyUsed) return null
  if (!/json/i.test(req.headers.get('content-type') || '')) return null
  try { return await req.clone().json() } catch (_) { return null }
}

/** Returns null when the caller is authorised, or a Response to return as-is.
 *
 *  A locked-out caller gets 429 and a retry-after, not 401. Returning the same
 *  "key is wrong" for both meant a correct key looked wrong for fifteen
 *  minutes, with nothing on screen to say why.
 *
 *  opts.as: 'text'       — errors as text/plain, for the endpoints that answer
 *                          in HTML or xlsx and cannot return a JSON body.
 *  The key is accepted only in the Authorization header, never as ?key=: a
 *  credential in a URL survives in history, in referrers and in logs, and
 *  the admin key opens every endpoint.
 *  opts.share: '<scope>' — also accept ?s=<share token> for that scope.
 *  opts.perm: '<name>'   — the row of the permission table (api/_permissions.js)
 *                          to use, when it is not the endpoint's own name.
 *
 *  Three kinds of Bearer value: ADMIN_KEY (the owner — exactly as before),
 *  a staff member's own key (lsk_…, accepted only by /api/admin-ping, which
 *  hands back a 12-hour session), and that session (lss.…). Whoever it is,
 *  the permission table then decides; every write is recorded in the audit
 *  log (api/_audit.js), refused ones included. */
export async function requireAdmin(req, opts) {
  const asText = opts && opts.as === 'text'
  const shareScope = (opts && opts.share) || null
  const fail = (body, status, extra) =>
    asText
      ? new Response(body.message, {
          status,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...(extra || {}) },
        })
      : json(body, status, extra)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const adminKey = (process.env.ADMIN_KEY || '').trim()
  if (!adminKey) {
    return fail({ ok: false, code: 'NOT_CONFIGURED', message: 'ADMIN_KEY が未設定です。' }, 503)
  }

  const cfg = storeConfig()
  const state = await failState(ip, cfg)
  if (state.count >= MAX_FAILS) {
    const mins = Math.max(1, Math.ceil(state.retryAfter / 60))
    return fail({
      ok: false, code: 'RATE_LIMITED', retryAfter: state.retryAfter,
      message: `試行回数の上限に達しました。あと約${mins}分お待ちください（正しいキーでもこの間は開きません）。`,
    }, 429, { 'retry-after': String(state.retryAfter || WINDOW_S) })
  }

  const url = new URL(req.url)

  // A share token, when this endpoint accepts one. Checked before the key so a
  // recipient who was given a link never has the admin key's error message
  // explained to them — they get the one that tells them to ask for a new link.
  if (shareScope) {
    const token = (url.searchParams.get('s') || '').trim()
    if (token) {
      // A good share token must not reset the failure count: otherwise
      // anyone holding a link could guess the admin key four times, open
      // the link once, and guess again — forever.
      if (await useShare(token, shareScope)) {
        WHO.set(req, { id: 'share', name: '共有リンク', role: 'share', via: 'share' })
        return null
      }
      await recordFail(ip, cfg)
      return fail({
        ok: false, code: 'SHARE_INVALID',
        message: 'この共有リンクは使えません。失効したか、有効期限が切れています。発行元に再発行を依頼してください。',
      }, 401)
    }
  }

  const auth = req.headers.get('authorization') || ''
  const fromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const submitted = fromHeader.trim()
  const endpoint = (opts && opts.perm) || endpointOf(url.pathname)
  const audit = async (who, result, extra) => {
    if (!cfg) return
    await record(entry({
      who, area: areaOf(endpoint), endpoint, method: req.method, ip: await ipHash(ip, adminKey), result, ...(extra || {}),
    }), cfg)
  }
  const wrong = async (staffId) => {
    await recordFail(ip, cfg)
    if (staffId) await recordUserFail(staffId, cfg)
    const left = MAX_FAILS - (state.count + 1)
    return fail({
      ok: false, code: 'UNAUTHORIZED',
      message: left > 0
        ? `管理キーが正しくありません。（あと${left}回でロックされます）`
        : '管理キーが正しくありません。回数上限に達したため、15分間ロックされます。',
    }, 401)
  }

  let who = null
  if (submitted && (await keyMatches(submitted, adminKey))) {
    who = { ...OWNER, via: 'owner' }
  } else if (isSessionToken(submitted) || isStaffKey(submitted)) {
    if (!cfg) {
      return fail({
        ok: false, code: 'STAFF_NEEDS_STORE',
        message: '担当者のキーは、保存先（Upstash Redis）をつないでいるときだけ使えます。オーナーの管理キーで入ってください。',
      }, 401)
    }
    if (isSessionToken(submitted)) {
      const v = await verifySession(submitted, adminKey)
      if (!v.ok && v.reason === 'expired') {
        // Not a guess — a signature only this server can make — so it is not
        // counted against the address.
        return fail({ ok: false, code: 'SESSION_EXPIRED', message: 'ログインから12時間たちました。もう一度キーを入れてください。' }, 401)
      }
      if (!v.ok) return wrong('')
      const rec = await getStaff(v.sid, cfg).catch(() => null)
      if (!rec || rec.active === false || (Number(rec.gen) || 0) !== v.gen) {
        return fail({
          ok: false, code: 'STAFF_REVOKED',
          message: 'このキーは使えなくなりました（止められたか、作り直されました）。オーナーに確かめてください。',
        }, 401)
      }
      who = { id: rec.id, name: rec.name, role: rec.role, via: 'session' }
    } else {
      // The raw staff key is for signing in only; afterwards the session goes
      // in its place, so the key itself is not on every request.
      const id = keyId(submitted)
      if (!id || endpoint !== 'admin-ping') return wrong('')
      const us = await userFailState(id, cfg)
      if (userLocked(us.count)) {
        const mins = Math.max(1, Math.ceil(us.retryAfter / 60))
        return fail({
          ok: false, code: 'RATE_LIMITED', retryAfter: us.retryAfter,
          message: `このキーは試行回数の上限に達しました。あと約${mins}分お待ちください。`,
        }, 429, { 'retry-after': String(us.retryAfter || WINDOW_S) })
      }
      const rec = await getStaff(id, cfg).catch(() => null)
      if (!rec || !(await verifyKey(submitted, rec))) {
        if (rec) await audit({ id: rec.id, name: rec.name, role: rec.role }, 'failed')
        return wrong(rec ? rec.id : '')
      }
      if (rec.active === false) {
        return fail({ ok: false, code: 'STAFF_REVOKED', message: 'このキーは止められています。オーナーに確かめてください。' }, 401)
      }
      await clearUserFails(rec.id, cfg)
      rec.lastLoginAt = new Date().toISOString()
      await putStaff(rec, cfg).catch(() => {})
      who = { id: rec.id, name: rec.name, role: rec.role, via: 'key' }
      await audit(who, 'login')
    }
  } else {
    return wrong('')
  }

  await clearFails(ip, cfg)

  // What may this person do here? The owner may do anything; the table is
  // still consulted so the audit log knows which area it was.
  const body = await peekBody(req)
  const action = body && typeof body.action === 'string' ? body.action : ''
  const view = url.searchParams.get('view') || ''
  const d = decide({ role: who.role, endpoint, method: req.method, action, view })
  if (!d.allow) {
    await audit(who, 'denied', { action, target: targetOf(endpoint, body, url) })
    return fail({ ok: false, code: 'FORBIDDEN', need: d.need, message: d.message }, 403)
  }
  if (!isRead(req.method) && !d.quiet) await audit(who, 'ok', { action, target: targetOf(endpoint, body, url) })
  WHO.set(req, who)
  return null
}

/** A day's ceiling on the endpoints that cost money, so a leaked share link
 *  cannot run the API bill up. Counted in Redis; without it there is nothing
 *  durable to count in, and the caller is let through.
 *
 *  `by` charges several units at once — an AIO run reserves every call it
 *  plans to make when it starts, so the ceiling can be in AI calls rather
 *  than in runs (a run can now be 28 calls or 1,000). */
export async function spendGuard(kind, limit, by = 1) {
  const cfg = storeConfig()
  if (!cfg) return null
  const key = `${KV}aispend:${kind}:${jstDate()}`
  const n = Math.max(1, Math.floor(Number(by) || 1))
  try {
    const [used] = await pipeline(cfg, [n === 1 ? ['INCR', key] : ['INCRBY', key, n], ['EXPIRE', key, 2 * 24 * 3600, 'NX']])
    if (Number(used) > limit) {
      // A refused reservation is handed back, so asking for a large run does
      // not use up what is left of the day for a smaller one.
      if (n > 1) await pipeline(cfg, [['DECRBY', key, n]]).catch(() => {})
      return json({
        ok: false, code: 'DAILY_LIMIT',
        message: `本日の上限（${limit}回）に達しました。日付が変わると再開します。`,
      }, 429)
    }
  } catch (_) { /* the guard must not take the feature down */ }
  return null
}

/** Async now: the key may have been entered from the admin page rather than
 *  set as an environment variable. */
export function apiKey(req) {
  return setting('ANTHROPIC_API_KEY', '', req)
}

export const NO_AI = {
  ok: false,
  code: 'AI_NOT_CONFIGURED',
  message:
    'AI機能が未設定です。console.anthropic.com で API キーを発行し、管理画面の「設定状況 › キーの入力」に貼ってください（再デプロイ不要）。' +
    'キーの保存先（Upstash Redis）が未接続のときは、Vercel の環境変数に ANTHROPIC_API_KEY として設定して再デプロイしてください。',
}
