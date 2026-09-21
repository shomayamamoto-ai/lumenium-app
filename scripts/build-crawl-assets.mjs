// Regenerates api/_crawl-assets.js from private/robots.txt and private/llms.txt.
//
// Those two files are the first thing every crawler asks for, which makes
// them the only place we can see who is crawling us — so they are served by a
// function that records the visit rather than by the CDN, and they live
// outside public/ so the CDN cannot answer first. Edit the text files; this
// turns them into a module the edge function can import with no filesystem
// and no network.
import { readFileSync, writeFileSync } from 'node:fs'

const robots = readFileSync('private/robots.txt', 'utf8')
// 「いつ時点の情報か」は、回答に使うかどうかの判断材料になります。毎回の
// ビルドで入れ替わるので、書き忘れることがありません。
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
// 記事数のような「増えていく数」を手で書くと、必ずどこかで古くなります。
// 実際の本数をビルド時に入れます。
const { articles } = await import('../src/data/articles.js')
const llms = readFileSync('private/llms.txt', 'utf8')
  .replace(/\{\{UPDATED\}\}/g, TODAY)
  .replace(/\{\{ARTICLES\}\}/g, String(articles.length))

writeFileSync(
  'api/_crawl-assets.js',
  '// GENERATED from private/robots.txt and private/llms.txt —\n' +
  '// edit those files, then run: node scripts/build-crawl-assets.mjs\n' +
  'export const ROBOTS_TXT = ' + JSON.stringify(robots) + '\n' +
  'export const LLMS_TXT = ' + JSON.stringify(llms) + '\n'
)
console.log(`api/_crawl-assets.js written, robots ${robots.length} chars, llms ${llms.length} chars`)
