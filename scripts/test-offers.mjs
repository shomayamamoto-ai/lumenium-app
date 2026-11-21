// 申込を受けるページ（研修・美容室・社労士）の決まりごと。
//   ・研修の料金は、料金ページの「AI導入・研修」の幅から外れない（新しい単価を作らない）
//   ・助成金の目安の計算（ページの計算と同じ式）
//   ・申込フォームの本文から、見積書の下書きが作れる
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TRAINING_PLANS, SALON, SUBSIDY } from '../src/data/offers.js'
import { PRICE_OPTIONS } from '../src/data/site.js'
import { prefillFromInquiry } from '../api/_quote-core.js'

let n = 0
const ok = (m) => { n++; console.log('  ✓ ' + m) }

const ai = PRICE_OPTIONS.find((p) => p.key === 'ai')
for (const p of TRAINING_PLANS.filter((x) => x.id !== 'build')) {
  const perSession = p.price / p.sessions
  assert.ok(perSession >= ai.min && perSession <= ai.max, `${p.id}: 1回 ${perSession}円 が料金ページの幅 ${ai.min}〜${ai.max} の外`)
  assert.equal(p.hours, p.sessions * 2)
}
ok('研修の料金は、料金ページの「講師1回」の幅の中')

// ページの計算（public/lead-form.js の bindCalc と同じ式）
function aid(plan, people, fee) {
  let capPer = 0
  SUBSIDY.caps.forEach((c) => { if (plan.hours >= c.from) capPer = c.cap })
  const feeAid = Math.min(Math.floor(fee * SUBSIDY.rate), capPer * people)
  return { feeAid, wage: SUBSIDY.wage * plan.hours * people, eligible: plan.hours >= SUBSIDY.minHours }
}
const practice = TRAINING_PLANS.find((p) => p.id === 'practice')
assert.deepEqual(aid(practice, 8, 500000), { feeAid: 375000, wage: 80000, eligible: true })
assert.equal(aid(practice, 1, 500000).feeAid, 300000) // 1人なら上限30万円で止まる
assert.equal(aid(TRAINING_PLANS[0], 8, 100000).eligible, false)
assert.ok(readFileSync('public/lead-form.js', 'utf8').includes('Math.min(Math.floor(fee * s.rate), capPer * n)'))
ok('助成金の目安: 75%・1人30万円まで・賃金1,000円/時、10時間未満は対象外')

assert.ok(SUBSIDY.sources.every(([, u]) => /^https:\/\/www\.mhlw\.go\.jp\//.test(u)), '出典は厚生労働省のページだけ')
assert.ok(/2027年3月31日/.test(SUBSIDY.summary))
ok('助成金の出典は厚生労働省・期限を書いている')

const t = prefillFromInquiry({ message: `【${practice.short}】の概算見積り\n・研修: ${practice.name}\n・受講予定: 8名\n概算: ¥500,000〜¥500,000（税別）\n\nx`, company: 'A社', name: '山田' }, {}, '2026-11-21')
assert.equal(t.items[0].price, 500000)
const s = prefillFromInquiry({ message: `【美容室まとめパック（モニター）】の概算見積り\n・店名: A\n概算: 月額¥${SALON.monitor.monthly.toLocaleString('ja-JP')}（モニター3か月・初期¥0）` }, {}, '2026-11-21')
assert.equal(s.items[0].price, SALON.monitor.monthly); assert.equal(s.items[0].unit, '月')
ok('申込の本文から、見積書の下書きが作れる（研修・美容室）')

for (const f of ['training', 'salon', 'partners']) {
  const h = readFileSync(`public/${f}.html`, 'utf8')
  assert.ok(h.includes('data-kind=') && h.includes('/lead-form.js'), f)
  assert.ok(!/キャッシュバック[^。]*します|実質無料で/.test(h), `${f}: 禁止されている言い方`)
}
ok('3ページに申込フォームがあり、「実質無料」などの言い方がない')

console.log(`\n申込ページ ${n} 件すべて通りました。`)
