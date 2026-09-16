export const config = { runtime: 'edge' }

// Reading and writing the keys the admin can enter.
//
// Admin key only, by the header only — this endpoint sets credentials, so it
// must not be reachable by a share link or by a key in a URL.
//
//   GET                                -> { ready, settings }
//   POST { name, value }               -> save (empty value clears it)
//
// A saved value is never returned. The status carries only whether one is set,
// where it came from, and its last four characters so two keys can be told
// apart.

import { requireAdmin, json } from './_admin-auth.js'
import { settingStatus, saveSetting, storeReady, SETTINGS } from './_settings.js'

const NO_STORE = {
  ok: false,
  ready: false,
  code: 'STORE_NOT_CONFIGURED',
  message:
    'キーを保存する場所がまだありません。Vercel の Storage から Upstash Redis を接続すると、以降のキーはこの画面から入力できるようになります。保存先そのものと管理キーだけは、この画面からは設定できません。',
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const ready = storeReady()
  const settings = await settingStatus()
  // Without a store nothing can be saved, but the environment may still have
  // values — so the list is worth showing either way, read-only.
  return json({ ok: true, ready, settings, message: ready ? '' : NO_STORE.message })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  if (!storeReady()) return json(NO_STORE, 503)

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }

  const name = String((body && body.name) || '')
  if (!SETTINGS.some((s) => s.name === name)) {
    return json({ ok: false, message: 'この項目は設定できません。' }, 400)
  }
  const value = String((body && body.value) || '')
  if (value.length > 4000) return json({ ok: false, message: '値が長すぎます。' }, 400)

  try {
    const res = await saveSetting(name, value)
    if (!res.ok) return json({ ok: false, message: res.message }, 502)
    return json({
      ok: true,
      cleared: res.cleared,
      settings: await settingStatus(),
      message: res.cleared
        ? '削除しました。環境変数が設定されていればそちらが使われます。'
        : '保存しました。すぐに反映されます（再デプロイは不要です）。',
    })
  } catch (_) {
    return json({ ok: false, message: '保存に失敗しました。時間をおいて再度お試しください。' }, 502)
  }
}
