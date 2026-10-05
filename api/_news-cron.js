// お知らせの予約を、公開日の朝にサイトに出す（毎朝の自動処理 social-cron.js から呼びます）。
//
// 予約したお知らせは news.json に入っていますが、サイトを作るとき
// (scripts/build-content-pages.mjs) に公開日まで外しています。公開日が来ても、
// サイトを作り直さない限り出てきません。そこで毎朝1回、公開日が来た予約が
// あれば作り直させます。やり方は2つです。
//
//   1. DEPLOY_HOOK_URL（Vercel の「デプロイフック」）が設定されていれば、
//      そこを呼びます。コミットは増えません。同じ予約で2回呼ばないよう、
//      呼んだ予約の id を保存先（Redis）の `${KV}news:released` に残します。
//   2. 無ければ、その予約の印（status: 'scheduled'）を「公開済み」に変えて
//      コミットします。コミットが作り直しのきっかけになります。
//
// どちらも、公開日が来た予約が無い日は何もしません。

import { setting } from './_settings.js'
import { ghFile, b64encodeUtf8, b64decodeUtf8, repoName } from './_github.js'
import { storeFor, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { dueScheduled, jstToday } from '../src/lib/news.js'

const FILE_PATH = 'public/news.json'
export const RELEASED_KEY = `${KV}news:released`

/** Vercel のデプロイフックの住所か（それ以外の住所は呼びません）。 */
export function hookUrlOk(u) {
  return /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(String(u || '').trim())
}

/** 予約の印を外した一覧（コミットで作り直すとき用）。 */
export function releaseItems(items, ids) {
  const want = new Set(ids)
  return items.map((n) => {
    if (!n || !want.has(n.id)) return n
    const { status, publishAt, ...rest } = n
    return rest
  })
}

export async function runNewsCron(req, today = jstToday()) {
  const token = await setting('GITHUB_TOKEN', '', req)
  if (!token) return { ok: true, skipped: 'no-github' }
  const repo = repoName()
  const cur = await ghFile(token, repo, FILE_PATH)
  if (!cur.ok) return { ok: false, message: `news.json を読めませんでした（${cur.status}）` }
  const curJson = await cur.json()
  let items = []
  try { items = JSON.parse(b64decodeUtf8(curJson.content || '')) } catch (_) { items = [] }
  if (!Array.isArray(items)) items = []
  const due = dueScheduled(items, today)
  if (!due.length) return { ok: true, due: 0 }

  const hook = (await setting('DEPLOY_HOOK_URL', '', req)).trim()
  const cfg = await storeFor(req)
  if (hook && hookUrlOk(hook) && cfg) {
    let released = []
    try { released = JSON.parse((await pipeline(cfg, [['GET', RELEASED_KEY]]))[0] || '[]') } catch (_) { released = [] }
    if (!Array.isArray(released)) released = []
    const fresh = due.filter((n) => !released.includes(n.id))
    if (!fresh.length) return { ok: true, due: due.length, via: 'hook', already: true }
    const r = await fetch(hook, { method: 'POST' }).catch(() => null)
    if (!r || !r.ok) return { ok: false, via: 'hook', message: `デプロイフックが応答しませんでした（${r ? r.status : '通信失敗'}）` }
    const keep = released.concat(fresh.map((n) => n.id)).slice(-200)
    try { await pipeline(cfg, [['SET', RELEASED_KEY, JSON.stringify(keep)]]) } catch (_) {}
    return { ok: true, due: due.length, via: 'hook', released: fresh.map((n) => n.id) }
  }

  const next = releaseItems(items, due.map((n) => n.id))
  const put = await ghFile(token, repo, FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      message: `news: 予約の公開日 (${due.length}件)`,
      content: b64encodeUtf8(JSON.stringify(next, null, 2) + '\n'),
      sha: curJson.sha,
    }),
  })
  if (!put.ok) return { ok: false, via: 'commit', message: `予約の公開のコミットに失敗しました（${put.status}）` }
  return { ok: true, due: due.length, via: 'commit', released: due.map((n) => n.id) }
}
