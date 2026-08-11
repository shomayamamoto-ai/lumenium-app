export const config = { runtime: 'edge' }

import { listContacts } from './_resend-audience.js'
import { buildXlsx } from './_xlsx.js'

// Permalink Excel export: GET /api/members-xlsx?key=<ADMIN_KEY> builds a
// fresh .xlsx from the live member list on every request, so the same URL
// always yields the up-to-date sheet. Accepts the key via query (shareable
// link) or an Authorization: Bearer header. Same hard rule as the list
// endpoint: no dev fallback — ADMIN_KEY must be configured.

const enc = new TextEncoder()

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function keyMatches(submitted, configured) {
  const a = await hmacHex(String(submitted), 'lumenium-admin-compare')
  const b = await hmacHex(String(configured), 'lumenium-admin-compare')
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const fails = new Map()
function limited(ip) {
  const rec = fails.get(ip)
  return !!rec && Date.now() <= rec.resetAt && rec.count >= MAX_FAILS
}
function recordFail(ip) {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now > rec.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  else rec.count += 1
  if (fails.size > 1000) fails.clear()
}

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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const adminKey = (process.env.ADMIN_KEY || '').trim()
  if (!adminKey) return text('ADMIN_KEY が未設定です。Vercel の環境変数に設定してください。', 503)

  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  const submitted = (url.searchParams.get('key') || (auth.startsWith('Bearer ') ? auth.slice(7) : '')).trim()

  if (limited(ip) || !submitted || !(await keyMatches(submitted, adminKey))) {
    recordFail(ip)
    return text('アクセスキーが正しくありません。', 401)
  }
  fails.delete(ip)

  const apiKey = process.env.RESEND_API_KEY
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
