// 管理画面の土台まわりの確認（ログイン・設定状況のテスト・設定の暗号化・
// AIアドバイザー・会員登録・お知らせ・反映状況）。
//
// 外へ出る通信はすべてこの中の fetch が受け止めるので、オフラインで決まった
// 結果になります。prebuild で走り、壊れていればビルドが止まります。

import assert from 'node:assert/strict'

const REDIS = 'https://redis.foundation.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'foundation-admin-key-0123456789',
  UPSTASH_REDIS_REST_URL: REDIS,
  UPSTASH_REDIS_REST_TOKEN: 'x',
})

/* ---- 小さな Redis ---- */
const store = new Map()
const hashes = new Map()
function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    if (op === 'GET') return { result: store.get(k) ?? null }
    if (op === 'SET') {
      if (c.includes('NX') && store.has(k)) return { result: null }
      store.set(k, String(c[2])); return { result: 'OK' }
    }
    if (op === 'DEL') { store.delete(k); hashes.delete(k); return { result: 1 } }
    if (op === 'INCR' || op === 'INCRBY') { const v = (Number(store.get(k)) || 0) + (op === 'INCR' ? 1 : Number(c[2])); store.set(k, String(v)); return { result: v } }
    if (op === 'DECRBY') { const v = (Number(store.get(k)) || 0) - Number(c[2]); store.set(k, String(v)); return { result: v } }
    if (op === 'TTL') return { result: 3600 }
    if (op === 'HINCRBY') { const h = hashes.get(k) || new Map(); const v = (Number(h.get(String(c[2]))) || 0) + Number(c[3]); h.set(String(c[2]), String(v)); hashes.set(k, h); return { result: v } }
    if (op === 'HSET') { const h = hashes.get(k) || new Map(); for (let i = 2; i + 1 < c.length; i += 2) h.set(String(c[i]), String(c[i + 1])); hashes.set(k, h); return { result: 1 } }
    if (op === 'HGET') { const h = hashes.get(k); return { result: h?.get(String(c[2])) ?? null } }
    if (op === 'HGETALL') { const h = hashes.get(k); return { result: h ? [...h].flat() : [] } }
    return { result: null }
  })
}

/* ---- 外向きの通信。テストごとに handlers を差し替えます ---- */
let handlers = []
const calls = []
const res = (body, status = 200, headers = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) return res(redis(JSON.parse(init.body || '[]')))
  calls.push({ url: u, init })
  for (const [match, fn] of handlers) if (u.includes(match)) return fn(u, init)
  throw new Error(`test tried to reach the network: ${u}`)
}
const on = (list) => { handlers = list; calls.length = 0 }

let passed = 0
async function t(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) {
    console.error(`✗ ${name}\n  ${e && e.stack}`)
    process.exitCode = 1
  }
}
const KEYH = { Authorization: `Bearer ${process.env.ADMIN_KEY}`, 'content-type': 'application/json' }
let ipN = 0
const req = (path, method = 'GET', body, headers = KEYH) => new Request(`https://example.com/api/${path}`, {
  method, headers: { ...headers, 'x-forwarded-for': `198.51.100.${++ipN}` }, body: body === undefined ? undefined : JSON.stringify(body),
})

/* ==== 1. ログインは ADMIN_KEY だけで通る ==== */
await t('admin-ping: 正しいキーで 200、違うキーで 401（Resend 未設定でも）', async () => {
  delete process.env.RESEND_API_KEY
  on([])
  const { GET } = await import('../api/admin-ping.js')
  assert.equal((await GET(req('admin-ping'))).status, 200)
  assert.equal((await GET(req('admin-ping', 'GET', undefined, { Authorization: 'Bearer nope' }))).status, 401)
  assert.equal(calls.length, 0, 'ログインで外部サービスを呼ばない')
})

/* ==== 2. 設定状況のテスト ==== */
await t('settings-test: 送信元が試用アドレスなら赤い警告と DNS の手順', async () => {
  process.env.RESEND_API_KEY = 're_test'
  on([['api.resend.com/emails', () => res({ id: 'e1' })]])
  const { runTest } = await import('../api/settings-test.js')
  const r = await runTest('resend', null)
  assert.equal(r.state, 'error')
  assert.ok(r.items.some((i) => i.state === 'ok' && /テストメール/.test(i.text)))
  assert.ok(r.items.some((i) => i.state === 'error' && /onboarding@resend\.dev/.test(i.text) && /DNS/.test(i.text)))
  // 宛先は管理者だけ
  const sent = JSON.parse(calls[0].init.body)
  assert.equal(sent.to.length, 1)
})

await t('送信元アドレスの読み方（名前つき・大文字・試用アドレス）', async () => {
  const { senderInfo } = await import('../api/_sender.js')
  assert.deepEqual(senderInfo('社 <info@Shop.co.jp>'), { address: 'info@Shop.co.jp', domain: 'shop.co.jp', sandbox: false })
  assert.equal(senderInfo('a <onboarding@resend.dev>').sandbox, true)
})

await t('settings-test: GitHub の権限を書き込まずに判定', async () => {
  process.env.GITHUB_TOKEN = 'ghp_x'
  const { runTest } = await import('../api/settings-test.js')
  on([['api.github.com/repos/', () => res({ permissions: { push: true } }, 200, { 'x-oauth-scopes': 'repo, workflow' })]])
  assert.equal((await runTest('github', null)).state, 'ok')
  assert.ok(calls.every((c) => !c.init.method || c.init.method === 'GET'), 'GET だけ')
  on([['api.github.com/repos/', () => res({ permissions: { push: false } })]])
  assert.match((await runTest('github', null)).message, /書き込みの権限がありません/)
  on([['api.github.com/repos/', () => res({}, 200, { 'x-oauth-scopes': 'read:user' })]])
  assert.match((await runTest('github', null)).message, /repo/)
  on([['api.github.com/repos/', () => res({ message: 'Bad credentials' }, 401)]])
  assert.match((await runTest('github', null)).message, /有効期限/)
})

await t('settings-test: Anthropic・Upstash・Google の判定', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x'
  const { runTest } = await import('../api/settings-test.js')
  on([['api.anthropic.com/v1/models', () => res({ data: [] })]])
  assert.equal((await runTest('ai', null)).state, 'ok')
  on([['api.anthropic.com/v1/models', () => res({}, 401)]])
  assert.equal((await runTest('ai', null)).state, 'error')
  on([])
  assert.equal((await runTest('store', null)).state, 'ok')
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r-foundation-1' })
  on([['oauth2.googleapis.com', () => res({ error: 'invalid_grant' }, 400)]])
  const g = await runTest('google', null)
  assert.equal(g.state, 'error')
  assert.match(g.message, /接続し直/)
})

await t('settings-test: メールのテストは1時間3回まで', async () => {
  on([['api.resend.com', () => res({ id: 'e' })]])
  const { POST } = await import('../api/settings-test.js')
  const codes = []
  for (let i = 0; i < 4; i++) codes.push((await POST(req('settings-test', 'POST', { target: 'resend' }))).status)
  assert.deepEqual(codes, [200, 200, 200, 429])
})

await t('health: ボタンを押さなくても試用の送信元を警告', async () => {
  on([])
  const { GET } = await import('../api/health.js')
  const d = await (await GET(req('health'))).json()
  const row = d.checks.find((c) => c.id === 'sender')
  assert.ok(row && row.state === 'warn' && /お客様/.test(row.note))
})

console.log(`test-foundation: ${passed} passed`)
