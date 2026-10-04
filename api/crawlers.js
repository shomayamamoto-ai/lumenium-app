export const config = { runtime: 'edge' }

// クローラーの来訪を、管理画面に返す。
//
// 記録しているのは root の middleware.js（全ページ・サイトマップ・robots.txt・
// llms.txt）。集計は _crawlers.js の readCrawls です。以前はサイト点検
// （/api/site-audit）の答えに相乗りしていましたが、点検はページを全部読むので
// 数秒かかり、来訪の表だけを見たいときにも待たされていました。来訪は保存先を
// 1回読むだけなので、ここで単独に返します。
//
// 保存先が無いときは ok のまま store: false を返します。「誰も来ていない」と
// 「記録する先が無い」は別の答えで、画面はそれを言い分ける必要があるからです。

import { requireAdmin, json } from './_admin-auth.js'
import { storeFor } from './_analytics-store.js'
import { readCrawls } from './_crawlers.js'

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const cfg = await storeFor(req).catch(() => null)
  if (!cfg) return json({ ok: true, store: false, crawlers: null })

  const crawlers = await readCrawls(cfg, 30).catch(() => null)
  if (!crawlers) {
    return json({ ok: false, store: true, message: '来訪の記録を読み込めませんでした。時間をおいて再度お試しください。' }, 502)
  }
  return json({ ok: true, store: true, crawlers })
}
