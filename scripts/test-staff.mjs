// 担当者と権限・操作の記録のテスト（api/_staff.js・_permissions.js・_audit.js、
// それに requireAdmin の通し方）。保存先は下の作り物の Redis で、外には出ません。
//
//   node scripts/test-staff.mjs
//
// 確かめること。
//   ・個人のキー: ハッシュだけ保存し、正しいキーだけ通る・形の読み取り
//   ・ログイン後の札: 署名・期限（12時間）・書き換え・ADMIN_KEY を変えたら無効
//   ・役割の表: 役割ごとの可否、表に無い窓口の決まり、オーナーだけの範囲
//   ・操作の記録: 1行の形にキーや本文が入らない・180日と5,000件・CSV が式にならない
//   ・requireAdmin: オーナーはこれまでどおり / 担当者の札で読める / 書けないものは 403 と
//     平易な一言 / 生のキーはログインにだけ / 人ごとのロック / 止めた人・作り直したキー

import assert from 'node:assert/strict'

const REDIS = 'https://redis.test-staff.invalid'
Object.assign(process.env, { ADMIN_KEY: 'test-owner-key', UPSTASH_REDIS_REST_URL: REDIS, UPSTASH_REDIS_REST_TOKEN: 't' })
delete process.env.KV_REST_API_URL
delete process.env.KV_REST_API_TOKEN

/* ---- 作り物の Redis（使うコマンドだけ） ---- */
const str = new Map(), hashes = new Map(), lists = new Map(), ttls = new Map(), sets = new Map()
function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase(), k = c[1]
    if (op === 'GET') return { result: str.get(k) ?? null }
    if (op === 'SET') { str.set(k, String(c[2])); return { result: 'OK' } }
    if (op === 'DEL') { str.delete(k); hashes.delete(k); lists.delete(k); sets.delete(k); ttls.delete(k); return { result: 1 } }
    if (op === 'SADD') { const st = sets.get(k) || new Set(); st.add(String(c[2])); sets.set(k, st); return { result: 1 } }
    if (op === 'SCARD') return { result: sets.get(k)?.size || 0 }
    if (op === 'INCR') { const v = (Number(str.get(k)) || 0) + 1; str.set(k, String(v)); return { result: v } }
    if (op === 'EXPIRE') { if (!(c[3] === 'NX' && ttls.has(k))) ttls.set(k, Number(c[2])); return { result: 1 } }
    if (op === 'TTL') return { result: ttls.get(k) ?? -1 }
    if (op === 'HSET') { const h = hashes.get(k) || new Map(); h.set(String(c[2]), String(c[3])); hashes.set(k, h); return { result: 1 } }
    if (op === 'HGET') return { result: hashes.get(k)?.get(String(c[2])) ?? null }
    if (op === 'HGETALL') { const h = hashes.get(k); return { result: h ? [...h].flat() : [] } }
    if (op === 'HDEL') return { result: hashes.get(k)?.delete(String(c[2])) ? 1 : 0 }
    if (op === 'LPUSH') { const l = lists.get(k) || []; l.unshift(String(c[2])); lists.set(k, l); return { result: l.length } }
    if (op === 'LTRIM') { const l = lists.get(k) || []; const end = Number(c[3]) < 0 ? l.length + Number(c[3]) : Number(c[3]); lists.set(k, l.slice(Number(c[2]), end + 1)); return { result: 'OK' } }
    if (op === 'LRANGE') { const l = lists.get(k) || []; const end = Number(c[3]) < 0 ? l.length + Number(c[3]) : Number(c[3]); return { result: l.slice(Number(c[2]), end + 1) } }
    return { result: null }
  })
}
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) return new Response(JSON.stringify(redis(JSON.parse(init.body || '[]'))), { headers: { 'content-type': 'application/json' } })
  throw new Error('test-staff tried to reach the network: ' + u)
}

const S = await import('../api/_staff.js')
const P = await import('../api/_permissions.js')
const A = await import('../api/_audit.js')
const { requireAdmin } = await import('../api/_admin-auth.js')
const ping = await import('../api/admin-ping.js')
const staffApi = await import('../api/staff.js')
const auditApi = await import('../api/audit.js')

let n = 0
async function test(name, fn) {
  try { await fn(); n++ } catch (e) { console.error('✗ ' + name); throw e }
}

/* ---- 個人のキー ---- */
await test('キーのハッシュと照合', async () => {
  const c = await S.makeCredential('abcd2345')
  assert.match(c.key, /^lsk_abcd2345_[A-Za-z0-9_-]{40}$/)
  assert.equal(c.iter, 100000)
  assert.ok(!c.hash.includes(c.key) && c.hash.length >= 40)
  const rec = { salt: c.salt, hash: c.hash, iter: c.iter }
  assert.equal(await S.verifyKey(c.key, rec), true)
  assert.equal(await S.verifyKey(c.key + 'x', rec), false)
  assert.equal(await S.verifyKey(c.key, { ...rec, salt: (await S.makeCredential('zzzz2345', 1000)).salt }), false)
  assert.equal(S.keyId(c.key), 'abcd2345')
  assert.equal(S.keyId('lsk_ab_short'), '')
  assert.equal(S.keyId('test-owner-key'), '')
  // 同じ人でも作り直すたびに別のキー・別の塩。
  const d = await S.makeCredential('abcd2345', 1000)
  assert.notEqual(d.key, c.key)
  assert.notEqual(d.salt, c.salt)
})

/* ---- ログイン後の札 ---- */
await test('札の署名と期限', async () => {
  const t0 = Date.parse('2026-10-05T00:00:00Z')
  const s = await S.signSession({ id: 'abcd2345', gen: 3 }, 'secret-a', t0)
  assert.match(s.token, /^lss\./)
  assert.equal(s.expiresAt, '2026-10-05T12:00:00.000Z')
  assert.deepEqual(await S.verifySession(s.token, 'secret-a', t0 + 3600e3), { ok: true, sid: 'abcd2345', gen: 3 })
  assert.equal((await S.verifySession(s.token, 'secret-a', t0 + 12 * 3600e3 + 1)).reason, 'expired')
  assert.equal((await S.verifySession(s.token, 'secret-b', t0)).reason, 'bad', 'ADMIN_KEY を変えたら無効')
  const [h, body, sig] = s.token.split('.')
  const forged = Buffer.from(JSON.stringify({ sid: 'abcd2345', gen: 3, exp: t0 + 99 * 3600e3 })).toString('base64url')
  assert.equal((await S.verifySession(`${h}.${forged}.${sig}`, 'secret-a', t0)).reason, 'bad', '期限の書き換え')
  assert.equal((await S.verifySession(`${h}.${body}.${sig}x`, 'secret-a', t0)).reason, 'bad')
  assert.equal((await S.verifySession('lss.x', 'secret-a', t0)).ok, false)
})

/* ---- 役割の表 ---- */
const can = (role, endpoint, method = 'GET', action = '', view = '') => P.decide({ role, endpoint, method, action, view }).allow
await test('役割の表', () => {
  // オーナーは何でも。
  for (const ep of ['staff', 'settings', 'share-links', 'members-xlsx', 'quote', 'audit']) {
    assert.ok(can('owner', ep, 'POST', 'delete'), 'owner ' + ep)
  }
  // 管理者: 担当者・キーの設定・共有リンク・会員の書き出しと削除のほかは何でも。
  assert.ok(can('manager', 'content-save', 'POST'))
  assert.ok(can('manager', 'members', 'POST', 'update'))
  assert.ok(can('manager', 'audit', 'GET'))
  assert.ok(can('manager', 'health', 'GET'))
  for (const [ep, m, a] of [['staff', 'GET'], ['staff', 'POST', 'create'], ['settings', 'GET'], ['settings', 'POST'], ['settings-test', 'POST'],
    ['share-links', 'GET'], ['share-links', 'POST', 'create'], ['members-xlsx', 'GET'], ['members-view', 'GET'], ['members', 'POST', 'delete'], ['google-oauth', 'GET']]) {
    assert.equal(can('manager', ep, m, a), false, `manager ${m} ${ep} ${a || ''}`)
  }
  // 担当者: 問い合わせ・予約・SNS（承認の流れ）・お知らせの下書き・口コミの返信。
  assert.ok(can('staff', 'inquiries', 'PATCH'))
  assert.ok(can('staff', 'booking', 'PATCH'))
  assert.ok(can('staff', 'reviews', 'POST', 'reply'))
  assert.ok(can('staff', 'social', 'POST', 'approval-create'))
  assert.ok(can('staff', 'social', 'POST', 'approval-send'))
  assert.ok(can('staff', 'social-write', 'POST'))
  assert.ok(can('staff', 'news-post', 'POST', 'draft-save'))
  assert.equal(can('staff', 'social', 'POST', 'post'), false, '承認なしで直接は出せない')
  assert.equal(can('staff', 'social', 'POST', 'schedule'), false)
  assert.equal(can('staff', 'news-post', 'POST', 'add'), false, 'お知らせの公開は管理者以上')
  assert.equal(can('staff', 'content-save', 'POST'), false, '文章の公開は管理者以上')
  assert.equal(can('staff', 'reviews', 'POST', 'prefs'), false)
  assert.equal(can('staff', 'inquiries', 'GET', '', 'export'), false, '問い合わせの CSV は管理者以上')
  assert.equal(can('staff', 'inquiries', 'POST', 'settings.save'), false)
  assert.equal(can('staff', 'members', 'POST', 'delete'), false)
  assert.ok(can('staff', 'inquiries', 'GET'))
  // 閲覧のみ: 見るだけ。
  assert.ok(can('viewer', 'inquiries', 'GET'))
  assert.ok(can('viewer', 'analytics', 'GET'))
  for (const [ep, m, a] of [['inquiries', 'PATCH'], ['social', 'POST', 'approval-create'], ['advisor', 'POST'], ['news-post', 'POST', 'draft-save'], ['booking', 'PATCH']]) {
    assert.equal(can('viewer', ep, m, a), false, `viewer ${m} ${ep}`)
  }
  assert.equal(can('viewer', 'audit', 'GET'), false)
  // 表に無い窓口（たとえば後から足す見積書）: 見るのは全員、書くのは管理者以上。
  assert.ok(can('viewer', 'quote', 'GET'))
  assert.equal(can('staff', 'quote', 'POST'), false)
  assert.ok(can('manager', 'quote', 'DELETE'))
  assert.equal(P.needed({ endpoint: 'quote-pdf', method: 'PUT' }), 'manager')
  // オーナーだけの範囲は、表の書き方より強い。
  for (const area of P.OWNER_AREAS) {
    for (const [ep, rule] of Object.entries(P.TABLE)) {
      if (rule.area !== area) continue
      for (const m of ['GET', 'POST']) assert.equal(P.needed({ endpoint: ep, method: m, action: 'x' }), 'owner', `${ep} ${m}`)
    }
  }
  // 知らない役割は何もできない。
  assert.equal(can('share', 'inquiries', 'GET'), false)
  assert.equal(can('', 'admin-ping', 'GET'), false)
  // 断る一言は平易に。
  assert.equal(P.decide({ role: 'staff', endpoint: 'content-save', method: 'POST' }).message, 'この操作は管理者以上が使えます。')
  assert.equal(P.decide({ role: 'manager', endpoint: 'staff', method: 'GET' }).message, 'この操作はオーナーだけが使えます。')
  assert.match(P.decide({ role: 'viewer', endpoint: 'inquiries', method: 'PATCH' }).message, /閲覧のみ/)
  assert.equal(P.endpointOf('/api/inquiries'), 'inquiries')
  assert.equal(P.endpointOf('/api/x/y'), '')
})

/* ---- 操作の記録 ---- */
await test('記録の1行に秘密が入らない', async () => {
  const body = { action: 'reply', id: 'r123', text: 'お客様への返信の本文', key: 'lsk_abcd2345_' + 'A'.repeat(40), email: 'a@example.com', value: 'sk-ant-secret' }
  const e = A.entry({ who: { id: 'abcd2345', name: '佐藤', role: 'staff' }, area: 'reviews', endpoint: 'reviews', method: 'post', action: body.action, target: A.targetOf('reviews', body), ip: await A.ipHash('203.0.113.9', 'k'), result: 'ok', at: '2026-10-05T01:00:00.000Z' })
  assert.deepEqual(Object.keys(e).sort(), ['act', 'area', 'at', 'by', 'ep', 'ip', 'm', 'name', 'result', 'role', 'target'])
  const text = JSON.stringify(e)
  for (const bad of ['返信の本文', 'lsk_', 'a@example.com', 'sk-ant', '203.0.113.9']) assert.ok(!text.includes(bad), bad)
  assert.equal(e.target, 'r123')
  assert.equal(e.m, 'POST')
  assert.match(e.ip, /^[0-9a-f]{12}$/)
  assert.equal(A.safeRef('a@example.com'), '')
  assert.equal(A.safeRef('lsk_abcd2345_xxxxxxxx'), '')
  assert.equal(A.safeRef(['a', 'b']), '2件')
  assert.equal(A.targetOf('settings', { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-xxx' }), 'ANTHROPIC_API_KEY')
  assert.equal(A.targetOf('members', { name: '山田 太郎' }), '', '人の名前は対象に入らない')
  assert.equal(A.entry({ result: 'weird' }).result, 'ok')
})

await test('180日と5,000件', () => {
  const now = Date.parse('2026-10-05T00:00:00Z')
  const at = (d) => new Date(now - d * 86400e3).toISOString()
  const list = [{ at: at(1) }, { at: at(179) }, { at: at(181) }, 'broken', { at: 'x' }].map((e) => typeof e === 'string' ? e : JSON.stringify(e))
  assert.equal(A.keep(list, now).length, 2)
  assert.equal(A.expiredTail(list, now), 3)
  assert.equal(A.expiredTail(list.slice(0, 2), now), 0)
  const many = Array.from({ length: 5200 }, () => JSON.stringify({ at: at(0) }))
  assert.equal(A.keep(many, now).length, 5000)
  const f = A.filter([{ at: '2026-10-04T16:00:00Z', by: 'a', area: 'sns' }, { at: '2026-10-03T10:00:00Z', by: 'b', area: 'sns' }], { from: '2026-10-05' })
  assert.equal(f.length, 1, '日付は日本時間で（10/4 16:00 UTC は 10/5）')
  assert.equal(A.filter(f, { by: 'b' }).length, 0)
})

await test('CSV は式として読まれない', () => {
  assert.equal(A.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  assert.equal(A.csvCell('+1'), "'+1")
  assert.equal(A.csvCell('-1'), "'-1")
  assert.equal(A.csvCell('@a'), "'@a")
  assert.equal(A.csvCell('普通'), '普通')
  const csv = A.toCsv([{ at: '2026-10-05T00:00:00Z', name: '=cmd', role: 'staff', area: 'sns', ep: 'social', m: 'POST', act: 'approval-create', target: '', ip: 'abc', result: 'denied' }])
  assert.ok(csv.startsWith('﻿日時'))
  assert.ok(csv.includes("'=cmd"))
  assert.ok(csv.includes('担当者') && csv.includes('断った'))
  assert.ok(csv.includes('承認をお願い'), '操作は日本語の呼び名で書き出す')
  assert.equal(A.actionLabel('reply-delete'), '返信を削除')
  assert.equal(A.actionLabel('unknown-thing'), 'unknown-thing', '知らない名前はそのまま')
  assert.equal(A.actionLabel(''), '')
})

/* ---- requireAdmin を通して ---- */
const H = (token, extra) => ({ Authorization: 'Bearer ' + token, 'x-forwarded-for': extra || '198.51.100.1' })
const call = async (mod, method, path, token, body, ip) => {
  const req = new Request('https://example.test/api/' + path, {
    method, headers: { ...H(token, ip), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const res = await mod[method](req)
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

let staffKey = '', staffId = ''
await test('オーナーのログインはこれまでどおり', async () => {
  const r = await call(ping, 'GET', 'admin-ping', 'test-owner-key')
  assert.equal(r.status, 200)
  assert.equal(r.data.who.role, 'owner')
  assert.equal(r.data.session, undefined, 'オーナーには札を出さない（キーのまま）')
  const w = await call(ping, 'GET', 'admin-ping', 'wrong', undefined, '198.51.100.2')
  assert.equal(w.status, 401)
  assert.match(w.data.message, /管理キーが正しくありません/)
})

await test('担当者を足す（キーは一度だけ・保存はハッシュだけ）', async () => {
  const r = await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'create', name: '佐藤', role: 'staff' })
  assert.equal(r.status, 200, r.data.message)
  staffKey = r.data.key
  staffId = r.data.member.id
  const stored = [...hashes.get(S.USERS_KEY).values()].join('')
  assert.ok(!stored.includes(staffKey), 'キーそのものは保存しない')
  assert.ok(!JSON.stringify(r.data.staff).includes('"hash"'), '一覧に塩とハッシュは出さない')
  const g = await call(staffApi, 'GET', 'staff', 'test-owner-key')
  assert.equal(g.data.staff[0].name, '佐藤')
  assert.equal(g.data.staff[0].key, undefined)
})

let session = ''
await test('担当者のログインと札', async () => {
  const r = await call(ping, 'GET', 'admin-ping', staffKey)
  assert.equal(r.status, 200, r.data.message)
  assert.equal(r.data.who.role, 'staff')
  assert.equal(r.data.who.roleLabel, '担当者')
  assert.match(r.data.session, /^lss\./)
  session = r.data.session
  const again = await call(ping, 'GET', 'admin-ping', session)
  assert.equal(again.data.who.name, '佐藤')
  assert.equal(again.data.session, undefined)
  // 生のキーはログインにだけ。
  const inq = await import('../api/inquiries.js')
  const raw = await call(inq, 'GET', 'inquiries', staffKey, undefined, '198.51.100.3')
  assert.equal(raw.status, 401)
  const ok = await call(inq, 'GET', 'inquiries', session)
  assert.notEqual(ok.status, 401)
  assert.notEqual(ok.status, 403)
})

await test('書けないものは 403 と平易な一言・記録に残る', async () => {
  const settings = await import('../api/settings.js')
  const r = await call(settings, 'POST', 'settings', session, { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-should-not-be-logged' })
  assert.equal(r.status, 403)
  assert.equal(r.data.code, 'FORBIDDEN')
  assert.equal(r.data.message, 'この操作はオーナーだけが使えます。')
  const s = await call(staffApi, 'GET', 'staff', session)
  assert.equal(s.status, 403)
  const log = (lists.get(A.AUDIT_KEY) || []).map((x) => JSON.parse(x))
  const denied = log.find((e) => e.result === 'denied' && e.ep === 'settings')
  assert.ok(denied, '断ったことが記録に残る')
  assert.equal(denied.name, '佐藤')
  assert.equal(denied.target, 'ANTHROPIC_API_KEY')
  assert.ok(!JSON.stringify(log).includes('sk-ant-should-not-be-logged'), '値は記録に入らない')
  assert.ok(log.some((e) => e.result === 'login' && e.by === staffId), 'ログインも記録に残る')
  // 管理者以上は記録を読める。担当者は読めない。
  assert.equal((await call(auditApi, 'GET', 'audit', session)).status, 403)
  const a = await call(auditApi, 'GET', 'audit', 'test-owner-key')
  assert.equal(a.status, 200)
  assert.ok(a.data.total >= 2)
  assert.ok(a.data.people.some((p) => p.name === '佐藤'))
})

await test('人ごとのロック', async () => {
  const wrongKey = `lsk_${staffId}_${'B'.repeat(40)}`
  // 毎回ちがう接続元から。IP のロックでは止まらず、人ごとのロックで止まること。
  for (let i = 0; i < 5; i++) {
    const r = await call(ping, 'GET', 'admin-ping', wrongKey, undefined, `192.0.2.${10 + i}`)
    assert.equal(r.status, 401)
  }
  const locked = await call(ping, 'GET', 'admin-ping', staffKey, undefined, '192.0.2.99')
  assert.equal(locked.status, 429, '正しいキーでもロック中は開かない')
  assert.match(locked.data.message, /試行回数の上限/)
  // ほかの人とオーナーには効かない。
  assert.equal((await call(ping, 'GET', 'admin-ping', 'test-owner-key', undefined, '192.0.2.98')).status, 200)
  // ログイン済みの札は、そのまま使える（ロックはキーの入力に対するもの）。
  assert.equal((await call(ping, 'GET', 'admin-ping', session, undefined, '192.0.2.97')).status, 200)
  str.delete(S.FAIL_KEY(staffId))
  assert.equal(S.userLocked(4), false)
  assert.equal(S.userLocked(5), true)
})

await test('止める・作り直すと、その場で使えなくなる', async () => {
  const d = await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'disable', id: staffId })
  assert.equal(d.status, 200)
  const r = await call(ping, 'GET', 'admin-ping', session, undefined, '192.0.2.50')
  assert.equal(r.status, 401)
  assert.equal(r.data.code, 'STAFF_REVOKED')
  await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'enable', id: staffId })
  const reset = await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'reset', id: staffId })
  assert.match(reset.data.key, /^lsk_/)
  assert.equal((await call(ping, 'GET', 'admin-ping', staffKey, undefined, '192.0.2.51')).status, 401, '古いキー')
  const fresh = await call(ping, 'GET', 'admin-ping', reset.data.key, undefined, '192.0.2.52')
  assert.equal(fresh.status, 200)
  // 役割を変えると、ログイン中の札も入り直し。
  await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'update', id: staffId, role: 'viewer' })
  assert.equal((await call(ping, 'GET', 'admin-ping', fresh.data.session, undefined, '192.0.2.53')).status, 401)
  const bad = await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'update', id: staffId, role: 'owner' })
  assert.equal(bad.status, 400, 'オーナーは作れない')
})

await test('期限切れの札', async () => {
  const rec = await S.getStaff(staffId)
  const old = await S.signSession(rec, 'test-owner-key', Date.now() - 13 * 3600e3)
  const r = await call(ping, 'GET', 'admin-ping', old.token, undefined, '192.0.2.60')
  assert.equal(r.status, 401)
  assert.equal(r.data.code, 'SESSION_EXPIRED')
  assert.match(r.data.message, /12時間/)
})

await test('保存先が無いとき', async () => {
  const keep = { u: process.env.UPSTASH_REDIS_REST_URL }
  delete process.env.UPSTASH_REDIS_REST_URL
  try {
    assert.equal((await call(ping, 'GET', 'admin-ping', 'test-owner-key', undefined, '192.0.2.70')).data.staff, false)
    const r = await call(ping, 'GET', 'admin-ping', session, undefined, '192.0.2.71')
    assert.equal(r.status, 401)
    assert.equal(r.data.code, 'STAFF_NEEDS_STORE')
  } finally { process.env.UPSTASH_REDIS_REST_URL = keep.u }
})

await test('見積書: 担当者は作る・送る、削除と設定は管理者から。既読・見たは記録しない', () => {
  const d = (role, action, method = 'POST') => P.decide({ role, endpoint: 'quotes', method, action }).allow
  assert.equal(d('staff', 'save'), true)
  assert.equal(d('staff', 'send'), true)
  assert.equal(d('staff', 'invoice'), true)
  assert.equal(d('staff', 'delete'), false)
  assert.equal(d('staff', 'settings'), false)
  assert.equal(d('manager', 'delete'), true)
  assert.equal(d('viewer', 'save'), false)
  assert.equal(d('viewer', '', 'GET'), true)
  assert.equal(P.AREA_LABEL.quotes, '見積書')
  assert.equal(P.quietBody({ action: 'seen' }), true)
  assert.equal(P.quietBody({ id: 'x', read: true }), true)
  assert.equal(P.quietBody({ id: 'x', read: true, status: 'done' }), false)
  assert.equal(P.quietBody({ id: 'x', action: 'confirmed' }), false)
})

await test('ログイン画面から入ったときだけ、オーナーのログインと不明なキーの失敗を記録する', async () => {
  const before = (await call(auditApi, 'GET', 'audit', 'test-owner-key')).data.total || 0
  await call(ping, 'GET', 'admin-ping', 'test-owner-key', undefined, '192.0.2.120')   // 開き直し（記録しない）
  const login = async (token, ip) => {
    const res = await ping.GET(new Request('https://example.test/api/admin-ping', { headers: { ...H(token, ip), 'x-lum-login': '1' } }))
    return res.status
  }
  assert.equal(await login('test-owner-key', '192.0.2.121'), 200)
  assert.equal(await login('not-a-key', '192.0.2.122'), 401)
  const a = (await call(auditApi, 'GET', 'audit', 'test-owner-key')).data
  assert.equal(a.total, before + 2, '開き直しは数えず、ログインと失敗の2件だけ')
  const [fail, ok] = a.items
  assert.equal(fail.result, 'failed')
  assert.equal(fail.name, '不明なキー')
  assert.equal(ok.result, 'login')
  assert.equal(ok.by, 'owner')
})

await test('2段階認証: 設定・キーだけでは入れない・コード・予備のコード・必須の決まり・リセット', async () => {
  const T = await import('../api/_totp.js')
  const otpApi = await import('../api/otp.js')
  const made = await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'create', name: '二段', role: 'manager' })
  const key = made.data.key, id = made.data.member.id
  const sess = (await call(ping, 'GET', 'admin-ping', key, undefined, '203.0.113.50')).data.session
  // 設定を始める → アプリの6けたでオン → 予備のコードが8つ
  const st = await call(otpApi, 'POST', 'otp', sess, { action: 'start' }, '203.0.113.50')
  assert.equal(st.status, 200)
  assert.match(st.data.uri, /^otpauth:\/\/totp\//)
  assert.equal((await call(otpApi, 'POST', 'otp', sess, { action: 'enable', code: '000000' }, '203.0.113.50')).status, 400)
  const code = await T.hotp(st.data.secret, Math.floor(Date.now() / 30000))
  const en = await call(otpApi, 'POST', 'otp', sess, { action: 'enable', code }, '203.0.113.50')
  assert.equal(en.data.on, true)
  assert.equal(en.data.codes.length, 8)
  assert.equal((await call(staffApi, 'GET', 'staff', 'test-owner-key')).data.staff.find((x) => x.id === id).otp, true)
  // キーだけでは入れない・違うコードは断る・正しいコードで入れる・予備のコードは1回だけ
  const login = async (otp, ip) => {
    const res = await ping.GET(new Request('https://example.test/api/admin-ping', { headers: { ...H(key, ip), ...(otp ? { 'x-lum-otp': otp } : {}) } }))
    return { status: res.status, data: await res.json() }
  }
  assert.equal((await login('', '203.0.113.51')).data.code, 'OTP_REQUIRED')
  assert.equal((await login('123456', '203.0.113.52')).data.code, 'OTP_WRONG')
  const ok = await login(await T.hotp(st.data.secret, Math.floor(Date.now() / 30000)), '203.0.113.53')
  assert.equal(ok.status, 200)
  assert.ok(ok.data.session)
  assert.equal((await login(en.data.codes[0], '203.0.113.54')).status, 200)
  assert.equal((await login(en.data.codes[0], '203.0.113.55')).data.code, 'OTP_WRONG', '予備のコードは1回だけ')
  // 必須の決まり: まだ設定していない人は、確認と設定の窓口しか使えない
  const other = await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'create', name: 'まだ', role: 'staff' })
  const s2 = (await call(ping, 'GET', 'admin-ping', other.data.key, undefined, '203.0.113.56')).data.session
  await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'policy', otpRequired: true })
  assert.equal((await call(staffApi, 'GET', 'staff', s2, undefined, '203.0.113.57')).data.code, 'OTP_SETUP_REQUIRED')
  const p2 = await call(ping, 'GET', 'admin-ping', s2, undefined, '203.0.113.58')
  assert.equal(p2.status, 200)
  assert.deepEqual(p2.data.otp, { on: false, required: true })
  assert.equal((await call(otpApi, 'GET', 'otp', s2, undefined, '203.0.113.59')).status, 200)
  await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'policy', otpRequired: false })
  // オーナーのリセット: オフになり、ログイン中の画面も入り直し
  await call(staffApi, 'POST', 'staff', 'test-owner-key', { action: 'otp.reset', id })
  assert.equal((await call(ping, 'GET', 'admin-ping', ok.data.session, undefined, '203.0.113.60')).data.code, 'STAFF_REVOKED')
  assert.equal((await login('', '203.0.113.61')).status, 200, 'リセット後はキーだけで入れる')
})

await test('ロックは5回まちがえてから（同じキーの重複・空のキーは数えない）', async () => {
  const ip = '198.51.100.7'
  // 空のキー（ログイン前の画面からの問い合わせ）は何回来ても数えない。
  for (let i = 0; i < 8; i++) assert.equal((await call(ping, 'GET', 'admin-ping', '', undefined, ip)).status, 401)
  // 同じ間違ったキーが何度届いても1回。
  for (let i = 0; i < 8; i++) assert.equal((await call(ping, 'GET', 'admin-ping', 'wrong-1', undefined, ip)).status, 401)
  assert.equal((await call(ping, 'GET', 'admin-ping', 'test-owner-key', undefined, ip)).status, 200, '1回まちがえただけでは開ける')
  // 正しく入ると数え直し。ちがうキーを4回まちがえても、まだ開ける。
  const msgs = []
  for (let i = 1; i <= 4; i++) msgs.push((await call(ping, 'GET', 'admin-ping', 'wrong-x' + i, undefined, ip)).data.message)
  assert.match(msgs[3], /あと1回/)
  assert.equal((await call(ping, 'GET', 'admin-ping', 'test-owner-key', undefined, ip)).status, 200, '4回までは開ける')
  // 5回まちがえたら、そこでロック。
  for (let i = 1; i <= 5; i++) await call(ping, 'GET', 'admin-ping', 'wrong-y' + i, undefined, ip)
  const locked = await call(ping, 'GET', 'admin-ping', 'test-owner-key', undefined, ip)
  assert.equal(locked.status, 429)
  str.delete('x'); sets.clear(); ttls.clear()
})

await test('個人の情報の書き出しは、操作の記録に残す対象になる', async () => {
  const { exportOf } = await import('../api/_admin-auth.js')
  const u = (p) => new URL('https://x.test' + p)
  assert.equal(exportOf('inquiries', u('/api/inquiries?view=export')), 'inquiries-csv')
  assert.equal(exportOf('inquiries', u('/api/inquiries?status=all')), '')
  assert.equal(exportOf('members-xlsx', u('/api/members-xlsx')), 'members-xlsx')
  assert.equal(exportOf('quotes', u('/api/quotes?view=xlsx')), 'quotes-xlsx')
  assert.equal(exportOf('audit', u('/api/audit?format=csv')), 'audit-csv')
  assert.equal(exportOf('analytics', u('/api/analytics?days=30')), '')
})

console.log(`test-staff: ${n} 件 OK`)
