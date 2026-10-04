// 問い合わせ管理のテスト。外には一切出ません（保存先とメールは偽物）。
//
//   node scripts/test-inquiries.mjs
//
// 確かめること。
//   ・先に保存、それからメール。メールが失敗しても1件が残り「未送信」になる
//   ・保存先が無いときは、これまでどおりメールだけ（失敗はエラーで返す）
//   ・1件の形、状態の変化と履歴、「返信した」
//   ・返信までの時間の中央値と、24時間・48時間の遅れ
//   ・文例の差し込み、受付確認メール（試用アドレスでは送らない・踏み台対策）
//   ・CSV の式の無効化、保存期間を過ぎたものの選び方
//   ・どこから来たかの言い方

import assert from 'node:assert/strict'

const REDIS = 'https://redis.test.invalid'
const STORE_NAMES = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']
for (const n of STORE_NAMES) delete process.env[n]
Object.assign(process.env, {
  UPSTASH_REDIS_REST_URL: REDIS, UPSTASH_REDIS_REST_TOKEN: 't',
  RESEND_API_KEY: 'test', CONTACT_TO_EMAIL: 'owner@example.com', LINE_CHANNEL_TOKEN: 'line-test',
  ADMIN_KEY: 'test-admin',
})
delete process.env.CONTACT_FROM_EMAIL

/* ---- 偽の保存先とメール ---- */
const kv = new Map()
const hashes = new Map()
const sent = []
let mailFails = false
let order = []
function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    order.push(op + ' ' + k)
    if (op === 'GET') return { result: kv.get(k) ?? null }
    if (op === 'SET') { kv.set(k, c[2]); return { result: 'OK' } }
    if (op === 'DEL') { kv.delete(k); return { result: 1 } }
    if (op === 'INCR' || op === 'HINCRBY') return { result: 1 }
    if (op === 'HSET') { const h = hashes.get(k) || new Map(); h.set(String(c[2]), String(c[3])); hashes.set(k, h); return { result: 1 } }
    if (op === 'HGETALL') { const h = hashes.get(k); return { result: h ? [...h].flat() : [] } }
    if (op === 'HDEL') { const h = hashes.get(k); return { result: h && h.delete(String(c[2])) ? 1 : 0 } }
    return { result: null }
  })
}
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) return new Response(JSON.stringify(redis(JSON.parse(init.body))))
  if (u.includes('api.resend.com')) {
    order.push('MAIL')
    const b = JSON.parse(init.body)
    if (mailFails) return new Response('nope', { status: 500 })
    sent.push({ kind: 'mail', ...b })
    return new Response(JSON.stringify({ id: 'x' }))
  }
  if (u.includes('api.line.me')) { sent.push({ kind: 'line', ...JSON.parse(init.body) }); return new Response('{}') }
  throw new Error('unexpected fetch ' + u)
}
const quiet = console.error
console.error = () => {}

const I = await import('../api/_inquiries.js')
const contact = await import('../api/contact.js')
const admin = await import('../api/inquiries.js')

let n = 0
async function t(name, fn) {
  try { await fn(); n++ } catch (e) { console.error = quiet; console.error('✗ ' + name); throw e }
}
let ip = 0
const submit = (body) => contact.POST(new Request('https://example.com/api/contact', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${++ip}` },
  body: JSON.stringify(Object.assign({ name: '山田 花子', email: `hanako${ip}@example.com`, message: 'テストの問い合わせです。よろしくお願いします。', company: '株式会社サンプル', orgType: 'company', topics: ['video'] }, body)),
}))
const records = () => [...kv.entries()].filter(([k]) => k.includes(':inq:r:')).map(([, v]) => JSON.parse(v))
const last = () => records().sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))[0]
const AUTH = { authorization: 'Bearer test-admin', 'x-forwarded-for': '192.0.2.9' }

/* ---- 1. 先に保存、それからメール ---- */
await t('メールが失敗しても1件が残り、送り主には「届いた」と返す', async () => {
  mailFails = true
  order = []
  const res = await submit({ src: { s: 'instagram', c: 'bio' } })
  assert.equal(res.status, 200)
  const firstSet = order.findIndex((x) => x.startsWith('SET ') && x.includes(':inq:r:'))
  const firstMail = order.indexOf('MAIL')
  assert.ok(firstSet >= 0 && firstMail > firstSet, '保存がメールより先: ' + order.join(' | '))
  const r = last()
  assert.equal(r.mail.owner, 'failed')
  assert.match(r.mail.ownerError, /500/)
  assert.equal(r.status, 'new')
  mailFails = false
})

await t('1件の形（決まった項目がそろい、どこから来たかが言葉になっている）', async () => {
  const r = last()
  for (const k of ['id', 'receivedAt', 'name', 'company', 'email', 'phone', 'topics', 'message', 'page', 'estimate', 'source', 'status', 'notes', 'history', 'repliedAt', 'assignee', 'spam', 'mail']) {
    assert.ok(k in r, k + ' がない')
  }
  assert.deepEqual(r.topics, ['動画制作'])
  assert.equal(r.source.label, 'Instagram（計測リンク）から来た人・キャンペーン「bio」')
  assert.equal(r.history[0].what, 'received')
  assert.ok(I.idOk(r.id))
  const s = JSON.parse(hashes.get(I.IK.list).get(r.id))
  assert.equal(s.mailOwner, 'failed')
})

await t('保存先が無いときはメールだけ。失敗はこれまでどおりエラーで返す', async () => {
  const saved = Object.fromEntries(STORE_NAMES.map((k) => [k, process.env[k]]))
  for (const k of STORE_NAMES) delete process.env[k]
  try {
    const before = records().length
    mailFails = true
    assert.equal((await submit({})).status, 502)
    mailFails = false
    assert.equal((await submit({})).status, 200)
    assert.equal(records().length, before, '保存していない')
    const res = await admin.GET(new Request('https://example.com/api/inquiries', { headers: AUTH }))
    const d = await res.json()
    assert.equal(d.stored, false)
    assert.match(d.message, /保存先が無いため、問い合わせは保存されていません/)
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v
    mailFails = false
  }
})

/* ---- 2. 受付確認メールと LINE ---- */
await t('受付確認: 試用アドレスの送信元では送らず「sandbox」と記録', async () => {
  await I.saveSettings({ url: REDIS, token: 't' }, { autoReply: { on: true }, lineOn: true, lineUserId: 'U' + 'a'.repeat(32) })
  sent.length = 0
  await submit({})
  const r = last()
  assert.equal(r.mail.owner, 'sent')
  assert.equal(r.mail.auto, 'sandbox')
  assert.ok(!sent.some((m) => m.kind === 'mail' && m.to[0] === r.email), 'お客様には送っていない')
  const line = sent.find((m) => m.kind === 'line')
  assert.ok(line && line.to === 'U' + 'a'.repeat(32))
  assert.ok(!line.messages[0].text.includes('テストの問い合わせ'), 'LINE に本文を入れない')
  assert.match(line.messages[0].text, /#inq=/)
  const owner = sent.find((m) => m.kind === 'mail')
  assert.match(owner.text, /admin-members\.html#inq=/)
  assert.ok(I.isSandboxSender('X <onboarding@resend.dev>'))
  assert.ok(!I.isSandboxSender('X <info@example.com>'))
})

await t('ブロックするドメインは保存だけして迷惑に。メールは送らない', async () => {
  await I.saveSettings({ url: REDIS, token: 't' }, { blockedDomains: 'spam.example\n@junk.example' })
  sent.length = 0
  const res = await submit({ email: 'a@mail.spam.example' })
  assert.equal(res.status, 200)
  const r = last()
  assert.equal(r.spam, true)
  assert.equal(r.mail.owner, 'skipped')
  assert.equal(sent.length, 0)
  assert.ok(I.blockedBy('x@junk.example', ['junk.example']))
  assert.ok(!I.blockedBy('x@notjunk.example', ['junk.example']))
})

await t('文例の差し込み（知らない {xxx} は残し、会社名が無いときの行頭の空白を詰める）', () => {
  const v = { name: '山田', company: '', brand: 'Lumenium', reply_hours: 48, topics: '動画制作' }
  assert.equal(I.fillTemplate('{company} {name} 様\n{brand}／{reply_hours}時間／{topics}／{other}', v), '山田 様\nLumenium／48時間／動画制作／{other}')
  assert.equal(I.fillTemplate(I.DEFAULT_SETTINGS.autoReply.subject, v), '【Lumenium】お問い合わせを受け付けました')
  assert.ok(I.looksLikeLink('http://x'))
  assert.ok(I.looksLikeLink('buy at cheap.xyz'))
  assert.ok(!I.looksLikeLink('株式会社サンプル'))
})

/* ---- 3. 状態の変化と履歴 ---- */
await t('状態の変化は履歴に残り、「返信した」で未対応→対応中', () => {
  const t0 = Date.parse('2026-10-01T00:00:00Z')
  let r = I.newRecord({ name: 'A', email: 'a@example.com', message: 'x'.repeat(20) }, t0)
  let x = I.applyPatch(r, { replied: true }, t0 + 5 * 3600e3)
  assert.ok(x.ok && x.changed)
  r = x.rec
  assert.equal(r.status, 'doing')
  assert.equal(I.replyHours(r), 5)
  assert.deepEqual(r.history.map((h) => h.what), ['received', 'replied', 'status'])
  x = I.applyPatch(r, { status: 'done', note: '電話で対応', assignee: '山本' }, t0 + 6 * 3600e3)
  r = x.rec
  assert.equal(r.status, 'done')
  assert.equal(r.notes[0].text, '電話で対応')
  assert.equal(r.assignee, '山本')
  assert.ok(r.history.some((h) => h.text === '対応中 → 完了'))
  assert.equal(I.applyPatch(r, { status: 'done' }, t0).changed, false, '同じ状態なら何も変えない')
  assert.equal(I.applyPatch(r, { status: 'bogus' }).ok, false)
  // 未来の返信時刻や、受信より前の時刻は受け付けない（いまの時刻にする）
  const y = I.applyPatch(I.newRecord({ name: 'B' }, t0), { replied: true, repliedAt: '2030-01-01T00:00:00Z' }, t0 + 3600e3).rec
  assert.equal(y.repliedAt, new Date(t0 + 3600e3).toISOString())
})

await t('メモと履歴には上限がある', () => {
  let r = I.newRecord({ name: 'A' })
  for (let i = 0; i < 120; i++) r = I.applyPatch(r, { note: 'n' + i, status: i % 2 ? 'doing' : 'new' }).rec
  assert.equal(r.notes.length, I.CAPS.notes)
  assert.equal(r.history.length, I.CAPS.history)
})

/* ---- 4. 返信までの時間と遅れ ---- */
await t('中央値（30日・返信済みだけ）と、24時間・48時間の遅れ', () => {
  const now = Date.parse('2026-10-04T00:00:00Z')
  const mk = (hAgo, replyAfter, extra) => Object.assign({
    id: 'q' + hAgo, receivedAt: new Date(now - hAgo * 3600e3).toISOString(), status: replyAfter == null ? 'new' : 'doing',
    repliedAt: replyAfter == null ? '' : new Date(now - hAgo * 3600e3 + replyAfter * 3600e3).toISOString(), spam: false, readAt: 'x',
  }, extra || {})
  const list = [mk(100, 2), mk(200, 10), mk(300, 60), mk(1000, 1), mk(2, null), mk(30, null), mk(50, null), mk(70, null, { spam: true }), mk(80, null, { status: 'done' })]
  const m = I.metrics(list, now)
  assert.equal(m.replied30, 3, '30日より前と迷惑は数えない')
  assert.equal(m.median30, 10)
  assert.equal(m.within, 2)
  assert.equal(m.warn, 1)
  assert.equal(m.late, 1)
  assert.equal(m.counts.spam, 1)
  assert.equal(I.overdue(mk(25, null), now), 'warn')
  assert.equal(I.overdue(mk(49, null), now), 'late')
  assert.equal(I.overdue(mk(49, 1), now), '', '返信済みは遅れにしない')
  assert.equal(I.median([4, 1, 3, 2]), 2.5)
  assert.equal(I.median([]), null)
})

await t('集計: ジャンルは選んだ数だけ、迷惑は別、期間の外は数えない', () => {
  const now = Date.now()
  const a = (d, topics, source, extra) => Object.assign({ receivedAt: new Date(now - d * 864e5).toISOString(), status: 'new', topics, source, campaign: '', spam: false }, extra || {})
  const s = I.stats([a(1, ['動画制作', 'AI導入・研修'], 'Instagram（計測リンク）', { campaign: 'bio' }), a(5, [], '直接・不明'), a(10, ['動画制作'], 'Instagram（計測リンク）', { spam: true }), a(60, ['動画制作'], '検索（google.com）')], 30, now)
  assert.equal(s.total, 2)
  assert.equal(s.byStatus.spam, 1)
  assert.deepEqual(s.byTopic.find((x) => x[0] === '動画制作'), ['動画制作', 1])
  assert.ok(s.byTopic.some((x) => x[0] === '（選択なし）'))
  assert.deepEqual(s.byCampaign, [['bio', 1]])
  assert.equal(I.stats([a(60, ['動画制作'], 'x')], 90, now).total, 1)
})

/* ---- 5. CSV と保存期間 ---- */
await t('CSV: 式になる先頭に \' を付け、" を重ね、BOM と CRLF', () => {
  assert.equal(I.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  for (const c of ['+1', '-1', '@SUM(A1)', '\tx', '\rx']) assert.ok(I.csvCell(c).startsWith('"\''), c)
  assert.equal(I.csvCell('普通の文'), '"普通の文"')
  const r = I.newRecord({ name: '=cmd|calc', email: 'a@example.com', message: '1行目\n2行目, "引用"' })
  const csv = I.toCsv([r])
  assert.ok(csv.startsWith('﻿"受信日時"'))
  assert.ok(csv.includes('"\'=cmd|calc"'))
  assert.ok(csv.includes('"1行目\n2行目, ""引用"""'))
  assert.ok(csv.endsWith('\r\n'))
})

await t('保存期間: 期間を過ぎたものだけを選び、設定は30〜1095日に収める', () => {
  const now = Date.parse('2026-10-04T00:00:00Z')
  const list = [
    { id: 'a', receivedAt: new Date(now - 364 * 864e5).toISOString() },
    { id: 'b', receivedAt: new Date(now - 366 * 864e5).toISOString() },
    { id: 'c', receivedAt: 'broken' },
  ]
  assert.deepEqual(I.expiredIds(list, 365, now), ['b', 'c'])
  assert.equal(I.cleanSettings({ retentionDays: 5 }).settings.retentionDays, 30)
  assert.equal(I.cleanSettings({ retentionDays: 9999 }).settings.retentionDays, 1095)
  assert.equal(I.cleanSettings({}).settings.retentionDays, 365)
  assert.equal(I.cleanSettings({ lineUserId: 'abc' }).ok, false, 'LINE のIDの形を確かめる')
  assert.equal(I.cleanSettings({ lineOn: true }).settings.lineOn, false, 'IDが無ければ LINE は送らない')
})

await t('一覧を開くと、保存期間を過ぎたものが消える', async () => {
  const cfg = { url: REDIS, token: 't' }
  const old = I.newRecord({ name: '古い', email: 'old@example.com', message: 'x'.repeat(20) }, Date.now() - 400 * 864e5)
  await I.putRecord(cfg, old)
  const res = await admin.GET(new Request('https://example.com/api/inquiries?status=all', { headers: AUTH }))
  const d = await res.json()
  assert.ok(d.ok && d.stored)
  assert.ok(d.removed >= 1)
  assert.ok(!d.items.some((x) => x.id === old.id))
  assert.equal(kv.has(I.IK.rec(old.id)), false)
})

/* ---- 6. 管理の窓口 ---- */
await t('窓口: 一括の変更・件数の上限・CSV・文例', async () => {
  const ids = records().filter((r) => !r.spam).map((r) => r.id)
  const call = (method, body, q = '') => admin[method](new Request('https://example.com/api/inquiries' + q, {
    method, headers: { ...AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }))
  let res = await call('PATCH', { ids, status: 'done' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).count, ids.length)
  res = await call('PATCH', { ids: Array.from({ length: 101 }, (_, i) => 'q' + i), status: 'done' })
  assert.equal(res.status, 400)
  res = await call('GET', null, '?view=export&status=all')
  assert.match(res.headers.get('content-type'), /text\/csv/)
  assert.ok((await res.text()).includes('完了'))
  res = await call('POST', { action: 'template.save', item: { name: '日程', body: '{name} 様' } })
  const tpl = (await res.json()).templates
  assert.ok(tpl.some((x) => x.name === '日程'))
  res = await call('POST', { action: 'template.save', item: { name: '', body: 'x' } })
  assert.equal(res.status, 400)
  const unauth = await admin.GET(new Request('https://example.com/api/inquiries', { headers: { 'x-forwarded-for': '192.0.2.10' } }))
  assert.equal(unauth.status, 401)
})

/* ---- 7. どこから来たか ---- */
await t('どこから来たかの言い方', () => {
  assert.equal(I.sourceInfo({ r: 'https://chatgpt.com' }).label, 'ChatGPT（AIアシスタントの回答）から来た人')
  assert.equal(I.sourceInfo({ s: 'chatgpt.com' }).kind, 'ai')
  assert.equal(I.sourceInfo({ r: 'https://www.google.co.jp' }).kind, 'search')
  assert.equal(I.sourceInfo({ s: 'flyer' }).short, 'チラシ・資料（QR）（計測リンク）')
  assert.equal(I.sourceInfo({ s: 'mystery' }).label, '「mystery」（計測リンク）から来た人')
  assert.equal(I.sourceInfo(null).short, '直接・不明')
  assert.equal(I.sourceInfo({ r: 'javascript:alert(1)' }).r, '')
})

console.error = quiet
console.log(`✓ test-inquiries: ${n} checks`)
