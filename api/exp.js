export const config = { runtime: 'edge' }

// 訪問者の画面に配る「いま動いている文章の実験」（src/lib/experiments.js が読む）。
//
// 中身は実験の名前・対象の項目・B の文章・成果として数えるものだけで、
// 誰がどちらを見たかのような記録は一切含みません。管理画面で実験を
// 止めたり「すべて止める」を押したりすると、1分ほどで全員が元の文章に
// 戻ります（キャッシュの長さ）。保存先が無いとき・読めないときは
// 「実験なし」を返します——サイトが元の文章で出るだけです。

import { storeConfig, pipeline } from './_analytics-store.js'
import { readLive } from './_auto-store.js'

const EMPTY = { v: 1, exps: [], pins: {} }

export async function GET() {
  const cfg = storeConfig()
  let body = EMPTY
  if (cfg) {
    try { body = await readLive(cfg, pipeline) } catch (_) { body = EMPTY }
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // 端末では30秒、Vercel の手前では60秒。止めたときに早く効くように短めです。
      'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
    },
  })
}
