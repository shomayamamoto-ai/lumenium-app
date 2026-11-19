// 「動きでわかるAI用語図鑑」（別のリポジトリ・非公開）の index.html から、
// 用語だけを1つの JSON に書き出します。管理画面の「AI用語図鑑」で、その JSON を取り込みます。
//
//   node scripts/export-ai-terms.mjs <図鑑の index.html> <書き出し先.json>
//
// 図鑑の中身は、このリポジトリ（公開）には入れません。書き出した JSON も
// コミットしないでください（.gitignore に ai-terms*.json を入れてあります）。
//
// 図鑑のページは用語を window.__PARTS に置いているので、ページを開いてそれを読みます
// （絵を描く関数などは捨て、名前・指示文・説明だけを残します）。

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const [src, out] = process.argv.slice(2)
if (!src || !out) {
  console.error('使い方: node scripts/export-ai-terms.mjs <図鑑の index.html> <書き出し先.json>')
  process.exit(1)
}

let chromium
try { ({ chromium } = await import('playwright')) } catch {
  try { ({ chromium } = createRequire('/')('playwright')) } catch {
    console.error('playwright が見つかりません（npm i -D playwright）。')
    process.exit(1)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(path.resolve(src)).href, { waitUntil: 'load' })
await page.waitForFunction(() => Array.isArray(window.__PARTS) && window.__PARTS.length > 0, null, { timeout: 30000 })
await page.waitForTimeout(800)

const sections = await page.evaluate(() => {
  const text = (v) => {
    const d = document.createElement('div')
    d.innerHTML = String(v == null ? '' : v)
    return (d.textContent || '').replace(/\s+\n/g, '\n').trim()
  }
  const plain = (v) => String(v == null ? '' : v).trim()
  return window.__PARTS.map((p) => ({
    id: String(p.id || ''),
    chip: plain(p.chip),
    title: plain(p.title),
    tip: text(p.tip),
    groups: (p.groups || []).map((g) => ({
      title: plain(g.title),
      items: (g.items || []).map((it) => [plain(it.jp), plain(it.en), plain(it.desc)]),
    })).filter((g) => g.items.length),
  })).filter((p) => p.id && p.groups.length)
})
await browser.close()

const count = sections.reduce((a, s) => a + s.groups.reduce((b, g) => b + g.items.length, 0), 0)
const data = {
  v: 1,
  name: '動きでわかるAI用語図鑑',
  copyright: '© Lumenium 山本捷真',
  exportedAt: new Date().toISOString(),
  count,
  sections,
}
fs.writeFileSync(out, JSON.stringify(data))
console.log(`${sections.length} 分野・${count} 項目を書き出しました → ${out}（${Math.round(fs.statSync(out).size / 1024)}KB）`)
