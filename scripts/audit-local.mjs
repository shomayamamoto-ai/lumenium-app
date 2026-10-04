// サイトの点検（/api/site-audit と同じ判定）を、ビルドした dist/ に対して
// 手元で走らせます。公開前に「必ず直す」が増えていないかを確かめるための道具です。
//
//   npm run build && node scripts/audit-local.mjs          要約を表示
//   node scripts/audit-local.mjs --json > audit.json        結果をそのまま出す
//
// dist/ を小さなサーバーで配り、vercel.json と同じように振る舞わせます:
// 無いURLにはトップページ（index.html）を 200 で返し、vercel.json の
// headers（X-Robots-Tag など）も付けます。本番との違いは /api/* が無いことだけ
// です（og:image の /api/og などは、ここでは開けません）。
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { auditSite, CHECKS } from '../api/_audit-rules.js'

const DIST = new URL('../dist/', import.meta.url).pathname
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const TYPES = { '.html': 'text/html; charset=utf-8', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

// vercel.json's sources are path-to-regexp; the ones this site uses are
// plain regular expressions once anchored, and ':name*' means "anything".
const pattern = (src) => { try { return new RegExp('^' + src.replace(/:[a-z]+\*/gi, '.*').replace(/:[a-z]+\(([^)]*)\)/gi, '($1)') + '$') } catch (_) { return null } }
const headerRules = (vercel.headers || []).filter((h) => !h.has).map((h) => ({ re: pattern(h.source), headers: h.headers }))
const redirectRules = (vercel.redirects || []).filter((r) => !r.has).map((r) => ({ re: pattern(r.source), to: r.destination, code: r.permanent ? 308 : 307 }))

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  for (const r of redirectRules) if (r.re && r.re.test(path)) { res.writeHead(r.code, { location: r.to }); return res.end() }
  for (const h of headerRules) if (h.re && h.re.test(path)) for (const { key, value } of h.headers) res.setHeader(key, value)
  let file = join(DIST, path)
  if (path.endsWith('/')) file = join(file, 'index.html')
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const run = await auditSite({ origin, exclude: [/^\/(game|racing|runner|hitblow)\.html$/], budgetMs: 60000 })
server.close()

if (process.argv.includes('--json')) {
  for (const p of run.pages) for (const k of ['headLines', 'bodyGrams', 'blocks', 'leadBlocks', 'shingles', 'found']) delete p[k]
  console.log(JSON.stringify(run, null, 2))
} else {
  const judged = run.pages.filter((p) => !p.error && !p.excluded).length
  console.log(`点検したページ ${judged} / リンク先 ${run.linksChecked} 件 / 共通部分として除いたブロック ${run.boilerplateBlocks}`)
  console.log(`必ず直す ${run.counts.must}件・直すと良い ${run.counts.should}件・問題なし ${run.counts.ok}項目`)
  for (const level of ['must', 'should']) {
    const by = new Map()
    for (const f of run.findings.filter((x) => x.level === level)) {
      if (!by.has(f.check)) by.set(f.check, [])
      by.get(f.check).push(f)
    }
    for (const [check, list] of by) {
      console.log(`\n[${level === 'must' ? '必ず直す' : '直すと良い'}] ${CHECKS[check].bad}（${list.length}）`)
      for (const f of list.slice(0, 6)) console.log(`  ${f.page}${f.detail ? '　' + f.detail : ''}`)
      if (list.length > 6) console.log(`  …ほか${list.length - 6}件`)
    }
  }
  console.log('\n[問題なし] ' + run.passed.map((p) => p.label).join(' ／ '))
  for (const n of run.notes) console.log('※ ' + n)
}
