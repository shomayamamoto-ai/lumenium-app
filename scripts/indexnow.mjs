// Submits every public URL to IndexNow (Bing, Yandex, Naver, Seznam …), which
// crawl within minutes instead of waiting for their own schedule. Bing's index
// is what ChatGPT search reads, so this is the fastest route into an AI answer.
// Google does not participate — use Search Console for that.
//
//   node scripts/indexnow.mjs
//
// The key must stay reachable at https://lumenium.net/<KEY>.txt containing
// exactly the key; that file is committed in public/.
import { readFileSync } from 'node:fs'

const KEY = '166607f542104bb9e1df8b1892799cdb'
const HOST = 'lumenium.net'

const urlList = readFileSync(new URL('../public/sitemap-urls.txt', import.meta.url), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList,
  }),
})

// 200 = accepted, 202 = accepted, key validation pending.
console.log(`IndexNow: ${res.status} ${res.statusText} — submitted ${urlList.length} URLs`)
if (!res.ok && res.status !== 202) {
  console.error(await res.text())
  process.exit(1)
}
