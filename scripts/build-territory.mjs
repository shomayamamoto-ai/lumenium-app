// Regenerates api/_territory-html.js from private/territory.html.
// The game HTML lives outside public/ so it is never served statically;
// the only way to reach it is through the session-checked function.
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('private/territory.html', 'utf8')
writeFileSync(
  'api/_territory-html.js',
  '// GENERATED from private/territory.html — edit that file, then run: node scripts/build-territory.mjs\n' +
  'export default ' + JSON.stringify(html) + '\n'
)
console.log('api/_territory-html.js written,', html.length, 'chars')
