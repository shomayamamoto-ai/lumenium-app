// Keys kept in the admin's own browser, for when there is nowhere else.
//
// Until now every key needed either a Vercel environment variable (leave the
// site, find the project, type the name, redeploy) or Upstash Redis (connect a
// database first). Both are one-time jobs, but both stand between "I have the
// token in my clipboard" and "the feature works", and the screen that asked
// for the token could not accept it. So the boxes were there and greyed out.
//
// This is the third way in: the value is encrypted here, handed to the
// browser as an HttpOnly cookie, and comes back on the admin's own requests.
// No database, no redeploy.
//
// What it is NOT:
//   · It is not shared. One browser holds it; another machine sees 未設定.
//   · It is not available to visitors' requests. The contact form, member
//     registration and session signing run on requests from other people's
//     browsers, which carry no such cookie — those still need the environment
//     or the store, and the admin screen says so per row.
//   · It is not stronger than the environment. Anyone who can open the admin
//     on this browser can use these keys, exactly as before.
//
// The encryption is there so the cookie is worthless on its own: the key is
// derived from ADMIN_KEY, so a copied cookie file, or a rotated admin key,
// decrypts to nothing and the row simply reads 未設定 again.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

const PREFIX = 'lum_k_'
const MAX_AGE = 180 * 24 * 60 * 60
const ATTRS = `; Path=/api; HttpOnly; Secure; SameSite=Strict`

// One decryption pass per request, not one per key lookup.
const perRequest = new WeakMap()

async function aesKey() {
  const admin = (process.env.ADMIN_KEY || '').trim()
  if (!admin || typeof crypto === 'undefined' || !crypto.subtle) return null
  try {
    const seed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lum:keybag:v1:' + admin))
    return await crypto.subtle.importKey('raw', seed, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  } catch (_) { return null }
}

const toB64url = (bytes) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64url = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function seal(value) {
  const key = await aesKey()
  if (!key) return ''
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return toB64url(out)
}

async function unseal(key, token) {
  try {
    const raw = fromB64url(token)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))
    return new TextDecoder().decode(plain)
  } catch (_) {
    // A cookie from before an ADMIN_KEY change, or a tampered one. Fail
    // closed: the row reads 未設定 rather than the request erroring.
    return ''
  }
}

/** Everything this browser is carrying, decrypted. */
export async function bag(req) {
  if (!req || !req.headers) return {}
  if (perRequest.has(req)) return perRequest.get(req)
  const out = {}
  perRequest.set(req, out)
  const header = req.headers.get('cookie') || ''
  if (!header.includes(PREFIX)) return out
  const key = await aesKey()
  if (!key) return out
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at < 0) continue
    const name = part.slice(0, at).trim()
    if (!name.startsWith(PREFIX)) continue
    const value = await unseal(key, part.slice(at + 1).trim())
    if (value) out[name.slice(PREFIX.length)] = value
  }
  return out
}

/** The Set-Cookie line that stores this value in the browser, or clears it. */
export async function cookieFor(name, value) {
  if (!value) return `${PREFIX}${name}=${ATTRS}; Max-Age=0`
  const sealed = await seal(value)
  if (!sealed) return ''
  return `${PREFIX}${name}=${sealed}${ATTRS}; Max-Age=${MAX_AGE}`
}

export async function bagReady() {
  return !!(await aesKey())
}
