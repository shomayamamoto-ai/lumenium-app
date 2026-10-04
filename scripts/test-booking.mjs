// 予約管理の計算のテスト。外には一切出ません（保存先は下の作り物）。
//
//   node scripts/test-booking.mjs
//
// 確かめること。
//   ・決まり → 枠（複数の時間帯・祝日・臨時休業・前後の空き・直前・何日先まで）
//   ・壊れた決まりの直し方（15分単位・メニューが無い・LINE のID）
//   ・同時に押された 10:00 と 10:30（区切りの鍵で片方だけ通る）・取消で返す

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

/* 作り物の保存先（Upstash の pipeline と同じ返し方）。命令を1つずつ、間に
   await を挟んで実行するので、Promise.all で投げた2つの pipeline は命令単位で
   交互に進みます（本物の同時アクセスと同じ混ざり方）。 */
function fakeStore() {
  const kv = new Map()
  const z = new Map()
  const lists = new Map()
  const run = (c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    if (op === 'GET') return kv.has(k) ? kv.get(k) : null
    if (op === 'SET') {
      if (c.includes('NX') && kv.has(k)) return null
      kv.set(k, String(c[2])); return 'OK'
    }
    if (op === 'DEL') { const had = kv.delete(k) || z.delete(k) || lists.delete(k); return had ? 1 : 0 }
    if (op === 'ZADD') { const m = z.get(k) || new Map(); m.set(String(c[3]), Number(c[2])); z.set(k, m); return 1 }
    if (op === 'ZREM') { const m = z.get(k); return m && m.delete(String(c[2])) ? 1 : 0 }
    if (op === 'ZRANGEBYSCORE') {
      const m = z.get(k) || new Map()
      return [...m].filter(([, v]) => v >= Number(c[2]) && v <= Number(c[3])).sort((a, b) => a[1] - b[1]).map(([id]) => id)
    }
    if (op === 'LPUSH') { const l = lists.get(k) || []; l.unshift(String(c[2])); lists.set(k, l); return l.length }
    if (op === 'LTRIM') { const l = lists.get(k) || []; lists.set(k, l.slice(c[2], c[3] + 1)); return 'OK' }
    if (op === 'LRANGE') { const l = lists.get(k) || []; return l.slice(c[2], c[3] === -1 ? undefined : c[3] + 1) }
    if (op === 'HSET') { const m = kv.get(k) instanceof Map ? kv.get(k) : new Map(); m.set(String(c[2]), String(c[3])); kv.set(k, m); return 1 }
    if (op === 'HGET') { const m = kv.get(k); return m instanceof Map ? (m.get(String(c[2])) ?? null) : null }
    if (op === 'EXPIRE') return 1
    throw new Error('fake store: ' + op)
  }
  const pipeline = async (_cfg, cmds) => {
    const out = []
    for (const c of cmds) { await new Promise((r) => setImmediate(r)); out.push(run(c)) }
    return out
  }
  return { cfg: { url: 'fake', token: 'fake' }, pipeline, kv }
}

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

/* ---- 2. 重ならないための鍵 ---- */
await t('区切り: 開始〜終わり＋後ろの空き（15分単位）', () => {
  const a = B.cellsFor(jst('2026-10-05 10:00'), jst('2026-10-05 11:00'), 30)
  assert.equal(a.length, 6)                          // 10:00〜11:30
  const b = B.cellsFor(jst('2026-10-05 11:30'), jst('2026-10-05 12:30'), 30)
  assert.ok(!a.some((x) => b.includes(x)))           // 30分あいていれば重ならない
  const c = B.cellsFor(jst('2026-10-05 11:15'), jst('2026-10-05 12:15'), 30)
  assert.ok(a.some((x) => c.includes(x)))
})

await t('同時に押された 10:00 と 10:30（60分）: 両方は通らない', async () => {
  for (let round = 0; round < 20; round++) {
    const S = fakeStore()
    const A = B.cellsFor(jst('2026-10-05 10:00'), jst('2026-10-05 11:00'), 30)
    const C = B.cellsFor(jst('2026-10-05 10:30'), jst('2026-10-05 11:30'), 30)
    const until = jst('2026-10-05 12:00'), now = jst('2026-10-04 09:00')
    const [ra, rc] = await Promise.all(round % 2
      ? [B.takeCells(S.cfg, S.pipeline, A, 'bk_a', until, now), B.takeCells(S.cfg, S.pipeline, C, 'bk_c', until, now)]
      : [B.takeCells(S.cfg, S.pipeline, C, 'bk_c', until, now), B.takeCells(S.cfg, S.pipeline, A, 'bk_a', until, now)].reverse())
    assert.ok(!(ra && rc), '両方通ってしまった')
    // 負けた側の区切りは残らない（勝った側の分だけ）。
    const owners = new Set([...S.kv].filter(([k]) => k.includes('bk:cell:')).map(([, v]) => v))
    assert.ok(owners.size <= 1)
    if (ra) assert.deepEqual([...owners], ['bk_a'])
    if (rc) assert.deepEqual([...owners], ['bk_c'])
  }
})

await t('昔の「開始時刻の鍵」では両方通ってしまう例（このテストが守っているもの）', async () => {
  const S = fakeStore()
  const old = (key) => S.pipeline(S.cfg, [['SET', 'lock:' + key, '1', 'NX']]).then(([r]) => r === 'OK')
  const [a, c] = await Promise.all([old('10:00'), old('10:30')])
  assert.ok(a && c)
})

await t('取消で区切りを返す（他人の区切りは消さない）→ 同じ時間をもう一度取れる', async () => {
  const S = fakeStore()
  const now = jst('2026-10-04 09:00')
  const A = B.cellsFor(jst('2026-10-05 10:00'), jst('2026-10-05 11:00'), 30)
  const D = B.cellsFor(jst('2026-10-05 12:00'), jst('2026-10-05 13:00'), 30)
  assert.ok(await B.takeCells(S.cfg, S.pipeline, A, 'bk_a', jst('2026-10-05 11:00'), now))
  assert.ok(await B.takeCells(S.cfg, S.pipeline, D, 'bk_d', jst('2026-10-05 13:00'), now))
  assert.ok(!(await B.takeCells(S.cfg, S.pipeline, A, 'bk_x', jst('2026-10-05 11:00'), now)))
  assert.equal(await B.releaseCells(S.cfg, S.pipeline, A.concat(D), 'bk_a'), A.length)
  assert.ok(await B.takeCells(S.cfg, S.pipeline, A, 'bk_x', jst('2026-10-05 11:00'), now))
  assert.ok(!(await B.takeCells(S.cfg, S.pipeline, D, 'bk_y', jst('2026-10-05 13:00'), now)))
  // 記録の区切りの範囲から、同じ区切りを作り直せる。
  assert.deepEqual(B.recCells({ cells: [A[0], A[A.length - 1]] }), A)
})

await t('空きの計算: 入った予約（以前の形の記録も）を前後の空きごと除く', async () => {
  const S = fakeStore()
  const { rules } = B.normalizeRules({ leadHours: 0 })
  await B.saveBooking(S.cfg, S.pipeline, { id: 'bk_1', start: jst('2026-10-05 12:00'), end: jst('2026-10-05 13:00'), status: 'confirmed' })
  await B.saveBooking(S.cfg, S.pipeline, { id: 'bk_2', start: jst('2026-10-05 15:00'), end: jst('2026-10-05 16:00'), status: 'cancelled' })
  // 以前の記録: start/end/status が無く、鍵と方式だけ。
  await S.pipeline(S.cfg, [['SET', 'lum:bk:rec:bk_old', JSON.stringify({ id: 'bk_old', key: new Date(jst('2026-10-06 10:00')).toISOString(), mode: 'local' })], ['LPUSH', 'lum:bk:index', 'bk_old']])
  const all = B.candidates(jst('2026-10-04 09:00'), rules, 60)
  const taken = await B.takenSpans(S.cfg, S.pipeline, all[0].start, all[all.length - 1].end)
  assert.equal(taken.length, 2)
  const free = B.removeBusy(all, taken, rules.bufferMin).map((x) => ymd(x.start) + ' ' + hhmm(x.start))
  assert.ok(!free.includes('2026-10-05 12:00'))
  assert.ok(free.includes('2026-10-05 15:00'))       // 取り消した枠は空き
  assert.ok(!free.includes('2026-10-06 10:00'))
  assert.ok(free.includes('2026-10-06 11:30'))
})

console.log(`✓ test-booking: ${n} 件`)
