// Regenerates api/_puzzle-html.js from private/puzzle.html.
// Like the arena, the members puzzle lives outside public/ so the only way
// to reach it is through the session-checked function.
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('private/puzzle.html', 'utf8')
writeFileSync(
  'api/_puzzle-html.js',
  '// GENERATED from private/puzzle.html — edit that file, then run: node scripts/build-puzzle.mjs\n' +
  'export default ' + JSON.stringify(html) + '\n'
)
console.log('api/_puzzle-html.js written,', html.length, 'chars')
