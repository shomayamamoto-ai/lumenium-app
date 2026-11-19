// SEO / AIO まわりの決まり: 存在しないURLの扱いと、掲載キットに書く事実。
//   node scripts/test-seo-kit.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PRICE_OPTIONS, PROFILES } from '../src/data/site.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name) }
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')

t('存在しないURLに、トップページを返さない（本物の404にする）', () => {
  // 以前は「どのURLでも index.html」を返していて、打ち間違いのURLがトップの中身のまま
  // 検索の索引に入っていました（例: /blog/post-4.html&gsessionid=…）。
  const v = JSON.parse(read('vercel.json'))
  assert.equal(v.rewrites.some((r) => r.destination === '/index.html'), false)
  assert.ok(fs.existsSync(new URL('../public/404.html', import.meta.url)))
  assert.match(read('public/404.html'), /name="robots"|content="noindex"/)
})

const kit = read('public/admin-seo-kit.js')
const man = (yen) => (yen % 10000 === 0 ? yen / 10000 + '万円〜' : null)

t('掲載キットの料金は、サイトの料金表と同じ数字', () => {
  const by = Object.fromEntries(PRICE_OPTIONS.map((o) => [o.key, o.min]))
  assert.ok(kit.includes(`動画制作（${man(by.video)}）`))
  assert.ok(kit.includes(`講師1回${man(by.ai)}`))
  assert.ok(kit.includes(`SNS運用・LINE構築（${man(by.sns)}）`))
  assert.ok(kit.includes(`開発（${man(by.web)}）`))
  assert.ok(kit.includes(`制作（${man(by.creative)}）`))
})

t('掲載キットの会社情報は、サイトの会社情報と同じ', () => {
  const org = read('src/data/org.js')
  assert.match(org, /name: 'Lumenium'/)
  assert.match(org, /foundingDate: '2026'/)
  assert.match(org, /name: '山本 捷真'/)
  for (const s of ['Lumenium（ルメニウム）', '山本 捷真', '2026年', 'https://lumenium.net', '東京都']) assert.ok(kit.includes(s), s)
})

t('公式アカウントのURLが入ったら、キットの「入っていません」を直すこと', () => {
  // PROFILES が空のあいだだけ、この案内が正しい。
  if (PROFILES.length) assert.doesNotMatch(kit, /公式アカウントのURLが1つも入っていません/)
  else assert.match(kit, /公式アカウントのURLが1つも入っていません/)
})

t('登録先のリンクは https で、開くときに元の画面を渡さない', () => {
  for (const m of kit.matchAll(/url: '([^']*)'/g)) assert.ok(m[1] === '' || m[1].startsWith('https://'), m[1])
  assert.match(kit, /rel="noopener noreferrer"/)
})

console.log(`\n${n} 件すべて通りました。`)
