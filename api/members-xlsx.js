export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'
import { setting } from './_settings.js'
import { SCOPE } from './_share.js'

import { listContacts } from './_resend-audience.js'
import { buildXlsx } from './_xlsx.js'

// Permalink Excel export: GET /api/members-xlsx?s=<share token> builds a
// fresh .xlsx from the live member list on every request, so the same URL
// always yields the up-to-date sheet. Accepts the key via query (shareable
// link) or an Authorization: Bearer header. Same hard rule as the list
// endpoint: no dev fallback — ADMIN_KEY must be configured.

const enc = new TextEncoder()

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export async function GET(req) {
  const denied = await requireAdmin(req, { as: 'text', allowQueryKey: true, share: SCOPE })
  if (denied) return denied

  const apiKey = await setting('RESEND_API_KEY')
  if (!apiKey) return text('RESEND_API_KEY が未設定です。', 503)

  const members = await listContacts(apiKey)
  if (members === null) return text('会員リストの取得に失敗しました。時間をおいて再度お試しください。', 502)

  members.sort((a, b) => (b.created || '').localeCompare(a.created || ''))
  const rows = [['お名前', '会社名・所属', 'メールアドレス', '登録日時', '配信状態']]
  for (const m of members) {
    rows.push([m.name || '', m.company || '', m.email || '', fmtDate(m.created), m.unsubscribed ? '配信停止' : ''])
  }
  const xlsx = buildXlsx(rows)

  return new Response(xlsx, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="lumenium-members.xlsx"',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function text(message, status) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
