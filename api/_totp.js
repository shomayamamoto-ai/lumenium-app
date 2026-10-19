// 2段階認証（スマートフォンの認証アプリの6けたのコード。TOTP・RFC 6238）。
//
// Google Authenticator・Microsoft Authenticator・1Password など、どのアプリでも使える
// ふつうの形（30秒ごとに変わる6けた・SHA-1）です。外のサービスには頼らず、ここで計算します。
// 前後30秒のずれまでは受け付けます（スマートフォンの時計が少しずれていても入れるように）。
// 予備のコード（8つ・1回ずつ）は、スマートフォンを無くしたときのためのものです。保存するのは
// ハッシュだけで、元のコードは作ったときに1回だけ見せます。
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const enc = new TextEncoder()

export function base32Encode(bytes) {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s) {
  const clean = String(s || '').toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0, value = 0
  const out = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) return null
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return new Uint8Array(out)
}

export function newSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)))
}

/** 6けたのコード（counter は 30秒ごとの番号）。 */
export async function hotp(secret, counter) {
  const key = base32Decode(secret)
  if (!key || !key.length) return ''
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256) }
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg))
  const o = h[h.length - 1] & 15
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 1000000).padStart(6, '0')
}

/** コードが合っているか（前後1つ＝30秒のずれまで）。 */
export async function verifyTotp(secret, code, now = Date.now(), window = 1) {
  const c = String(code || '').replace(/\D/g, '')
  if (c.length !== 6) return false
  const step = Math.floor(now / 30000)
  for (let w = -window; w <= window; w++) {
    if ((await hotp(secret, step + w)) === c) return true
  }
  return false
}

/** 認証アプリに読ませる形（QR コードの中身）。 */
export function otpauthUri(issuer, account, secret) {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

/* ---------------- 予備のコード ---------------- */

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(String(s)))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const normRecovery = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** 予備のコードを8つ。{ codes: 見せる文字, hashes: 保存するもの } */
export async function newRecoveryCodes(n = 8) {
  const alpha = 'abcdefghjkmnpqrstuvwxyz23456789'
  const codes = []
  for (let i = 0; i < n; i++) {
    const r = crypto.getRandomValues(new Uint8Array(10))
    const raw = [...r].map((b) => alpha[b % alpha.length]).join('')
    codes.push(raw.slice(0, 5) + '-' + raw.slice(5))
  }
  return { codes, hashes: await Promise.all(codes.map((c) => sha256Hex('lum:otp-rc:' + normRecovery(c)))) }
}

/** 予備のコードが合えば、その1つを使った残りを返します（合わなければ null）。 */
export async function useRecovery(hashes, code) {
  const c = normRecovery(code)
  if (c.length !== 10) return null
  const h = await sha256Hex('lum:otp-rc:' + c)
  const list = Array.isArray(hashes) ? hashes : []
  const i = list.indexOf(h)
  if (i < 0) return null
  return list.slice(0, i).concat(list.slice(i + 1))
}

/** 6けたのコードか予備のコードで確かめます。{ ok, recovery: 残り|null } */
export async function checkSecondFactor(totp, code, now = Date.now()) {
  if (!totp || !totp.on || !totp.secret) return { ok: false }
  if (await verifyTotp(totp.secret, code, now)) return { ok: true, recovery: null }
  const rest = await useRecovery(totp.recovery, code)
  return rest ? { ok: true, recovery: rest } : { ok: false }
}
