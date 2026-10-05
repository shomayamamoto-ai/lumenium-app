// 自動改善（観測・提案・実験・自動適用）のテスト。外には一切出ません。
//
//   node scripts/test-auto.mjs
//
// 確かめること。
//   ・観測: 一部の読み取りが無い・失敗する・時間切れでも、同じ形の1枚になる
//   ・率の言い方: 件数が少ないと「判断できません」「参考程度」

import assert from 'node:assert/strict'
import * as SIG from '../api/_auto-signals.js'

let n = 0
async function t(name, fn) {
  try { await fn(); n++ } catch (e) { console.error('✗ ' + name); throw e }
}

/* ---------------- 観測 ---------------- */

const REPORT = (view, submit, arrivals = 1000) => ({
  range: { days: 30 },
  summary: { cur: { visits: arrivals } },
  funnel: {
    arrivals,
    main: [
      { key: 'service_view', label: 'サービスを見た', people: 400, drop: 0.6 },
      { key: 'contact_view', label: '問い合わせ画面', people: view, drop: 1 - view / 400 },
      { key: 'contact_start', label: '入力を始めた', people: Math.round(view / 2), drop: 0.5 },
      { key: 'contact_submit', label: '送信した', people: submit, drop: 1 - submit / Math.round(view / 2) },
      { key: 'booking_confirm', label: '商談を予約した', people: 2, drop: 1 - 2 / Math.max(1, submit) },
    ],
  },
  exits: [{ name: '/', exits: 300, opened: 900, rate: 0.33 }, { name: '/x', exits: 3, opened: 5, rate: 0.6 }],
  readByPath: [{ name: '/', opened: 900, ended: 90, rate: 0.1 }, { name: '/pricing', opened: 100, ended: 50, rate: 0.5 }, { name: '/tiny', opened: 3, ended: 0, rate: 0 }],
  referrerKinds: [{ key: 'ai', count: 12 }],
  aiSources: [{ name: 'ChatGPT', count: 10 }, { name: 'Perplexity', count: 2 }],
})

await t('率の言い方', () => {
  assert.equal(SIG.rateOf(0, 0).p, null)
  assert.equal(SIG.rateOf(0, 0).label, '判断できません')
  assert.equal(SIG.rateOf(3, 20).label, '判断できません')
  assert.equal(SIG.rateOf(3, 60).label, '参考程度')
  assert.equal(SIG.rateOf(30, 300).label, '')
  const r = SIG.rateOf(30, 300)
  assert.ok(r.lo < 0.1 && r.hi > 0.1)
  // 成果が5件未満は、人数が多くても参考程度。
  assert.equal(SIG.rateOf(2, 500).label, '参考程度')
})

await t('アクセス解析 → 送信率の変化（誤差を超えたか）', () => {
  const a = SIG.analyticsPart(REPORT(200, 20), REPORT(200, 50))
  assert.equal(a.form.cur.k, 20)
  assert.equal(a.form.prev.k, 50)
  assert.equal(a.form.change, 'down')
  const same = SIG.analyticsPart(REPORT(200, 20), REPORT(200, 22))
  assert.equal(same.form.change, 'same')
  // 前の期間が無ければ「比べられない」。
  assert.equal(SIG.analyticsPart(REPORT(200, 20), null).form.change, 'na')
  // 開かれた回数が少ないページは、離脱・読了の一覧に入れません。
  assert.deepEqual(a.exits.map((e) => e.path), ['/'])
  assert.deepEqual(a.lowRead.map((e) => e.path), ['/', '/pricing'])
  assert.equal(a.ai.visits, 12)
  assert.ok(a.drop && a.drop.key)
})

await t('観測: 足りない・壊れた・遅い読み取りがあっても同じ形', async () => {
  const snap = await SIG.gatherSignals({
    analytics: async () => SIG.analyticsPart(REPORT(100, 10), null),
    seo: async () => null,
    aio: async () => { throw new Error('boom') },
    sns: () => new Promise((ok) => setTimeout(() => ok({ late: true }), 200)),
    inquiries: async () => SIG.inquiriesPart({ median30: 60, replied30: 8, open30: 1, late: 2, warn: 0, promised: 48 }, { autoReply: { on: false } }),
  }, '2026-10-05', { timeoutMs: 50 })
  assert.equal(snap.date, '2026-10-05')
  for (const name of SIG.SOURCES) assert.ok(name in snap, name)
  assert.equal(snap.sources.analytics, 'ok')
  assert.equal(snap.sources.seo, 'none')
  assert.equal(snap.sources.aio, 'error')
  assert.equal(snap.sources.sns, 'error') // 時間切れ
  assert.equal(snap.sources.booking, 'none') // 読み取り自体が無い
  assert.equal(snap.sns, null)
  assert.equal(snap.inquiries.median30, 60)
  assert.equal(snap.inquiries.autoReply, false)
  // 何も無くても壊れない。
  const empty = await SIG.gatherSignals(null, '2026-10-05')
  assert.equal(empty.sources.analytics, 'none')
})

await t('SEO・AIO・SNS・予約・会員の要約', () => {
  const sum = SIG.auditSummary({ findings: [
    { check: 'status', level: 'must', page: '/a' }, { check: 'status', level: 'must', page: '/b' },
    { check: 'redirect', level: 'should', page: '/c' },
  ], counts: { must: 2, should: 1 } }, { status: { bad: '開けない', fix: '直す' }, redirect: { bad: '転送', fix: '' } }, Date.parse('2026-10-01T00:00:00Z'))
  assert.equal(sum.items[0].check, 'status')
  assert.equal(sum.items[0].count, 2)
  const seo = SIG.seoPart(sum, Date.parse('2026-10-05T00:00:00Z'))
  assert.equal(seo.must, 2)
  assert.equal(seo.stale, false)
  assert.equal(SIG.seoPart(sum, Date.parse('2026-12-05T00:00:00Z')).stale, true)
  const aio = SIG.aioPart({ summary: { asked: 40, stats: { mention: { k: 4, n: 40 }, recommend: { k: 0, n: 40 } }, missingEvidence: ['所在地'] } })
  assert.equal(aio.mention.k, 4)
  assert.equal(aio.cite, null)
  assert.deepEqual(aio.missing, ['所在地'])
  const sns = SIG.snsPart({
    today: '2026-10-05',
    plan: { pillars: [{ id: 'ura', name: '裏側' }, { id: 'tips', name: 'お役立ち' }] },
    posts: [
      ...Array.from({ length: 6 }, (_, i) => ({ at: '2026-09-0' + (i + 1) + 'T00:00:00Z', pillar: 'ura', outcome: { visits: 10, inquiries: 1 } })),
      ...Array.from({ length: 6 }, (_, i) => ({ at: '2026-09-1' + i + 'T00:00:00Z', pillar: 'tips', outcome: { visits: 20, inquiries: 0 } })),
      { at: '2025-01-01T00:00:00Z', pillar: 'tips', outcome: { visits: 999, inquiries: 99 } },
    ],
    cadenceRows: [{ net: 'x', per: 'week', n: 3, left: 2 }], weekLeft: 2, nets: { x: { posts: 12, visits: 180, inquiries: 6 } },
  })
  assert.equal(sns.pillars[0].name, '裏側')
  assert.equal(sns.pillars[0].inquiries, 6)
  assert.equal(sns.pillars[0].label, '')
  assert.equal(sns.posts, 12) // 90日より前は数えない
  const bk = SIG.bookingPart({ all: 20, cancelled: 4, visited: 10, noshow: 2 })
  assert.equal(bk.cancel.k, 4)
  assert.equal(bk.noshow.n, 12)
  const mem = SIG.membersPart({ total: 10, subscribed: 9, unsubscribed: 1, thisMonth: 2, series: [{ added: 1 }, { added: 2 }] })
  assert.equal(mem.lastMonth, 1)
})

console.log(`✓ test-auto: ${n} 件`)
