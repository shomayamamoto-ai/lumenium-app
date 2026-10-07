// AIO出現率の自動計測を、1回ぶん（50秒ほど）進める窓口。
// エッジ関数ではなく通常の関数（Node.js・最長60秒。vercel.json の "functions"）で
// 動かします。ウェブ検索つきの回答は1回に10〜30秒かかり、エッジ関数の持ち時間では
// 1回に1つずつしか進められないためです。
// 中身は _aio-auto.js。毎朝の自動処理（social-cron.js）と、この窓口自身
// （続きがあるとき）から、CRON_SECRET を付けて呼ばれます。
// vercel.json の "crons" には入れていません（定期実行は social-cron.js にまとめています）。
//
// すぐに 202 を返し、計測は応答のあと（waitUntil・関数の持ち時間まで）で進めます。呼んだ側が
// 待たずに済むので、続きを呼ぶたびに持ち時間が積み重なることがありません。

import { json } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import { stepAuto, kick } from './_aio-auto.js'

async function same(a, b) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s)))))
  const u = new Uint8Array(x)
  const v = new Uint8Array(y)
  let d = 0
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]
  return d === 0
}

const REQ_CONTEXT = Symbol.for('@vercel/request-context')
function waitUntilOf() {
  try {
    const c = globalThis[REQ_CONTEXT] && globalThis[REQ_CONTEXT].get && globalThis[REQ_CONTEXT].get()
    return c && typeof c.waitUntil === 'function' ? (p) => c.waitUntil(p) : null
  } catch (_) { return null }
}

// 1回に進める時間。関数の持ち時間（60秒）から、続きを呼ぶぶんを残します。
const STEP_MS = 45000

/** 1回ぶん進めて、続きがあれば次を呼ぶ。失敗しても投げません。 */
export async function advance(cfg, origin) {
  try {
    const r = await stepAuto(cfg, STEP_MS)
    if (r && r.more) await kick(origin)
    return r
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e).slice(0, 160) }
  }
}

export async function GET(req) {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return json({ ok: false, code: 'NO_CRON_SECRET', message: 'CRON_SECRET が未設定のため動きません。' }, 503)
  const auth = req.headers.get('authorization') || ''
  if (!(await same(auth, `Bearer ${secret}`))) return json({ ok: false, message: '認証できませんでした。' }, 401)
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: '保存先（Upstash Redis）の環境変数がありません。' }, 503)

  const origin = new URL(req.url).origin
  const later = waitUntilOf()
  if (later) {
    later(advance(cfg, origin))
    return json({ ok: true, accepted: true }, 202)
  }
  // 応答のあとで進められない環境では、その場で進めてから返します。
  return json(await advance(cfg, origin))
}
