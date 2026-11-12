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
import * as R from '../src/lib/rhythm.js'
import { buildPrompt, buildSystem } from '../api/human-write.js'

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

/* ---- 人間らしい文章（src/lib/rhythm.js と api/human-write.js） ---- */
const AI_LIKE = '本記事では、ホームページ制作の重要なポイントについて解説します。ホームページは企業にとって非常に重要なツールです。デザインだけでなく、使いやすさも大切です。また、スマートフォン対応も欠かせません。さらに、更新のしやすさも重要なポイントです。このように、ホームページ制作では様々な要素を考える必要があると言えるでしょう。'
const HUMAN = '火曜の午後三時、店の電話が二回鳴って切れた。かけ直すべきか、少し迷った。結局かけなかった。あとで分かったのは、予約のページが携帯で開かなかったことだ。直すのは簡単だと思っていた。でも、どこまで直せば「開ける」と言えるのか、まだ決めきれていない。'
t('文に分ける（かぎかっこの中の。では切らない・見出しと箇条書きは数えない）', () => {
  assert.deepEqual(R.sentences('「はい。そうです」と言った。次。\n## 見出し\n- 項目\n本当に？'), ['「はい。そうです」と言った。', '次。', '本当に？'])
  assert.deepEqual(R.sentences('**太字**の文。'), ['太字の文。'])
})
t('文末の形と頭の動き方', () => {
  assert.equal(R.ending('そう思います。'), 'ます')
  assert.equal(R.ending('静かな店だった。'), 'だった')
  assert.equal(R.ending('本当だろうか。'), '問い')
  assert.equal(R.ending('午後三時の電話。'), '体言止め')
  assert.equal(R.mode('まだ決めきれていない、かもしれない。'), 'hesitate')
  assert.equal(R.mode('結局かけなかった。'), 'assert')
  assert.equal(R.mode('予約のページが携帯で開かなかったことを、あとで知って、それから長いあいだ考えていた。'), 'observe')
})
t('機械っぽい文章は引っかかり、考えている人の文章は通る', () => {
  const a = R.analyze(AI_LIKE), h = R.analyze(HUMAN)
  const ids = a.issues.map((x) => x.id)
  for (const id of ['meta', 'cliche', 'flat', 'wrapup']) assert.ok(ids.includes(id), id + ' が見つからない: ' + ids)
  assert.ok(a.score < 50, 'score ' + a.score)
  assert.equal(h.issues.filter((x) => x.level === 'warn').length, 0, JSON.stringify(h.issues))
  assert.ok(h.score >= 85)
  assert.deepEqual(R.analyze('').issues, [])
})
t('同じ文末が3回続くと指摘する', () => {
  const r = R.analyze('朝に店を開けます。窓を拭きます。看板を出します。それで、ようやく一日が始まる気がする。')
  assert.ok(r.issues.some((x) => x.id === 'endrun'))
  assert.match(R.issuesText(r), /同じ文末/)
})
t('AIへの依頼文：決まりを渡し、材料だけを使わせ、宣言を書かせない', () => {
  const sys = buildSystem()
  for (const r of R.WRITING_RULES) assert.ok(sys.includes(r.title))
  assert.match(sys, /作らない/)
  assert.match(buildPrompt({ mode: 'write', material: '材料X', purpose: 'blog', length: 'short' }), /150〜250字[\s\S]*材料X/)
  assert.match(buildPrompt({ mode: 'fix', text: '元X', issues: '- 指摘Y' }), /指摘Y[\s\S]*元X/)
  assert.match(buildPrompt({ mode: 'rewrite', text: '元Z' }), /事実[\s\S]*元Z/)
})
t('public/rhythm.js は元から作り直したものと同じ', () => {
  assert.equal(readFileSync(new URL('../public/rhythm.js', import.meta.url), 'utf8'), build('rhythm'), 'node scripts/build-markup.mjs を実行してください')
})
console.log(`  文章の書式・人間らしい文章のテスト ${n} 件すべて通りました。`)
