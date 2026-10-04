// The arithmetic behind the AIO report: the ranges, the "is this a real
// change" test, the company-name tally and the branded/non-branded split.
//
// These are the numbers a client reads and acts on, and every one of them can
// be wrong without anything failing: a range that is too narrow says a coin
// toss was a trend, a tally that splits 「株式会社サンプル」 from 「サンプル」
// hides the competitor that matters, and a question with our name in it that
// is counted as non-branded flatters the number that matters most.
//
// Offline, no model calls.
//
//   node scripts/test-aio.mjs

import assert from 'node:assert/strict'

Object.assign(process.env, { SITE_NAME: '', SITE_URL: '', SITE_NAME_KANA: '', SITE_LOOKALIKES: '' })

const { wilson, rate, compareRates } = await import(new URL('../api/_aio-stats.js', import.meta.url))
const C = await import(new URL('../api/_aio-catalog.js', import.meta.url))
const { summarise, comparable } = await import(new URL('../api/aio.js', import.meta.url))

let failed = 0
let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`)
  }
}
const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} is not ≈ ${b}`)

await test('Wilson: 0 of 20 is not "0% to 0%"', () => {
  const w = wilson(0, 20)
  near(w.lo, 0)
  near(w.hi, 0.161) // the textbook value for 0/20 at 95%
})

await test('Wilson: 10 of 20 and 42 of 100 match the published values', () => {
  const a = wilson(10, 20)
  near(a.lo, 0.299)
  near(a.hi, 0.701)
  const b = wilson(42, 100)
  near(b.lo, 0.3271)
  near(b.hi, 0.5190)
})

await test('Wilson: no samples is the whole range; bounds stay inside 0..1', () => {
  assert.deepEqual(wilson(0, 0), { lo: 0, hi: 1 })
  const w = wilson(5, 5)
  assert.ok(w.hi <= 1 && w.lo > 0.5)
  const r = rate(3, 12)
  assert.equal(r.k, 3); assert.equal(r.n, 12); near(r.p, 0.25)
})

await test('comparison: 8/28 → 10/28 is 誤差の範囲 (same)', () => {
  const c = compareRates(rate(8, 28), rate(10, 28))
  assert.equal(c.change, 'same')
})

await test('comparison: 5/84 → 30/84 is a real rise; the reverse a real fall', () => {
  assert.equal(compareRates(rate(5, 84), rate(30, 84)).change, 'up')
  assert.equal(compareRates(rate(30, 84), rate(5, 84)).change, 'down')
})

await test('comparison: 0% both times is "same"; a missing side is "na"', () => {
  assert.equal(compareRates(rate(0, 30), rate(0, 30)).change, 'same')
  assert.equal(compareRates(null, rate(3, 10)).change, 'na')
  assert.equal(compareRates(rate(0, 0), rate(3, 10)).change, 'na')
})

await test('company names: legal forms, width, case and spaces are one company', () => {
  const k = C.companyKey
  assert.equal(k('株式会社サンプル'), k('サンプル'))
  assert.equal(k('（株）サンプル'), k('サンプル株式会社'))
  assert.equal(k('ｻﾝﾌﾟﾙ'), k('サンプル'))
  assert.equal(k('Example Inc.'), k('example'))
  assert.equal(k('Example Co., Ltd.'), k('EXAMPLE'))
  assert.equal(k('Example LLC'), k('Ｅｘａｍｐｌｅ'))
  assert.equal(k('合同会社 みほん 工房'), k('みほん工房'))
  assert.notEqual(k('サンプル制作'), k('サンプル'))
})

await test('company names: we are never a competitor; a look-alike is not us', () => {
  assert.ok(C.isOwnCompany('Lumenium'))
  assert.ok(C.isOwnCompany('株式会社ルメニウム'))
  assert.ok(C.isOwnCompany('LUMENIUM Inc.'))
  assert.ok(!C.isOwnCompany('Lumentum'))
})

await test('branded: the flag, the category and the text are all honoured', () => {
  const byId = Object.fromEntries(C.DEFAULT_QUESTIONS.map((q) => [q.id, q]))
  // These two name us and used to be counted as non-branded.
  assert.ok(C.isBranded(byId['trust-review']))
  assert.ok(C.isBranded(byId['trust-real']))
  assert.ok(!C.isBranded(byId['trust-newco']))
  assert.ok(C.isBranded({ q: 'ルメニウムの料金はいくらですか？' }))
  assert.ok(!C.isBranded({ q: '東京の動画制作会社を教えてください。' }))
  assert.ok(!C.DEFAULT_QUESTIONS.some((q) => /16問/.test(q.q)))
})

await test('question list: limits and slugs are enforced, the name is auto-flagged', () => {
  assert.equal(C.validateQuestions([]).ok, false)
  assert.equal(C.validateQuestions(Array.from({ length: 61 }, (_, i) => ({ q: 'q' + i }))).ok, false)
  assert.equal(C.validateQuestions([{ q: 'あ'.repeat(201) }]).ok, false)
  assert.equal(C.validateQuestions([{ q: 'ok', cat: 'か'.repeat(31) }]).ok, false)
  assert.equal(C.validateQuestions([{ id: 'Bad Id', q: 'ok' }]).ok, false)
  assert.equal(C.validateQuestions([{ id: 'a', q: 'x' }, { id: 'a', q: 'y' }]).ok, false)
  const v = C.validateQuestions([{ q: 'Lumenium の評判は？', cat: '評判' }, { q: '東京の制作会社は？' }])
  assert.ok(v.ok)
  assert.equal(v.questions[0].branded, true)
  assert.equal(v.questions[1].branded, false)
  assert.equal(v.questions[1].id, 'q2')
  assert.equal(v.questions[1].cat, 'その他')
  assert.notEqual(C.questionSetHash(v.questions), C.questionSetHash(v.questions.slice(1)))
})

await test('cost: calls = questions × samples × engines + judge calls', () => {
  const p = C.planRun(28, 3, ['claude', 'openai'], { claude: 0.05, openai: 0.02 })
  assert.equal(p.answers, 168)
  assert.equal(p.judgeCalls, Math.ceil(168 / C.JUDGE_BATCH))
  assert.equal(p.calls, 168 + p.judgeCalls)
  assert.ok(p.usd > 168 * 0.02)
})

/* summarise, over a tiny run: two questions (one branded) × 3 samples. */
const ans = (id, q, sample, verdict, extra = {}) => ({
  key: `${id}#claude#${sample}`, id, cat: id === 'b' ? 'ブランド指名' : '動画制作', q, engine: 'claude',
  sample, answer: 'x', verdict, branded: id === 'b', cited: false, searched: false, companies: [], ...extra,
})
const results = [
  ans('o', '東京の動画制作会社は？', 0, 'recommended', { position: 2, sentiment: 'positive', cited: true, searched: true, companies: ['Lumenium', '株式会社サンプル'] }),
  ans('o', '東京の動画制作会社は？', 1, 'absent', { searched: true, companies: ['サンプル', '（株）テスト'] }),
  ans('o', '東京の動画制作会社は？', 2, 'mentioned', { position: 3, sentiment: 'neutral', companies: ['ｻﾝﾌﾟﾙ', 'Lumenium'] }),
  ans('b', 'Lumenium とは？', 0, 'recommended', { position: 1, sentiment: 'positive', companies: ['Lumenium'] }),
  ans('b', 'Lumenium とは？', 1, 'denied'),
  ans('b', 'Lumenium とは？', 2, null, { truncated: true }),
]

await test('summarise: non-branded rates leave the branded question out', () => {
  const s = summarise(results, false, { samples: 3, engines: ['claude'] })
  assert.equal(s.asked, 5) // the truncated one is not scored
  assert.equal(s.truncated, 1)
  assert.equal(s.stats.openMention.n, 3)
  assert.equal(s.stats.openMention.k, 2)
  assert.equal(s.stats.recommend.k, 1)
  assert.equal(s.stats.mention.n, 5)
  assert.equal(s.stats.cite.k, 1)
  assert.equal(s.stats.searched.k, 2)
  assert.ok(s.stats.openMention.lo < s.stats.openMention.p && s.stats.openMention.hi > s.stats.openMention.p)
})

await test('summarise: per-question hit rate is k of n', () => {
  const s = summarise(results, false, { samples: 3, engines: ['claude'] })
  const o = s.byQuestion.find((q) => q.id === 'o')
  assert.equal(o.n, 3); assert.equal(o.hits, 2); assert.equal(o.recs, 1)
  const b = s.byQuestion.find((q) => q.id === 'b')
  assert.equal(b.n, 2); assert.equal(b.branded, true)
})

await test('summarise: competitors merged across spellings, never us; share of voice', () => {
  const s = summarise(results, false, { samples: 3, engines: ['claude'] })
  const others = s.competitors.filter((c) => !c.us)
  const sample = others.find((c) => C.companyKey(c.name) === C.companyKey('サンプル'))
  assert.equal(sample.count, 3)
  assert.ok(!others.some((c) => C.isOwnCompany(c.name)))
  // ours 2 (two hits in non-branded answers) vs others 3 + 1
  assert.equal(s.shareOfVoice.ours, 2)
  assert.equal(s.shareOfVoice.others, 4)
  near(s.shareOfVoice.value, 2 / 6)
})

await test('summarise: average position is non-branded only; sentiment counted', () => {
  const s = summarise(results, false, { samples: 3, engines: ['claude'] })
  near(s.position.avg, 2.5)
  assert.equal(s.position.n, 2)
  assert.deepEqual(s.sentiment, { positive: 2, neutral: 1, negative: 0 })
})

await test('comparable: only the same questions to the same engines', () => {
  const a = { settings: { questionsHash: 'aa', engines: ['claude', 'openai'], samples: 3 } }
  assert.equal(comparable(a, { settings: { questionsHash: 'aa', engines: ['openai', 'claude'], samples: 5 } }).ok, true)
  assert.equal(comparable(a, { settings: { questionsHash: 'bb', engines: ['claude', 'openai'] } }).ok, false)
  assert.equal(comparable(a, { settings: { questionsHash: 'aa', engines: ['claude'] } }).ok, false)
  assert.equal(comparable(a, {}).ok, false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
