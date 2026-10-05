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

/* ---- お知らせメール ---- */

await t('本文の下に、送信者・住所・問い合わせ先・配信停止のリンクが必ず付く', async () => {
  const out = M.compose({
    subject: ' 冬のお知らせ ', body: '■ 営業日\nいつも**ありがとう**ございます。\n\n・28日から休み\n・5日から営業\n\nhttps://example.com/a?b=1 <script>x</script>',
    footer: { sender: '架空商店', address: '東京都千代田区1-2-3', contact: 'https://example.com/contact.html', unsubscribe: M.RESEND_UNSUB },
  })
  assert.equal(out.subject, '冬のお知らせ')
  for (const part of [out.text, out.html]) {
    assert.ok(part.includes('架空商店'), '送信者')
    assert.ok(part.includes('東京都千代田区1-2-3'), '住所')
    assert.ok(part.includes('https://example.com/contact.html'), '問い合わせ先')
    assert.ok(part.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'), '配信停止のリンク')
  }
  assert.ok(out.html.includes('<h2'), '見出し')
  assert.ok(out.html.includes('<strong>ありがとう</strong>'), '太字')
  assert.ok(out.html.includes('<li style="margin:2px 0">28日から休み</li>'), '箇条書き')
  const mixed = M.bodyHtml('■ 営業日\n・28日から休み\n・5日から営業\nよろしくお願いします')
  assert.match(mixed, /<\/h2><ul[^>]*><li[^>]*>28日から休み<\/li><li[^>]*>5日から営業<\/li><\/ul><p[^>]*>よろしくお願いします<\/p>$/, '見出しのすぐ下の箇条書き')
  assert.ok(out.html.includes('<a href="https://example.com/a?b=1"'), 'URL はリンク')
  assert.equal(out.html.includes('<script>'), false, 'HTML は文字として出す')
  assert.ok(M.compose({ subject: 's', body: 'b', footer: { unsubscribe: 'u' } }).text.includes('住所: （未設定）'))
})

await t('配信停止のリンク: 署名が合うときだけ通る（大文字小文字は同じ扱い）', async () => {
  const url = await M.unsubscribeUrl('Taro@Example.com')
  const u = new URL(url)
  assert.equal(u.pathname, '/api/unsubscribe')
  assert.equal(u.searchParams.get('e'), 'taro@example.com')
  const tok = u.searchParams.get('t')
  assert.match(tok, /^[0-9a-f]{32}$/)
  assert.equal(await M.verifyUnsubscribe('taro@example.com', tok), true)
  assert.equal(await M.verifyUnsubscribe('TARO@example.com', tok), true)
  assert.equal(await M.verifyUnsubscribe('jiro@example.com', tok), false, '他人のアドレスでは通らない')
  assert.equal(await M.verifyUnsubscribe('taro@example.com', tok.replace(/.$/, (c) => (c === '0' ? '1' : '0'))), false)
  assert.equal(await M.verifyUnsubscribe('taro@example.com', 'short'), false)
  assert.equal(await M.verifyUnsubscribe('taro@example.com', tok, 'another-secret'), false, '鍵が違えば通らない')
  assert.ok((await M.unsubscribeUrl('a@example.com', { test: true })).endsWith('&test=1'))
})

await t('配信停止のページ: 開いただけでは止めず、押したら止める・試し送りは止めない', async () => {
  standardRoutes()
  const patched = []
  routes.push(['PATCH', /^\/contacts\/(.+)$/, (h, b) => { patched.push([decodeURIComponent(h[1]), b]); return { body: { id: 'x' } } }])
  const mod = await import('../api/unsubscribe.js')
  const url = await M.unsubscribeUrl('taro@example.com')
  const page = await mod.GET(new Request(url))
  assert.equal(page.status, 200)
  assert.match(await page.text(), /配信を停止する/)
  assert.equal(patched.length, 0, '開いただけでは止めない')
  const bad = await mod.GET(new Request(url.replace(/t=[0-9a-f]+/, 't=' + '0'.repeat(32))))
  assert.equal(bad.status, 400)
  const done = await mod.POST(new Request(url, { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.1' } }))
  assert.equal(done.status, 200)
  assert.deepEqual(patched[0], ['taro@example.com', { unsubscribed: true }])
  const test = await mod.POST(new Request(await M.unsubscribeUrl('owner@example.com', { test: true }), { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.2' } }))
  assert.match(await test.text(), /テストのため止めていません/)
  assert.equal(patched.length, 1)
})

await t('送信元が Resend の試用アドレスなら送らない（直し方つき）', async () => {
  standardRoutes()
  delete process.env.CONTACT_FROM_EMAIL
  process.env.MAIL_SENDER_ADDRESS = '東京都千代田区1-2-3'
  const posted = []
  routes.push(['POST', /^\/broadcasts$/, (_h, b) => { posted.push(b); return { body: { id: 'bc1' } } }])
  const mod = await import('../api/members.js')
  const res = await call(mod, 'POST', '', { action: 'mail.send', subject: '件名', body: '本文', confirmCount: 207 })
  const out = await res.json()
  assert.equal(res.status, 409)
  assert.equal(out.code, 'SANDBOX')
  assert.match(out.steps, /Domains/)
  assert.equal(posted.length, 0)
  const view = await (await call(mod, 'GET', '?view=mail')).json()
  assert.equal(view.sandbox, true)
})

await t('住所が無ければ送らない・人数が確かめたものと違えば送らない・送れば控えを残す', async () => {
  standardRoutes()
  process.env.CONTACT_FROM_EMAIL = '架空商店 <info@example.co.jp>'
  delete process.env.MAIL_SENDER_ADDRESS
  const posted = []
  routes.push(['POST', /^\/broadcasts$/, (_h, b) => { posted.push(b); return { body: { id: 'bc1' } } }])
  const mod = await import('../api/members.js')
  const noAddr = await (await call(mod, 'POST', '', { action: 'mail.send', subject: '件名', body: '本文', confirmCount: 207 })).json()
  assert.equal(noAddr.code, 'NO_ADDRESS')
  process.env.MAIL_SENDER_ADDRESS = '東京都千代田区1-2-3'

  const n = await (await call(mod, 'POST', '', { action: 'mail.count', segment: '' })).json()
  assert.equal(n.count, 207, '230人のうち配信停止の23人を除く')
  assert.equal(n.stopped, 23)
  const vip = await (await call(mod, 'POST', '', { action: 'mail.count', segment: 'seg_vip' })).json()
  assert.equal(vip.count, VIP.filter((c) => !c.unsubscribed).length)

  const stale = await (await call(mod, 'POST', '', { action: 'mail.send', subject: '件名', body: '本文', confirmCount: 230 })).json()
  assert.equal(stale.code, 'COUNT_CHANGED')
  assert.equal(stale.count, 207)
  assert.equal(posted.length, 0)

  const ok = await (await call(mod, 'POST', '', { action: 'mail.send', subject: '冬のお知らせ', body: '本文', segment: 'seg_vip', segmentName: '常連さん', confirmCount: vip.count })).json()
  assert.equal(ok.ok, true)
  assert.equal(posted.length, 1)
  const b = posted[0]
  assert.equal(b.segment_id, 'seg_vip')
  assert.equal(b.send, true)
  assert.equal(b.from, '架空商店 <info@example.co.jp>')
  assert.equal(b.reply_to, 'owner@example.com')
  assert.ok(b.html.includes('{{{RESEND_UNSUBSCRIBE_URL}}}') && b.text.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'))
  assert.ok(b.text.includes('東京都千代田区1-2-3'))
  const log = JSON.parse(lists.get(M.MK.broadcasts)[0])
  assert.deepEqual([log.id, log.count, log.group, log.subject], ['bc1', vip.count, '常連さん', '冬のお知らせ'])
  assert.equal(lists.get(M.MK.broadcasts)[0].includes('@'), false, '控えに宛先は入れない')

  const later = await call(mod, 'POST', '', { action: 'mail.send', subject: 's', body: 'b', confirmCount: 207, scheduledAt: new Date(Date.now() + 60000).toISOString() })
  assert.equal(later.status, 400, '5分より前の予約は受けない')
})

await t('テスト送信は自分あてに【テスト】・見本と履歴の数字（取れなければ null）', async () => {
  standardRoutes()
  const mails = []
  routes.push(
    ['POST', /^\/emails$/, (_h, b) => { mails.push(b); return { body: { id: 'e1' } } }],
    ['GET', /^\/broadcasts\?/, () => ({ body: { object: 'list', has_more: false, data: [{ id: 'bc1', name: '冬', status: 'sent', created_at: '2026-10-01T00:00:00Z', sent_at: '2026-10-01T00:01:00Z' }] } })],
    ['GET', /^\/broadcasts\/bc1\/recipients\?type=delivered/, () => ({ body: { object: 'list', has_more: false, data: [{ id: 'r1' }, { id: 'r2' }] } })],
    ['GET', /^\/broadcasts\/bc1\/recipients\?type=opened/, () => ({ body: { object: 'list', has_more: false, data: [{ id: 'r1' }] } })],
  )
  const mod = await import('../api/members.js')
  const sent = await (await call(mod, 'POST', '', { action: 'mail.test', subject: '冬', body: '本文' })).json()
  assert.equal(sent.to, 'owner@example.com')
  assert.deepEqual(mails[0].to, ['owner@example.com'])
  assert.match(mails[0].subject, /^【テスト】冬/)
  assert.match(mails[0].text, /api\/unsubscribe\?e=owner%40example\.com&t=[0-9a-f]{32}&test=1/)
  const prev = await (await call(mod, 'POST', '', { action: 'mail.preview', subject: '冬', body: '本文' })).json()
  assert.ok(prev.html.includes('本文') && prev.text.includes('配信の停止'))
  const view = await (await call(mod, 'GET', '?view=mail')).json()
  assert.equal(view.history[0].subject, '冬のお知らせ', 'ここで送った控えの件名')
  assert.equal(view.history[0].statusLabel, '送信済み')
  const st = await (await call(mod, 'GET', '?view=broadcast&id=bc1')).json()
  assert.deepEqual(st.stats.delivered, { n: 2, more: false })
  assert.deepEqual(st.stats.opened, { n: 1, more: false })
  assert.equal(st.stats.clicked, null, 'Resend が返さないものは null（画面は「取得できません」）')
})

await t('増え方: 月ごとの登録と累計（日本時間）・配信停止・登録したページ', async () => {
  const now = Date.parse('2026-10-15T00:00:00Z')
  const ms = [
    { email: 'a@x.jp', created: '2025-01-05T00:00:00Z', unsubscribed: false }, // 12か月より前
    { email: 'b@x.jp', created: '2026-09-30T16:00:00Z', unsubscribed: true }, // 日本時間では10/1
    { email: 'c@x.jp', created: '2026-10-02T00:00:00Z', unsubscribed: false },
    { email: 'd@x.jp', created: '2026-08-10T00:00:00Z', unsubscribed: false },
  ]
  const consents = new Map([['kb', { source: '/register.html' }], ['kc', { source: '/register.html' }], ['kd', { source: '/game.html' }]])
  const keys = new Map([['b@x.jp', 'kb'], ['c@x.jp', 'kc'], ['d@x.jp', 'kd'], ['a@x.jp', 'ka']])
  const g = M.growth(ms, consents, keys, now)
  assert.equal(g.series.length, 12)
  assert.equal(g.series[11].month, '2026-10')
  assert.equal(g.series[11].added, 2)
  assert.equal(g.series[11].total, 4)
  assert.equal(g.series[9].added, 1, '8月')
  assert.equal(g.series[0].total, 1, '前からいる人が累計の出発点')
  assert.deepEqual([g.total, g.subscribed, g.unsubscribed, g.thisMonth], [4, 3, 1, 2])
  assert.deepEqual(g.sources, [{ source: '/register.html', count: 2 }, { source: '/game.html', count: 1 }])
  assert.equal(g.noRecord, 1)
  const stops = M.stopsByMonth([
    { action: 'unsubscribe', at: '2026-10-03T00:00:00Z' }, { action: 'unsubscribe-link', at: '2026-09-30T20:00:00Z' },
    { action: 'delete', at: '2026-10-03T00:00:00Z' },
  ], g.series.map((x) => x.month))
  assert.equal(stops[11].stops, 2)
  assert.equal(stops[10].stops, 0)
})

if (failed) {
  console.error(`\n${failed} 件の確認が通りませんでした。`)
  process.exit(1)
}
console.log('\n会員リスト: すべて通りました。')
