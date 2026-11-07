// 文章編集の書式（src/lib/markup.js）のテスト。外には一切出ません。
//
//   node scripts/test-markup.mjs
//
// 確かめること。
//   ・印の無い文章は、前と同じ（文字として出すだけ）
//   ・太字・斜体・リンク・改行、見出し・箇条書き・番号・表・画像
//   ・HTML や危ないリンク先（javascript: など）は通さない
//   ・検索結果の説明などに使う「印を外した文」
//   ・画面用に書き出したファイル（public/markup.js）が元とずれていない
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as M from '../src/lib/markup.js'
import { build } from './build-markup.mjs'

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error('✗ ' + name); throw e } }

t('印の無い文章は esc と同じ', () => {
  for (const s of ['ふつうの文。', '5 * 3 = 15、※注意', 'a_b_c', '[括弧] だけ', '<b>&"\'']) assert.equal(M.inlineHtml(s), M.esc(s))
})
t('文の中の書式', () => {
  assert.equal(M.inlineHtml('**太**と*斜*と***両方***'), '<strong>太</strong>と<em>斜</em>と<strong><em>両方</em></strong>')
  assert.equal(M.inlineHtml('[料金](/pricing.html)'), '<a href="/pricing.html">料金</a>')
  assert.equal(M.inlineHtml('[外](https://example.com)'), '<a href="https://example.com" target="_blank" rel="noopener">外</a>')
  assert.equal(M.inlineHtml('1行\n2行'), '1行<br>2行')
})
t('危ないものは通さない', () => {
  assert.ok(!/<a/.test(M.inlineHtml('[x](javascript:alert)')))
  assert.ok(!/<script/.test(M.inlineHtml('<script>alert(1)</script>')))
  assert.ok(!/<img/.test(M.blockHtml('![x](javascript:alert)')))
  assert.ok(!/<img/.test(M.blockHtml('![x](http://example.com/a.png)')), '画像は https とサイトの中だけ')
  assert.equal(M.safeUrl('//evil.example'), '')
})
t('段落の書式', () => {
  assert.equal(M.hasBlock('ふつう\n2行'), false)
  assert.equal(M.hasBlock('- 箇条'), true)
  const h = M.blockHtml('## 見出し\n本文\n- a\n- b\n1. 一\n2. 二\n| 項目 | 値 |\n|---|---|\n| A | 1 |\n![写真](/img/a.jpg)', { h: 2 })
  assert.match(h, /<h2>見出し<\/h2>/)
  assert.match(h, /<ul><li>a<\/li><li>b<\/li><\/ul>/)
  assert.match(h, /<ol><li>一<\/li><li>二<\/li><\/ol>/)
  assert.match(h, /<thead><tr><th>項目<\/th><th>値<\/th><\/tr><\/thead><tbody><tr><td>A<\/td><td>1<\/td><\/tr><\/tbody>/)
  assert.match(h, /<img src="\/img\/a.jpg" alt="写真"/)
  assert.equal(M.blockHtml('1行目\n2行目'), '<p>1行目<br>2行目</p>')
  assert.equal(M.blockHtml('1行目\n2行目', { perLine: true }), '<p>1行目</p>\n<p>2行目</p>')
})
t('印を外した文', () => {
  assert.equal(M.plain('## 見出し\n**太**と*斜*と[リンク](https://x.com)\n| a | b |\n|---|---|\n![絵](/x.png)\n- 項目'), '見出し\n太と斜とリンク\na / b\n絵\n・項目')
})
t('public/markup.js は元から作り直したものと同じ', () => {
  assert.equal(readFileSync(new URL('../public/markup.js', import.meta.url), 'utf8'), build(), 'node scripts/build-markup.mjs を実行してください')
})
console.log(`  文章の書式のテスト ${n} 件すべて通りました。`)
