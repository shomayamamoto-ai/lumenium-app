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
import { BRAND, KV } from './_brand.js'

// The key file of the same name must be in public/ (see indexnow.org).
const KEY = (process.env.INDEXNOW_KEY || '166607f542104bb9e1df8b1892799cdb').trim()
const HOST = BRAND.host
const LAST = `${KV}indexnow:last`

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

/** サイトの全ページを IndexNow に送る。管理画面のボタンと、自動送信の両方から。 */
export async function submitIndexNow(origin, extra = {}) {
  let urls = []
  try {
    const txt = await (await fetch(`${origin}/sitemap-urls.txt`, { cf: { cacheTtl: 0 } })).text()
    urls = txt.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http')).slice(0, 10000)
  } catch (e) {
    return { ok: false, status: 502, message: 'URL一覧を読めませんでした: ' + String(e.message || e).slice(0, 120) }
  }
  if (!urls.length) return { ok: false, status: 400, message: '送るURLがありません。' }

  let res
  try {
    res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
    })
  } catch (e) {
    return { ok: false, status: 502, message: '送信できませんでした: ' + String(e.message || e).slice(0, 120) }
  }

  // 200 も 202 も受理。202 は「鍵の確認待ち」で、これも正常です。
  const ok = res.ok || res.status === 202
  const rec = { at: new Date().toISOString(), status: res.status, count: urls.length, ok, ...extra }
  await remember(rec)
  if (!ok) {
    const detail = await res.text().catch(() => '')
    return { ok: false, status: 502, message: `IndexNow が ${res.status} を返しました。${detail.slice(0, 160)}`, last: rec }
  }
  return { ok: true, last: rec, message: `${urls.length}ページを送信しました（${res.status}）。Bing系は数分〜数時間で取りに来ます。` }
}

/** サイトが変わっていたら（sitemap.xml の中身が前回送ったときと違えば）送る。
 *  変わっていなくても、30日に1回は送り直します。手で押し忘れても、新しい
 *  ページや書き換えたページが検索エンジン（Bing → ChatGPT検索・Copilot）に
 *  届くように。毎朝の自動処理と、管理画面を開いたときに呼ばれます。 */
export async function autoIndexNow(origin) {
  const cfg = storeConfig()
  if (!cfg || !origin) return { ok: false, skipped: 'no-store' }
  let last = null
  try {
    const [raw] = await pipeline(cfg, [['GET', LAST]])
    last = raw ? JSON.parse(raw) : null
  } catch (_) { last = null }
  let hash = ''
  try {
    const xml = await (await fetch(`${origin}/sitemap.xml`)).text()
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml))
    hash = [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch (_) { return { ok: false, skipped: 'no-sitemap' } }
  const age = last && last.at ? Date.now() - Date.parse(last.at) : Infinity
  if (last && last.ok && last.hash === hash && age < 30 * 24 * 3600 * 1000) return { ok: true, skipped: 'unchanged' }
  // 送ってすぐの重複を避ける（同じ日に何度も画面を開いても、1回だけ）。
  if (last && last.hash === hash && age < 6 * 3600 * 1000) return { ok: true, skipped: 'recent' }
  return submitIndexNow(origin, { hash, auto: true })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const r = await submitIndexNow(new URL(req.url).origin)
  if (!r.ok) return json({ ok: false, message: r.message, last: r.last }, r.status || 502)
  return json({ ok: true, last: r.last, message: r.message })
}
