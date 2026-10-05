// 自動改善（観測・提案・実験・自動適用）のテスト。外には一切出ません。
//
//   node scripts/test-auto.mjs
//
// 確かめること。
//   ・観測: 一部の読み取りが無い・失敗する・時間切れでも、同じ形の1枚になる
//   ・率の言い方: 件数が少ないと「判断できません」「参考程度」
//   ・提案のルール: 当てはまるときだけ出る・根拠に人数と幅・見送りは30日出ない
//   ・AIの下書き: 決まりに合わない案（金額・連絡先・長さ）は捨てる

import assert from 'node:assert/strict'
import * as SIG from '../api/_auto-signals.js'
import * as C from '../api/_auto-core.js'
import * as AI from '../api/_auto-ai.js'

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

/* ---------------- 提案 ---------------- */

const CUR = { 'text.contact.desc': 'お気軽にご相談ください。', 'text.lp.ctaPrimary': '無料で相談する', 'text.lp.lead': 'ホームページや業務システムを作りたい方へ。' }
const SNAP = (over = {}) => ({
  date: '2026-10-05',
  analytics: SIG.analyticsPart(REPORT(200, 20), REPORT(200, 50)),
  seo: { at: '2026-10-01', ageDays: 4, stale: false, must: 2, should: 1, items: [{ level: 'must', check: 'status', problem: '開けない', fix: '直す', count: 2 }] },
  aio: { mention: SIG.rateOf(4, 40), missing: ['所在地', '実績'] },
  sns: { pillars: [{ id: 'ura', name: '裏側', posts: 6, visits: 60, inquiries: 6, perPost: { visits: 10, inquiries: 1 }, label: '' }, { id: 'tips', name: 'お役立ち', posts: 6, visits: 120, inquiries: 1, perPost: { visits: 20, inquiries: 1 / 6 }, label: '' }], cadence: { weekLeft: 0, rows: [] } },
  inquiries: { median30: 60, replied30: 8, late: 1, promised: 48, autoReply: false, label: '' },
  booking: { all: 20, noshow: SIG.rateOf(3, 12) },
  members: { total: 30, unsubscribed: 1 },
  ...over,
})

await t('提案のルール: 当てはまるものだけ', () => {
  const list = C.rulesFor(SNAP(), CUR)
  const ids = list.map((p) => p.id)
  for (const id of ['form-copy', 'seo-must', 'aio-missing', 'sns-pillar', 'inq-autoreply', 'inq-late', 'bk-noshow']) assert.ok(ids.includes(id), id)
  assert.ok(!ids.includes('mem-unsub'))
  assert.ok(!ids.includes('seo-run'))
  assert.ok(!ids.includes('sns-cadence'))
  // 送信率が「同じ」なら、文章の実験は出しません。
  const calm = C.rulesFor(SNAP({ analytics: SIG.analyticsPart(REPORT(200, 20), REPORT(200, 22)) }), CUR)
  assert.ok(!calm.some((p) => p.id === 'form-copy'))
  // 返信が速ければ出ない。自動返信がすでに入っていれば、文例の提案に変わる。
  assert.ok(!C.rulesFor(SNAP({ inquiries: { median30: 20, replied30: 8, late: 0, autoReply: false } }), CUR).some((p) => p.area === 'inquiry'))
  assert.ok(C.rulesFor(SNAP({ inquiries: { median30: 60, replied30: 8, late: 0, autoReply: true } }), CUR).some((p) => p.id === 'inq-template'))
  // 柱の差が小さい（1.5倍未満）・件数が少ない（判断できません）なら出さない。
  const close = SNAP().sns
  close.pillars[1].perPost.inquiries = 0.9
  assert.ok(!C.rulesFor(SNAP({ sns: close }), CUR).some((p) => p.id === 'sns-pillar'))
  const few = SNAP().sns
  few.pillars[0].label = '判断できません'
  assert.ok(!C.rulesFor(SNAP({ sns: few }), CUR).some((p) => p.id === 'sns-pillar'))
  // 観測が何も無くても、点検を勧めるだけで壊れない。
  assert.deepEqual(C.rulesFor({}, {}).map((p) => p.id), ['seo-run'])
})

await t('提案の根拠: 人数・幅・言い方、効果は約束しない', () => {
  const list = C.rulesFor(SNAP(), CUR)
  const form = list.find((p) => p.id === 'form-copy')
  assert.equal(form.action.a, CUR['text.contact.desc'])
  assert.equal(form.risk, '低')
  assert.equal(form.evidence[0].n, 200)
  assert.ok(form.evidence[0].lo < form.evidence[0].p && form.evidence[0].hi > form.evidence[0].p)
  assert.match(form.evidence[0].text, /20\/200人/)
  const aio = list.find((p) => p.id === 'aio-missing')
  assert.equal(aio.evidence[0].label, '参考程度') // 40回中4回
  for (const p of list) {
    assert.ok(C.RISK.includes(p.risk), p.id)
    assert.ok(!/必ず|確実に|保証/.test(p.effect), p.id + ' の効果が言い切り')
    assert.ok(C.AREA_LABELS[p.area], p.id)
  }
})

await t('提案の重ね方: 見送りは30日出ない・実験中はそのまま・消えた条件は消す', () => {
  const now = Date.parse('2026-10-05T00:00:00Z')
  const fresh = C.rulesFor(SNAP(), CUR)
  let st = C.mergeProposals({}, fresh, now)
  assert.equal(st['seo-must'].status, 'open')
  st['seo-must'] = { ...st['seo-must'], status: 'dismissed', decidedAt: new Date(now).toISOString() }
  st['form-copy'] = { ...st['form-copy'], status: 'testing' }
  const later = C.mergeProposals(st, fresh, now + 5 * C.DAY)
  assert.equal(later['seo-must'].status, 'dismissed')
  assert.equal(later['form-copy'].status, 'testing')
  const much = C.mergeProposals(st, fresh, now + 31 * C.DAY)
  assert.equal(much['seo-must'].status, 'open')
  // 条件に当てはまらなくなった「未対応」は消える。
  const gone = C.mergeProposals(C.mergeProposals({}, fresh, now), [], now + C.DAY)
  assert.equal(Object.keys(gone).length, 0)
})

await t('AIの下書き: 決まりに合わない案は捨てる', () => {
  const list = Object.values(C.mergeProposals({}, C.rulesFor(SNAP(), CUR), Date.now()))
  const todo = list.filter(AI.needsDraft)
  assert.ok(todo.some((p) => p.id === 'form-copy'))
  assert.ok(todo.some((p) => p.id === 'sns-pillar'))
  assert.ok(!todo.some((p) => p.id === 'seo-must'))
  const prompt = AI.promptFor(todo)
  assert.match(prompt, /id=form-copy/)
  const d = AI.draftsFrom({
    copy: [{ id: 'form-copy', text: 'まずは気軽にご相談ください。', why: '一歩目を軽く' }],
    sns: [{ id: 'sns-pillar', text: '作業の裏側を少しだけ。' }],
    news: [{ id: 'aio-missing', title: '会社の所在地について', body: '（ここに住所を書く）' }],
  }, todo)
  assert.equal(d['form-copy'].text, 'まずは気軽にご相談ください。')
  assert.ok(d['sns-pillar'])
  assert.ok(d['aio-missing'])
  const bad = AI.draftsFrom({ copy: [{ id: 'form-copy', text: '今なら5,000円引き！', why: '' }], sns: [], news: [] }, todo)
  assert.equal(bad['form-copy'], undefined)
})

/* ---------------- 実験 ---------------- */

const EXP = await import('../src/lib/experiments.js')
const { SECTION } = await import('../src/data/text.js')
const STORE = await import('../api/_auto-store.js')

await t('振り分け: 端末と同じ計算・同じ種なら同じ答え・ほぼ半々', () => {
  for (const s of ['a', '2026-10-05:abc', 'x'.repeat(40)]) assert.equal(C.hash32(s), EXP.hash32(s))
  assert.equal(C.assign('2026-10-05:k1', 'xab12'), C.assign('2026-10-05:k1', 'xab12'))
  let b = 0
  const N = 20000
  for (let i = 0; i < N; i++) if (EXP.assign(`2026-10-05:${i.toString(36)}`, 'xab12') === 'B') b++
  assert.ok(b / N > 0.48 && b / N < 0.52, `B の割合 ${b / N}`)
  // 実験が違えば、同じ人でも振り分けは独立（偏りが持ち越されない）。
  let same = 0
  for (let i = 0; i < 2000; i++) if (EXP.assign('s' + i, 'xaaaa1') === EXP.assign('s' + i, 'xbbbb2')) same++
  assert.ok(same / 2000 > 0.45 && same / 2000 < 0.55)
})

await t('訪問者の画面: B は差し替え・A はそのまま・止めたら元のまま', () => {
  const orig = SECTION.lp.title
  const cfg = { v: 1, exps: [{ id: 'xtest1', key: 'text.lp.title', phase: 'running', b: '別の見出し\nです' }], pins: {} }
  // 管理画面の「この端末で見る」は数えない（印を返さない）。
  assert.equal(EXP.applyExperiments(cfg, { force: 'A' }), null)
  assert.equal(SECTION.lp.title, orig)
  EXP.applyExperiments(cfg, { force: 'B' })
  assert.equal(SECTION.lp.title, '別の見出し\nです')
  SECTION.lp.title = orig
  // 振り分けで決まった人には印が付く。
  const tag = EXP.applyExperiments(cfg, { force: null })
  assert.match(tag.tag, /^xtest1:[AB]$/)
  SECTION.lp.title = orig
  // 予約欄の見出し（content.json に無い項目）は textFor で。
  EXP.applyExperiments({ exps: [{ id: 'xtest2', key: 'booking.heading', phase: 'running', b: '空き日時を見て予約する' }] }, { force: 'B' })
  assert.equal(EXP.textFor('booking.heading', '元'), '空き日時を見て予約する')
  EXP.applyExperiments({ exps: [] }, { force: null })
  assert.equal(EXP.textFor('booking.heading', '元'), '元')
  // 採用後の見張りは文章を替えず、印だけ W。
  const w = EXP.applyExperiments({ exps: [{ id: 'xtest3', key: 'text.lp.lead', phase: 'watch' }] }, { force: null })
  assert.equal(w.tag, 'xtest3:W')
  // 壊れた設定・無い設定は何もしない。
  assert.equal(EXP.applyExperiments(null), null)
  assert.equal(EXP.applyExperiments({ exps: [{ id: 'BAD ID', key: 'text.lp.title' }] }), null)
  EXP._reset()
})

/** 作り物の保存先（Upstash の pipeline と同じ返し方）。 */
function fakeRedis() {
  const kv = new Map(), hll = new Map(), hashes = new Map(), lists = new Map()
  const run = (c) => {
    const [op, k, ...a] = c
    switch (String(op).toUpperCase()) {
      case 'GET': return kv.has(k) ? kv.get(k) : null
      case 'SET': kv.set(k, a[0]); return 'OK'
      case 'PFADD': { const s = hll.get(k) || new Set(); s.add(a[0]); hll.set(k, s); return 1 }
      case 'PFCOUNT': return (hll.get(k) || new Set()).size
      case 'EXPIRE': return 1
      case 'HSET': { const h = hashes.get(k) || new Map(); h.set(a[0], a[1]); hashes.set(k, h); return 1 }
      case 'HDEL': { const h = hashes.get(k); return h && h.delete(a[0]) ? 1 : 0 }
      case 'HGETALL': { const h = hashes.get(k); return h ? [...h].flat() : [] }
      case 'LPUSH': { const l = lists.get(k) || []; l.unshift(a[0]); lists.set(k, l); return l.length }
      case 'LTRIM': { const l = lists.get(k) || []; lists.set(k, l.slice(Number(a[0]), Number(a[1]) + 1)); return 'OK' }
      case 'LRANGE': { const l = lists.get(k) || []; return l.slice(Number(a[0]), Number(a[1]) + 1) }
      case 'LSET': { const l = lists.get(k) || []; l[Number(a[0])] = a[1]; return 'OK' }
      case 'DEL': kv.delete(k); hashes.delete(k); return 1
      default: return null
    }
  }
  return { cfg: { url: 'fake', token: 'fake' }, pipeline: async (_cfg, cmds) => cmds.map(run), kv, hll }
}

await t('数え方: 今の実験と合う印だけ・見た人と成果を案ごとに・同じ人は1回', async () => {
  const R = fakeRedis()
  const exps = [{ id: 'xcount1', key: 'text.contact.desc', phase: 'running', b: 'B案', startedAt: '2026-10-01T00:00:00Z' }]
  const live = await STORE.publishLive(R.cfg, R.pipeline, exps, C.DEFAULT_SETTINGS)
  assert.deepEqual(live.exps[0].goal, ['contact_submit'])
  const hit = async (tag, ev, vid) => { const cmds = await STORE.countCommands(R.cfg, R.pipeline, tag, ev, vid); if (cmds.length) await R.pipeline(R.cfg, cmds); return cmds.length > 0 }
  assert.ok(await hit('xcount1:A', 'exp_view', 'v1'))
  assert.ok(await hit('xcount1:A', 'exp_view', 'v1')) // 同じ人・同じ日 → 数は増えない
  assert.ok(await hit('xcount1:B', 'exp_view', 'v2'))
  assert.ok(await hit('xcount1:B', 'exp_view', 'v3'))
  assert.ok(await hit('xcount1:B', 'contact_submit', 'v3'))
  assert.ok(!(await hit('xcount1:B', 'click_tel', 'v3'))) // この実験の成果ではない
  assert.ok(!(await hit('xother:B', 'exp_view', 'v4'))) // 知らない実験
  assert.ok(!(await hit('xcount1:W', 'exp_view', 'v4'))) // 見張り中ではない
  assert.ok(!(await hit('xcount1:A; DROP', 'exp_view', 'v4')))
  const counts = await STORE.readCounts(R.cfg, R.pipeline, 'xcount1')
  assert.deepEqual(counts, { A: { x: 1, c: 0 }, B: { x: 2, c: 1 } })
  // 「すべて止める」: 配る実験が空になり、数えるのも止まる。
  const stopped = await STORE.publishLive(R.cfg, R.pipeline, exps, { ...C.DEFAULT_SETTINGS, paused: true })
  assert.equal(stopped.exps.length, 0)
  assert.ok(!(await hit('xcount1:B', 'exp_view', 'v9')))
})

await t('判定: 最低人数・最低日数・確率・期限', () => {
  const start = Date.parse('2026-09-01T00:00:00Z')
  const exp = { startedAt: new Date(start).toISOString() }
  const at = (d) => start + d * C.DAY
  // 人数が足りない → まだ判断できません（あと約◯日）
  let e = C.evaluate(exp, { A: { x: 100, c: 3 }, B: { x: 100, c: 8 } }, at(5))
  assert.equal(e.verdict, 'collecting')
  assert.match(e.text, /まだ判断できません：あと約\d+日/)
  assert.ok(e.daysLeft >= 5)
  // 人数は足りても7日未満 → 判断しない
  e = C.evaluate(exp, { A: { x: 400, c: 10 }, B: { x: 400, c: 30 } }, at(3))
  assert.equal(e.verdict, 'collecting')
  // 十分 + B が明らかに良い
  e = C.evaluate(exp, { A: { x: 400, c: 10 }, B: { x: 400, c: 30 } }, at(8))
  assert.equal(e.verdict, 'b_wins')
  assert.ok(e.prob >= 0.95)
  assert.ok(e.pValue < 0.05)
  // 十分 + A が明らかに良い
  e = C.evaluate(exp, { A: { x: 400, c: 30 }, B: { x: 400, c: 10 } }, at(8))
  assert.equal(e.verdict, 'a_wins')
  // 十分だが差が小さい → まだ。期限（42日）を過ぎたら元のまま。
  e = C.evaluate(exp, { A: { x: 400, c: 20 }, B: { x: 400, c: 22 } }, at(10))
  assert.equal(e.verdict, 'collecting')
  assert.match(e.text, /差はまだはっきりしません/)
  e = C.evaluate(exp, { A: { x: 400, c: 20 }, B: { x: 400, c: 22 } }, at(43))
  assert.equal(e.verdict, 'no_diff')
  // 成果が10件に届かない（各案200人以上でも）
  e = C.evaluate(exp, { A: { x: 300, c: 2 }, B: { x: 300, c: 6 } }, at(20))
  assert.equal(e.verdict, 'collecting')
  // まだ誰も来ていない → 見込みが立たない
  e = C.evaluate(exp, {}, at(2))
  assert.equal(e.daysLeft, null)
  assert.match(e.text, /見込みが立ちません/)
  // 確率の向きと、同じなら 50%
  assert.ok(Math.abs(C.probBBeatsA({ k: 10, n: 100 }, { k: 10, n: 100 }) - 0.5) < 1e-9)
})

await t('採用・停止・見張り・元に戻すの判断', () => {
  const on = { ...C.DEFAULT_SETTINGS, autoAdopt: true, autoRevert: true }
  const off = C.DEFAULT_SETTINGS
  assert.equal(C.decideRunning({ verdict: 'b_wins' }, on), 'adopt')
  assert.equal(C.decideRunning({ verdict: 'b_wins' }, off), 'won')
  assert.equal(C.decideRunning({ verdict: 'b_wins' }, { ...on, paused: true }), 'won') // 止めている間は自動で採用しない
  assert.equal(C.decideRunning({ verdict: 'a_wins' }, on), 'stop')
  assert.equal(C.decideRunning({ verdict: 'no_diff' }, on), 'stop')
  assert.equal(C.decideRunning({ verdict: 'collecting' }, on), 'continue')
  const adopted = Date.parse('2026-10-01T00:00:00Z')
  const exp = { adoptedAt: new Date(adopted).toISOString(), baseline: SIG.rateOf(20, 400) } // A: 5%（幅 約3.3〜7.6%）
  // 下がった（見張りの率が A の幅の下より下）→ 戻す
  assert.equal(C.decideWatch(exp, { x: 300, c: 6 }, adopted + 5 * C.DAY, on).action, 'revert')
  assert.equal(C.decideWatch(exp, { x: 300, c: 6 }, adopted + 5 * C.DAY, off).action, 'suggest_revert')
  // 人数が少ないうちは、低く見えても戻さない
  assert.equal(C.decideWatch(exp, { x: 50, c: 0 }, adopted + 5 * C.DAY, on).action, 'continue')
  // 14日たって下がっていなければ、見張りを終える
  assert.equal(C.decideWatch(exp, { x: 300, c: 18 }, adopted + 14 * C.DAY, on).action, 'finish')
  assert.equal(C.decideWatch(exp, { x: 300, c: 18 }, adopted + 6 * C.DAY, on).action, 'continue')
})

await t('触らないもの: 料金・法的なページ・連絡先・一覧に無い項目', () => {
  for (const k of ['site.PRICE_OPTIONS.0.label', 'text.pricing.lead', 'legal.privacy.body', 'text.contact.tel', 'text.contact.email',
    'text.footer.address', 'services.0.price', 'faq.0.items.0.a', 'text.lp.adminNote', '']) {
    assert.ok(C.keyBlocked(k), k)
  }
  for (const k of Object.keys(C.EXP_KEYS)) assert.equal(C.keyBlocked(k), '', k)
  // 文章の中身の決まり
  const A = '無料で相談する'
  assert.equal(C.textProblem(A, 'まずは無料で相談'), '')
  assert.match(C.textProblem(A, '5,000円で相談する'), /金額/)
  assert.match(C.textProblem(A, 'info@example.com へ'), /連絡先/)
  assert.match(C.textProblem(A, '必ず解決します！'), /言い切り/)
  assert.match(C.textProblem('お気軽にご相談ください。', '無料でご相談ください。'), /無料/)
  assert.match(C.textProblem(A, 'とても長い文章になってしまった相談のボタン'), /長さ/)
  assert.match(C.textProblem('一行', '二\n行'), /改行|長さ/)
  assert.match(C.textProblem(A, A), /同じ/)
  // 自動で始めてよいか
  const prop = { risk: '低', action: { type: 'experiment', key: 'text.lp.ctaPrimary', a: A, b: '' }, draft: { text: 'まずは無料で相談' } }
  const on = { ...C.DEFAULT_SETTINGS, autoStart: true }
  assert.equal(C.canAutoStart(prop, [], on), '')
  assert.match(C.canAutoStart(prop, [], C.DEFAULT_SETTINGS), /切れています/)
  assert.match(C.canAutoStart(prop, [], { ...on, paused: true }), /切れています/)
  assert.match(C.canAutoStart(prop, [{ key: 'text.lp.title', phase: 'running' }], on), /1ページに1つ/)
  assert.match(C.canAutoStart({ ...prop, action: { ...prop.action, key: 'site.PRICE_OPTIONS.0.label' } }, [], on), /試せません/)
  assert.match(C.canAutoStart({ ...prop, risk: '中' }, [], on), /低/)
  // 配る設定にも、触らない項目は載らない
  const live = C.liveConfig([{ id: 'xbad1', key: 'site.PRICE_OPTIONS.0.label', phase: 'running', b: 'x' }, { id: 'xok01', key: 'text.lp.title', phase: 'running', b: 'y' }, { id: 'xok02', key: 'text.lp.lead', phase: 'running', b: 'z' }], C.DEFAULT_SETTINGS)
  assert.deepEqual(live.exps.map((e) => e.id), ['xok01']) // 1ページに1つまで
})

await t('すべて止める: どの自動の動きも止まる', () => {
  const all = { ...C.DEFAULT_SETTINGS, autoStart: true, autoAdopt: true, autoRevert: true, snsToQueue: true, drafts: true }
  for (const k of Object.keys(C.SWITCH_LABELS)) {
    assert.equal(C.allowed(all, k), true, k)
    assert.equal(C.allowed({ ...all, paused: true }, k), false, k)
  }
  // 最初の設定では「提案と下書きを作る」だけ
  assert.deepEqual(Object.keys(C.SWITCH_LABELS).filter((k) => C.allowed(C.DEFAULT_SETTINGS, k)), ['drafts'])
  const s = C.cleanSettings({ autoStart: 'yes', autoAdopt: true, monthlyYen: '1,000円', evil: 1 })
  assert.equal(s.autoStart, false)
  assert.equal(s.autoAdopt, true)
  assert.equal(s.monthlyYen, 1000)
  assert.ok(!('evil' in s))
})

/* ---------------- 自動適用（通し） ---------------- */

// GitHub の文章ファイルの作り物。PUT されたものを覚えます。
const GH = { content: { 'text.lp.title': '保存済みの見出し', 'faq.0.q': 'ほかの人の編集' }, sha: 's1', puts: [] }
process.env.GITHUB_TOKEN = 'test-token'
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.includes('api.github.com') && u.includes('contents/public/content.json')) {
    if ((init.method || 'GET') === 'PUT') {
      const b = JSON.parse(init.body)
      GH.puts.push({ message: b.message, sha: b.sha })
      GH.content = JSON.parse(Buffer.from(b.content, 'base64').toString('utf8'))
      GH.sha = 's' + (GH.puts.length + 1)
      return new Response(JSON.stringify({ commit: { sha: 'c' + GH.puts.length } }), { status: 200 })
    }
    return new Response(JSON.stringify({ sha: GH.sha, content: Buffer.from(JSON.stringify(GH.content)).toString('base64') }), { status: 200 })
  }
  throw new Error('外へは出ません: ' + u)
}
const RUN = await import('../api/_auto-run.js')

const READERS = (over = {}) => ({
  analytics: async () => SIG.analyticsPart(REPORT(200, 20), REPORT(200, 50)),
  inquiries: async () => SIG.inquiriesPart({ median30: 60, replied30: 8, late: 0, promised: 48 }, { autoReply: { on: false } }),
  ...over,
})
const noAi = async (list) => ({ ok: true, drafts: Object.fromEntries(list.filter(AI.needsDraft).filter((p) => p.kind === 'experiment').map((p) => [p.id, { kind: 'copy', text: 'まずはお気軽にご相談を。', by: 'ai' }])) })

await t('最初の設定: 毎朝は観測と提案だけ（実験も採用もしない）', async () => {
  const R = fakeRedis()
  const ctx = { cfg: R.cfg, pipeline: R.pipeline, req: new Request('https://x.test/'), now: Date.parse('2026-10-05T00:00:00Z') }
  const out = await RUN.runDaily(ctx, { date: '2026-10-05', readers: READERS(), ai: noAi })
  assert.ok(R.kv.has(SIG.snapKey('2026-10-05')))
  const props = await STORE.readProps(R.cfg, R.pipeline)
  assert.ok(props['form-copy'] && props['form-copy'].draft) // 下書きまでは作る
  assert.equal((await STORE.readExps(R.cfg, R.pipeline)).length, 0)
  assert.equal(GH.puts.length, 0)
  assert.ok(!out.steps.some((s) => s.step === 'auto_start'))
  // 「提案と下書きを作る」を切れば、AI は呼ばれない。
  await STORE.saveSettings(R.cfg, R.pipeline, { ...C.DEFAULT_SETTINGS, drafts: false })
  let called = false
  await RUN.runDaily(ctx, { date: '2026-10-05', readers: READERS(), ai: async () => { called = true; return { ok: true, drafts: {} } } })
  assert.equal(called, false)
})

await t('自動で始める → 勝ったら採用（content.json に1項目だけ）→ 下がったら戻す', async () => {
  const R = fakeRedis()
  const t0 = Date.parse('2026-10-05T00:00:00Z')
  const ctx = (d) => ({ cfg: R.cfg, pipeline: R.pipeline, req: new Request('https://x.test/'), now: t0 + d * C.DAY })
  await STORE.saveSettings(R.cfg, R.pipeline, { ...C.DEFAULT_SETTINGS, autoStart: true, autoAdopt: true, autoRevert: true })
  await RUN.runDaily(ctx(0), { date: '2026-10-05', readers: READERS(), ai: noAi })
  let [exp] = await STORE.readExps(R.cfg, R.pipeline)
  assert.equal(exp.phase, 'running')
  assert.equal(exp.key, 'text.contact.desc')
  assert.equal(exp.by, 'auto')
  const live = JSON.parse(R.kv.get(STORE.AK.live))
  assert.equal(live.exps[0].b, 'まずはお気軽にご相談を。')
  // 数を入れる（B がはっきり良い）。
  const add = (v, kind, n) => { const k = STORE.AK.count(exp.id, v, kind); const s = R.hll.get(k) || new Set(); for (let i = 0; i < n; i++) s.add(v + kind + i); R.hll.set(k, s) }
  add('A', 'x', 400); add('A', 'c', 10); add('B', 'x', 400); add('B', 'c', 32)
  await RUN.runDaily(ctx(8), { date: '2026-10-13', readers: READERS(), ai: noAi })
  ;[exp] = await STORE.readExps(R.cfg, R.pipeline)
  assert.equal(exp.phase, 'watch')
  assert.equal(GH.puts.length, 1)
  assert.match(GH.puts[0].message, /^auto: 実験の勝ち案を採用（問い合わせ欄の説明文）/)
  assert.equal(GH.content['text.contact.desc'], 'まずはお気軽にご相談を。')
  assert.equal(GH.content['faq.0.q'], 'ほかの人の編集') // ほかの項目はそのまま
  assert.equal(exp.prevOverride, null)
  let log = await STORE.readLog(R.cfg, R.pipeline)
  assert.equal(log[0].kind, 'adopt')
  assert.equal(log[0].by, 'auto')
  assert.ok(log[0].before && log[0].after && log[0].undo)
  // 見張り: 採用後の率が A の幅の下より下 → 自動で戻す（上書きを消す＝元の文章）。
  add('W', 'x', 300); add('W', 'c', 3)
  await RUN.runDaily(ctx(12), { date: '2026-10-17', readers: READERS(), ai: noAi })
  ;[exp] = await STORE.readExps(R.cfg, R.pipeline)
  assert.equal(exp.phase, 'reverted')
  assert.equal(GH.puts.length, 2)
  assert.match(GH.puts[1].message, /元に戻す/)
  assert.ok(!('text.contact.desc' in GH.content))
  log = await STORE.readLog(R.cfg, R.pipeline)
  assert.equal(log[0].kind, 'revert')
  assert.match(log[0].evidence[0], /下回りました/)
})

await t('元に戻す（記録から）・すべて止める・触らない項目は書かない', async () => {
  const R = fakeRedis()
  const ctx = { cfg: R.cfg, pipeline: R.pipeline, req: new Request('https://x.test/'), now: Date.parse('2026-10-05T00:00:00Z') }
  const s = await RUN.startExperiment(ctx, { key: 'text.lp.ctaPrimary', a: '無料で相談する', b: 'まずは無料で相談', by: 'owner' })
  assert.ok(s.ok)
  // 同じページで2つ目は断る。
  assert.equal((await RUN.startExperiment(ctx, { key: 'text.lp.title', a: '見出しです', b: '見出しだよ', by: 'owner' })).ok, false)
  // 料金・一覧に無い項目は断る。
  assert.equal((await RUN.startExperiment(ctx, { key: 'site.PRICE_OPTIONS.0.label', a: 'a', b: 'b' })).ok, false)
  assert.equal((await RUN.writeCopy(ctx.req, { 'site.PRICE_OPTIONS.0.label': '0円' }, 'x')).ok, false)
  assert.equal((await RUN.writeCopy(ctx.req, { 'booking.heading': 'x' }, 'x')).ok, false) // content.json の項目ではない
  // 記録の「元に戻す」で実験が止まる。
  const [entry] = await STORE.readLog(R.cfg, R.pipeline)
  assert.equal(entry.kind, 'exp_start')
  assert.ok((await RUN.undoLog(ctx, entry.id, entry)).ok)
  const [exp] = await STORE.readExps(R.cfg, R.pipeline)
  assert.equal(exp.phase, 'stopped')
  const again = (await STORE.readLog(R.cfg, R.pipeline)).find((e) => e.id === entry.id)
  assert.ok(again.undone)
  assert.equal((await RUN.undoLog(ctx, again.id, again)).ok, false) // 二度は戻さない
  // すべて止める: 毎朝は観測だけ。
  await STORE.saveSettings(R.cfg, R.pipeline, { ...C.DEFAULT_SETTINGS, paused: true, autoStart: true })
  let called = false
  const out = await RUN.runDaily(ctx, { date: '2026-10-05', readers: READERS(), ai: async () => { called = true; return { drafts: {} } } })
  assert.equal(out.paused, true)
  assert.deepEqual(out.steps.map((x) => x.step), ['snapshot', 'paused'])
  assert.equal(called, false)
  assert.equal(Object.keys(await STORE.readProps(R.cfg, R.pipeline)).length, 0)
})

await t('週次メールの一節', async () => {
  const R = fakeRedis()
  await RUN.startExperiment({ cfg: R.cfg, pipeline: R.pipeline, now: Date.now() - 2 * C.DAY }, { key: 'text.lp.ctaPrimary', a: '無料で相談する', b: 'まずは無料で相談', by: 'auto' })
  const w = await RUN.weeklyAuto(R.cfg, R.pipeline)
  const lines = RUN.weeklyAutoLines(w)
  assert.equal(lines[0], '■ 今週の自動改善')
  assert.ok(lines.some((l) => /実験「トップのボタン/.test(l) && /まだ判断できません/.test(l)))
  assert.ok(lines.some((l) => /提案と下書きを作る/.test(l)))
  assert.ok(lines.some((l) => /（自動）/.test(l)))
  assert.ok(RUN.weeklyAutoLines({ ...w, paused: true }).some((l) => /すべて止める/.test(l)))
})

globalThis.fetch = realFetch

console.log(`✓ test-auto: ${n} 件`)
