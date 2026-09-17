export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'
import { setting } from './_settings.js'
import { ghFile, b64encodeUtf8, b64decodeUtf8, repoName, ghDetail, lastCommit } from './_github.js'

// Admin news publishing: commits public/news.json to the GitHub repo via
// the Contents API. Vercel's GitHub integration then redeploys, so a post
// goes live in ~1-2 minutes — no database needed, history lives in git.
//
// Requires env: ADMIN_KEY (auth, same as the member-list endpoints) and
// GITHUB_TOKEN (fine-grained PAT with Contents read/write on the repo).
// Optional: GITHUB_REPO ("owner/repo", defaults to the site repo).

const FILE_PATH = 'public/news.json'

const NO_TOKEN = {
  ok: false, code: 'GITHUB_NOT_CONFIGURED',
  message: 'GITHUB_TOKEN が未設定です。GitHubのFine-grained PAT（対象リポジトリのContents: Read and write権限）を作成し、Vercelの環境変数に設定して再デプロイしてください。',
}

/** The committed list, which is not the same as the published one: a commit is
 *  instant and the redeploy behind it is not. The admin reads this so a post
 *  made a minute ago is not missing from its own list. */
export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const token = await setting('GITHUB_TOKEN', '', req)
  if (!token) return json(NO_TOKEN, 503)
  const repo = repoName()

  const cur = await ghFile(token, repo, FILE_PATH)
  if (!cur.ok) {
    return json({
      ok: false, code: 'GITHUB_ERROR',
      message: `ニュースファイルを読み込めませんでした。${ghDetail(cur.status)}`,
    }, 502)
  }
  const curJson = await cur.json()
  let items = []
  try {
    const parsed = JSON.parse(b64decodeUtf8(curJson.content || ''))
    if (Array.isArray(parsed)) items = parsed
  } catch (_) { items = [] }

  return json({ ok: true, items, commit: await lastCommit(token, repo, FILE_PATH) })
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

  const action = payload?.action
  const title = String(payload?.title ?? '').trim()
  const body = String(payload?.body ?? '').trim()
  const link = String(payload?.link ?? '').trim()
  const delId = String(payload?.id ?? '').trim()

  if (action === 'add' || action === 'edit') {
    if (!title || title.length > 80) return json({ ok: false, code: 'BAD_REQUEST', message: 'タイトルは1〜80文字で入力してください。' }, 400)
    if (body.length > 600) return json({ ok: false, code: 'BAD_REQUEST', message: '本文は600文字以内で入力してください。' }, 400)
    if (link && !/^https?:\/\/|^\//.test(link)) return json({ ok: false, code: 'BAD_REQUEST', message: 'リンクは http(s):// か / で始まるURLを指定してください。' }, 400)
    if (action === 'edit' && !delId) return json({ ok: false, code: 'BAD_REQUEST', message: '編集対象のIDがありません。' }, 400)
  } else if (action === 'delete') {
    if (!delId) return json({ ok: false, code: 'BAD_REQUEST', message: '削除対象のIDがありません。' }, 400)
  } else {
    return json({ ok: false, code: 'BAD_REQUEST', message: '不明な操作です。' }, 400)
  }

  // Read current file (content + sha for the update)
  const cur = await ghFile(token, repo, FILE_PATH)
  if (!cur.ok) {
    return json({ ok: false, code: 'GITHUB_ERROR', message: `ニュースファイルを読み込めませんでした。${ghDetail(cur.status)}` }, 502)
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
  } else if (action === 'edit') {
    // The id and the date stay. Fixing a typo by deleting and retyping moved
    // the post to today and to the top of the list, which is not a correction.
    const at = items.findIndex((n) => n && n.id === delId)
    if (at < 0) return json({ ok: false, code: 'NOT_FOUND', message: '該当のお知らせが見つかりません。' }, 404)
    items[at] = { id: items[at].id, date: items[at].date, title, body, link }
    message = `news: edit ${title}`
  } else {
    const before = items.length
    items = items.filter((n) => n && n.id !== delId)
    if (items.length === before) return json({ ok: false, code: 'NOT_FOUND', message: '該当のお知らせが見つかりません。' }, 404)
    message = `news: remove ${delId}`
  }

  const put = await ghFile(token, repo, FILE_PATH, {
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
