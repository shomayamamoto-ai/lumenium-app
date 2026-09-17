// Regenerates api/_states-html.js from private/states.html.
// The game HTML lives outside public/ so it is never served statically;
// the only way to reach it is through the session-checked function.
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('private/states.html', 'utf8')
writeFileSync(
  'api/_states-html.js',
  '// GENERATED from private/states.html — edit that file, then run: node scripts/build-states.mjs\n' +
  'export default ' + JSON.stringify(html) + '\n'
)
console.log('api/_states-html.js written,', html.length, 'chars')
