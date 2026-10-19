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
//
// 「掲載を終える日」（unpublishAt）も同じです。終える日の翌朝、サイトを作り直して
// ページと一覧から外します。デプロイフックのときは `end:<id>` を同じ保存先に
// 残し、コミットのときは印（ended: true）を付けます。印が付いたものは、あとで
// 管理画面から終える日を延ばして保存し直すまで、二度と数えません。

import { setting } from './_settings.js'
import { ghFile, b64encodeUtf8, b64decodeUtf8, repoName } from './_github.js'
import { storeFor, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { dueScheduled, dueEnded, jstToday } from '../src/lib/news.js'

const FILE_PATH = 'public/news.json'
export const RELEASED_KEY = `${KV}news:released`

/** Vercel のデプロイフックの住所か（それ以外の住所は呼びません）。 */
export function hookUrlOk(u) {
  return /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(String(u || '').trim())
}

/** 予約の印を外し、掲載を終えたものに印を付けた一覧（コミットで作り直すとき用）。 */
export function releaseItems(items, ids, endIds = []) {
  const want = new Set(ids)
  const end = new Set(endIds)
  return items.map((n) => {
    if (!n) return n
    let out = n
    if (want.has(n.id)) {
      const { status, publishAt, ...rest } = n
      out = rest
    }
    if (end.has(n.id)) out = { ...out, ended: true }
    return out
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
  const ended = dueEnded(items, today)
  if (!due.length && !ended.length) return { ok: true, due: 0, ended: 0 }
  // 保存先に残す印。予約は id のまま（以前からの形）、掲載終了は end:<id>。
  const marks = due.map((n) => n.id).concat(ended.map((n) => 'end:' + n.id))

  const hook = (await setting('DEPLOY_HOOK_URL', '', req)).trim()
  const cfg = await storeFor(req)
  if (hook && hookUrlOk(hook) && cfg) {
    let released = []
    try { released = JSON.parse((await pipeline(cfg, [['GET', RELEASED_KEY]]))[0] || '[]') } catch (_) { released = [] }
    if (!Array.isArray(released)) released = []
    const fresh = marks.filter((m) => !released.includes(m))
    if (!fresh.length) return { ok: true, due: due.length, ended: ended.length, via: 'hook', already: true }
    const r = await fetch(hook, { method: 'POST' }).catch(() => null)
    if (!r || !r.ok) return { ok: false, via: 'hook', message: `デプロイフックが応答しませんでした（${r ? r.status : '通信失敗'}）` }
    const keep = released.concat(fresh).slice(-200)
    try { await pipeline(cfg, [['SET', RELEASED_KEY, JSON.stringify(keep)]]) } catch (_) {}
    return { ok: true, due: due.length, ended: ended.length, via: 'hook', released: fresh }
  }

  const next = releaseItems(items, due.map((n) => n.id), ended.map((n) => n.id))
  const what = [due.length ? `予約の公開日 (${due.length}件)` : '', ended.length ? `掲載の終了 (${ended.length}件)` : ''].filter(Boolean).join('・')
  const put = await ghFile(token, repo, FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      message: `news: ${what}`,
      content: b64encodeUtf8(JSON.stringify(next, null, 2) + '\n'),
      sha: curJson.sha,
    }),
  })
  if (!put.ok) return { ok: false, via: 'commit', message: `予約の公開・掲載の終了のコミットに失敗しました（${put.status}）` }
  return { ok: true, due: due.length, ended: ended.length, via: 'commit', released: marks }
}
