// 担当者のアカウント（管理画面に入れる人を、オーナーのほかに増やす）。
//
// パスワードは使いません。オーナーが担当者ごとに「個人のキー」を発行し、
// 一度だけ画面に出します。保存するのはキーそのものではなく、担当者ごとの
// 塩（salt）と PBKDF2（SHA-256・10万回）でかけたハッシュだけです。忘れた・
// 漏れたときは、オーナーが「キーを作り直す」と古いキーとログイン中の画面が
// まとめて使えなくなります（gen を進めるため）。
//
// キーの形:  lsk_<id>_<40文字>   … id で記録を1回で引けるので、全員分の
//            ハッシュを順に試す必要がありません。
// ログイン後: lss.<中身>.<署名>  … 12時間だけ使える札。生のキーを毎回
//            送らないためのものです。署名の鍵は ADMIN_KEY から作るので、
//            ADMIN_KEY を変えると全員の札がその場で無効になります。
//
//   ${KV}staff:users  … HASH  id → { id, name, email, role, active, createdAt,
//                                    lastLoginAt, keyIssuedAt, salt, hash, iter, gen }
//   ${KV}staff:fail:<id> … 失敗の回数（15分）。人ごとのロック。
//
// 保存先（Upstash Redis）が無いときは、担当者の機能は丸ごと使えません
// （オーナーのログインはこれまでどおり）。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { ROLES, ROLE_LABEL } from './_permissions.js'

export const USERS_KEY = `${KV}staff:users`
export const FAIL_KEY = (id) => `${KV}staff:fail:${id}`
export const ITERATIONS = 100000
export const SESSION_HOURS = 12
export const MAX_STAFF = 30
export const USER_FAILS = 5
export const USER_WINDOW_S = 15 * 60
/** オーナーとして作る人はいません（オーナーは ADMIN_KEY の持ち主だけ）。 */
export const STAFF_ROLES = ROLES.filter((r) => r !== 'owner')
export const OWNER = Object.freeze({ id: 'owner', name: 'オーナー', role: 'owner' })

const enc = new TextEncoder()

function b64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function sameText(a, b) {
  a = String(a); b = String(b)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 読み違えやすい字（0/O, 1/l/I）を外した、id 用の短い文字列。 */
export function newId() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const r = crypto.getRandomValues(new Uint8Array(8))
  return [...r].map((b) => abc[b % abc.length]).join('')
}

/** 個人のキー。240ビットの乱数。 */
export function newKey(id) {
  return `lsk_${id}_${b64url(crypto.getRandomValues(new Uint8Array(30)))}`
}

/** キーから id を取り出します。形が違えば ''。 */
export function keyId(key) {
  const m = /^lsk_([a-z0-9]{4,16})_[A-Za-z0-9_-]{32,}$/.exec(String(key || '').trim())
  return m ? m[1] : ''
}

export async function hashKey(key, salt, iter = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(key)), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(salt), iterations: iter }, base, 256
  )
  return b64url(new Uint8Array(bits))
}

/** 新しいキーの塩とハッシュ。返すキーはこのときだけ画面に出します。 */
export async function makeCredential(id, iter = ITERATIONS) {
  const key = newKey(id)
  const salt = b64url(crypto.getRandomValues(new Uint8Array(16)))
  return { key, salt, iter, hash: await hashKey(key, salt, iter) }
}

export async function verifyKey(key, rec) {
  if (!rec || !rec.salt || !rec.hash) return false
  const got = await hashKey(key, rec.salt, Number(rec.iter) || ITERATIONS)
  return sameText(got, rec.hash)
}

/* ---- ログイン後の札（12時間） ---- */

async function signingKey(secret) {
  // ADMIN_KEY をそのまま使わず、用途の名前を混ぜてから鍵にします。
  const seed = await crypto.subtle.digest('SHA-256', enc.encode('lum:staff-session:v1:' + secret))
  return crypto.subtle.importKey('raw', seed, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function sign(body, secret) {
  const sig = await crypto.subtle.sign('HMAC', await signingKey(secret), enc.encode(body))
  return b64url(new Uint8Array(sig))
}

export async function signSession(rec, secret, now = Date.now()) {
  const exp = now + SESSION_HOURS * 3600 * 1000
  const body = b64url(enc.encode(JSON.stringify({ sid: rec.id, gen: Number(rec.gen) || 0, exp })))
  return { token: `lss.${body}.${await sign(body, secret)}`, expiresAt: new Date(exp).toISOString() }
}

/** 署名と期限を確かめます。{ ok, sid, gen } / { ok:false, reason: 'bad'|'expired' } */
export async function verifySession(token, secret, now = Date.now()) {
  const m = /^lss\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(token || ''))
  if (!m || !secret) return { ok: false, reason: 'bad' }
  if (!sameText(await sign(m[1], secret), m[2])) return { ok: false, reason: 'bad' }
  let p = null
  try { p = JSON.parse(new TextDecoder().decode(fromB64url(m[1]))) } catch (_) {}
  if (!p || typeof p.sid !== 'string') return { ok: false, reason: 'bad' }
  if (!(Number(p.exp) > now)) return { ok: false, reason: 'expired' }
  return { ok: true, sid: p.sid, gen: Number(p.gen) || 0 }
}

export function isSessionToken(s) { return /^lss\./.test(String(s || '')) }
export function isStaffKey(s) { return /^lsk_/.test(String(s || '')) }

/* ---- 人ごとのロック ---- */

/** 失敗が上限に達しているか（純粋な判定。テスト用に分けています）。 */
export function userLocked(count) { return (Number(count) || 0) >= USER_FAILS }

export async function userFailState(id, cfg = storeConfig()) {
  if (!cfg) return { count: 0, retryAfter: 0 }
  try {
    const [count, ttl] = await pipeline(cfg, [['GET', FAIL_KEY(id)], ['TTL', FAIL_KEY(id)]])
    return { count: Number(count) || 0, retryAfter: Math.max(0, Number(ttl) || 0) }
  } catch (_) { return { count: 0, retryAfter: 0 } }
}
export async function recordUserFail(id, cfg = storeConfig()) {
  if (!cfg) return
  try { await pipeline(cfg, [['INCR', FAIL_KEY(id)], ['EXPIRE', FAIL_KEY(id), USER_WINDOW_S, 'NX']]) } catch (_) {}
}
export async function clearUserFails(id, cfg = storeConfig()) {
  if (!cfg) return
  try { await pipeline(cfg, [['DEL', FAIL_KEY(id)]]) } catch (_) {}
}

/* ---- 保存 ---- */

export function staffReady() { return !!storeConfig() }

export async function getStaff(id, cfg = storeConfig()) {
  if (!cfg || !id) return null
  const [raw] = await pipeline(cfg, [['HGET', USERS_KEY, String(id)]])
  try { return raw ? JSON.parse(raw) : null } catch (_) { return null }
}

export async function putStaff(rec, cfg = storeConfig()) {
  await pipeline(cfg, [['HSET', USERS_KEY, rec.id, JSON.stringify(rec)]])
}

export async function allStaff(cfg = storeConfig()) {
  if (!cfg) return []
  const [flat] = await pipeline(cfg, [['HGETALL', USERS_KEY]])
  const out = []
  const list = Array.isArray(flat) ? flat : []
  for (let i = 1; i < list.length; i += 2) {
    try { out.push(JSON.parse(list[i])) } catch (_) {}
  }
  return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

export async function removeStaff(id, cfg = storeConfig()) {
  await pipeline(cfg, [['HDEL', USERS_KEY, String(id)], ['DEL', FAIL_KEY(id)]])
}

/** 画面に返す形。塩とハッシュは決して出しません。 */
export function publicStaff(rec) {
  return {
    id: rec.id, name: rec.name, email: rec.email || '', role: rec.role, roleLabel: ROLE_LABEL[rec.role] || rec.role,
    active: rec.active !== false, createdAt: rec.createdAt || null, lastLoginAt: rec.lastLoginAt || null,
    keyIssuedAt: rec.keyIssuedAt || null,
  }
}

/** 名前・メール・役割の入力を整えます。{ ok, value } / { ok:false, message } */
export function cleanInput(b, { partial = false } = {}) {
  const out = {}
  if (!partial || b.name !== undefined) {
    const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40)
    if (!name) return { ok: false, message: '名前を入れてください。' }
    out.name = name
  }
  if (!partial || b.email !== undefined) {
    const email = String(b.email || '').trim().slice(0, 120)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'メールアドレスの形が正しくありません（空でもかまいません）。' }
    out.email = email
  }
  if (!partial || b.role !== undefined) {
    if (!STAFF_ROLES.includes(b.role)) return { ok: false, message: '役割は「管理者」「担当者」「閲覧のみ」から選んでください。' }
    out.role = b.role
  }
  return { ok: true, value: out }
}
