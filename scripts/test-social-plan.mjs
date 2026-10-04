// SNS（文章）の「運用プラン」の計算のテスト。外には一切出ません。
//
//   node scripts/test-social-plan.mjs
//
// 確かめること。
//   ・柱の保存の形（壊れた値・多すぎる柱・色）
//   ・柱の割合と、宣伝が2割を超えたときの知らせ方
//   ・画面用に書き出したファイルが、元とずれていないか

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import * as P from '../api/_social-plan-core.js'
import { build } from './build-social-plan.mjs'

let n = 0
function t(name, fn) {
  try { fn(); n++ } catch (e) { console.error('✗ ' + name); throw e }
}

/* ---- 書き出したファイル ---- */
t('public/social-plan-core.js は元から作り直したものと同じ', () => {
  const built = readFileSync(new URL('../public/social-plan-core.js', import.meta.url), 'utf8')
  assert.equal(built, build(), 'node scripts/build-social-plan.mjs を実行してください')
})

/* ---- 1. 柱 ---- */
t('validatePlan: 名前の無い柱は捨て、5つまでにし、色は決まった中から', () => {
  const r = P.validatePlan({
    pillars: [
      { name: 'お役立ち', color: '#ff0000', ideas: 'a\nb\n\n' },
      { name: '' },
      { name: '裏側', id: 'ura' }, { name: 'c' }, { name: 'd' }, { name: 'e', promo: true }, { name: 'f' },
    ],
  })
  assert.equal(r.plan.pillars.length, 5)
  assert.ok(P.PILLAR_COLORS.includes(r.plan.pillars[0].color))
  assert.deepEqual(r.plan.pillars[0].ideas, ['a', 'b'])
  assert.equal(r.plan.pillars[1].id, 'ura')
  assert.equal(r.plan.pillars[4].promo, true)
  assert.ok(r.problems.some((p) => p.includes('名前')))
  assert.ok(r.problems.some((p) => p.includes('5つまで')))
  // 目標は、無ければおすすめの値
  assert.equal(r.plan.targets.instagram.n, 5)
  assert.equal(r.plan.targets.line.per, 'month')
})

t('validatePlan: tags は柱の id の形のものだけ', () => {
  const r = P.validatePlan({ tags: { 'a-1': 'ura', 'q:x': 'bad id!', '<b>': 'x' } })
  assert.deepEqual(r.plan.tags, { 'a-1': 'ura' })
})

const PILLARS = [
  { id: 'tips', name: 'お役立ち', color: '#0f766e', promo: false },
  { id: 'ura', name: '裏側', color: '#3d3fbf', promo: false },
  { id: 'koe', name: 'お客さまの声', color: '#be185d', promo: false },
  { id: 'ad', name: '宣伝', color: '#9a3412', promo: true },
]
const TODAY = '2026-10-07' // 水曜日
const at = (day, h = 3) => `${day}T0${h}:00:00.000Z` // 日本時間の昼

t('itemsOf: どこにも出なかった投稿は数えず、予約は q: を付ける', () => {
  const it = P.itemsOf(
    [{ id: 'a', at: at('2026-10-06'), nets: ['x'], pillar: 'tips' }, { id: 'b', at: at('2026-10-05'), nets: [] }],
    [{ id: 'z', date: '2026-10-09', targets: ['line'] }],
    { 'q:z': 'ad' },
  )
  assert.equal(it.length, 2)
  assert.equal(it[1].id, 'q:z')
  assert.equal(it[1].pillar, 'ad')
  assert.equal(it[1].scheduled, true)
})

t('pillarMix: 割合と、宣伝が2割を超えたら知らせる', () => {
  const hist = [
    { id: '1', at: at('2026-10-06'), nets: ['x'], pillar: 'ad' },
    { id: '2', at: at('2026-10-05'), nets: ['x'], pillar: 'ad' },
    { id: '3', at: at('2026-10-04'), nets: ['x'], pillar: 'tips' },
    { id: '4', at: at('2026-10-03'), nets: ['x'], pillar: 'ura' },
    { id: '5', at: at('2026-08-01'), nets: ['x'], pillar: 'ad' }, // 30日より前
    { id: '6', at: at('2026-10-02'), nets: ['x'] }, // 柱なし
  ]
  const m = P.pillarMix(P.itemsOf(hist, [{ id: 'q', date: '2026-10-10', targets: ['x'], pillar: 'koe' }]), PILLARS, TODAY)
  assert.equal(m.total, 6)
  assert.equal(m.tagged, 5)
  assert.equal(m.untagged, 1)
  assert.equal(m.rows.find((r) => r.id === 'ad').n, 2)
  assert.equal(Math.round(m.promoShare * 100), 40)
  assert.equal(m.promoOver, true)
  assert.ok(m.warnings.some((w) => w.includes('40%') && w.includes('20%')))
  assert.equal(m.reliability.label, '参考程度')
})

t('pillarMix: ちょうど2割は範囲内。使っていない柱を言う', () => {
  const hist = ['tips', 'tips', 'ura', 'ura', 'ad'].map((p, i) => ({ id: 'h' + i, at: at('2026-10-0' + (i + 1)), nets: ['x'], pillar: p }))
  const m = P.pillarMix(P.itemsOf(hist, []), PILLARS, TODAY)
  assert.equal(m.promoOver, false)
  assert.ok(m.notes.some((w) => w.includes('20%') && w.includes('範囲')))
  assert.ok(m.warnings.some((w) => w.includes('お客さまの声')))
})

t('pillarMix: 柱が無いときは決めるよう促す', () => {
  const m = P.pillarMix([], [], TODAY)
  assert.equal(m.rows.length, 0)
  assert.ok(m.warnings[0].includes('柱'))
  assert.equal(m.reliability.label, '判断できません')
})

t('reliability: 3件未満・6件未満・それ以上', () => {
  assert.equal(P.reliability(2).label, '判断できません')
  assert.equal(P.reliability(3).label, '参考程度')
  assert.equal(P.reliability(5).label, '参考程度')
  assert.equal(P.reliability(6).label, '')
})

/* ---- 2. ペース ---- */
t('weekStart: 週は月曜から。日本時間の日付で区切る', () => {
  assert.equal(P.weekStart('2026-10-07'), '2026-10-05') // 水 → 月
  assert.equal(P.weekStart('2026-10-05'), '2026-10-05') // 月
  assert.equal(P.weekStart('2026-10-11'), '2026-10-05') // 日 → その週の月
  assert.equal(P.weekStart('2026-11-01'), '2026-10-26') // 月をまたぐ
  // 日曜 23:30（日本時間）＝ 日曜 14:30 UTC。月曜 0:30（日本時間）＝ 日曜 15:30 UTC。
  assert.equal(P.jstDay('2026-10-11T14:30:00Z'), '2026-10-11')
  assert.equal(P.jstDay('2026-10-11T15:30:00Z'), '2026-10-12')
  assert.equal(P.monthEnd('2026-02-10'), '2026-02-28')
  assert.equal(P.monthEnd('2028-02-10'), '2028-02-29')
})

t('cadence: 今週の出した分＋予約と、あと何本。週の境目は日本時間', () => {
  const targets = P.validatePlan({}).plan.targets
  const hist = [
    { id: 'a', at: '2026-10-04T15:30:00Z', nets: ['instagram'] }, // 日本時間 10/5（月）0:30 → 今週
    { id: 'b', at: '2026-10-04T14:30:00Z', nets: ['instagram'] }, // 日本時間 10/4（日）23:30 → 先週
    { id: 'c', at: at('2026-10-06'), nets: ['instagram', 'line'] },
  ]
  const queue = [{ id: 'q1', date: '2026-10-09', targets: ['instagram'] }, { id: 'q2', date: '2026-10-20', targets: ['line'] }]
  const cd = P.cadence(P.itemsOf(hist, queue), targets, TODAY)
  assert.equal(cd.weekFrom, '2026-10-05')
  assert.equal(cd.weekTo, '2026-10-11')
  const ig = cd.rows.find((r) => r.net === 'instagram')
  assert.equal(ig.week.done, 2)
  assert.equal(ig.week.booked, 1)
  assert.equal(ig.left, 2) // 目標5 − 2 − 1
  assert.equal(ig.month.done, 3) // 10/4 も今月
  assert.equal(ig.month.target, Math.round(5 * 31 / 7))
  const line = cd.rows.find((r) => r.net === 'line')
  assert.equal(line.per, 'month')
  assert.equal(line.month.done + line.month.booked, 2)
  assert.equal(line.left, 1)
  assert.ok(!cd.rows.some((r) => r.net === 'linkedin')) // 目標に入れていないもの
})

t('suggestDays: 空いている日から、間を空けて、おすすめの曜日を先に', () => {
  const it = P.itemsOf([{ id: 'a', at: at('2026-10-07'), nets: ['x'] }], [{ id: 'q', date: '2026-10-09', targets: ['x'] }])
  // 今日(水)と金は使用済み。残り 木・土・日 から2日
  const d = P.suggestDays(it, 'x', TODAY, 2, [], 'week')
  assert.equal(d.length, 2)
  assert.ok(!d.includes('2026-10-07') && !d.includes('2026-10-09'))
  assert.ok(d.includes('2026-10-11')) // 日曜がいちばん離れている
  // おすすめの曜日（木=4）があれば、そちらを先に
  const d2 = P.suggestDays(it, 'x', TODAY, 1, [4], 'week')
  assert.deepEqual(d2, ['2026-10-08'])
  // 足りていれば何も出さない、空きが無ければある分だけ
  assert.deepEqual(P.suggestDays(it, 'x', TODAY, 0, [], 'week'), [])
  assert.equal(P.suggestDays(it, 'x', '2026-10-11', 3, [], 'week').length, 1)
  // 月の目標は今月の残りから
  assert.ok(P.suggestDays([], 'line', TODAY, 2, [], 'month').every((x) => x >= TODAY && x <= '2026-10-31'))
})

/* ---- 3. 今週やること ---- */
const PLAN = P.validatePlan({
  pillars: [
    { id: 'tips', name: 'お役立ち', ideas: ['選び方のコツ'] },
    { id: 'ura', name: '裏側', ideas: ['朝の仕込み'] },
    { id: 'ad', name: '宣伝', promo: true },
  ],
  targets: { x: { on: false }, threads: { on: false }, facebook: { on: false }, gbp: { on: false } },
}).plan

t('weekChecklist: 柱が無いときは、まず柱を決める', () => {
  const l = P.weekChecklist({ items: [], plan: P.validatePlan({}).plan, today: TODAY })
  assert.equal(l[0].id, 'setup')
  assert.equal(l[0].draft, null)
})

t('weekChecklist: 柱のかたより・ペース・LINE・宣伝の多さ・受信箱', () => {
  const hist = [
    { id: '1', at: at('2026-10-06'), nets: ['instagram'], pillar: 'tips' },
    { id: '2', at: at('2026-10-02'), nets: ['instagram'], pillar: 'ad' },
    { id: '3', at: at('2026-10-01'), nets: ['instagram'], pillar: 'ad' },
  ]
  const l = P.weekChecklist({ items: P.itemsOf(hist, []), plan: PLAN, today: '2026-10-14', inbox: { unanswered: 2 } })
  const ids = l.map((x) => x.id)
  assert.ok(ids.includes('mix')) // 宣伝 2/3
  assert.ok(ids.includes('pillar-ura') && ids.includes('pillar-tips')) // 10/12〜の週はどちらもまだ
  assert.ok(ids.includes('cadence-instagram'))
  assert.ok(ids.includes('line-send')) // 14日でまだ0通
  assert.ok(ids.includes('inbox'))
  const ig = l.find((x) => x.id === 'cadence-instagram')
  assert.deepEqual(ig.draft.nets, ['instagram'])
  assert.ok(ig.title.includes('あと 5 本'))
  const ura = l.find((x) => x.id === 'pillar-ura')
  assert.equal(ura.draft.pillar, 'ura')
  assert.ok(ura.draft.topic.includes('テーマ：裏側') && ura.draft.topic.includes('朝の仕込み'))
  assert.ok(ura.draft.topic.includes('保存して見返してね')) // Instagram 向けの書き方
  assert.ok(ura.draft.topic.length < 3000) // /api/social-write のメモの上限
})

t('weekChecklist: LINE が月4通に達したら「送らない」', () => {
  const hist = ['01', '03', '05'].map((d, i) => ({ id: 'l' + i, at: at('2026-10-' + d), nets: ['line'] }))
  const l = P.weekChecklist({ items: P.itemsOf(hist, [{ id: 'q', date: '2026-10-20', targets: ['line'] }]), plan: PLAN, today: TODAY })
  const s = l.find((x) => x.id === 'line-stop')
  assert.ok(s && s.draft === null && s.why.includes('4 通'))
})

t('isAnswered: 受信箱の形がいろいろでも読める', () => {
  assert.equal(P.isAnswered({ status: 'replied' }), true)
  assert.equal(P.isAnswered({ repliedAt: '2026-10-01T00:00:00Z' }), true)
  assert.equal(P.isAnswered({ reply: { at: '2026-10-01T00:00:00Z' } }), true)
  assert.equal(P.isAnswered({ createdAt: '2026-10-01T00:00:00Z' }), false)
})

/* ---- 4. 保存・シェア ---- */
t('carouselCheck: 良い形のカルーセルは全部 OK', () => {
  const k = P.carouselCheck({
    cover: '開店前に見て！ 豆の選び方3つ',
    slides: ['1. 焙煎日を見る', '2. 挽くのは飲む直前に', '3. 好みの酸味を伝える'],
    last: '保存して見返してね',
    caption: '',
  })
  assert.equal(k.ok, k.total)
  assert.equal(k.slides, 5)
})

t('carouselCheck: 枚数・表紙・1枚1つ・長さ・お願い の不足を言う', () => {
  const long = 'あ'.repeat(70)
  const k = P.carouselCheck({ cover: 'こんにちは', slides: ['一つ目。二つ目。三つ目。', long], last: 'ありがとう', caption: '' })
  const by = Object.fromEntries(k.checks.map((c) => [c.id, c]))
  assert.equal(by.count.ok, false)
  assert.equal(by.cover.ok, false)
  assert.equal(by.one.ok, false)
  assert.ok(by.one.detail.includes('2枚目'))
  assert.equal(by.length.ok, false)
  assert.ok(by.length.detail.includes('3枚目'))
  assert.equal(by.cta.ok, false)
  // キャプションにお願いがあれば OK
  assert.equal(P.carouselCheck({ cover: 'a', slides: [], last: '', caption: '保存してね' }).checks.find((c) => c.id === 'cta').ok, true)
})

t('carouselCaption / carouselText: たたき台と書き出し', () => {
  const c = { cover: '豆の選び方3つ', slides: ['焙煎日を見る\n細かい説明', '挽きたて'], last: '保存して見返してね' }
  const cap = P.carouselCaption(c)
  assert.ok(cap.startsWith('豆の選び方3つ'))
  assert.ok(cap.includes('・焙煎日を見る') && !cap.includes('細かい説明'))
  assert.ok(cap.includes('保存'))
  const txt = P.carouselText({ ...c, caption: cap })
  assert.ok(txt.includes('【1枚目（表紙）】\n豆の選び方3つ'))
  assert.ok(txt.includes('【4枚目（最後）】\n保存して見返してね'))
  assert.ok(txt.includes('【キャプション】'))
})

t('saveShareScore: 手順＋お願い＝3点、宣伝だけ＝低い、空は null', () => {
  assert.equal(P.saveShareScore('  '), null)
  const good = P.saveShareScore('おうちで淹れるコツ\n1. 豆は挽きたて\n2. お湯は90度\n保存して見返してね')
  assert.equal(good.score, 3)
  const ad = P.saveShareScore('秋の限定メニュー、今だけ10%OFF！ご予約はこちら')
  assert.equal(ad.pureAd, true)
  assert.equal(ad.score, 0)
  assert.equal(ad.tips.length, 3)
  // 宣伝でも、役立つ形なら「宣伝だけ」ではない
  const mixed = P.saveShareScore('限定メニューのおいしい食べ方3つ')
  assert.equal(mixed.pureAd, false)
  assert.equal(mixed.score, 2)
})

/* ---- 5. 投稿直後の1時間・返事の早さ ---- */
t('firstHour: 60分以内に出したものだけ、残り分数つき', () => {
  const now = Date.parse('2026-10-07T03:00:00Z')
  const posts = [
    { id: 'a', at: '2026-10-07T02:45:00Z', nets: ['x'] },
    { id: 'b', at: '2026-10-07T01:59:00Z', nets: ['x'] }, // 61分前
    { id: 'c', at: '2026-10-07T02:30:00Z', nets: [] }, // どこにも出ていない
  ]
  const h = P.firstHour(posts, now)
  assert.equal(h.length, 1)
  assert.equal(h[0].post.id, 'a')
  assert.equal(h[0].minutesLeft, 45)
})

t('replySpeed: 中央値と1時間以内の割合。時刻が無ければ null', () => {
  const c = (got, rep) => ({ createdAt: got, repliedAt: rep })
  const r = P.replySpeed([
    c('2026-10-01T00:00:00Z', '2026-10-01T00:10:00Z'),
    c('2026-10-01T00:00:00Z', '2026-10-01T00:50:00Z'),
    c('2026-10-01T00:00:00Z', '2026-10-01T03:00:00Z'),
    { createdAt: '2026-10-01T00:00:00Z' }, // まだ返事していない
  ])
  assert.equal(r.n, 3)
  assert.equal(r.median, 50)
  assert.equal(Math.round(r.within * 100), 67)
  assert.equal(r.open, 1)
  assert.equal(r.reliability.label, '参考程度')
  assert.equal(P.replySpeed([{ status: 'replied' }]), null)
  assert.equal(P.replySpeed([]), null)
})

/* ---- 6. LINE ---- */
t('lineMonth: その月の送った分＋予約。5通目は nextIsOver', () => {
  const hist = [
    { id: 'a', at: '2026-09-30T15:30:00Z', nets: ['line'] }, // 日本時間 10/1 0:30 → 10月
    { id: 'b', at: '2026-09-30T14:00:00Z', nets: ['line'] }, // 日本時間 9/30 → 9月
    { id: 'c', at: at('2026-10-05'), nets: ['line', 'x'] },
    { id: 'd', at: at('2026-10-06'), nets: ['x'] },
  ]
  const queue = [{ id: 'q1', date: '2026-10-20', targets: ['line'] }, { id: 'q2', date: '2026-11-02', targets: ['line'] }]
  const it = P.itemsOf(hist, queue)
  const m = P.lineMonth(it, TODAY)
  assert.deepEqual([m.sent, m.booked, m.count, m.state], [2, 1, 3, 'ok'])
  assert.equal(m.nextIsOver, false)
  const m2 = P.lineMonth(P.itemsOf(hist, queue.concat([{ id: 'q3', date: '2026-10-28', targets: ['line'] }])), TODAY)
  assert.equal(m2.state, 'full')
  assert.equal(m2.nextIsOver, true)
  assert.equal(P.lineMonth(it, '2026-11-15').count, 1)
  assert.equal(P.lineMonth(it, '2026-09-01').state, 'few')
})

t('lineBlockRate / blockBand: blocks があればそれ、無ければ 友だち−届く人数', () => {
  assert.equal(P.lineBlockRate({ followers: 200, blocks: 30 }), 0.15)
  assert.equal(P.lineBlockRate({ followers: 200, reach: 150 }), 0.25)
  assert.equal(P.lineBlockRate({ followers: null, reach: 1 }), null)
  assert.equal(P.lineBlockRate({ followers: 200 }), null)
  assert.equal(P.blockBand(0.2).level, 'good')
  assert.equal(P.blockBand(0.25).level, 'avg')
  assert.equal(P.blockBand(0.31).level, 'act')
  assert.equal(P.blockBand(null), null)
})

t('lineTrend: 2日分から。増減を出す', () => {
  assert.equal(P.lineTrend([{ date: '2026-10-01', followers: 100 }]), null)
  const tr = P.lineTrend([{ date: '2026-10-03', followers: 104 }, { date: '2026-10-01', followers: 100 }, { date: '2026-10-02', followers: null }])
  assert.equal(tr.diff, 4)
  assert.equal(tr.from, '2026-10-01')
  assert.equal(tr.points.length, 2)
})

console.log(`  運用プランのテスト ${n} 件すべて通りました。`)
