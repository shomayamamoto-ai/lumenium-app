// 予約管理の計算のテスト。外には一切出ません（保存先は下の作り物）。
//
//   node scripts/test-booking.mjs
//
// 確かめること。
//   ・決まり → 枠（複数の時間帯・祝日・臨時休業・前後の空き・直前・何日先まで）
//   ・壊れた決まりの直し方（15分単位・メニューが無い・LINE のID）

import assert from 'node:assert/strict'
import * as B from '../api/_booking.js'

let n = 0
async function t(name, fn) {
  try { await fn(); n++ } catch (e) { console.error('✗ ' + name); throw e }
}

const JST = 9 * 3600e3
const MIN = 60e3
/** 日本時間の 'YYYY-MM-DD HH:MM' → ms */
const jst = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') - JST
const hhmm = (ms) => new Date(ms + JST).toISOString().slice(11, 16)
const ymd = (ms) => new Date(ms + JST).toISOString().slice(0, 10)

/* ---- 1. 決まり → 枠 ---- */
await t('既定の決まりは以前と同じ（平日10〜18時・60分・30分刻み・20時間後から）', () => {
  const rules = B.normalizeRules(null).rules
  // 2026-10-05 は月曜。日曜の朝9時から見る。
  const s = B.candidates(jst('2026-10-04 09:00'), rules, 60)
  assert.equal(ymd(s[0].start), '2026-10-05')
  assert.equal(hhmm(s[0].start), '10:00')
  const mon = s.filter((x) => ymd(x.start) === '2026-10-05')
  assert.equal(mon.length, 15)                       // 10:00 … 17:00、30分刻み
  assert.equal(hhmm(mon[mon.length - 1].end), '18:00')
  assert.ok(!s.some((x) => [0, 6].includes(new Date(x.start + JST).getUTCDay())))
})

await t('1日に複数の時間帯（昼休み）と、長さの違うメニュー', () => {
  const { rules } = B.normalizeRules({ week: [[], [[600, 720], [780, 1080]], [], [], [], [], []], stepMin: 60, leadHours: 0 })
  const s = B.candidates(jst('2026-10-04 09:00'), rules, 90).filter((x) => ymd(x.start) === '2026-10-05')
  // 10:00 開始の90分は 11:30 まで（12時まで）。11:00 開始は 12:30 で昼休みにかかる。
  assert.deepEqual(s.map((x) => hhmm(x.start)), ['10:00', '13:00', '14:00', '15:00', '16:00'])
})

await t('祝日を休みにする（2026-10-12 スポーツの日）・臨時休業・表の外の年', () => {
  const base = { week: [[], [[600, 660]], [[600, 660]], [[600, 660]], [[600, 660]], [[600, 660]], []], leadHours: 0, horizonDays: 14 }
  const off = B.normalizeRules({ ...base, holidays: false }).rules
  const on = B.normalizeRules({ ...base, holidays: true, closed: ['2026-10-14'] }).rules
  const now = jst('2026-10-10 09:00')
  const days = (r) => B.candidates(now, r, 60).map((x) => ymd(x.start))
  assert.ok(days(off).includes('2026-10-12'))
  assert.ok(!days(on).includes('2026-10-12'))
  assert.ok(!days(on).includes('2026-10-14'))
  assert.equal(B.closedOn(jst('2026-10-12 12:00'), on), 'スポーツの日')
  assert.equal(B.closedOn(jst('2026-10-14 12:00'), on), '臨時休業')
  assert.equal(B.closedOn(jst('2026-10-11 12:00'), on), '定休日')
  assert.equal(B.HOLIDAYS['2027-03-22'], '振替休日')
  assert.ok(Object.keys(B.HOLIDAYS).every((d) => d <= B.HOLIDAY_LAST))
})

await t('直前（leadHours）と何日先まで（horizonDays）', () => {
  const { rules } = B.normalizeRules({ leadHours: 48, horizonDays: 3 })
  const now = jst('2026-10-05 09:00')                // 月曜
  const s = B.candidates(now, rules, 60)
  assert.ok(s.every((x) => x.start >= now + 48 * 3600e3))
  assert.ok(s.every((x) => x.start <= now + 3 * 86400e3))
  assert.equal(ymd(s[0].start), '2026-10-07')
})

await t('前後の空き（bufferMin）: 予定の30分前後には入れない', () => {
  const { rules } = B.normalizeRules({ leadHours: 0 })
  const all = B.candidates(jst('2026-10-04 09:00'), rules, 60).filter((x) => ymd(x.start) === '2026-10-05')
  const busy = [{ start: jst('2026-10-05 12:00'), end: jst('2026-10-05 13:00') }]
  const free = B.removeBusy(all, busy, rules.bufferMin).map((x) => hhmm(x.start))
  assert.ok(free.includes('10:30'))                  // 11:30 に終わる → 30分あく
  assert.ok(!free.includes('11:00'))
  assert.ok(!free.includes('13:00'))
  assert.ok(free.includes('13:30'))
  assert.ok(B.removeBusy(all, busy, 0).map((x) => hhmm(x.start)).includes('11:00'))
})

await t('壊れた決まりは直して、何を直したかを返す', () => {
  const { rules, problems } = B.normalizeRules({
    wording: 'ぜんぜん違う', week: [[], [[605, 700], [600, 720], [705, 810]], [], [], [], [], []],
    bufferMin: 20, stepMin: 7, lineUserId: 'abc', services: [{ name: '' }, { name: 'カット', minutes: 50, active: false }],
  })
  assert.equal(rules.wording, '商談')
  assert.deepEqual(rules.week[1], [[600, 810]])
  assert.equal(rules.bufferMin, 15)
  assert.equal(rules.stepMin, 30)
  assert.equal(rules.lineUserId, '')
  assert.equal(rules.services[0].minutes, 45)
  assert.ok(rules.services.some((s) => s.active))
  assert.ok(problems.length >= 3)
  assert.equal(B.bookingNoun(B.normalizeRules({ wording: '予約' }).rules), 'ご予約')
  assert.equal(B.bookingNoun(rules), '商談のご予約')
})

await t('メニューの選び方: 止めてあるもの・知らない id は先頭の受付中のもの', () => {
  const { rules } = B.normalizeRules({ services: [
    { id: 'cut', name: 'カット', minutes: 60 }, { id: 'color', name: 'カラー', minutes: 120, active: false },
  ] })
  assert.equal(B.pickService(rules, 'color').id, 'cut')
  assert.equal(B.pickService(rules, 'nope').id, 'cut')
  assert.equal(B.activeServices(rules).length, 1)
})

console.log(`✓ test-booking: ${n} 件`)
