export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'
import { setting } from './_settings.js'
import { ghFile, b64encodeUtf8, b64decodeUtf8, repoName, ghDetail, lastCommit, fileHistory, fileAt } from './_github.js'
import { migrateOverrides, migratePath } from '../src/lib/content-ids.js'
import { applyOps } from '../src/lib/content-extra.js'

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
// Top-level keys that hold structured sections rather than one string each
// (src/lib/content-extra.js). They can never be a string path.
const SECTIONS = ['added', 'hidden', 'seo']
// Blog posts written in the admin live at /blog/<slug>.html; the built-in ones
// at /blog/post-<n>.html, which validArticleSlug already rules out.
const BUILTIN_SLUGS = []
const MAX_LEN = 4000
// A segment is a key, an index, or "@id" (an item of a list, by its id —
// see src/lib/content-ids.js).
const SEG = '(?:[A-Za-z0-9_]+|@[A-Za-z0-9_-]+)'
const PATH_RE = new RegExp(`^${SEG}(\\.${SEG})*$`)

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

  if (new URL(req.url).searchParams.get('history')) return history(token, repo)

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

  // Older index-keyed overrides are shown as the items they meant; the file
  // itself is rewritten that way on the next save. `stored` is the file as it
  // is, for comparing with the deployed copy.
  const { out } = migrateOverrides(overrides)
  return json({ ok: true, overrides: out, stored: overrides, commit: await lastCommit(token, repo, FILE_PATH) })
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

  if (payload?.revert) return revert(token, repo, String(payload.revert))

  // `changes`: one string per path. `ops`: the structured sections — items
  // added to or hidden from a list, page titles for search, blog posts
  // (src/lib/content-extra.js applyOps). Either may come alone.
  const changes = payload?.changes ?? {}
  const ops = payload?.ops
  if (typeof changes !== 'object' || Array.isArray(changes) || changes === null ||
      (!Object.keys(changes).length && !(ops && typeof ops === 'object'))) {
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
  // 古い「何番目」の書き方を、この保存のついでに id の書き方へ。
  const migrated = migrateOverrides(merged)
  merged = migrated.out

  let changed = 0
  for (const [raw, value] of Object.entries(changes)) {
    if (!PATH_RE.test(raw)) {
      return json({ ok: false, code: 'BAD_REQUEST', message: `不正な項目名です: ${raw}` }, 400)
    }
    if (SECTIONS.includes(raw)) {
      return json({ ok: false, code: 'BAD_REQUEST', message: `${raw} はこの形では保存できません。` }, 400)
    }
    // An editor page opened before the switch to ids still sends index paths.
    const path = migratePath(raw) || raw
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
  if (ops && typeof ops === 'object') {
    const r = applyOps(merged, ops, { builtinSlugs: BUILTIN_SLUGS })
    if (r.error) return json({ ok: false, code: 'BAD_REQUEST', message: r.error }, 400)
    for (const k of SECTIONS) {
      if (r[k] && Object.keys(r[k]).length) merged[k] = r[k]
      else delete merged[k]
    }
    changed += r.changed
  }

  // Nothing new from the admin: leave the file alone, even if it still has
  // old keys — they read correctly, and a commit means a whole rebuild.
  if (!changed) {
    return json({ ok: true, overrides: merged, changed: 0, message: '変更はありませんでした。' })
  }

  // Sorted keys keep the git diff readable when only one string moves.
  const sorted = {}
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k]

  const put = await ghFile(token, repo, FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      message: `content: ${changed} 件の文章を更新` + (migrated.moved ? `（${migrated.moved} 件の住所を id に移行）` : ''),
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

  // The admin follows this commit until the site has been rebuilt with it
  // (api/deploy-status.js), so a failed build is not mistaken for 「保存済み」.
  const saved = await put.json().catch(() => ({}))
  return json({
    ok: true,
    overrides: sorted,
    changed,
    commit: { sha: (saved.commit && saved.commit.sha) || null },
    message: `${changed} 件を保存しました。サイトへの反映（約1〜2分）を下に表示します。`,
  })
}

/* ---- 保存の履歴（最近20回）と、何が変わったか ----
   一覧の1行ごとに、その保存で変わった項目の住所を返します（画面が「お客様の声
   2件目・本文」のような言葉に直します）。各回の中身を GitHub から読み、
   1つ前の回と比べます。読めなかった回は「変更点を読めませんでした」と出します。 */
async function history(token, repo) {
  const list = await fileHistory(token, repo, FILE_PATH, 21)
  if (!list) return json({ ok: false, code: 'GITHUB_ERROR', message: '保存の履歴を読み込めませんでした。時間をおいてもう一度お試しください。' }, 502)
  const texts = await Promise.all(list.map((c) => fileAt(token, repo, FILE_PATH, c.sha)))
  const parse = (t) => {
    if (!t || !t.ok) return null
    try { const o = JSON.parse(t.text); return o && typeof o === 'object' && !Array.isArray(o) ? o : null } catch (_) { return null }
  }
  const versions = texts.map(parse)
  const out = list.slice(0, 20).map((c, i) => {
    const next = versions[i]
    // The oldest commit in the window has no "before" here unless a 21st was fetched.
    const prev = i + 1 < list.length ? versions[i + 1] : (list.length < 21 ? {} : undefined)
    return { ...c, changes: next && prev !== undefined && prev !== null ? diffContent(prev, next) : null }
  })
  return json({ ok: true, history: out })
}

/** Which fields differ between two versions of content.json: string paths
 *  (old index paths read as ids), and the added / hidden / seo sections as
 *  "added.faq:<id>", "hidden.cases:<id>", "seo:<path>", "articles:<slug>". */
export function diffContent(prev, next) {
  const a = migrateOverrides(prev).out
  const b = migrateOverrides(next).out
  const out = []
  const strings = (o) => Object.keys(o).filter((k) => typeof o[k] === 'string')
  for (const k of new Set([...strings(a), ...strings(b)])) if (a[k] !== b[k]) out.push(k)
  const sec = (o, k) => (o && o[k] && typeof o[k] === 'object' ? o[k] : {})
  for (const list of new Set([...Object.keys(sec(a, 'added')), ...Object.keys(sec(b, 'added'))])) {
    const key = list === 'articles' ? 'slug' : 'id'
    const byId = (arr) => Object.fromEntries((Array.isArray(arr) ? arr : []).map((x) => [x && x[key], JSON.stringify(x)]))
    const x = byId(sec(a, 'added')[list]), y = byId(sec(b, 'added')[list])
    for (const id of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (x[id] !== y[id]) out.push(list === 'articles' ? `articles:${id}` : `added.${list}:${id}`)
    }
  }
  for (const list of new Set([...Object.keys(sec(a, 'hidden')), ...Object.keys(sec(b, 'hidden'))])) {
    const x = new Set(sec(a, 'hidden')[list] || []), y = new Set(sec(b, 'hidden')[list] || [])
    for (const id of new Set([...x, ...y])) if (x.has(id) !== y.has(id)) out.push(`hidden.${list}:${id}`)
  }
  const sa = sec(a, 'seo'), sb = sec(b, 'seo')
  for (const p of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (JSON.stringify(sa[p]) !== JSON.stringify(sb[p])) out.push(`seo:${p}`)
  }
  return out
}

/** 「この時点に戻す」：その時点のファイルを、そのまま新しいコミットで書き戻します。 */
async function revert(token, repo, sha) {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return json({ ok: false, code: 'BAD_REQUEST', message: '戻す時点の指定が正しくありません。' }, 400)
  const old = await fileAt(token, repo, FILE_PATH, sha)
  if (!old.ok) return json({ ok: false, code: 'GITHUB_ERROR', message: `その時点の文章を読み込めませんでした。${ghDetail(old.status)}` }, 502)
  const back = revertContent(old.text)
  if (!back) return json({ ok: false, code: 'BAD_REQUEST', message: 'その時点のファイルが壊れているため、戻せません。' }, 400)
  const cur = await ghFile(token, repo, FILE_PATH)
  const curSha = cur.ok ? (await cur.json()).sha : undefined
  const put = await ghFile(token, repo, FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      message: `content: ${sha.slice(0, 7)} の時点に戻す`,
      content: b64encodeUtf8(JSON.stringify(back, null, 2) + '\n'),
      ...(curSha ? { sha: curSha } : {}),
    }),
  })
  if (!put.ok) return json({ ok: false, code: 'GITHUB_ERROR', message: `戻せませんでした（GitHub応答: ${put.status}）。時間をおいて再度お試しください。` }, 502)
  const saved = await put.json().catch(() => ({}))
  return json({
    ok: true, overrides: migrateOverrides(back).out, stored: back,
    commit: { sha: (saved.commit && saved.commit.sha) || null },
    message: `${sha.slice(0, 7)} の時点の文章に戻しました。サイトへの反映（約1〜2分）を下に表示します。`,
  })
}

/** 書き戻す中身。オブジェクトでないもの・文字でも節でもない値は戻しません。 */
export function revertContent(text) {
  let o
  try { o = JSON.parse(String(text || '')) } catch (_) { return null }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const out = {}
  for (const k of Object.keys(o).sort()) {
    const v = o[k]
    if (typeof v === 'string' || (SECTIONS.includes(k) && v && typeof v === 'object')) out[k] = v
  }
  return out
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
