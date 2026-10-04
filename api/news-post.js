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
  // 日付は選べます（「昨日の更新」を今日書く、など）。書式が正しく、実在し、
  // 今日（日本時間）より先でなく、2年より前でもない日付だけを受け付けます。
  const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const rawDate = String(payload?.date ?? '').trim()
  let date = ''
  if (rawDate) {
    const d = new Date(rawDate + 'T00:00:00Z')
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !isNaN(d) && d.toISOString().slice(0, 10) === rawDate &&
      rawDate <= todayJst && Date.now() - d.getTime() < 2 * 366 * 86400000
    if (!ok) return json({ ok: false, code: 'BAD_REQUEST', message: '日付は今日以前の正しい日付を指定してください。' }, 400)
    date = rawDate
  }

  if (action === 'add' || action === 'edit') {
    if (!title || title.length > 80) return json({ ok: false, code: 'BAD_REQUEST', message: 'タイトルは1〜80文字で入力してください。' }, 400)
    if (body.length > 600) return json({ ok: false, code: 'BAD_REQUEST', message: '本文は600文字以内で入力してください。' }, 400)
    if (link && !/^https?:\/\/|^\/(?!\/)/.test(link)) return json({ ok: false, code: 'BAD_REQUEST', message: 'リンクは http(s):// か / で始まるURL（// で始まるものは不可）を指定してください。' }, 400)
    if (action === 'edit' && !delId) return json({ ok: false, code: 'BAD_REQUEST', message: '編集対象のIDがありません。' }, 400)
  } else if (action === 'delete') {
    if (!delId) return json({ ok: false, code: 'BAD_REQUEST', message: '削除対象のIDがありません。' }, 400)
  } else {
    return json({ ok: false, code: 'BAD_REQUEST', message: '不明な操作です。' }, 400)
  }

  // Read, change, write — and if someone else saved in between (GitHub
  // answers 409 because the file's sha moved), read again and re-apply the
  // same change on top of theirs. A post is a small edit to a list, so
  // re-applying it is safe; asking the owner to reload and retype was not.
  for (let attempt = 0; attempt < 3; attempt++) {
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

    const next = applyNews(items, { action, title, body, link, delId, date: date || todayJst, keepDate: date })
    if (next.error) return json(next.error, next.status)

    const put = await ghFile(token, repo, FILE_PATH, {
      method: 'PUT',
      body: JSON.stringify({
        message: next.message,
        content: b64encodeUtf8(JSON.stringify(next.items, null, 2) + '\n'),
        sha: curJson.sha,
      }),
    })
    if (put.status === 409 && attempt < 2) continue
    if (!put.ok) {
      const detail = put.status === 409
        ? '他の保存と重なりました。画面を再読み込みしてからもう一度お試しください'
        : `GitHub応答: ${put.status}`
      return json({ ok: false, code: 'GITHUB_ERROR', message: `保存に失敗しました（${detail}）。時間をおいて再度お試しください。` }, 502)
    }
    const saved = await put.json().catch(() => ({}))
    return json({
      ok: true,
      items: next.items,
      // The admin follows this commit until the site has been rebuilt with it.
      commit: { sha: (saved.commit && saved.commit.sha) || null },
      message: '保存しました。サイトへの反映（約1〜2分）を下に表示します。',
    })
  }
}

const byDate = (items) => items.map((n, i) => [n, i])
  .sort((a, b) => String(b[0].date).localeCompare(String(a[0].date)) || a[1] - b[1]).map((x) => x[0])

/** The change itself, separate from reading and writing so it can be
 *  re-applied after a conflict. Every post is kept: the list used to be cut
 *  at 50, silently dropping the oldest. The site page shows the newest and
 *  folds the rest (scripts/build-content-pages.mjs). */
export function applyNews(items, { action, title, body, link, delId, date, keepDate }) {
  if (action === 'add') {
    const id = `n-${date.replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`
    // 過去の日付で書いたものも、日付の順に並ぶように（同じ日なら新しいものが上）
    return { items: byDate([{ id, date, title, body, link }, ...items]), message: `news: ${title}` }
  }
  if (action === 'edit') {
    // The id and the date stay. Fixing a typo by deleting and retyping moved
    // the post to today and to the top of the list, which is not a correction.
    const at = items.findIndex((n) => n && n.id === delId)
    if (at < 0) return { error: { ok: false, code: 'NOT_FOUND', message: '該当のお知らせが見つかりません。' }, status: 404 }
    const out = items.slice()
    out[at] = { id: items[at].id, date: keepDate || items[at].date, title, body, link }
    return { items: byDate(out), message: `news: edit ${title}` }
  }
  const out = items.filter((n) => n && n.id !== delId)
  if (out.length === items.length) return { error: { ok: false, code: 'NOT_FOUND', message: '該当のお知らせが見つかりません。' }, status: 404 }
  return { items: out, message: `news: remove ${delId}` }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
