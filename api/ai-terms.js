export const config = { runtime: 'edge' }

// AI用語図鑑（管理画面）。取り込んだ用語を読む・取り込む・消す。
//
//   GET                     … { ok, meta, sections }（ログインした人だけ。まだ取り込んでいなければ sections は空）
//   POST { action:'import', data }  … 図鑑の JSON を取り込む（前の中身と入れ替え）
//   POST { action:'clear' }         … 取り込んだ用語を消す
//
// 図鑑は別の非公開リポジトリのものなので、このサイトのファイルには入れず、
// 保存先（Upstash）に置いて、ログインした人にだけ返します。

import { requireAdmin, json, whoOf } from './_admin-auth.js'
import { storeFor } from './_analytics-store.js'
import { normalizeTerms, readAll, saveAll, clearAll, LIMITS } from './_ai-terms.js'

const NO_STORE = { ok: false, code: 'NO_STORE', message: '保存先（Upstash）が未設定のため、図鑑を置けません。「設定状況」で保存先をつないでください。' }

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await storeFor(req)
  if (!cfg) return json({ ok: true, meta: null, sections: [], noStore: true })
  try {
    const { meta, sections } = await readAll(cfg)
    return json({ ok: true, meta, sections })
  } catch (e) {
    return json({ ok: false, message: `図鑑を読めませんでした（${String((e && e.message) || e).slice(0, 120)}）` }, 502)
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await storeFor(req)
  if (!cfg) return json(NO_STORE, 503)

  const len = Number(req.headers.get('content-length') || 0)
  if (len > LIMITS.body) return json({ ok: false, message: 'ファイルが大きすぎます（3MBまで）。' }, 413)
  let body
  try { body = await req.json() } catch { return json({ ok: false, message: '内容を読み取れませんでした。' }, 400) }
  body = body || {}

  try {
    if (body.action === 'clear') {
      await clearAll(cfg)
      return json({ ok: true, meta: null, sections: [] })
    }
    if (body.action === 'import') {
      const data = normalizeTerms(body.data)
      if (!data.ok) return json({ ok: false, message: data.message }, 400)
      const meta = await saveAll(cfg, data, whoOf(req))
      return json({ ok: true, meta, sections: data.sections })
    }
  } catch (e) {
    return json({ ok: false, message: `保存できませんでした（${String((e && e.message) || e).slice(0, 120)}）` }, 502)
  }
  return json({ ok: false, message: 'import か clear を指定してください。' }, 400)
}
