export const config = { runtime: 'edge' }

// Admin news publishing: commits public/news.json to the GitHub repo via
// the Contents API. Vercel's GitHub integration then redeploys, so a post
// goes live in ~1-2 minutes — no database needed, history lives in git.
//
// Requires env: ADMIN_KEY (auth, same as the member-list endpoints) and
// GITHUB_TOKEN (fine-grained PAT with Contents read/write on the repo).
// Optional: GITHUB_REPO ("owner/repo", defaults to the site repo).

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

// UTF-8 safe base64 helpers (edge runtime)
function b64encodeUtf8(str) {
  const bytes = enc.encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

const FILE_PATH = 'public/news.json'

async function gh(token, repo, path, init = {}) {
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lumenium-news',
      ...(init.headers || {}),
    },
  })
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const adminKey = (process.env.ADMIN_KEY || '').trim()
  if (!adminKey) return json({ ok: false, code: 'NOT_CONFIGURED', message: 'ADMIN_KEY が未設定です。' }, 503)

  const auth = req.headers.get('authorization') || ''
  const submitted = (auth.startsWith('Bearer ') ? auth.slice(7) : '').trim()
  if (limited(ip) || !submitted || !(await keyMatches(submitted, adminKey))) {
    recordFail(ip)
    return json({ ok: false, code: 'UNAUTHORIZED', message: '管理キーが正しくありません。' }, 401)
  }
  fails.delete(ip)

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO || 'shomayamamoto-ai/lumenium-app'
  if (!token) {
    return json({
      ok: false, code: 'GITHUB_NOT_CONFIGURED',
      message: 'GITHUB_TOKEN が未設定です。GitHubのFine-grained PAT（対象リポジトリのContents: Read and write権限）を作成し、Vercelの環境変数に設定して再デプロイしてください。',
    }, 503)
  }

  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, code: 'BAD_REQUEST', message: '不正なリクエストです。' }, 400)
  }

  const action = payload?.action
  const title = String(payload?.title ?? '').trim()
  const body = String(payload?.body ?? '').trim()
  const link = String(payload?.link ?? '').trim()
  const delId = String(payload?.id ?? '').trim()

  if (action === 'add') {
    if (!title || title.length > 80) return json({ ok: false, code: 'BAD_REQUEST', message: 'タイトルは1〜80文字で入力してください。' }, 400)
    if (body.length > 600) return json({ ok: false, code: 'BAD_REQUEST', message: '本文は600文字以内で入力してください。' }, 400)
    if (link && !/^https?:\/\/|^\//.test(link)) return json({ ok: false, code: 'BAD_REQUEST', message: 'リンクは http(s):// か / で始まるURLを指定してください。' }, 400)
  } else if (action === 'delete') {
    if (!delId) return json({ ok: false, code: 'BAD_REQUEST', message: '削除対象のIDがありません。' }, 400)
  } else {
    return json({ ok: false, code: 'BAD_REQUEST', message: '不明な操作です。' }, 400)
  }

  // Read current file (content + sha for the update)
  const cur = await gh(token, repo, FILE_PATH)
  if (!cur.ok) {
    const detail = cur.status === 401 || cur.status === 403 ? 'トークンの権限を確認してください。' : `GitHub応答: ${cur.status}`
    return json({ ok: false, code: 'GITHUB_ERROR', message: `ニュースファイルを読み込めませんでした。${detail}` }, 502)
  }
  const curJson = await cur.json()
  let items = []
  try {
    items = JSON.parse(b64decodeUtf8(curJson.content || ''))
    if (!Array.isArray(items)) items = []
  } catch {
    items = []
  }

  let message
  if (action === 'add') {
    const now = new Date()
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const date = jst.toISOString().slice(0, 10)
    const id = `n-${date.replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`
    items.unshift({ id, date, title, body, link })
    if (items.length > 50) items = items.slice(0, 50) // keep the file lean
    message = `news: ${title}`
  } else {
    const before = items.length
    items = items.filter((n) => n && n.id !== delId)
    if (items.length === before) return json({ ok: false, code: 'NOT_FOUND', message: '該当のお知らせが見つかりません。' }, 404)
    message = `news: remove ${delId}`
  }

  const put = await gh(token, repo, FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: b64encodeUtf8(JSON.stringify(items, null, 2) + '\n'),
      sha: curJson.sha,
    }),
  })
  if (!put.ok) {
    return json({ ok: false, code: 'GITHUB_ERROR', message: `保存に失敗しました（GitHub応答: ${put.status}）。時間をおいて再度お試しください。` }, 502)
  }

  return json({
    ok: true,
    items,
    message: '保存しました。自動デプロイ後、約1〜2分でサイトに反映されます。',
  })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
