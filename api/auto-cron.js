export const config = { runtime: 'edge' }

// 自動改善の毎朝の処理。Vercel の定期実行は増やさず、毎朝の
// api/social-cron.js の中から runAutoCron を呼びます（残り時間の中で）。
//
// この窓口（GET）は、同じ合言葉（CRON_SECRET）を付けたときだけ、手で
// 1回動かすためのものです。vercel.json の "crons" には入れていません。
//
// してよいことは管理画面の「自動改善」の設定で決まります。最初の設定では
// 観測（読むだけ）と提案・下書きだけで、サイトは何も変わりません。

import { json } from './_admin-auth.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { runDaily } from './_auto-run.js'

async function same(a, b) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s)))))
  const u = new Uint8Array(x)
  const v = new Uint8Array(y)
  let d = 0
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]
  return d === 0
}

/** social-cron.js から。budgetMs の中で終わらせ、失敗しても投げません。 */
export async function runAutoCron(req, budgetMs) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: '保存先がありません。' }
  try {
    return { ok: true, ...(await runDaily({ cfg, pipeline, req }, { budgetMs })) }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e).slice(0, 160) }
  }
}

export async function GET(req) {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return json({ ok: false, code: 'NO_CRON_SECRET', message: 'CRON_SECRET が未設定のため動きません。' }, 503)
  const auth = req.headers.get('authorization') || ''
  if (!(await same(auth, `Bearer ${secret}`))) return json({ ok: false, message: '認証できませんでした。' }, 401)
  return json(await runAutoCron(req, 20000))
}
