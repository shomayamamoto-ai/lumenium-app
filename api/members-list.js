export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'
import { setting } from './_settings.js'

import { listContacts } from './_resend-audience.js'

// Admin-only member list. Handles personal data (names + emails), so unlike
// the game gate this endpoint has NO dev fallback: ADMIN_KEY must be set in
// the environment or the endpoint refuses to serve.

// Best-effort per-instance rate limit on failed attempts: 5 / 15 min per IP.

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const apiKey = await setting('RESEND_API_KEY')
  // Each refusal says what is actually wrong. The login no longer comes through
  // here (api/admin-ping.js), so these show inside the member list only, and
  // must not read as a problem with the admin key.
  if (!apiKey) {
    return json({
      ok: false, code: 'NOT_CONFIGURED',
      message: '会員リストは未設定です。メール送信サービス Resend の API キー（RESEND_API_KEY）を「設定状況 › キーの入力」に入れると表示されます。',
    }, 503)
  }

  const members = await listContacts(apiKey)
  if (members === null) {
    return json({
      ok: false, code: 'UPSTREAM_ERROR',
      message: '会員リストを一時的に取得できません（Resend 側の応答がありません）。少し時間をおいて「更新」を押してください。',
    }, 502)
  }

  // Newest first
  members.sort((a, b) => (b.created || '').localeCompare(a.created || ''))
  return json({ ok: true, count: members.length, members })
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
