// Does each editable string actually appear on a page?
//
// check-copy-reach.mjs answers the static half: is there code that reads this
// value. This answers the real question by measurement — it tags every
// editable string with a unique marker, builds, then looks for each marker in
// the generated pages and in the rendered app.
//
// It needs a build and a browser, so it is not part of prebuild. Run it after
// changing what the copy editor offers, or when a field is suspected of being
// inert:
//
//     node scripts/check-copy-render.mjs
//
// It writes public/content.json while it runs and restores it afterwards,
// including on failure.
//
// One thing to know before trusting a "not found": the site opens with a
// splash that covers the page for a few seconds. Crawling without dismissing
// it measures the splash and reports almost everything as unreachable. That
// is what happened the first time this was run, and skipSplash below is the
// fix.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { execSync, spawn } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname
const OVERRIDES = join(ROOT, 'public/content.json')
const PORT = 4488

let chromium
try {
  ({ chromium } = await import('playwright'))
} catch (_) {
  try {
    ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'))
  } catch (_) {
    console.log('playwright が見つからないため、この確認は飛ばします。')
    console.log('  npm i -D playwright  を入れると実行できます。')
    process.exit(0)
  }
}

const before = existsSync(OVERRIDES) ? readFileSync(OVERRIDES, 'utf8') : '{}'
const restore = () => writeFileSync(OVERRIDES, before)
process.on('exit', restore)
process.on('SIGINT', () => { restore(); process.exit(130) })

// A marker appended rather than substituted, so a value that is also a URL or
// a label keeps working and the page still builds.
const schema = JSON.parse(readFileSync(join(ROOT, 'public/content-schema.json'), 'utf8'))
const marked = {}
const byMarker = {}
let n = 0
for (const g of schema.groups) {
  for (const f of g.fields) {
    const mk = 'MK' + String(++n).padStart(4, '0')
    marked[f.path] = `${f.value} ${mk}`
    byMarker[mk] = f.path
  }
}
writeFileSync(OVERRIDES, JSON.stringify(marked, null, 2) + '\n')
console.log(`${n} 件に印を付けてビルドします…`)
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

const found = new Set()

// 1. The generated static pages — what search engines and answer engines read.
const html = []
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) { if (e !== 'assets') walk(p) }
    else if (extname(e) === '.html') html.push(p)
  }
}
walk(join(ROOT, 'dist'))
for (const m of html.map((p) => readFileSync(p, 'utf8')).join('\n').matchAll(/MK\d{4}/g)) found.add(m[0])
console.log(`静的HTML ${html.length} ファイル: ${found.size} 件`)

// 2. The app itself.
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: join(ROOT, 'dist'), stdio: 'ignore' })
const stop = () => { try { server.kill() } catch (_) {} }
process.on('exit', stop)
await new Promise((r) => setTimeout(r, 1500))

const ROUTES = ['', '#/info', '#/info/news', '#/info/pain', '#/info/story', '#/info/positioning',
  '#/info/services', '#/info/results', '#/info/pricing', '#/info/testimonials', '#/info/flow',
  '#/info/blog', '#/info/faq', '#/info/about', '#/info/company', '#/info/contact-form']

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })

const skipSplash = async () => {
  try { await page.locator('button:has-text("SKIP"), .splash-skip').first().click({ timeout: 1500, force: true }) } catch (_) {}
  await page.waitForTimeout(900)
}
const grab = async () => {
  const t = await page.evaluate(() => document.body.innerText + ' ' + document.body.innerHTML)
  for (const m of t.matchAll(/MK\d{4}/g)) found.add(m[0])
}

for (const r of ROUTES) {
  await page.goto(`http://localhost:${PORT}/${r}`, { waitUntil: 'networkidle' })
  await skipSplash()
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
  await page.waitForTimeout(500)
  await grab()
  if (r === '#/info/services') {
    const CARD = '.services-grid > *, .service-card, [class*="service-card"], article'
    const cards = await page.locator(CARD).count()
    for (let i = 0; i < cards; i++) {
      await page.locator(CARD).nth(i).click({ force: true }).catch(() => {})
      await page.waitForTimeout(450)
      await grab()
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(250)
    }
  }
  if (r === '#/info/faq') {
    const c = await page.locator('button').count()
    for (let i = 0; i < Math.min(c, 60); i++) await page.locator('button').nth(i).click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
    await grab()
  }
}
// The hero overlay, which is behind a button rather than a route.
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await skipSplash()
await page.locator('button.rcore').first().click({ force: true }).catch(() => {})
await page.waitForTimeout(1200)
await grab()
await browser.close()
stop()

const dead = Object.entries(byMarker).filter(([m]) => !found.has(m)).map(([, p]) => p)
console.log(`\n合計 ${found.size} / ${n} 件が表示されました。`)
if (dead.length) {
  console.log(`\nどこにも表示されなかった ${dead.length} 件:`)
  for (const p of dead) console.log('  ✗ ' + p)
  console.log('\nこの一覧は手がかりであって断定ではありません。クリックしないと出ない場所や、')
  console.log('文字ごとに分解して描画している箇所は、このクロールでは拾えないことがあります。')
  console.log('1件ずつ、実際にその文字列を描く場所があるかを確認してください。')
  process.exitCode = 1
} else {
  console.log('編集できる文章は、すべてどこかのページに出ます。')
}
