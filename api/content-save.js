export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'
import { setting } from './_settings.js'
import { ghFile, b64encodeUtf8, b64decodeUtf8, repoName, ghDetail, lastCommit } from './_github.js'

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

const FILE_PATH = 'public/content.json'
const MAX_KEYS = 2000
const MAX_LEN = 4000
const PATH_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/

const NO_TOKEN = {
  ok: false, code: 'GITHUB_NOT_CONFIGURED',
  message: 'GITHUB_TOKEN が未設定です。GitHubのFine-grained PAT（対象リポジトリのContents: Read and write権限）を作成し、Vercelの環境変数に設定して再デプロイしてください。',
}

/** Read the committed overrides back. The editor used to load /content.json —
 *  the deployed copy — so pressing 再読込 within a minute of saving showed the
 *  text you had just replaced, as if the save had not happened. */
export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const token = await setting('GITHUB_TOKEN', '', req)
  if (!token) return json(NO_TOKEN, 503)
  const repo = repoName()

  const cur = await ghFile(token, repo, FILE_PATH)
  // No file yet simply means nothing has been overridden.
  if (cur.status === 404) return json({ ok: true, overrides: {}, commit: null })
  if (!cur.ok) {
    return json({
      ok: false, code: 'GITHUB_ERROR',
      message: `文章ファイルを読み込めませんでした。${ghDetail(cur.status)}`,
    }, 502)
  }
  const curJson = await cur.json()
  let overrides = {}
  try {
    const parsed = JSON.parse(b64decodeUtf8(curJson.content || ''))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) overrides = parsed
  } catch (_) { overrides = {} }

  return json({ ok: true, overrides, commit: await lastCommit(token, repo, FILE_PATH) })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const token = await setting('GITHUB_TOKEN', '', req)
  const repo = repoName()
  if (!token) return json(NO_TOKEN, 503)

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
  const cur = await ghFile(token, repo, FILE_PATH)
  if (!cur.ok && cur.status !== 404) {
    return json({ ok: false, code: 'GITHUB_ERROR', message: `文章ファイルを読み込めませんでした。${ghDetail(cur.status)}` }, 502)
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

  const put = await ghFile(token, repo, FILE_PATH, {
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
