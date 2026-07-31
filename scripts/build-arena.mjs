// Regenerates api/_arena-html.js from private/arena.html.
// The game HTML lives outside public/ so it is never served statically;
// the only way to reach it is through the session-checked function.
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('private/arena.html', 'utf8')
writeFileSync(
  'api/_arena-html.js',
  '// GENERATED from private/arena.html — edit that file, then run: node scripts/build-arena.mjs\n' +
  'export default ' + JSON.stringify(html) + '\n'
)
console.log('api/_arena-html.js written,', html.length, 'chars')
