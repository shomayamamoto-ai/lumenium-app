// 管理画面の土台まわりの確認（ログイン・設定状況のテスト・設定の暗号化・
// AIアドバイザー・会員登録・お知らせ・反映状況）。
//
// 外へ出る通信はすべてこの中の fetch が受け止めるので、オフラインで決まった
// 結果になります。prebuild で走り、壊れていればビルドが止まります。

import assert from 'node:assert/strict'

const REDIS = 'https://redis.foundation.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'foundation-admin-key-0123456789',
  // 別の会社のサイトに載せた状態で確かめます（AIアドバイザーに元の会社の
  // 名前が残っていないか、を見るため）。
  SITE_NAME: 'Sample', SITE_NAME_KANA: 'サンプル', SITE_URL: 'https://sample.example',
  OWNER_EMAIL: 'owner@sample.example', GITHUB_REPO: 'sample/site',
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

/* ==== 3. 保存した設定の暗号化 ==== */
await t('settings: 保存は暗号化・読むと元どおり・古い平文も読める・鍵を変えると未設定', async () => {
  on([])
  const S = await import('../api/_settings.js')
  const r = await S.saveSetting('CONTACT_TO_EMAIL', 'owner@shop.example', null)
  assert.equal(r.ok, true)
  const raw = [...store].find(([k]) => k.endsWith('cfg:CONTACT_TO_EMAIL'))[1]
  assert.ok(raw.startsWith('enc1:') && !raw.includes('owner@shop'), '平文で保存しない')
  assert.equal(await S.openValue(raw), 'owner@shop.example')
  assert.equal(await S.openValue('legacy-plain'), 'legacy-plain', '暗号化前の値はそのまま')
  // 古い平文の値は、次に保存した時点で暗号化に置き換わる
  const k = [...store.keys()].find((x) => x.endsWith('cfg:CONTACT_TO_EMAIL')).replace('CONTACT_TO_EMAIL', 'MEMBER_CODE')
  store.set(k, 'PLAIN-CODE')
  await S.saveSetting('MEMBER_CODE', 'NEW-CODE', null)
  assert.ok(store.get(k).startsWith('enc1:'))
  assert.equal(await S.setting('MEMBER_CODE', '', null), 'NEW-CODE')
  const old = process.env.ADMIN_KEY
  process.env.ADMIN_KEY = 'rotated-admin-key-0123456789'
  assert.equal(await S.openValue(raw), '', '管理キーを変えたら読めない（未設定に戻る）')
  process.env.ADMIN_KEY = old
})

/* ==== 4. AIアドバイザー ==== */
await t('advisor: 社名を差し替えると、元の会社の名前・代表者・ドメインが指示文に残らない', async () => {
  const { systemPrompt, pagesFromList } = await import('../api/advisor.js')
  const p = systemPrompt({ analytics: null, aio: null, social: null, crawl: null, pages: ['/menu.html'] })
  assert.equal((p.match(/lumenium|ルメニウム|山本|捷真/gi) || []).length, 0, 'vendor literal left in prompt')
  assert.ok(p.includes('sample.example') && p.includes('/menu.html'))
  assert.deepEqual(pagesFromList('https://sample.example/\nhttps://sample.example/a.html\nhttps://other.example/x', 'https://sample.example'), ['/', '/a.html'])
  assert.deepEqual(pagesFromList('/menu.html メニュー, /access.html アクセス', 'https://sample.example'), ['/menu.html メニュー', '/access.html アクセス'])
})

await t('料金の目安: トークン数から円を出す・月に記録・上限の読み方', async () => {
  const P = await import('../api/_ai-pricing.js')
  // 入力100万 = $5、出力10万 = $2.5、キャッシュ読み100万 = $0.5、検索10回 = $0.1 → $8.1
  const c = P.estimateCost('claude-opus-5', { in: 1e6, out: 1e5, cr: 1e6, ws: 10 })
  assert.equal(Math.round(c.usd * 100), 810)
  assert.equal(c.yen, Math.round(8.1 * P.YEN_PER_USD))
  await P.recordUsage('advisor', { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, server_tool_use: { web_search_requests: 2 } })
  await P.recordUsage('advisor', { input_tokens: 1000, output_tokens: 200 })
  const m = await P.monthUsage('advisor', 'claude-opus-5')
  assert.equal(m.usage.calls, 2)
  assert.equal(m.usage.in, 2000)
  assert.equal(m.usage.ws, 2)
  assert.equal(P.monthlyCap(''), 3000)
  assert.equal(P.monthlyCap('5,000円'), 5000)
  assert.equal(P.monthlyCap('abc'), 3000)
})

await t('advisor: 今月の目安が上限に達したら 429（AIを呼ばない）', async () => {
  const P = await import('../api/_ai-pricing.js')
  // 上限 3000円 ≒ $20。出力100万トークン = $25 で超える
  await P.recordUsage('advisor', { output_tokens: 1e6 })
  on([])
  const { POST } = await import('../api/advisor.js')
  const r = await POST(req('advisor', 'POST', { messages: [{ role: 'user', content: '次に何をすべき？' }] }))
  assert.equal(r.status, 429)
  assert.match((await r.json()).message, /上限/)
  assert.equal(calls.filter((c) => c.url.includes('anthropic')).length, 0)
})

console.log(`test-foundation: ${passed} passed`)
