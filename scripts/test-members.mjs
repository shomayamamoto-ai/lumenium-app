// 会員リストのテスト。外には一切出ません（Resend と保存先は偽物）。
//
//   node scripts/test-members.mjs
//
// 確かめること。
//   ・ページを最後までたどり、重なりを1つにする（以前は1ページ目だけ）
//   ・会員の名簿の場所（セグメント／古いオーディエンス）と、会社名の読み方
//   ・同意の記録の読み方（壊れた値・古い登録は「記録なし」）
//   ・グループで絞る、届く人数（配信を止めた人は数えない）

import assert from 'node:assert/strict'

const REDIS = 'https://redis.test.invalid'
const STORE_NAMES = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']
for (const n of STORE_NAMES) delete process.env[n]
Object.assign(process.env, {
  UPSTASH_REDIS_REST_URL: REDIS, UPSTASH_REDIS_REST_TOKEN: 't',
  RESEND_API_KEY: 'test', ADMIN_KEY: 'test-admin', SESSION_SECRET: 'members-test-secret',
  CONTACT_TO_EMAIL: 'owner@example.com',
})
for (const n of ['CONTACT_FROM_EMAIL', 'RESEND_AUDIENCE_ID', 'RESEND_SEGMENT_ID', 'MAIL_SENDER_ADDRESS']) delete process.env[n]

/* ---- 偽の保存先 ---- */
const kv = new Map()
const hashes = new Map()
const lists = new Map()
function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    if (op === 'HSET') { const h = hashes.get(k) || new Map(); h.set(String(c[2]), String(c[3])); hashes.set(k, h); return { result: 1 } }
    if (op === 'HGET') { const h = hashes.get(k); return { result: h ? h.get(String(c[2])) ?? null : null } }
    if (op === 'HGETALL') { const h = hashes.get(k); return { result: h ? [...h].flat() : [] } }
    if (op === 'HDEL') { const h = hashes.get(k); return { result: h && h.delete(String(c[2])) ? 1 : 0 } }
    if (op === 'LPUSH') { const l = lists.get(k) || []; l.unshift(String(c[2])); lists.set(k, l); return { result: l.length } }
    if (op === 'LTRIM') return { result: 'OK' }
    if (op === 'LRANGE') { const l = lists.get(k) || []; return { result: l.slice(Number(c[2]), Number(c[3]) + 1) } }
    if (op === 'GET') return { result: kv.get(k) ?? null }
    if (op === 'SET') { kv.set(k, c[2]); return { result: 'OK' } }
    if (op === 'INCR') { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return { result: v } }
    return { result: null }
  })
}

/* ---- 偽の Resend ----
   routes: [[method, 正規表現, (match, body, url) => {status, body}]] */
let routes = []
const calls = []
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (input, init = {}) => {
  const url = String(input && input.url ? input.url : input)
  if (url.startsWith(REDIS)) return jsonRes(redis(JSON.parse(init.body || '[]')))
  if (url.startsWith('https://api.resend.com')) {
    const method = String(init.method || 'GET').toUpperCase()
    const path = url.slice('https://api.resend.com'.length)
    let body = null
    try { body = init.body ? JSON.parse(init.body) : null } catch (_) {}
    calls.push({ method, path, body, headers: init.headers || {} })
    for (const [m, re, fn] of routes) {
      const hit = m === method && re.exec(path)
      if (hit) { const r = fn(hit, body, path); return jsonRes(r.body, r.status || 200) }
    }
    return jsonRes({ message: 'not found' }, 404)
  }
  throw new Error('test tried to reach the network: ' + url)
}

let failed = 0
async function t(name, fn) {
  try { await fn(); console.log('  ✓ ' + name) }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')) }
}

/* 会員を n 人、ページ size ずつ返す偽のセグメント。after は最後の id。 */
function people(n, seg = 'seg_all') {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${String(i + 1).padStart(3, '0')}`, email: `p${i + 1}@example.com`, first_name: `会員${i + 1}`,
    last_name: i % 3 ? `会社${i + 1}` : '', created_at: new Date(Date.UTC(2026, i % 12, 1 + (i % 27))).toISOString(),
    unsubscribed: i % 10 === 9, _seg: seg,
  }))
}
function pager(all) {
  return (hit, _b, path) => {
    const u = new URL('https://x' + path)
    const limit = Number(u.searchParams.get('limit') || 20)
    const after = u.searchParams.get('after')
    const start = after ? all.findIndex((c) => c.id === after) + 1 : 0
    const data = all.slice(start, start + limit)
    return { body: { object: 'list', data, has_more: start + limit < all.length } }
  }
}

const M = await import('../api/_members.js')

const ALL = people(230)
const VIP = ALL.filter((_, i) => i % 7 === 0)
function standardRoutes() {
  routes = [
    ['GET', /^\/segments\?/, () => ({ body: { object: 'list', has_more: false, data: [
      { id: 'seg_all', name: M.ALL_NAME, created_at: '2026-01-01T00:00:00Z' },
      { id: 'seg_vip', name: '常連さん', created_at: '2026-02-01T00:00:00Z' },
    ] } })],
    ['GET', /^\/segments\/seg_all\/contacts/, pager(ALL)],
    // 境目の1人をわざと2ページに出し、重なりが1つになるかも確かめます。
    ['GET', /^\/segments\/seg_vip\/contacts/, pager(VIP)],
    ['GET', /^\/contact-properties/, () => ({ body: { object: 'list', has_more: false, data: [{ id: 'p1', key: 'company', type: 'string' }] } })],
  ]
}

await t('ページを最後までたどる（100件ずつ・230人）', async () => {
  standardRoutes()
  calls.length = 0
  const r = await M.listMembers('test')
  assert.equal(r.members.length, 230)
  assert.equal(r.mode, 'segments')
  assert.equal(r.truncated, false)
  const pages = calls.filter((c) => c.path.startsWith('/segments/seg_all/contacts'))
  assert.equal(pages.length, 3)
  assert.match(pages[1].path, /after=c100/)
  assert.ok(pages.every((c) => /limit=100/.test(c.path)))
})

await t('ページの重なりは1つに、has_more が無い（古い形）は1回で終わる', async () => {
  let n = 0
  const got = await M.collectPages(async (after) => {
    n++
    if (!after) return { ok: true, body: { data: [{ id: 'a' }, { id: 'b' }], has_more: true } }
    return { ok: true, body: { data: [{ id: 'b' }, { id: 'c' }], has_more: false } }
  })
  assert.deepEqual(got.items.map((x) => x.id), ['a', 'b', 'c'])
  assert.equal(n, 2)
  const legacy = await M.collectPages(async () => ({ ok: true, body: { data: [{ id: 'x' }] } }))
  assert.deepEqual(legacy.items.map((x) => x.id), ['x'])
  assert.equal(await M.collectPages(async () => ({ ok: false, body: null })), null)
  const loop = await M.collectPages(async () => ({ ok: true, body: { data: [{ id: 'same' }], has_more: true } }), 5)
  assert.equal(loop.items.length, 1, '同じ after が続いても止まる')
})

await t('グループの中身を1人ごとに付ける・グループで絞る', async () => {
  standardRoutes()
  const r = await M.listMembers('test', { withSegments: true })
  assert.deepEqual(r.segments.map((s) => s.name), ['常連さん'], '全員のグループは選択肢に出さない')
  assert.equal(r.segments[0].count, VIP.length)
  const vip = r.members.filter((m) => M.inSegment(m, 'seg_vip'))
  assert.equal(vip.length, VIP.length)
  assert.equal(r.members.filter((m) => M.inSegment(m, 'none')).length, 230 - VIP.length)
  assert.equal(r.members.filter((m) => M.inSegment(m, '')).length, 230)
})

await t('届く人数は配信を止めた人を数えない', async () => {
  const ms = [
    { unsubscribed: false, segments: ['a'] }, { unsubscribed: true, segments: ['a'] },
    { unsubscribed: false, segments: [] }, { unsubscribed: true, segments: [] },
  ]
  assert.equal(M.recipientCount(ms, ''), 2)
  assert.equal(M.recipientCount(ms, 'a'), 1)
  assert.equal(M.recipientCount(ms, 'none'), 1)
  const r = await M.listMembers('test')
  assert.equal(M.recipientCount(r.members, ''), 230 - 23)
})

await t('会社名は追加の項目を先に、無ければ姓の欄', async () => {
  assert.equal(M.toMember({ id: '1', email: 'a@x.jp', first_name: '山田', last_name: '旧社名', properties: { company: '新社名' } }).company, '新社名')
  assert.equal(M.toMember({ id: '1', email: 'a@x.jp', first_name: '山田', last_name: '旧社名' }).company, '旧社名')
  assert.equal(M.toMember({ id: '1', email: 'a@x.jp', last_name: null }).company, '')
})

await t('登録: セグメントに入れ、会社名は追加の項目と姓の欄の両方に', async () => {
  standardRoutes()
  let sent = null
  routes.push(['POST', /^\/contacts$/, (_h, b) => { sent = b; return { body: { id: 'new' } } }])
  assert.equal(await M.addMember('test', { name: '佐藤', email: 's@example.com', company: '架空商事' }), true)
  assert.deepEqual(sent.segments, [{ id: 'seg_all' }])
  assert.equal(sent.properties.company, '架空商事')
  assert.equal(sent.last_name, '架空商事')
  assert.equal(sent.unsubscribed, false)
})

await t('/segments が無い古いアカウントはオーディエンスに戻る', async () => {
  const Mod = await import('../api/_members.js?legacy')
  routes = [
    ['GET', /^\/audiences$/, () => ({ body: { data: [{ id: 'aud1', name: Mod.ALL_NAME }] } })],
    ['GET', /^\/audiences\/aud1\/contacts/, () => ({ body: { data: people(3) } })],
  ]
  const r = await Mod.listMembers('legacy-key', { withSegments: true })
  assert.equal(r.mode, 'legacy')
  assert.equal(r.members.length, 3)
  assert.deepEqual(r.segments, [])
})

await t('同意の記録: 日時・ページ・文面の版。壊れた値は「記録なし」、IP は有無だけ', async () => {
  const rec = { at: '2026-10-01T01:02:03.000Z', version: '2026-10', source: '/register.html', ipHash: 'abc' }
  const v = M.consentView(JSON.stringify(rec))
  assert.deepEqual(v, { at: rec.at, version: '2026-10', source: '/register.html', hasIp: true })
  assert.equal(JSON.stringify(v).includes('abc'), false, 'IP のハッシュそのものは画面に出さない')
  assert.equal(M.consentView('{oops'), null)
  assert.equal(M.consentView(JSON.stringify({ version: 'x' })), null)
  assert.equal(M.consentView(null), null)
  // 登録（api/register.js）が書いた場所から読めること
  const key = await M.consentKey('Taro@Example.com')
  redis([['HSET', M.MK.consent, key, JSON.stringify(rec)]])
  const got = await M.readConsent('taro@example.com')
  assert.equal(got.stored, true)
  assert.equal(got.record.source, '/register.html')
  assert.equal((await M.readConsent('nobody@example.com')).record, null)
  const all = await M.allConsents()
  assert.equal(all.get(key).version, '2026-10')
})

/* ---- 管理画面の操作（api/members.js） ---- */
const ADMIN = { authorization: 'Bearer test-admin', 'content-type': 'application/json' }
let ipN = 0
const call = (mod, method, query, body) => mod[method](new Request('https://sample.example/api/members' + query, {
  method, headers: { ...ADMIN, 'x-forwarded-for': `198.51.100.${++ipN}` }, body: body ? JSON.stringify(body) : undefined,
}))
const PERSON = { id: 'c_del', email: 'Hanako@Example.com', first_name: '山田 花子', last_name: '架空商事', created_at: '2026-09-01T00:00:00Z', unsubscribed: false, properties: { company: '架空商事' } }

await t('削除: 連絡先と同意の記録を消し、監査には個人を指す値を残さない', async () => {
  standardRoutes()
  let deleted = ''
  routes.push(
    ['GET', /^\/contacts\/c_del$/, () => ({ body: PERSON })],
    ['GET', /^\/contacts\/c_del\/segments/, () => ({ body: { data: [{ id: 'seg_all' }, { id: 'seg_vip' }] } })],
    ['DELETE', /^\/contacts\/c_del$/, (h) => { deleted = h[0]; return { body: { deleted: true } } }],
  )
  const key = await M.consentKey(PERSON.email)
  redis([['HSET', M.MK.consent, key, JSON.stringify({ at: '2026-09-01T00:00:00Z', version: '2026-10', source: '/register.html', ipHash: 'iphash123' })]])
  const mod = await import('../api/members.js')
  const detail = await (await call(mod, 'GET', '?id=c_del')).json()
  assert.equal(detail.member.company, '架空商事')
  assert.deepEqual(detail.member.segments, ['seg_vip'], '全員のグループは出さない')
  assert.equal(detail.consent.version, '2026-10')

  const wrong = await call(mod, 'POST', '', { action: 'delete', id: 'c_del', email: 'someone@example.com', reason: 'request' })
  assert.equal(wrong.status, 409, '画面の人と違えば消さない')
  assert.equal(deleted, '')

  const res = await call(mod, 'POST', '', { action: 'delete', id: 'c_del', email: 'hanako@example.com', reason: 'request' })
  const out = await res.json()
  assert.equal(out.ok, true)
  assert.equal(deleted, '/contacts/c_del')
  assert.match(out.ref, /^A[0-9A-Z]{6,}$/)
  assert.equal(out.consentRemoved, true)
  assert.equal(hashes.get(M.MK.consent).has(key), false, '同意の記録も消える')
  const audit = lists.get(M.MK.audit) || []
  assert.equal(audit.length, 1)
  const row = JSON.parse(audit[0])
  assert.equal(row.action, 'delete')
  assert.equal(row.reason, 'request')
  assert.equal(row.hadConsent, true)
  const text = audit[0].toLowerCase()
  for (const bad of ['hanako', 'example.com', '山田', '架空商事', 'c_del', key, 'iphash123']) {
    assert.equal(text.includes(String(bad).toLowerCase()), false, `監査に「${bad}」が入っている`)
  }
  const shown = await (await call(mod, 'GET', '?view=audit')).json()
  assert.equal(shown.items[0].ref, out.ref)
})

await t('配信停止: unsubscribed だけを送り、戻す操作は無い', async () => {
  standardRoutes()
  let patch = null
  routes.push(['PATCH', /^\/contacts\/c9$/, (_h, b) => { patch = b; return { body: { id: 'c9' } } }])
  const mod = await import('../api/members.js')
  const out = await (await call(mod, 'POST', '', { action: 'unsubscribe', id: 'c9' })).json()
  assert.equal(out.ok, true)
  assert.deepEqual(patch, { unsubscribed: true })
  const back = await (await call(mod, 'POST', '', { action: 'resubscribe', id: 'c9' })).json()
  assert.equal(back.ok, false)
  const audit = JSON.parse(lists.get(M.MK.audit)[0])
  assert.equal(audit.action, 'unsubscribe')
})

await t('名前と会社名の修正・グループの出入り', async () => {
  standardRoutes()
  const seen = []
  routes.push(
    ['PATCH', /^\/contacts\/c7$/, (_h, b) => { seen.push(['patch', b]); return { body: { id: 'c7' } } }],
    ['POST', /^\/contacts\/c7\/segments\/seg_vip$/, () => { seen.push(['join']); return { body: { id: 'seg_vip' } } }],
    ['DELETE', /^\/contacts\/c7\/segments\/seg_vip$/, () => { seen.push(['leave']); return { body: { deleted: true } } }],
    ['POST', /^\/segments$/, (_h, b) => { seen.push(['make', b.name]); return { body: { id: 'seg_new', name: b.name } } }],
  )
  const mod = await import('../api/members.js')
  assert.equal((await (await call(mod, 'POST', '', { action: 'update', id: 'c7', name: ' 佐藤 ', company: '新会社' })).json()).ok, true)
  assert.deepEqual(seen[0][1], { first_name: '佐藤', last_name: '新会社', properties: { company: '新会社' } })
  assert.equal((await call(mod, 'POST', '', { action: 'update', id: 'c7', name: '' })).status, 400)
  assert.equal((await (await call(mod, 'POST', '', { action: 'segment.join', id: 'c7', segment: 'seg_vip' })).json()).ok, true)
  assert.equal((await (await call(mod, 'POST', '', { action: 'segment.leave', id: 'c7', segment: 'seg_vip' })).json()).ok, true)
  const made = await (await call(mod, 'POST', '', { action: 'segment.create', name: 'セミナー' })).json()
  assert.equal(made.segment.id, 'seg_new')
  assert.equal((await call(mod, 'POST', '', { action: 'segment.delete', segment: 'seg_all' })).status, 400, '全員のグループは消せない')
  assert.deepEqual(seen.map((x) => x[0]), ['patch', 'join', 'leave', 'make'])
})

if (failed) {
  console.error(`\n${failed} 件の確認が通りませんでした。`)
  process.exit(1)
}
console.log('\n会員リスト: すべて通りました。')
