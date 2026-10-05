// 予約管理の計算のテスト。外には一切出ません（保存先は下の作り物）。
//
//   node scripts/test-booking.mjs
//
// 確かめること。
//   ・決まり → 枠（複数の時間帯・祝日・臨時休業・前後の空き・直前・何日先まで）
//   ・壊れた決まりの直し方（15分単位・メニューが無い・LINE のID）
//   ・同時に押された 10:00 と 10:30（区切りの鍵で片方だけ通る）・取消で返す
//   ・取り消し・変更のリンク（署名・期限・締め切り）と、通しでの予約→変更→取消
//   ・前日のお知らせを送る相手（日本時間の明日）・今日の一覧・無断キャンセル率

import assert from 'node:assert/strict'

/* 時計を止めます。予約の枠は「いま」から何時間先かで変わるので、本物の
   時計のままだと、夕方に走らせたときだけ「2時間後の枠が営業時間外」に
   なって落ちていました（ビルドの途中で走るテストが時刻しだいで落ちると、
   サイトの更新が止まります）。火曜の朝9時（日本時間）に固定し、そこから
   実際に経った分だけ進めます。 */
const REAL = Date
const FIXED = REAL.UTC(2026, 9, 6, 0, 0, 0) // 2026-10-06 09:00 JST（火）
const START = REAL.now()
class FixedDate extends REAL {
  constructor(...a) { super(...(a.length ? a : [FIXED + (REAL.now() - START)])) }
  static now() { return FIXED + (REAL.now() - START) }
}
globalThis.Date = FixedDate

const B = await import('../api/_booking.js')

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
    if (op === 'INCR') { const v = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(v)); return v }
    if (op === 'TTL') return 60
    throw new Error('fake store: ' + op)
  }
  const pipeline = async (_cfg, cmds) => {
    const out = []
    for (const c of cmds) { await new Promise((r) => setImmediate(r)); out.push(run(c)) }
    return out
  }
  return { cfg: { url: 'fake', token: 'fake' }, pipeline, kv, run }
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

/* ---- 3. 取り消し・変更 ---- */
await t('リンクの署名: 正しい鍵・書き換え・期限切れ・鍵なし', async () => {
  const exp = Date.now() + 3600e3
  const tok = await B.signManage('bk_1_abc', exp, 'secret-1')
  assert.deepEqual(await B.verifyManage(tok, 'secret-1'), { ok: true, id: 'bk_1_abc' })
  assert.equal((await B.verifyManage(tok, 'secret-2')).why, 'bad')
  assert.equal((await B.verifyManage(tok.replace('bk_1_abc', 'bk_2_abc'), 'secret-1')).why, 'bad')
  assert.equal((await B.verifyManage(tok, 'secret-1', exp + 2000)).why, 'expired')
  assert.equal((await B.verifyManage(tok, '')).why, 'bad')
  assert.equal((await B.verifyManage('<script>', 'secret-1')).why, 'bad')
})

await t('締め切り: 開始の cutoffHours 時間前まで・取り消し済み・過去', () => {
  const rules = B.normalizeRules({ cutoffHours: 24 }).rules
  const now = jst('2026-10-04 09:00')
  const rec = (start, status) => ({ id: 'bk_x', start, end: start + 3600e3, status })
  assert.ok(B.canChange(rec(jst('2026-10-05 10:00'), 'confirmed'), rules, now).ok)
  assert.equal(B.canChange(rec(jst('2026-10-05 08:00'), 'tentative'), rules, now).why, 'cutoff')
  assert.equal(B.canChange(rec(jst('2026-10-04 08:00'), 'tentative'), rules, now).why, 'past')
  assert.equal(B.canChange(rec(jst('2026-10-09 10:00'), 'cancelled'), rules, now).why, 'status')
})

await t('日時の変更: 前の枠と重なる区切りは自分のものとして取れる・前の分は返す', async () => {
  const S = fakeStore()
  const now = jst('2026-10-04 09:00')
  const old = B.cellsFor(jst('2026-10-05 10:00'), jst('2026-10-05 11:00'), 30)
  const neu = B.cellsFor(jst('2026-10-05 10:30'), jst('2026-10-05 11:30'), 30)
  assert.ok(await B.takeCells(S.cfg, S.pipeline, old, 'bk_a', jst('2026-10-05 11:00'), now))
  assert.ok(await B.takeCells(S.cfg, S.pipeline, neu, 'bk_a', jst('2026-10-05 11:30'), now))
  assert.ok(!(await B.takeCells(S.cfg, S.pipeline, neu, 'bk_b', jst('2026-10-05 11:30'), now)))
  await B.releaseCells(S.cfg, S.pipeline, old.filter((n) => !neu.includes(n)), 'bk_a')
  assert.ok(await B.takeCells(S.cfg, S.pipeline, B.cellsFor(jst('2026-10-05 09:00'), jst('2026-10-05 10:00'), 0), 'bk_c', jst('2026-10-05 10:00'), now))
})

/* 通し: 本物の関数を、作り物の保存先とメールで動かす。 */
const S = fakeStore()
const mails = []
Object.assign(process.env, {
  UPSTASH_REDIS_REST_URL: 'https://redis.test.invalid', UPSTASH_REDIS_REST_TOKEN: 't',
  ADMIN_KEY: 'test-admin-key', SESSION_SECRET: 'test-session-secret', RESEND_API_KEY: 'test',
})
for (const n of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_CALENDAR_ICS_URL', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[n]
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith('https://redis.test.invalid')) {
    const out = await S.pipeline(null, JSON.parse(init.body || '[]'))
    return new Response(JSON.stringify(out.map((result) => ({ result }))), { status: 200 })
  }
  if (u.startsWith('https://api.resend.com/')) { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }) }
  throw new Error('外に出ようとした: ' + u)
}
const api = await import('../api/booking.js')
const manage = await import('../api/booking-manage.js')
const ADMIN = { Authorization: 'Bearer test-admin-key', 'content-type': 'application/json' }
const call = (fn, method, path, headers, body) => fn(new Request('https://x.test' + path, { method, headers, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }))
const form = (o) => new URLSearchParams(o).toString()
const FORM = { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.0.0.9' }

await t('通し: 決まりの保存 → 枠 → 同時の2件は片方だけ → 変更 → 取消 → 同じ枠をまた取れる', async () => {
  const week = Array.from({ length: 7 }, () => [[540, 1260]])
  let r = await call(api.PUT, 'PUT', '/api/booking', ADMIN, { rules: { week, leadHours: 0, cutoffHours: 0, horizonDays: 7, wording: '来店', online: false, place: '駅前店',
    services: [{ id: 'cut', name: 'カット', minutes: 60 }, { id: 'color', name: 'カラー', minutes: 90 }] } })
  assert.equal(r.status, 200)
  r = await call(api.GET, 'GET', '/api/booking?service=color&all=1', {})
  let d = await r.json()
  assert.equal(d.minutes, 90)
  assert.equal(d.services.length, 2)
  assert.equal(d.wording, '来店')
  assert.equal(d.slots[0].minutes, 90)
  // 同じ日の、30分ずれた2つの枠。
  const a = d.slots.find((s, i) => d.slots[i + 1] && d.slots[i + 1].start - s.start === 30 * 60e3)
  const b = d.slots.find((s) => s.start === a.start + 30 * 60e3)
  const book = (s, who) => call(api.POST, 'POST', '/api/booking', { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.' + who.length },
    { key: s.key, service: 'color', name: who, email: who + '@example.com', message: '' })
  const res = await Promise.all([book(a, 'aaa'), book(b, 'bbbb')])
  const codes = res.map((x) => x.status).sort()
  assert.deepEqual(codes, [200, 409], '片方だけ通るはず: ' + codes)
  const won = res[0].status === 200 ? a : b
  // お客様あてのメールに、変更・取り消しのリンクが入っている。
  const cust = mails.find((m) => m.to[0].endsWith('@example.com') && /\/api\/booking-manage\?t=/.test(m.text))
  assert.ok(cust, 'お客様あてのメールにリンクが無い')
  assert.ok(cust.text.includes('場所: 駅前店'))
  assert.ok(cust.subject.includes('仮予約'))
  const token = /booking-manage\?t=(\S+)/.exec(cust.text)[1]

  r = await call(manage.GET, 'GET', '/api/booking-manage?t=' + token, {})
  let html = await r.text()
  assert.equal(r.status, 200)
  assert.ok(html.includes('日時を変更する') && html.includes('カラー（90分）'))
  r = await call(manage.GET, 'GET', '/api/booking-manage?t=' + token.slice(0, -1) + (token.endsWith('0') ? '1' : '0'), {})
  assert.ok((await r.text()).includes('このリンクは使えません'))

  // 2時間後へ変更。
  const later = d.slots.find((s) => s.start === won.start + 120 * 60e3)
  r = await call(manage.POST, 'POST', '/api/booking-manage', FORM, form({ t: token, action: 'move', key: later.key }))
  html = await r.text()
  assert.ok(html.includes('変更しました'), html.slice(0, 400))
  // 前の時間は空き、新しい時間は埋まっている。
  d = await (await call(api.GET, 'GET', '/api/booking?service=color&all=1', {})).json()
  assert.ok(d.slots.some((s) => s.key === won.key))
  assert.ok(!d.slots.some((s) => s.key === later.key))
  assert.ok(mails.some((m) => m.subject.includes('日時を変更しました') && m.attachments))

  // 取り消し（印なし → 断る、印あり → 取り消し）。
  r = await call(manage.POST, 'POST', '/api/booking-manage', FORM, form({ t: token, action: 'cancel' }))
  assert.ok((await r.text()).includes('印を付けてから'))
  r = await call(manage.POST, 'POST', '/api/booking-manage', FORM, form({ t: token, action: 'cancel', sure: '1' }))
  assert.ok((await r.text()).includes('取り消しました'))
  const cancelMail = mails.find((m) => m.subject.includes('取り消し') && m.attachments)
  assert.ok(Buffer.from(cancelMail.attachments[0].content, 'base64').toString().includes('METHOD:CANCEL'))
  // 区切りが返っているので、同じ時間をほかの人が取れる。
  r = await book(later, 'ccccc')
  assert.equal(r.status, 200)
  // 取り消した予約のリンクでは、もう何もできない。
  r = await call(manage.GET, 'GET', '/api/booking-manage?t=' + token, {})
  assert.ok((await r.text()).includes('取り消し済み'))
})

await t('通し: 管理画面から 確定・来店済み・メモ・取消（締め切りは管理側には無い）', async () => {
  const list = await (await call(api.GET, 'GET', '/api/booking?recent=1', ADMIN)).json()
  const live = list.bookings.find((x) => x.status === 'tentative')
  assert.ok(live)
  let r = await call(api.PATCH, 'PATCH', '/api/booking', ADMIN, { id: live.id, action: 'confirmed' })
  assert.equal((await r.json()).booking.status, 'confirmed')
  assert.ok(mails.some((m) => m.subject.includes('確定しました')))
  r = await call(api.PATCH, 'PATCH', '/api/booking', ADMIN, { id: live.id, action: 'memo', memo: 'カラーは前回と同じ' })
  assert.equal((await r.json()).booking.memo, 'カラーは前回と同じ')
  r = await call(api.PATCH, 'PATCH', '/api/booking', ADMIN, { id: live.id, action: 'cancel' })
  assert.equal((await r.json()).booking.status, 'cancelled')
  r = await call(api.PATCH, 'PATCH', '/api/booking', { 'content-type': 'application/json' }, { id: live.id, action: 'cancel' })
  assert.equal(r.status, 401)
})

await t('通し: 空き枠の控え（1分）は、予約・取り消しのたびに捨てられる', async () => {
  const get = async () => (await call(api.GET, 'GET', '/api/booking?service=cut&all=1', {})).json()
  const d1 = await get()
  const s = d1.slots[3]
  // 予約の記録だけを直接入れる（控えは捨てない）→ 1分の間は控えのまま。
  await B.saveBooking(S.cfg, S.pipeline, { id: 'bk_cache_1', start: s.start, end: s.end, status: 'confirmed' })
  assert.ok((await get()).slots.some((x) => x.key === s.key))
  await api.invalidateSlots({ url: 'https://redis.test.invalid', token: 't' })
  assert.ok(!(await get()).slots.some((x) => x.key === s.key))
})

/* ---- 4. 毎朝の仕事・数字 ---- */
await t('明日（日本時間）の予約だけを選ぶ（UTC の日付の境目に転ばない）', () => {
  // 日本時間 10/4 23:30 = UTC 10/4 14:30。明日は 10/5。
  const now = jst('2026-10-04 23:30')
  const mk = (id, s, extra) => ({ id, start: jst(s), end: jst(s) + 3600e3, status: 'confirmed', ...extra })
  const list = [
    mk('a', '2026-10-05 00:00'), mk('b', '2026-10-05 23:00'), mk('c', '2026-10-06 00:00'),
    mk('d', '2026-10-04 23:45'), mk('e', '2026-10-05 10:00', { status: 'cancelled' }),
    mk('f', '2026-10-05 11:00', { reminded: '2026-10-04T00:00:00Z' }), mk('g', '2026-10-05 12:00', { status: 'tentative' }),
  ]
  assert.deepEqual(B.dueReminders(list, now).map((r) => r.id), ['a', 'b', 'g'])
  // 朝9時（cron の時刻）に見ても同じ答え。
  assert.deepEqual(B.dueReminders(list, jst('2026-10-04 09:00')).map((r) => r.id), ['a', 'b', 'g'])
})

await t('今日の一覧（LINE）: 予約の無い日は送らない・仮予約の印', () => {
  const now = jst('2026-10-05 09:00')
  assert.equal(B.agendaText([], now), '')
  const txt = B.agendaText([
    { id: 'x', start: jst('2026-10-05 14:00'), end: jst('2026-10-05 15:00'), status: 'tentative', name: '佐藤', service: { name: 'カット' } },
    { id: 'y', start: jst('2026-10-05 10:00'), end: jst('2026-10-05 11:00'), status: 'confirmed', name: '鈴木' },
    { id: 'z', start: jst('2026-10-05 12:00'), end: jst('2026-10-05 13:00'), status: 'cancelled', name: '田中' },
  ], now)
  assert.ok(txt.startsWith('今日の予約 10/5(月)　2件'))
  assert.ok(txt.indexOf('鈴木') < txt.indexOf('佐藤'))
  assert.ok(txt.includes('カット 佐藤様（仮予約）'))
  assert.ok(!txt.includes('田中'))
})

await t('取り消し率と無断キャンセル率（来た・来なかったを付けたものだけで割る）', () => {
  const r = B.rates([{ status: 'visited' }, { status: 'visited' }, { status: 'visited' }, { status: 'noshow' }, { status: 'cancelled' }, { mode: 'google' }])
  assert.equal(r.all, 6)
  assert.equal(r.noshowRate, 0.25)
  assert.equal(r.cancelRate, 1 / 6)
  assert.equal(B.rates([{ status: 'confirmed' }]).noshowRate, null)
})

await t('通し: 毎朝の仕事が明日の予約にだけ1回お知らせを送る', async () => {
  const cron = await import('../api/booking-cron.js')
  const now = Date.now()
  const t0 = B.tomorrowRange(now)[0]
  await B.saveBooking(S.cfg, S.pipeline, { id: 'bk_rem_1', start: t0 + 11 * 3600e3, end: t0 + 12 * 3600e3, status: 'confirmed', name: '明日', email: 'tomorrow@example.com', when: 'x', service: { name: 'カット', minutes: 60 } })
  await B.saveBooking(S.cfg, S.pipeline, { id: 'bk_rem_2', start: t0 + 35 * 3600e3, end: t0 + 36 * 3600e3, status: 'confirmed', name: '明後日', email: 'later@example.com', when: 'y' })
  const before = mails.length
  const r1 = await cron.runBookingCron(new Request('https://x.test/'), now)
  assert.equal(r1.reminders.sent, 1)
  const m = mails.slice(before)
  assert.equal(m.length, 1)
  assert.deepEqual(m[0].to, ['tomorrow@example.com'])
  assert.ok(m[0].subject.startsWith('【明日の'))
  assert.ok(m[0].text.includes('/api/booking-manage?t='))
  const r2 = await cron.runBookingCron(new Request('https://x.test/'), now)
  assert.equal(r2.reminders.sent, 0)
  const res = await cron.GET(new Request('https://x.test/api/booking-cron'))
  assert.ok([401, 503].includes(res.status))
})

console.log(`✓ test-booking: ${n} 件`)
