export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'
import { setting } from './_settings.js'
import { ghFile, b64encodeUtf8, b64decodeUtf8, repoName, ghDetail, lastCommit, fileHistory, fileAt } from './_github.js'
import { storeFor, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { jstToday, realDay, checkImage } from '../src/lib/news.js'

// Admin news publishing: commits public/news.json to the GitHub repo via
// the Contents API. Vercel's GitHub integration then redeploys, so a post
// goes live in ~1-2 minutes — no database needed, history lives in git.
//
// 下書きは別です。下書きを保存するたびにコミットすると、そのたびにサイトの
// 作り直し（ビルド）が走ります。下書きは保存先（Upstash Redis）の
// `${KV}news:drafts` にだけ置き、公開したときに初めてコミットします。
//
// 予約（status: 'scheduled' と publishAt）はコミットしますが、サイトを作る
// ときに公開日まで外します（src/lib/news.js の isLive）。公開日の朝の
// 自動処理（api/_news-cron.js）がサイトを作り直させます。
//
//   GET                 → { items, commit, drafts }
//   GET ?history=1      → { history: [{ sha, at, message }] }（最近20回）
//   POST action: add | edit | delete           （コミット）
//   POST action: draft-save | draft-delete     （Redis だけ。ビルドは走りません）
//   POST action: revert, sha                   （その時点の内容を新しいコミットで書き戻す）
//
// Requires env: ADMIN_KEY (auth, same as the member-list endpoints) and
// GITHUB_TOKEN (fine-grained PAT with Contents read/write on the repo).
// Optional: GITHUB_REPO ("owner/repo", defaults to the site repo).

const FILE_PATH = 'public/news.json'
export const DRAFTS_KEY = `${KV}news:drafts`
const DRAFTS_MAX = 30

const NO_TOKEN = {
  ok: false, code: 'GITHUB_NOT_CONFIGURED',
  message: 'GITHUB_TOKEN が未設定です。GitHubのFine-grained PAT（対象リポジトリのContents: Read and write権限）を作成し、Vercelの環境変数に設定して再デプロイしてください。',
}
const NO_STORE = '下書きの保存先（Upstash Redis）が未接続です。設定状況から保存先をつなぐと、下書きを残せます。いまは「すぐ公開」か「予約」だけ使えます。'

async function readDrafts(req) {
  const cfg = await storeFor(req)
  if (!cfg) return null
  try {
    const [raw] = await pipeline(cfg, [['GET', DRAFTS_KEY]])
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch (_) { return [] }
}

/** The committed list, which is not the same as the published one: a commit is
 *  instant and the redeploy behind it is not. The admin reads this so a post
 *  made a minute ago is not missing from its own list. */
export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const drafts = await readDrafts(req)
  const token = await setting('GITHUB_TOKEN', '', req)
  if (!token) return json({ ...NO_TOKEN, drafts }, 503)
  const repo = repoName()

  if (new URL(req.url).searchParams.get('history')) {
    const history = await fileHistory(token, repo, FILE_PATH, 20)
    if (!history) return json({ ok: false, code: 'GITHUB_ERROR', message: '保存の履歴を読み込めませんでした。時間をおいてもう一度お試しください。' }, 502)
    return json({ ok: true, history })
  }

  const cur = await ghFile(token, repo, FILE_PATH)
  if (!cur.ok) {
    return json({
      ok: false, code: 'GITHUB_ERROR', drafts,
      message: `ニュースファイルを読み込めませんでした。${ghDetail(cur.status)}`,
    }, 502)
  }
  const curJson = await cur.json()
  let items = []
  try {
    const parsed = JSON.parse(b64decodeUtf8(curJson.content || ''))
    if (Array.isArray(parsed)) items = parsed
  } catch (_) { items = [] }

  return json({ ok: true, items, drafts, today: jstToday(), commit: await lastCommit(token, repo, FILE_PATH) })
}

const bad = (message) => json({ ok: false, code: 'BAD_REQUEST', message }, 400)

/** タイトル・本文・リンク・画像の確認。下書きでも公開でも同じ決まりです。 */
export function checkPost({ title, body, link, image }, { draft = false } = {}) {
  if ((!draft && !title) || title.length > 80) return 'タイトルは1〜80文字で入力してください。'
  if (body.length > 600) return '本文は600文字以内で入力してください。'
  if (link && !/^https?:\/\/|^\/(?!\/)/.test(link)) return 'リンクは http(s):// か / で始まるURL（// で始まるものは不可）を指定してください。'
  const img = checkImage(image)
  if (!img.ok) return img.message
  return ''
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let payload
  try {
    payload = await req.json()
  } catch {
    return bad('不正なリクエストです。')
  }

  const action = payload?.action
  const title = String(payload?.title ?? '').trim()
  const body = String(payload?.body ?? '').trim()
  const link = String(payload?.link ?? '').trim()
  const delId = String(payload?.id ?? '').trim()
  const image = checkImage(payload?.image).image
  const todayJst = jstToday()

  /* ---- 下書き（コミットしない） ---- */
  if (action === 'draft-save' || action === 'draft-delete') {
    const cfg = await storeFor(req)
    if (!cfg) return json({ ok: false, code: 'NO_STORE', message: NO_STORE }, 503)
    const drafts = (await readDrafts(req)) || []
    let next
    if (action === 'draft-delete') {
      next = drafts.filter((d) => d && d.id !== delId)
    } else {
      const why = checkPost({ title, body, link, image: payload?.image }, { draft: true })
      if (why) return bad(why)
      if (!title && !body) return bad('タイトルか本文のどちらかを書いてから保存してください。')
      const id = /^d-[a-z0-9-]{4,40}$/.test(delId) ? delId : `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`
      const publishAt = realDay(payload?.publishAt) ? payload.publishAt : ''
      const draft = { id, title, body, link, image, publishAt, savedAt: new Date().toISOString() }
      next = [draft, ...drafts.filter((d) => d && d.id !== id)]
      if (next.length > DRAFTS_MAX) return bad(`下書きは${DRAFTS_MAX}件までです。使わない下書きを消してから保存してください。`)
    }
    try {
      await pipeline(cfg, [['SET', DRAFTS_KEY, JSON.stringify(next)]])
    } catch (_) {
      return json({ ok: false, code: 'STORE_ERROR', message: '下書きを保存できませんでした。時間をおいてもう一度お試しください。' }, 502)
    }
    return json({
      ok: true, drafts: next,
      message: action === 'draft-delete' ? '下書きを削除しました。' : '下書きを保存しました（サイトには出ていません）。',
    })
  }

  const token = await setting('GITHUB_TOKEN', '', req)
  const repo = repoName()
  if (!token) return json(NO_TOKEN, 503)

  /* ---- その時点に戻す ---- */
  if (action === 'revert') {
    const sha = String(payload?.sha || '')
    if (!/^[0-9a-f]{7,40}$/.test(sha)) return bad('戻す時点の指定が正しくありません。')
    const old = await fileAt(token, repo, FILE_PATH, sha)
    if (!old.ok) return json({ ok: false, code: 'GITHUB_ERROR', message: `その時点のお知らせを読み込めませんでした。${ghDetail(old.status)}` }, 502)
    const items = revertItems(old.text)
    if (!items) return bad('その時点のファイルが壊れているため、戻せません。')
    return commitItems(token, repo, () => ({ items, message: `news: ${sha.slice(0, 7)} の時点に戻す` }),
      `${sha.slice(0, 7)} の時点の内容に戻しました。サイトへの反映（約1〜2分）を下に表示します。`)
  }

  // 予約か、すぐ公開か。予約の日付は、明日から1年先まで。
  const scheduled = payload?.status === 'scheduled'
  let publishAt = ''
  if (scheduled) {
    publishAt = String(payload?.publishAt || '').trim()
    const limit = jstToday(Date.now() + 366 * 86400000)
    if (!realDay(publishAt) || publishAt <= todayJst || publishAt > limit) {
      return bad('予約の日付は、明日から1年先までの日付を選んでください。')
    }
  }

  // 日付は選べます（「昨日の更新」を今日書く、など）。書式が正しく、実在し、
  // 今日（日本時間）より先でなく、2年より前でもない日付だけを受け付けます。
  const rawDate = String(payload?.date ?? '').trim()
  let date = ''
  if (rawDate && !scheduled) {
    const d = new Date(rawDate + 'T00:00:00Z')
    const ok = realDay(rawDate) && rawDate <= todayJst && Date.now() - d.getTime() < 2 * 366 * 86400000
    if (!ok) return bad('日付は今日以前の正しい日付を指定してください。')
    date = rawDate
  }
  if (scheduled) date = publishAt

  if (action === 'add' || action === 'edit') {
    const why = checkPost({ title, body, link, image: payload?.image })
    if (why) return bad(why)
    if (action === 'edit' && !delId) return bad('編集対象のIDがありません。')
  } else if (action === 'delete') {
    if (!delId) return bad('削除対象のIDがありません。')
  } else {
    return bad('不明な操作です。')
  }

  const fromDraft = String(payload?.fromDraft || '')
  const res = await commitItems(token, repo,
    (items) => applyNews(items, { action, title, body, link, delId, image, publishAt, date: date || todayJst, keepDate: date }),
    scheduled
      ? `予約しました。${publishAt} の朝（9時ごろ）にサイトに出ます。それまではサイトには出ません。`
      : '保存しました。サイトへの反映（約1〜2分）を下に表示します。')
  // 下書きから公開・予約したら、その下書きは片付けます（失敗しても公開は済んでいます）。
  if (res.status === 200 && fromDraft) {
    try {
      const cfg = await storeFor(req)
      const drafts = await readDrafts(req)
      if (cfg && drafts) await pipeline(cfg, [['SET', DRAFTS_KEY, JSON.stringify(drafts.filter((d) => d && d.id !== fromDraft))]])
    } catch (_) {}
  }
  return res
}

/** Read, change, write — and if someone else saved in between (GitHub
 *  answers 409 because the file's sha moved), read again and re-apply the
 *  same change on top of theirs. A post is a small edit to a list, so
 *  re-applying it is safe; asking the owner to reload and retype was not. */
async function commitItems(token, repo, change, okMessage) {
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

    const next = change(items)
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
      id: next.id || null,
      // The admin follows this commit until the site has been rebuilt with it.
      commit: { sha: (saved.commit && saved.commit.sha) || null },
      message: okMessage,
    })
  }
}

/** 「この時点に戻す」で書き戻す中身。壊れたファイルは戻しません。 */
export function revertItems(text) {
  try {
    const items = JSON.parse(String(text || ''))
    if (!Array.isArray(items)) return null
    return items.filter((n) => n && typeof n === 'object' && n.id && n.title)
  } catch (_) { return null }
}

const byDate = (items) => items.map((n, i) => [n, i])
  .sort((a, b) => String(b[0].date).localeCompare(String(a[0].date)) || a[1] - b[1]).map((x) => x[0])

/** One stored post. Optional fields are left out rather than saved empty, so
 *  a post made the old way and one made now look the same in the file. */
function shape({ id, date, title, body, link, image, publishAt }) {
  const n = { id, date, title, body, link }
  if (image) n.image = image
  if (publishAt) { n.status = 'scheduled'; n.publishAt = publishAt }
  return n
}

/** The change itself, separate from reading and writing so it can be
 *  re-applied after a conflict. Every post is kept: the list used to be cut
 *  at 50, silently dropping the oldest. The site page shows the newest and
 *  folds the rest (scripts/build-content-pages.mjs). */
export function applyNews(items, { action, title, body, link, delId, date, keepDate, image = null, publishAt = '' }) {
  if (action === 'add') {
    const id = `n-${date.replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`
    // 過去の日付で書いたものも、日付の順に並ぶように（同じ日なら新しいものが上）
    return { id, items: byDate([shape({ id, date, title, body, link, image, publishAt }), ...items]), message: `news: ${title}` }
  }
  if (action === 'edit') {
    // The id and the date stay. Fixing a typo by deleting and retyping moved
    // the post to today and to the top of the list, which is not a correction.
    const at = items.findIndex((n) => n && n.id === delId)
    if (at < 0) return { error: { ok: false, code: 'NOT_FOUND', message: '該当のお知らせが見つかりません。' }, status: 404 }
    const out = items.slice()
    // 予約をやめて「すぐ公開」にしたとき、先の日付のまま残さない。
    const was = String(items[at].date || '')
    out[at] = shape({ id: items[at].id, date: keepDate || (was > date ? date : was), title, body, link, image, publishAt })
    return { id: items[at].id, items: byDate(out), message: `news: edit ${title}` }
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
