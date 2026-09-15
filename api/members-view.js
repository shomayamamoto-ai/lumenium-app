export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'
import { SCOPE } from './_share.js'

import { listContacts } from './_resend-audience.js'

// Live member list view: GET /api/members-view?s=<share token> renders the
// always-current list as an HTML table — no download step. Auto-refreshes
// every 60s; same auth guarantees as the other admin endpoints.
//
// ?key=<ADMIN_KEY> still works, because share tokens need Redis and it may not
// be connected yet. Issue a share link from the admin page when it is: that
// one can be withdrawn on its own, and it opens nothing but this list.

const enc = new TextEncoder()

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
  const denied = await requireAdmin(req, { as: 'text', allowQueryKey: true, share: SCOPE })
  if (denied) return denied

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return text('RESEND_API_KEY が未設定です。', 503)

  const members = await listContacts(apiKey)
  if (members === null) return text('会員リストの取得に失敗しました。時間をおいて再度お試しください。', 502)

  members.sort((a, b) => (b.created || '').localeCompare(a.created || ''))
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })
  // Carry whichever credential opened this page through to the Excel link, so
  // the download works for a share-link recipient too — and so this page never
  // has to name the admin key to build it. (It used to read a `submitted`
  // variable that the move to the shared guard had already removed, which
  // meant every authorised request to this page threw before rendering.)
  const url = new URL(req.url)
  const carried = ['s', 'key']
    .map((p) => [p, (url.searchParams.get(p) || '').trim()])
    .find(([, v]) => v)
  const xlsxHref = carried
    ? `/api/members-xlsx?${carried[0]}=${encodeURIComponent(carried[1])}`
    : null

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
      ${xlsxHref ? `<a href="${escapeHtml(xlsxHref)}">Excelでダウンロード</a>` : ''}
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
