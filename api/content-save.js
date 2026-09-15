export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'

// Admin copy editing: commits public/content.json to the GitHub repo via the
// Contents API, exactly like news-post.js. Vercel's GitHub integration then
// redeploys, so an edit goes live in ~1-2 minutes and every revision is a
// git commit — no database, and nothing is ever silently overwritten.
//
// The file holds only overrides: a flat map of dotted paths to strings. The
// app and the static page generators apply it over the built-in copy, so a
// missing or partial file always degrades to the wording in the code.
//
// Requires env: ADMIN_KEY and GITHUB_TOKEN (fine-grained PAT, Contents:
// Read and write on the repo). Optional: GITHUB_REPO ("owner/repo").

const enc = new TextEncoder()

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

const FILE_PATH = 'public/content.json'
const MAX_KEYS = 2000
const MAX_LEN = 4000
const PATH_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/

async function gh(token, repo, path, init = {}) {
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lumenium-content',
      ...(init.headers || {}),
    },
  })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

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

  const changes = payload?.changes
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return json({ ok: false, code: 'BAD_REQUEST', message: '変更内容がありません。' }, 400)
  }

  // Read the current overrides first: the admin only sends what it changed,
  // so an edit from one browser must not wipe an edit made from another.
  const cur = await gh(token, repo, FILE_PATH)
  if (!cur.ok && cur.status !== 404) {
    const detail = cur.status === 401 || cur.status === 403 ? 'トークンの権限を確認してください。' : `GitHub応答: ${cur.status}`
    return json({ ok: false, code: 'GITHUB_ERROR', message: `文章ファイルを読み込めませんでした。${detail}` }, 502)
  }
  let sha
  let merged = {}
  if (cur.ok) {
    const curJson = await cur.json()
    sha = curJson.sha
    try {
      const parsed = JSON.parse(b64decodeUtf8(curJson.content || ''))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) merged = parsed
    } catch { merged = {} }
  }

  let changed = 0
  for (const [path, value] of Object.entries(changes)) {
    if (!PATH_RE.test(path)) {
      return json({ ok: false, code: 'BAD_REQUEST', message: `不正な項目名です: ${path}` }, 400)
    }
    // null means "restore the built-in wording" — drop the override entirely.
    if (value === null) {
      if (path in merged) { delete merged[path]; changed++ }
      continue
    }
    if (typeof value !== 'string') {
      return json({ ok: false, code: 'BAD_REQUEST', message: `文字列以外は保存できません: ${path}` }, 400)
    }
    if (value.length > MAX_LEN) {
      return json({ ok: false, code: 'BAD_REQUEST', message: `${path} が長すぎます（${MAX_LEN}文字まで）。` }, 400)
    }
    if (merged[path] !== value) { merged[path] = value; changed++ }
  }

  if (Object.keys(merged).length > MAX_KEYS) {
    return json({ ok: false, code: 'BAD_REQUEST', message: '項目数が上限を超えました。' }, 400)
  }
  if (!changed) {
    return json({ ok: true, overrides: merged, changed: 0, message: '変更はありませんでした。' })
  }

  // Sorted keys keep the git diff readable when only one string moves.
  const sorted = {}
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k]

  const put = await gh(token, repo, FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      message: `content: ${changed} 件の文章を更新`,
      content: b64encodeUtf8(JSON.stringify(sorted, null, 2) + '\n'),
      ...(sha ? { sha } : {}),
    }),
  })
  if (!put.ok) {
    const detail = put.status === 409
      ? '他の編集と競合しました。画面を再読み込みしてからもう一度お試しください。'
      : `GitHub応答: ${put.status}`
    return json({ ok: false, code: 'GITHUB_ERROR', message: `保存に失敗しました（${detail}）。` }, 502)
  }

  return json({
    ok: true,
    overrides: sorted,
    changed,
    message: `${changed} 件を保存しました。自動デプロイ後、約1〜2分でサイトに反映されます。`,
  })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
