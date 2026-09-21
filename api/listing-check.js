export const config = { runtime: 'edge' }

// 「載りに行くべきページ」に、いま自社が載っているかを実際に開いて確かめる。
//
// AIO計測は、答えを作るためにAIが開いたページのURLを残すようになりました。
// ただ、そこに自社が載っているかどうかは、一つずつ開いて Ctrl+F で探すしか
// ありませんでした。10件も20件もあると誰もやりません。
//
// やっていることは単純で、そのページを取ってきて、本文に社名があるかを見る
// だけです。モデルもAPIキーも使わないので費用はかかりません。
//
// 分かることと分からないこと:
//   ・載っている  → そのページはもう材料として自社を含んでいます。それでも
//                   答えに出ないなら、載り方（説明文・料金の有無）の問題。
//   ・見当たらない → 登録すれば材料に入ります。ここが作業先です。
//   ・読めなかった → 相手がこちらの取得を断った、あるいは一覧を後から
//                   JavaScript で描くページ。人の目で見る必要があります。
//                   「載っていない」と断定はしません。

import { requireAdmin, json } from './_admin-auth.js'
import { BRAND } from './_aio-catalog.js'

const LIMIT = 14
const BATCH = 4
const TIMEOUT_MS = 8000

const strip = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')

/** 社名が出ているか。同じ綴りの別会社（米国 Lumenium, LLC / Lumentum）を
 *  数えないよう、先に消してから探します。 */
function findsUs(text, html) {
  const cleaned = String(text)
    .replace(/lumenium,?\s*llc/gi, ' ')
    .replace(/lumentum/gi, ' ')
    .replace(/ルメンタム/g, ' ')
  const hasName = /ルメニウム/.test(cleaned) || /\blumenium\b/i.test(cleaned)
  // リンクは href の中にあるので、タグを落とす前の HTML を見ます。名前を
  // 出さずにURLだけ載せている一覧もあり、それも掲載のうちです。
  const hasLink = new RegExp(BRAND.domain.replace('.', '\\.'), 'i').test(String(html))
  return { hasName, hasLink }
}

async function checkOne(url) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      headers: {
        // 名乗ります。名乗らない取得は、相手からすれば区別のつかない機械です。
        'user-agent': 'LumeniumListingCheck/1 (+https://lumenium.net/about.html)',
        'accept-language': 'ja,en;q=0.8',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return { url, state: 'unreadable', note: `HTTP ${res.status}`, ms: Date.now() - t0 }
    const html = await res.text()
    const text = strip(html)
    const { hasName, hasLink } = findsUs(text, html)
    const title = (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1].trim().slice(0, 80)
    return {
      url,
      title,
      state: hasName || hasLink ? 'listed' : 'absent',
      hasName,
      hasLink,
      chars: text.length,
      ms: Date.now() - t0,
    }
  } catch (e) {
    const msg = String((e && e.message) || e)
    return {
      url,
      state: 'unreadable',
      note: /timed out|abort/i.test(msg) ? `${TIMEOUT_MS / 1000}秒以内に返りませんでした` : msg.slice(0, 80),
      ms: Date.now() - t0,
    }
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }

  const urls = [...new Set((Array.isArray(body && body.urls) ? body.urls : [])
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u))
    // 自社のページを数えても意味がない。
    .filter((u) => !u.includes(BRAND.domain)))]
    .slice(0, LIMIT)

  if (!urls.length) return json({ ok: false, message: '調べるURLがありません。' }, 400)

  const results = []
  for (let i = 0; i < urls.length; i += BATCH) {
    results.push(...await Promise.all(urls.slice(i, i + BATCH).map(checkOne)))
  }

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    results,
    listed: results.filter((r) => r.state === 'listed').length,
    absent: results.filter((r) => r.state === 'absent').length,
    unreadable: results.filter((r) => r.state === 'unreadable').length,
  })
}
