// X（旧Twitter）への投稿に使う署名（OAuth 1.0a / HMAC-SHA1）。
//
// なぜこの方式か。X の開発者画面で「ボタンを押すだけで作れて、期限が
// 切れない」鍵はこれだけだからです。
//   ・画面の「Bearer Token」はアプリ専用で、投稿には使えません（403）。
//   ・OAuth 2.0 のユーザー用トークンは画面では作れず、2時間で切れます。
// 自社アカウント1つから投稿するだけなら、4つの鍵（API Key / API Key
// Secret / Access Token / Access Token Secret）で署名するのが一番確実です。
//
// JSON を送る POST では、本文は署名に含めません（含めるのはフォーム形式の
// ときだけ）。署名に入るのは oauth_* とクエリの値です。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

const enc = new TextEncoder()

/** RFC 3986 のパーセントエンコード。encodeURIComponent は ! ' ( ) * を
 *  そのまま残すので、署名がずれます。 */
export function pct(s) {
  return encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function b64(buf) {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s)
}

function nonce() {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 署名そのもの。テストで公式の例と突き合わせられるよう、
 *  nonce と時刻を外から渡せるようにしてあります。 */
export async function signature({ method, url, params, consumerSecret, tokenSecret }) {
  const norm = Object.keys(params)
    .map((k) => [pct(k), pct(params[k])])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1)))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = [method.toUpperCase(), pct(url), pct(norm)].join('&')
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(`${pct(consumerSecret)}&${pct(tokenSecret || '')}`),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(base)))
}

/** Authorization ヘッダの値。`extra` はクエリやフォームの値（署名に入るもの）。 */
export async function authHeader({ method, url, keys, extra = {}, now, nonceValue }) {
  const oauth = {
    oauth_consumer_key: keys.apiKey,
    oauth_nonce: nonceValue || nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(now || Math.floor(Date.now() / 1000)),
    oauth_token: keys.accessToken,
    oauth_version: '1.0',
  }
  const sig = await signature({
    method, url, params: { ...extra, ...oauth },
    consumerSecret: keys.apiSecret, tokenSecret: keys.accessSecret,
  })
  const all = { ...oauth, oauth_signature: sig }
  return 'OAuth ' + Object.keys(all).sort().map((k) => `${pct(k)}="${pct(all[k])}"`).join(', ')
}
