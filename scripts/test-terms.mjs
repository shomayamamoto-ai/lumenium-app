// AI用語図鑑（api/_ai-terms.js）: 取り込みの確かめ・用語さがし・AI への渡し方。
// 図鑑そのものはリポジトリに入れないので、ここでは小さな見本で確かめます。
//   node scripts/test-terms.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeTerms, lexicon, findTerms, blockText, meaningOf, labelOf, countOf, LIMITS, saveAll, readAll, clearAll, readMeta, TK } from '../api/_ai-terms.js'
import { buildPrompt } from '../api/human-write.js'
import { planPrompt } from '../api/cm-plan.js'
import { designPrompt } from '../api/char-plan.js'
import { decide } from '../api/_permissions.js'

let n = 0
const t = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name) }

const SAMPLE = {
  v: 1, name: '見本の図鑑', copyright: '© 見本', exportedAt: '2026-11-19T00:00:00Z',
  sections: [
    { id: 'expl', chip: '説明の型 20', title: '説明の型 20', tip: '話の組み立て方', groups: [
      { title: '理解してもらう', items: [
        ['PREP法', '「PREP法」（結論 → 理由 → 具体例 → 結論）で書いて', '例を出して納得してもらうとき。'],
        ['型', '短い名前', '2文字より短い名前'],
        { jp: 'TAPS法', en: '「TAPS法」（理想 → 現状 → 問題 → 解決）で書いて', desc: '' },
      ] },
      { title: '空のグループ', items: [] },
    ] },
    { id: 'cam', chip: 'カメラワーク 97', title: 'カメラワーク', tip: '', groups: [
      { title: '基本', items: [['パン', 'pan', '左右に首を振る。'], ['ドリーイン', 'dolly in', 'カメラごと近づく。'], ['', 'x', '名前なしは捨てる']] },
    ] },
    { id: 'BAD ID', chip: 'x', groups: [{ title: 'x', items: [['a', 'b', 'c']] }] },
    { id: 'empty', chip: '空 0', groups: [] },
  ],
}

await t('取り込み: 形をそろえ、こわれた分野・空の項目は捨てる', () => {
  const r = normalizeTerms(SAMPLE)
  assert.equal(r.ok, true)
  assert.deepEqual(r.sections.map((s) => s.id), ['expl', 'cam'])
  assert.equal(r.count, 5)
  assert.equal(r.sections[0].label, '説明の型')
  assert.equal(r.sections[0].groups.length, 1)
  assert.deepEqual(r.sections[0].groups[0].items[2], ['TAPS法', '「TAPS法」（理想 → 現状 → 問題 → 解決）で書いて', ''])
  assert.equal(countOf(r.sections[1]), 2)
  assert.equal(r.copyright, '© 見本')
})

await t('取り込み: 図鑑でないもの・空のものは断る', () => {
  assert.equal(normalizeTerms(null).ok, false)
  assert.equal(normalizeTerms({ sections: 'x' }).ok, false)
  assert.equal(normalizeTerms({ sections: [{ id: 'a', groups: [{ items: [] }] }] }).ok, false)
})

await t('取り込み: 長すぎる言葉は切り、同じ id は1つだけ', () => {
  const r = normalizeTerms({ sections: [
    { id: 'a', chip: 'A 1', groups: [{ title: 'g', items: [['あ'.repeat(500), 'い'.repeat(5000), 'う'.repeat(5000)]] }] },
    { id: 'a', chip: 'A 1', groups: [{ title: 'g', items: [['二重', '', '']] }] },
  ] })
  assert.equal(r.sections.length, 1)
  const it = r.sections[0].groups[0].items[0]
  assert.equal(it[0].length, LIMITS.jp)
  assert.equal(it[1].length, LIMITS.en)
  assert.equal(it[2].length, LIMITS.desc)
})

await t('分野の名前: 末尾の数を外す', () => {
  assert.equal(labelOf('Web演出 48', ''), 'Web演出')
  assert.equal(labelOf('', '題だけ'), '題だけ')
})

const lex = lexicon(normalizeTerms(SAMPLE).sections)

await t('さがす: 名前で当たる（全角・大文字小文字はそろえる）', () => {
  assert.deepEqual(findTerms('ＰＲＥＰ法で書いて', lex).map((m) => m.jp), ['PREP法'])
  assert.deepEqual(findTerms('prep法で', lex).map((m) => m.jp), ['PREP法'])
})

await t('さがす: 英語の名前でも当たる。単語の途中では当てない', () => {
  assert.deepEqual(findTerms('最後は dolly in で寄る', lex).map((m) => m.jp), ['ドリーイン'])
  assert.deepEqual(findTerms('company の話', lex).map((m) => m.jp), [])
  assert.deepEqual(findTerms('pan で始める', lex).map((m) => m.jp), ['パン'])
})

await t('さがす: 2文字の名前は「」で囲んだときだけ', () => {
  assert.deepEqual(findTerms('パンを焼く店です', lex).map((m) => m.jp), [])
  assert.deepEqual(findTerms('冒頭は「パン」で', lex).map((m) => m.jp), ['パン'])
})

await t('さがす: 出てきた順に返し、長い名前を優先する', () => {
  const got = findTerms('ドリーインのあと、TAPS法で語り、PREP法で締める', lex).map((m) => m.jp)
  assert.deepEqual(got, ['ドリーイン', 'TAPS法', 'PREP法'])
  assert.equal(findTerms('', lex).length, 0)
  assert.equal(findTerms('PREP法', []).length, 0)
})

await t('AI に渡す段落: 指定と、用語の意味', () => {
  const b = blockText('PREP法で', findTerms('PREP法で', lex))
  assert.match(b, /使う型・用語の指定/)
  assert.match(b, /PREP法で/)
  assert.match(b, /・PREP法（説明の型）: 「PREP法」（結論 → 理由 → 具体例 → 結論）で書いて ／ 例を出して/)
  assert.match(b, /事実は、型を埋めるためでも作らない/)
})

await t('AI に渡す段落: 図鑑に無い言葉でも、指定そのものは渡す。空なら何も足さない', () => {
  const b = blockText('やわらかい口調で', [])
  assert.match(b, /やわらかい口調で/)
  assert.doesNotMatch(b, /用語の意味/)
  assert.equal(blockText('', []), '')
  assert.equal(blockText('   ', []), '')
  assert.ok(blockText('あ'.repeat(2000), []).length < LIMITS.hints + 200)
})

await t('意味の1行: 指示文の改行は1行にまとめる', () => {
  assert.equal(meaningOf({ jp: '型A', en: '一行目\n\n二行目', desc: '', section: 'SNS投稿の型' }), '・型A（SNS投稿の型）: 一行目 / 二行目')
  assert.equal(meaningOf({ jp: '名前だけ', en: '名前だけ', desc: '', section: '' }), '・名前だけ: （説明なし）')
})

await t('依頼文: 文章・CM・キャラクターに段落が入る（無ければ入らない）', () => {
  const terms = blockText('PREP法で', findTerms('PREP法で', lex))
  assert.match(buildPrompt({ mode: 'write', material: '材料', purpose: 'blog', length: 'short', terms }), /材料\n\n使う型・用語の指定/)
  assert.doesNotMatch(buildPrompt({ mode: 'write', material: '材料', purpose: 'blog', length: 'short' }), /使う型・用語/)
  assert.doesNotMatch(buildPrompt({ mode: 'rewrite', text: '文', purpose: 'blog', terms }), /使う型・用語/)
  assert.match(planPrompt({ product: '美容室', seconds: 17, aspect: '16:9', terms }), /使う型・用語の指定/)
  assert.doesNotMatch(planPrompt({ product: '美容室', seconds: 17, aspect: '16:9' }), /使う型・用語/)
  assert.match(designPrompt({ name: 'ミミ', style: 'anime', terms }), /使う型・用語の指定/)
})

await t('権限: 読むのはだれでも、取り込み・消すのは管理者から', () => {
  assert.equal(decide({ role: 'viewer', endpoint: 'ai-terms', method: 'GET' }).allow, true)
  assert.equal(decide({ role: 'staff', endpoint: 'ai-terms', method: 'POST', action: 'import' }).allow, false)
  assert.equal(decide({ role: 'manager', endpoint: 'ai-terms', method: 'POST', action: 'import' }).allow, true)
})

// 保存先（Upstash）の代わり。1回の送信の大きさも見ます。
const kv = new Map()
let biggest = 0
globalThis.fetch = async (url, o) => {
  biggest = Math.max(biggest, o.body.length)
  const out = JSON.parse(o.body).map((c) => {
    if (c[0] === 'GET') return { result: kv.get(c[1]) ?? null }
    if (c[0] === 'SET') { kv.set(c[1], c[2]); return { result: 'OK' } }
    if (c[0] === 'MGET') return { result: c.slice(1).map((k) => kv.get(k) ?? null) }
    if (c[0] === 'DEL') { c.slice(1).forEach((k) => kv.delete(k)); return { result: 1 } }
    return { error: 'unknown' }
  })
  return { ok: true, json: async () => out }
}
const CFG = { url: 'http://store.test', token: 't' }

await t('保存: 取り込む → 読む → 入れ替える（無くなった分野は消える） → 消す', async () => {
  const data = normalizeTerms(SAMPLE)
  const meta = await saveAll(CFG, data, { name: '山本' })
  assert.equal(meta.count, 5)
  assert.equal(meta.by, '山本')
  assert.deepEqual(meta.sections.map((s) => [s.id, s.count]), [['expl', 3], ['cam', 2]])
  const got = await readAll(CFG)
  assert.deepEqual(got.sections, data.sections)
  assert.deepEqual(findTerms('PREP法で', lexicon(got.sections)).map((m) => m.jp), ['PREP法'])

  await saveAll(CFG, normalizeTerms({ sections: [SAMPLE.sections[1]] }), null)
  assert.equal(kv.has(TK.sec('expl')), false)
  assert.deepEqual((await readAll(CFG)).sections.map((s) => s.id), ['cam'])

  await clearAll(CFG)
  assert.equal(await readMeta(CFG), null)
  assert.equal(kv.size, 0)
  assert.deepEqual(await readAll(CFG), { meta: null, sections: [] })
})

await t('保存: 大きな図鑑でも、1回の送信は小さく分ける', async () => {
  const big = { sections: Array.from({ length: 40 }, (_, i) => ({ id: 's' + i, chip: '分野' + i + ' 80', groups: [{ title: 'g', items: Array.from({ length: 80 }, (_, j) => ['用語' + i + '-' + j, 'この指示文は、それなりの長さがあります。'.repeat(4), '説明です。'.repeat(6)]) }] })) }
  const data = normalizeTerms(big)
  assert.equal(data.count, 3200)
  biggest = 0
  await saveAll(CFG, data, null)
  assert.ok(biggest < 400000, `1回の送信が大きすぎます（${biggest}）`)
  assert.equal((await readAll(CFG)).sections.length, 40)
  await clearAll(CFG)
})

await t('図鑑の中身を、このリポジトリに入れていない', () => {
  assert.match(fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^ai-terms\*\.json$/m)
  for (const f of ['api/_ai-terms.js', 'api/ai-terms.js', 'public/admin-terms.js']) {
    const size = fs.statSync(new URL('../' + f, import.meta.url)).size
    assert.ok(size < 60000, `${f} が大きすぎます（${size}）。用語のデータを入れていませんか`)
  }
})

console.log(`\n${n} 件すべて通りました。`)
