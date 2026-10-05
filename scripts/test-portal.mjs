// 管理ポータル（public/admin-portal.js）の計算のテスト。画面も通信も使いません。
//
//   node scripts/test-portal.mjs
//
// 確かめること。
//   ・各 API の返事 → 「今日やること」の行（何を・何件・なぜ・どこを開くか）
//   ・急ぎの順に並ぶこと（至急 → 要対応 → 今日 → 今週の様子）
//   ・読めなかった・未設定のものがあっても、残りはそのまま出ること
//   ・何もないときは、やることが 0 件になること

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../public/admin-portal.js', import.meta.url), 'utf8')
const box = {}
vm.runInNewContext(code, { globalThis: box, setTimeout })
const C = box.lumPortalCore
assert.ok(C, 'lumPortalCore が読めること')
// vm の中の配列は別の Array なので、比べる前に JSON で持ち出します。
const out = (x) => JSON.parse(JSON.stringify(x))
const build = (...a) => out(C.buildToday(...a))

let n = 0
function test(name, fn) {
  try { fn(); n++ } catch (e) { console.error('✗ ' + name); throw e }
}

const H = 3600000, DAY = 86400000
// 2026-10-05（月）10:00 JST
const NOW = Date.parse('2026-10-05T01:00:00Z')
const ok = (data) => ({ state: 'ok', data })
const iso = (ms) => new Date(ms).toISOString()

const FULL = {
  inquiries: ok({
    ok: true, stored: true, promised: 48,
    items: [
      { id: 'q-new', receivedAt: iso(NOW - 2 * H), overdue: '', readAt: null },
      { id: 'q-old', receivedAt: iso(NOW - 80 * H), overdue: 'late', readAt: null },
      { id: 'q-late', receivedAt: iso(NOW - 50 * H), overdue: 'late', readAt: iso(NOW - 40 * H) },
    ],
    metrics: { counts: { new: 3, unread: 2 }, late: 2, warn: 0 },
  }),
  booking: ok({
    ok: true, stored: true,
    bookings: [
      { id: 'b1', start: NOW + 4 * H, end: NOW + 5 * H, status: 'confirmed', service: { name: 'カット' } },
      { id: 'b2', start: NOW - 2 * H, end: NOW - H, status: 'visited' },
      { id: 'b3', start: NOW + 24 * H, end: NOW + 25 * H, status: 'tentative' },
      { id: 'b4', start: NOW + 3 * H, end: NOW + 4 * H, status: 'cancelled' },
    ],
  }),
  social: ok({
    ok: true,
    recent: [
      { at: iso(NOW - DAY), results: [{ ok: true }, { ok: false }, { ok: false, unknown: true }] },
      { at: iso(NOW - 20 * DAY), results: [{ ok: false }] },
    ],
    schedule: { ready: true, jstHour: 9, items: [{ id: 's1', date: '2026-10-05' }, { id: 's2', date: '2026-10-07' }] },
    approvals: [
      { id: 'a1', status: 'pending' }, { id: 'a2', status: 'approved', scheduledId: '' },
      { id: 'a3', status: 'approved', scheduledId: 'x' }, { id: 'a4', status: 'returned', expired: true },
    ],
  }),
  members: ok({ ok: true, members: [{ created: iso(NOW - 2 * DAY) }, { created: iso(NOW - 3 * DAY) }, { created: iso(NOW - 30 * DAY) }] }),
  news: ok([{ date: '2026-08-01' }, { date: '2026-07-01' }]),
  health: ok({ ok: true, worst: 'error', checks: [{ id: 'resend', label: '問い合わせメール送信', state: 'error' }, { id: 'ai', state: 'warn' }] }),
  deploy: ok({ ok: true, state: 'failed', url: 'https://vercel.example/x' }),
  analytics: ok({ ok: true, summary: { cur: { visits: 120, submits: 3 }, prev: { visits: 100 } } }),
}

test('classify: 読めた・未設定・読めなかった', () => {
  assert.equal(C.classify(200, { ok: true }).state, 'ok')
  assert.equal(C.classify(200, { ok: true, stored: false }).state, 'off')
  assert.equal(C.classify(503, { ok: false, code: 'NOT_CONFIGURED' }).state, 'off')
  assert.equal(C.classify(503, null).state, 'off')
  assert.equal(C.classify(500, { ok: false }).state, 'fail')
  assert.equal(C.classify(200, { ok: false }).state, 'fail')
  assert.equal(C.classify(0, null).state, 'fail')
  assert.equal(C.classify(429, {}).state, 'fail')
})

test('全部そろったときの行と並び', () => {
  const t = build(FULL, NOW)
  const ids = t.rows.map((r) => r.id)
  assert.deepEqual(ids, [
    'health-error', 'deploy-failed', 'inq-late', 'sns-failed',
    'inq-unread', 'bk-tentative', 'sns-unknown', 'sns-today', 'sns-approved', 'news-stale',
    'bk-today', 'bk-tomorrow',
    'sns-pending', 'mem-new', 'analytics-week',
  ])
  const levels = t.rows.map((r) => ({ urgent: 0, action: 1, today: 2, fyi: 3 })[r.level])
  assert.deepEqual(levels, levels.slice().sort((a, b) => a - b), '急ぎの順')
  assert.equal(t.todo.length, 12)
  assert.equal(t.fyi.length, 3)
  assert.deepEqual(t.failed, [])
  assert.deepEqual(t.off, [])
})

test('問い合わせ: 期限切れはいちばん古いものを開く', () => {
  const r = build({ inquiries: FULL.inquiries }, NOW).rows
  const late = r.find((x) => x.id === 'inq-late')
  assert.equal(late.count, 2)
  assert.equal(late.go.inq, 'q-old')
  assert.equal(late.tab, 'inquiries-admin')
  assert.match(late.title, /48時間/)
  const unread = r.find((x) => x.id === 'inq-unread')
  assert.equal(unread.count, 2)
  assert.equal(unread.go.inq, '', '2件以上なら受信箱')
})

test('問い合わせ: 未読が1件ならその1件を開く', () => {
  const one = ok({ ok: true, items: [{ id: 'only', receivedAt: iso(NOW - H), readAt: null }], metrics: { counts: { unread: 1 }, late: 0, warn: 0 } })
  const r = build({ inquiries: one }, NOW).rows
  assert.equal(r.length, 1)
  assert.equal(r[0].go.inq, 'only')
})

test('予約: 今日・明日・仮予約（取り消しは数えない）', () => {
  const r = build({ booking: FULL.booking }, NOW).rows
  const today = r.find((x) => x.id === 'bk-today')
  assert.equal(today.count, 2)
  assert.match(today.why, /14:00/)
  assert.match(today.why, /カット/)
  assert.equal(r.find((x) => x.id === 'bk-tomorrow').count, 1)
  assert.equal(r.find((x) => x.id === 'bk-tentative').count, 1)
  assert.equal(r.find((x) => x.id === 'bk-today').go.sec, 'list')
})

test('予約: 日付は日本時間で区切る', () => {
  // 10/5 23:30 JST は「今日」、10/6 00:30 JST は「明日」
  const late = Date.parse('2026-10-05T14:30:00Z'), after = Date.parse('2026-10-05T15:30:00Z')
  const r = build({ booking: ok({ ok: true, bookings: [
    { start: late, end: late + H, status: 'confirmed' }, { start: after, end: after + H, status: 'confirmed' },
  ] }) }, NOW).rows
  assert.equal(r.find((x) => x.id === 'bk-today').count, 1)
  assert.equal(r.find((x) => x.id === 'bk-tomorrow').count, 1)
})

test('SNS: 7日より前の失敗は出さない・予約投稿の時刻', () => {
  const r = build({ social: FULL.social }, NOW).rows
  assert.equal(r.find((x) => x.id === 'sns-failed').count, 1)
  assert.equal(r.find((x) => x.id === 'sns-unknown').count, 1)
  const today = r.find((x) => x.id === 'sns-today')
  assert.equal(today.count, 1)
  assert.equal(today.level, 'action', '10時なのに9時の分が残っている')
  const early = build({ social: FULL.social }, NOW - 3 * H).rows.find((x) => x.id === 'sns-today')
  assert.equal(early.level, 'today')
  assert.equal(r.find((x) => x.id === 'sns-approved').count, 1, '予約済みの承認は数えない')
  assert.equal(r.find((x) => x.id === 'sns-returned'), undefined, '期限切れは数えない')
  const stop = build({ social: ok({ ok: true, schedule: { ready: false, message: 'CRON_SECRET がありません', items: [{ date: '2026-10-05' }] } }) }, NOW).rows
  assert.equal(stop[0].level, 'urgent')
  assert.match(stop[0].why, /CRON_SECRET/)
})

test('お知らせ: 30日で知らせる・無いときも知らせる', () => {
  const stale = build({ news: FULL.news }, NOW).rows[0]
  assert.equal(stale.count, 65)
  assert.equal(stale.unit, '日')
  assert.equal(build({ news: ok([{ date: '2026-09-20' }]) }, NOW).rows.length, 0)
  assert.equal(build({ news: ok([]) }, NOW).rows[0].title, 'お知らせがまだ1件もありません')
})

test('会員・解析は「今週の様子」で、やることには数えない', () => {
  const t = build({ members: FULL.members, analytics: FULL.analytics }, NOW)
  assert.equal(t.todo.length, 0)
  assert.equal(t.fyi.find((x) => x.id === 'mem-new').count, 2)
  const a = t.fyi.find((x) => x.id === 'analytics-week')
  assert.equal(a.count, 120)
  assert.match(a.why, /20回多い/)
  assert.match(a.why, /3件/)
})

test('ビルドの失敗は詳しいリンクを開く（https だけ）', () => {
  assert.equal(build({ deploy: FULL.deploy }, NOW).rows[0].go.href, 'https://vercel.example/x')
  const js = build({ deploy: ok({ state: 'failed', url: 'javascript:alert(1)' }) }, NOW).rows[0]
  assert.equal(js.go.href, undefined)
  assert.equal(build({ deploy: ok({ state: 'live' }) }, NOW).rows.length, 0)
})

test('全部読めなかったとき: 落ちずに、読めなかったものを並べる', () => {
  const fail = { state: 'fail', data: null }
  const t = build({ inquiries: fail, booking: fail, social: fail, members: fail, news: fail, health: fail, deploy: fail, analytics: fail }, NOW)
  assert.equal(t.rows.length, 0)
  assert.equal(t.failed.length, 8)
  const none = build(undefined, NOW)
  assert.equal(none.rows.length, 0)
  assert.equal(none.failed.length, 8)
})

test('未設定は「読めなかった」と分ける', () => {
  const t = build({ booking: { state: 'off', data: { ok: true, stored: false } }, news: ok([{ date: '2026-10-01' }]) }, NOW)
  assert.deepEqual(t.off, ['予約'])
  assert.ok(!t.failed.includes('予約'))
  assert.ok(!t.failed.includes('お知らせ'))
})

test('形の崩れた返事でも落ちない', () => {
  const weird = {
    inquiries: ok({ ok: true }), booking: ok({ ok: true, bookings: [{ key: 'x' }] }), social: ok({ ok: true, recent: [{}] }),
    members: ok({ ok: true, members: [{}] }), news: ok({ items: [{ date: 'いつか' }] }), health: ok({ ok: true }),
    deploy: ok({}), analytics: ok({ summary: {} }),
  }
  const t = build(weird, NOW)
  assert.deepEqual(t.rows.map((r) => r.id), ['news-stale'])
})

/* ---- はじめての設定 ---- */

const setup = (...a) => out(C.buildSetup(...a))
const chk = (id, state, extra = {}) => ({ id, label: id, state, note: id + ' の説明', ...extra })
const ALL_OK = ['admin', 'resend', 'contactTo', 'store', 'ai', 'github', 'memberCode', 'sessionSecret', 'cron', 'social'].map((id) => chk(id, 'ok'))
const st = (r, id) => r.steps.find((x) => x.id === id)

test('設定: 全部済みなら 100%', () => {
  const r = setup({
    health: ok({ ok: true, checks: ALL_OK.concat([chk('google', 'ok')]) }),
    settings: ok({ ok: true, settings: [] }),
    social: ok({ ok: true, brand: { name: 'Sample Salon', host: 'sample.example' } }),
  }, { host: 'www.sample.example' })
  assert.equal(r.total, 12)
  assert.equal(r.done, 12)
  assert.equal(r.pct, 100)
  assert.deepEqual(r.steps.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], '順番つき')
})

test('設定: 一部まだ・試用の送信元・使わない', () => {
  const checks = ALL_OK.filter((c) => !['cron', 'ai', 'sessionSecret'].includes(c.id))
    .concat([chk('cron', 'warn'), chk('ai', 'warn'), chk('sessionSecret', 'error'), chk('sender', 'warn'), chk('admin', 'warn')])
    .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i || c.state !== 'ok')
  const health = ok({ ok: true, checks: checks.filter((c) => !(c.id === 'admin' && c.state === 'ok')) })
  const r = setup({
    health,
    settings: ok({ ok: true, settings: [{ name: 'GOOGLE_CALENDAR_ICS_URL', set: true }] }),
    social: ok({ ok: true, brand: { name: 'Lumenium', host: 'lumenium.net' } }),
  }, { host: 'client.example', skipped: { ai: true, admin: true } })
  assert.equal(st(r, 'sender').state, 'todo')
  assert.equal(st(r, 'member').state, 'todo')
  assert.match(st(r, 'member').note, /SESSION_SECRET/)
  assert.equal(st(r, 'admin').state, 'todo', '必須の手順は「使わない」にできない')
  assert.equal(st(r, 'ai').state, 'skipped')
  assert.equal(st(r, 'cron').state, 'todo')
  assert.equal(st(r, 'google').state, 'done', '簡易接続でも済み')
  assert.match(st(r, 'google').note, /簡易接続/)
  assert.equal(st(r, 'brand').state, 'todo', '社名が既定のまま・別のドメイン')
  assert.equal(st(r, 'resend').test, 'resend')
  // まだ: admin, sender, member, cron, brand → 済み 7 / 12
  assert.equal(r.done, 7)
  assert.equal(r.pct, 58)
})

test('設定: メールが無いと送信元も「まだ」、Google のテストはつないでから', () => {
  const r = setup({
    health: ok({ ok: true, checks: [chk('resend', 'error')] }),
    settings: ok({ ok: true, settings: [] }),
    booking: ok({ ok: true, connected: false, ics: false }),
  }, { host: 'x.example' })
  assert.equal(st(r, 'sender').state, 'todo')
  assert.match(st(r, 'sender').note, /先に/)
  assert.equal(st(r, 'google').state, 'todo')
  assert.equal(st(r, 'google').test, '')
  assert.equal(st(r, 'brand').state, 'unknown', 'SNS が読めないと社名は分からない')
})

test('設定: 本家のドメインなら社名は既定のままで済み', () => {
  const r = setup({ social: ok({ ok: true, brand: { name: 'Lumenium', host: 'lumenium.net' } }) }, { host: 'www.lumenium.net' })
  assert.equal(st(r, 'brand').state, 'done')
  const evil = setup({ social: ok({ ok: true, brand: { name: 'Lumenium', host: 'lumenium.net' } }) }, { host: 'notlumenium.net' })
  assert.equal(st(evil, 'brand').state, 'todo')
})

test('設定: 何も読めなければ % は出さない', () => {
  const r = setup({}, {})
  assert.equal(r.pct, null)
  assert.ok(r.steps.every((x) => x.state === 'unknown'))
  const fail = { state: 'fail', data: null }
  assert.equal(setup({ health: fail, settings: fail, booking: fail, social: fail }, {}).pct, null)
})

console.log(`✓ test-portal: ${n} checks`)
