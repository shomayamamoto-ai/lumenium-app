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
const llms = readFileSync('private/llms.txt', 'utf8')

writeFileSync(
  'api/_crawl-assets.js',
  '// GENERATED from private/robots.txt and private/llms.txt —\n' +
  '// edit those files, then run: node scripts/build-crawl-assets.mjs\n' +
  'export const ROBOTS_TXT = ' + JSON.stringify(robots) + '\n' +
  'export const LLMS_TXT = ' + JSON.stringify(llms) + '\n'
)
console.log(`api/_crawl-assets.js written, robots ${robots.length} chars, llms ${llms.length} chars`)
