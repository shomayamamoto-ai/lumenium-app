export const config = { runtime: 'edge' }

// IndexNow に全ページを送る。Bing・Yandex・Naver・Seznam が数分で取りに
// 来ます。ChatGPT検索やCopilotが読んでいるのは Bing の索引なので、AIの回答に
// 入る経路としてはここが一番速い。Google は IndexNow に参加していないので、
// そちらは Search Console からになります。
//
// これまで node scripts/indexnow.mjs を手元で叩く必要がありました。記事を
// 出したその場で押せないと、結局「あとでやる」になります。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig, pipeline } from './_analytics-store.js'

const KEY = '166607f542104bb9e1df8b1892799cdb'
const HOST = 'lumenium.net'
const LAST = 'lum:indexnow:last'

async function remember(rec) {
  const cfg = storeConfig()
  if (!cfg) return
  try { await pipeline(cfg, [['SET', LAST, JSON.stringify(rec), 'EX', 180 * 24 * 3600]]) } catch (_) {}
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  let last = null
  if (cfg) {
    try {
      const [raw] = await pipeline(cfg, [['GET', LAST]])
      last = raw ? JSON.parse(raw) : null
    } catch (_) { /* 記録が無いだけ */ }
  }
  return json({ ok: true, last, keyUrl: `https://${HOST}/${KEY}.txt` })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const origin = new URL(req.url).origin
  let urls = []
  try {
    const txt = await (await fetch(`${origin}/sitemap-urls.txt`, { cf: { cacheTtl: 0 } })).text()
    urls = txt.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http')).slice(0, 10000)
  } catch (e) {
    return json({ ok: false, message: 'URL一覧を読めませんでした: ' + String(e.message || e).slice(0, 120) }, 502)
  }
  if (!urls.length) return json({ ok: false, message: '送るURLがありません。' }, 400)

  let res
  try {
    res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
    })
  } catch (e) {
    return json({ ok: false, message: '送信できませんでした: ' + String(e.message || e).slice(0, 120) }, 502)
  }

  // 200 も 202 も受理。202 は「鍵の確認待ち」で、これも正常です。
  const ok = res.ok || res.status === 202
  const rec = { at: new Date().toISOString(), status: res.status, count: urls.length, ok }
  await remember(rec)
  if (!ok) {
    const detail = await res.text().catch(() => '')
    return json({ ok: false, message: `IndexNow が ${res.status} を返しました。${detail.slice(0, 160)}`, last: rec }, 502)
  }
  return json({
    ok: true,
    last: rec,
    message: `${urls.length}ページを送信しました（${res.status}）。Bing系は数分〜数時間で取りに来ます。`,
  })
}
