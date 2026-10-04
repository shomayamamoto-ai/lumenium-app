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

console.log(`  運用プランのテスト ${n} 件すべて通りました。`)
