// Revocable share links for the member list.
//
// Until now a share link was the admin key in a query string. That had two
// problems, and only one of them is obvious.
//
// The obvious one: the only way to withdraw a leaked link was to change
// ADMIN_KEY — which kills every other link at the same time and locks the
// owner out of the admin page until the new key is pasted in.
//
// The quieter one: the admin key authenticates *every* endpoint, not just the
// two the link points at. A URL handed to someone so they could read the
// member list was also, in their hands, permission to rewrite the site copy,
// post news, and spend on the AI endpoints. Nothing about the URL said so.
//
// A share token is bound to the member list, carries an expiry, and can be
// withdrawn one at a time. Only the SHA-256 of it is stored, so the full link
// exists exactly once: in the response to the request that issued it.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, pipeline } from './_analytics-store.js'

const TK = (hash) => `lum:share:t:${hash}`
const INDEX = 'lum:share:ix'

/** One scope for now: both member endpoints show the same list, so splitting
 *  them would be a distinction without a difference. Stored anyway, so an
 *  older token cannot silently widen if a second scope is ever added. */
export const SCOPE = 'members'

/** Enough links to cover a team; a ceiling so the index cannot grow without
 *  bound if something starts issuing them in a loop. */
export const MAX_LINKS = 20

/** Short-lived tokens minted by the 開く buttons so the admin key never lands
 *  in the address bar. Not listed, and gone within the quarter hour. */
const TEMP_TTL = 15 * 60

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(s) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

function mint() {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return hex(b)
}

export function shareReady() {
  return !!storeConfig()
}

/** Issue a link. Returns { token, link } — the token is not recoverable after
 *  this, because only its digest is written. */
export async function createShare({ label, days, temp }) {
  const cfg = storeConfig()
  if (!cfg) return null

  const token = mint()
  const hash = await sha256hex(token)
  const id = hash.slice(0, 10)
  const ttl = temp ? TEMP_TTL : (days > 0 ? days * 24 * 3600 : 0)
  const rec = {
    id,
    scope: SCOPE,
    label: String(label || '').slice(0, 60) || '共有リンク',
    createdAt: new Date().toISOString(),
    expiresAt: ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null,
    uses: 0,
    lastUsedAt: null,
    temp: !!temp,
  }

  const cmds = [ttl ? ['SET', TK(hash), JSON.stringify(rec), 'EX', ttl] : ['SET', TK(hash), JSON.stringify(rec)]]
  // Temporary tokens stay out of the index: they expire on their own, and
  // listing them would bury the real links under one row per click.
  if (!temp) cmds.push(['HSET', INDEX, id, hash])
  await pipeline(cfg, cmds)

  return { token, link: rec }
}

/** Active links, newest first. Expired entries are swept out of the index as
 *  they are noticed — the token keys expire themselves, the index does not. */
export async function listShares() {
  const cfg = storeConfig()
  if (!cfg) return null

  const [flat] = await pipeline(cfg, [['HGETALL', INDEX]])
  const pairs = []
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([String(flat[i]), String(flat[i + 1])])
  } else if (flat && typeof flat === 'object') {
    for (const [k, v] of Object.entries(flat)) pairs.push([k, String(v)])
  }
  if (!pairs.length) return []

  const raws = await pipeline(cfg, pairs.map(([, hash]) => ['GET', TK(hash)]))
  const links = []
  const dead = []
  pairs.forEach(([id], i) => {
    let rec = null
    try { rec = JSON.parse(raws[i]) } catch (_) {}
    if (rec) links.push(rec)
    else dead.push(id)
  })
  if (dead.length) {
    try { await pipeline(cfg, [['HDEL', INDEX, ...dead]]) } catch (_) {}
  }
  return links.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

/** Withdraw one link. Returns true when there was one to withdraw. */
export async function revokeShare(id) {
  const cfg = storeConfig()
  if (!cfg) return false
  const [hash] = await pipeline(cfg, [['HGET', INDEX, String(id)]])
  if (!hash) return false
  await pipeline(cfg, [['DEL', TK(String(hash))], ['HDEL', INDEX, String(id)]])
  return true
}

/** Check a token presented on a request. Returns the record, or null.
 *
 *  A revoked or expired token is simply absent — there is no tombstone to
 *  consult, because DEL and the TTL both remove the only thing that grants
 *  access. */
export async function useShare(token, scope) {
  const cfg = storeConfig()
  if (!cfg || !token) return null
  let hash
  try { hash = await sha256hex(String(token)) } catch (_) { return null }

  let rec = null
  try {
    const [raw] = await pipeline(cfg, [['GET', TK(hash)]])
    rec = raw ? JSON.parse(raw) : null
  } catch (_) { return null }
  if (!rec || rec.scope !== scope) return null

  // Best effort: an unrecorded visit is a worse report, not a failed request.
  // KEEPTTL so reading a link does not quietly extend its life.
  try {
    rec.uses = (Number(rec.uses) || 0) + 1
    rec.lastUsedAt = new Date().toISOString()
    await pipeline(cfg, [['SET', TK(hash), JSON.stringify(rec), 'KEEPTTL']])
  } catch (_) {}

  return rec
}
