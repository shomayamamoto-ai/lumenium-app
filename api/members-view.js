export const config = { runtime: 'edge' }

import { listContacts } from './_resend-audience.js'

// Live member list view: GET /api/members-view?key=<ADMIN_KEY> renders the
// always-current list as an HTML table — no download step. Auto-refreshes
// every 60s; same auth guarantees as the other admin endpoints.

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

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
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
  const submitted = (url.searchParams.get('key') || '').trim()

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
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })
  const keyParam = encodeURIComponent(submitted)

  const rows = members.map((m) => `
    <tr>
      <td>${escapeHtml(m.name) || '—'}</td>
      <td>${escapeHtml(m.company) || '—'}</td>
      <td class="email">${escapeHtml(m.email)}</td>
      <td>${escapeHtml(fmtDate(m.created))}</td>
      <td>${m.unsubscribed ? '<span class="unsub">配信停止</span>' : ''}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="refresh" content="60">
<title>会員リスト（ライブ） | Lumenium 管理</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    min-height:100dvh; background:#171c33; color:#f5f7fb; padding:32px 20px;
    font-family:'Zen Kaku Gothic New','Hiragino Sans',system-ui,-apple-system,sans-serif;
  }
  .wrap { max-width:900px; margin:0 auto; }
  header { display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
  header img { width:28px; height:28px; }
  h1 { font-size:18px; font-weight:700; }
  .tag {
    font-size:10px; font-weight:800; letter-spacing:0.16em;
    background:linear-gradient(135deg,#4f46e5,#06b6d4); color:#fff;
    padding:4px 10px; border-radius:999px;
  }
  .live-dot { width:8px; height:8px; border-radius:50%; background:#10b981; animation:pulse 1.6s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
  .meta { font-size:12px; color:#abb5cb; margin-bottom:18px; display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
  .meta a {
    color:#93c5fd; text-decoration:none; font-weight:700;
    padding:6px 14px; border:1px solid #424a6b; border-radius:8px;
  }
  .meta a:hover { border-color:#93c5fd; }
  .panel { background:#262c4a; border:1px solid #424a6b; border-radius:16px; padding:20px; overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #424a6b; white-space:nowrap; }
  th { font-size:11px; letter-spacing:0.1em; color:#abb5cb; }
  td.email { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:12.5px; }
  tr:hover td { background:rgba(99,102,241,0.07); }
  .unsub { color:#f87171; font-size:11px; }
  .empty { padding:28px; text-align:center; color:#abb5cb; font-size:13px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <img src="/favicon.svg" alt="">
      <h1>会員リスト</h1>
      <span class="tag">LIVE</span>
      <span class="live-dot" aria-hidden="true"></span>
    </header>
    <div class="meta">
      <span>${members.length} 件</span>
      <span>最終更新 ${escapeHtml(now)}（60秒ごと自動更新）</span>
      <a href="javascript:location.reload()">今すぐ更新</a>
      <a href="/api/members-xlsx?key=${keyParam}">Excelでダウンロード</a>
    </div>
    <div class="panel">
      ${members.length === 0
        ? '<div class="empty">まだ登録がありません。</div>'
        : `<table>
        <thead><tr><th>お名前</th><th>会社名・所属</th><th>メールアドレス</th><th>登録日時</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
    </div>
  </div>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
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
