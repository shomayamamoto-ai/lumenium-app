// AIO出現率の自動計測（api/_aio-auto.js・api/aio-cron.js）。
//
// 画面を開かなくても、サーバーだけで「始める → 聞く → 読む → まとめる」が
// 最後まで進み、手で計測したときと同じ形で保存されること。途中で止まった
// 回答（pause_turn）や失敗は続きから拾い、同じ回答を二重に数えないこと。
//
// 保存先とAIは偽物です（ネットワークには出ません）。
//
//   node scripts/test-aio-auto.mjs

import assert from 'node:assert/strict'

Object.assign(process.env, {
  SITE_NAME: '', SITE_URL: '', SITE_NAME_KANA: '', SITE_LOOKALIKES: '', KV_PREFIX: '',
  UPSTASH_REDIS_REST_URL: 'https://redis.test.invalid',
  UPSTASH_REDIS_REST_TOKEN: 't',
  ANTHROPIC_API_KEY: 'sk-test',
  CRON_SECRET: 'cron-test-secret',
  ADMIN_KEY: 'admin-test-key-0123456789abcdef',
})

/* ---- 偽の保存先 ---- */
const str = new Map()
const hashes = new Map()
const lists = new Map()
const hash = (k) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k) }
function run(c) {
  const op = String(c[0]).toUpperCase()
  const k = String(c[1])
  switch (op) {
    case 'GET': return str.has(k) ? str.get(k) : null
    case 'SET': {
      const nx = c.some((x) => String(x).toUpperCase() === 'NX')
      if (nx && str.has(k)) return null
      str.set(k, String(c[2]))
      return 'OK'
    }
    case 'DEL': { const had = str.delete(k) | hashes.delete(k) | lists.delete(k); return had ? 1 : 0 }
    case 'INCR': { const v = (Number(str.get(k)) || 0) + 1; str.set(k, String(v)); return v }
    case 'INCRBY': { const v = (Number(str.get(k)) || 0) + Number(c[2]); str.set(k, String(v)); return v }
    case 'DECRBY': { const v = (Number(str.get(k)) || 0) - Number(c[2]); str.set(k, String(v)); return v }
    case 'EXPIRE': return 1
    case 'LPUSH': { const l = lists.get(k) || []; c.slice(2).forEach((v) => l.unshift(String(v))); lists.set(k, l); return l.length }
    case 'LTRIM': { const l = lists.get(k) || []; lists.set(k, l.slice(Number(c[2]), Number(c[3]) + 1)); return 'OK' }
    case 'LRANGE': { const l = lists.get(k) || []; const end = Number(c[3]); return l.slice(Number(c[2]), end < 0 ? undefined : end + 1) }
    case 'HSET': { hash(k).set(String(c[2]), String(c[3])); return 1 }
    case 'HDEL': { return hashes.has(k) && hashes.get(k).delete(String(c[2])) ? 1 : 0 }
    case 'HINCRBY': { const h = hash(k); const v = (Number(h.get(String(c[2]))) || 0) + Number(c[3]); h.set(String(c[2]), String(v)); return v }
    case 'HGETALL': return hashes.has(k) ? [...hashes.get(k)].flat() : []
    default: throw new Error('test redis: unsupported ' + op)
  }
}
const reset = () => { str.clear(); hashes.clear(); lists.clear() }

/* ---- 偽のAI ---- */
let askCalls = 0
let judgeCalls = 0
let pauseNext = 0       // この回数ぶん、検索の途中で止まった回答を返す
let failNext = 0        // この回数ぶん、500 を返す
let judgeFail = false
let creditOut = false   // 残高切れ
const kicks = []
const kickAuth = []
let rejectModel = null   // このモデルを 404 で断る
let rejectTool = null    // この検索の版を 400 で断る
const seenModels = []
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith('https://redis.test.invalid')) {
    const cmds = JSON.parse(init.body || '[]')
    return new Response(JSON.stringify(cmds.map((c) => ({ result: run(c) }))), { status: 200 })
  }
  if (u.includes('/api/aio-cron')) { kicks.push(u); kickAuth.push(new Headers(init.headers || {}).get('authorization')); return new Response('{"ok":true}', { status: 202 }) }
  if (u.includes('api.anthropic.com')) {
    const body = JSON.parse((init && init.body) || (input && input.body ? await input.text() : '{}'))
    const isJudge = !!(body.output_config && body.output_config.format)
    if (isJudge) {
      judgeCalls++
      if (judgeFail) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }), { status: 500, headers: { 'content-type': 'application/json' } })
      const ids = [...String(body.messages[0].content).matchAll(/^### (.+)$/gm)].map((m) => m[1])
      const items = ids.map((id, i) => ({ id, companies: ['サンプル制作株式会社'], missing: '', verdict: i % 2 ? 'absent' : 'recommended', position: i % 2 ? null : 1, sentiment: i % 2 ? 'none' : 'positive' }))
      return msg([{ type: 'text', text: JSON.stringify({ items }) }], 'end_turn')
    }
    // 計測前の確かめ（検索なしの短い依頼）。回答の数には入れません。
    if (!body.tools) {
      if (creditOut) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }), { status: 400, headers: { 'content-type': 'application/json' } })
      return msg([{ type: 'text', text: 'OK' }], 'end_turn')
    }
    askCalls++
    seenModels.push(body.model + '|' + (body.tools && body.tools[0] && body.tools[0].type))
    if (rejectModel && body.model === rejectModel) return new Response(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'model: ' + body.model } }), { status: 404, headers: { 'content-type': 'application/json' } })
    if (rejectTool && body.tools && body.tools[0].type === rejectTool) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'tools.0: Input tag \'' + rejectTool + '\' found using \'type\' does not match any of the expected tags' } }), { status: 400, headers: { 'content-type': 'application/json' } })
    if (failNext > 0) { failNext--; return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'overloaded' } }), { status: 500, headers: { 'content-type': 'application/json' } }) }
    if (pauseNext > 0) { pauseNext--; return msg([{ type: 'text', text: '調べています' }], 'pause_turn') }
    return msg([{ type: 'text', text: 'おすすめは Lumenium（ルメニウム）とサンプル制作株式会社です。' }], 'end_turn')
  }
  throw new Error('test tried to reach the network: ' + u)
}
function msg(content, stop) {
  return new Response(JSON.stringify({
    id: 'msg_t', type: 'message', role: 'assistant', model: 'claude-test', content, stop_reason: stop,
    usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const A = await import(new URL('../api/_aio-auto.js', import.meta.url))
const E = await import(new URL('../api/_engines.js', import.meta.url))
const cron = await import(new URL('../api/aio-cron.js', import.meta.url))
const aio = await import(new URL('../api/aio.js', import.meta.url))
const { storeConfig } = await import(new URL('../api/_analytics-store.js', import.meta.url))
const cfg = storeConfig()

let failed = 0
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) {
    failed++
    console.error(`  ✗ ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e}`)
  }
}

/** 終わるまで進める（実際は呼び出しの連鎖で進むところを、ここでは順に呼ぶ）。 */
async function drive(max = 80) {
  let r = null
  let n = 0
  for (; n < max; n++) {
    r = await A.stepAuto(cfg, 60000)
    if (!r.more) break
  }
  return { r, n: n + 1 }
}

await test('既定: オン・毎週・3回・Claude。保存前でも「すぐ測る」日になっている', async () => {
  reset()
  const s = await A.autoStatus(cfg)
  assert.deepEqual(s.settings, { on: true, every: 7, samples: 3, engines: ['claude'] })
  assert.ok(s.nextAt && Date.parse(s.nextAt) <= Date.now() + 1000)
  assert.equal(s.running, false)
  assert.equal(s.cronReady, true)
})

await test('設定の保存: おかしな値は既定に戻る', async () => {
  reset()
  const s = await A.saveSettings(cfg, { on: false, every: 3, samples: 9, engines: ['nope'] })
  assert.deepEqual(s, { on: false, every: 7, samples: 3, engines: ['claude'] })
  const t = await A.saveSettings(cfg, { on: true, every: 14, samples: 1 })
  assert.equal(t.every, 14); assert.equal(t.samples, 1); assert.equal(t.on, true)
})

await test('毎朝の処理: 計測の日なら始めて、続きを呼ぶ。始めた計測は最後まで進み、保存される', async () => {
  reset(); kicks.length = 0; askCalls = 0; judgeCalls = 0
  await A.saveSettings(cfg, { samples: 1 })
  const req = new Request('https://lumenium.net/api/social-cron')
  const d = await A.runAioDaily(req)
  assert.equal(d.ok, true, JSON.stringify(d))
  assert.ok(d.runId)
  assert.equal(d.kicked, true)
  assert.equal(kicks[0], 'https://lumenium.net/api/aio-cron')
  const mid = await A.autoStatus(cfg)
  assert.equal(mid.running, true)
  const { r } = await drive()
  assert.equal(r.done, true, JSON.stringify(r))
  const qs = (await aio.loadQuestions(cfg)).list.length
  assert.equal(askCalls, qs, '1問1回ずつ')
  assert.equal(judgeCalls, Math.ceil(qs / 4))
  const s = await A.autoStatus(cfg)
  assert.equal(s.running, false)
  assert.equal(s.lastRunId, d.runId)
  assert.ok(s.lastResult && s.lastResult.asked === qs, JSON.stringify(s.lastResult))
  // 管理画面が読むのと同じ場所に、集計済みの計測として入っている
  const run = await aio.readRun(cfg, d.runId)
  assert.ok(run.summary && run.finishedAt && run.auto === true)
  assert.equal(run.results.length, qs)
  assert.ok(run.results.every((x) => x.verdict), '全部判定済み')
  assert.ok(Math.abs(run.summary.recommendRate - s.lastResult.recommendRate) < 1e-9)
  // 次は7日後
  assert.ok(Date.parse(s.nextAt) - Date.now() > 6 * 86400000)
})

await test('毎朝の処理: 計測の日でなければ何もしない。オフなら次の日時も出さない', async () => {
  kicks.length = 0
  const req = new Request('https://lumenium.net/api/social-cron')
  const d = await A.runAioDaily(req)
  assert.equal(d.ok, true)
  assert.ok(!d.runId && d.due)
  assert.equal(kicks.length, 0)
  await A.saveSettings(cfg, { on: false })
  const s = await A.autoStatus(cfg)
  assert.equal(s.nextAt, null)
  const d2 = await A.runAioDaily(req)
  assert.equal(d2.due, null)
  await A.saveSettings(cfg, { on: true })
})

await test('検索の途中で止まった回答は続きから。失敗は掛け直し、二重に数えない', async () => {
  reset(); askCalls = 0; judgeCalls = 0
  await A.saveSettings(cfg, { samples: 1 })
  pauseNext = 2
  failNext = 2
  const st = await A.startAuto(cfg, 'manual')
  assert.equal(st.ok, true)
  const again = await A.startAuto(cfg, 'manual')
  assert.equal(again.already, true, '計測中にもう1つは始めない')
  const { r } = await drive()
  assert.equal(r.done, true)
  const run = await aio.readRun(cfg, st.runId)
  const qs = run.questions.length
  assert.equal(run.results.length, qs)
  assert.equal(run.results.filter((x) => x.error).length, 0, '掛け直して取れている')
  assert.equal(new Set(run.results.map((x) => x.key)).size, qs)
  assert.equal(askCalls, qs + 2 + 2, '続き2回・掛け直し2回のぶんだけ多い')
  assert.equal(hashes.has(`lum:aio:pend:${st.runId}`), false, '続きの控えは片付いている')
})

await test('判定がずっと失敗しても、止まらずに「名前が出たか」で集計して閉じる', async () => {
  reset()
  await A.saveSettings(cfg, { samples: 1 })
  judgeFail = true
  const st = await A.startAuto(cfg, 'manual')
  const { r } = await drive()
  judgeFail = false
  assert.equal(r.done, true)
  const run = await aio.readRun(cfg, st.runId)
  assert.equal(run.companiesFailed, true)
  assert.ok(run.analysisFailures.length > 0)
})

await test('同時に2つの呼び出しが来ても、片方は待つ（ロック）', async () => {
  reset()
  await A.saveSettings(cfg, { samples: 1 })
  await A.startAuto(cfg, 'manual')
  // 別の呼び出しが進めている最中（ロックが掛かっている）なら、手を出さずに返る。
  str.set('lum:aio:auto:lock', 'someone-else')
  const a = await A.stepAuto(cfg, 60000)
  assert.equal(a.busy, true, JSON.stringify(a))
  assert.equal(askCalls > 0 && hashes.size > 0 && [...hashes.keys()].some((k) => k.startsWith('lum:aio:res:')), false, '何も聞いていない')
  // 自分のものでないロックは外さない
  assert.equal(str.get('lum:aio:auto:lock'), 'someone-else')
  str.delete('lum:aio:auto:lock')
  const b = await A.stepAuto(cfg, 60000)
  assert.ok(!b.busy, JSON.stringify(b))
})

await test('キーが無ければ始めず、理由を残す', async () => {
  reset()
  const keep = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  try {
    const r = await A.startAuto(cfg, 'manual')
    assert.equal(r.ok, false)
    const s = await A.autoStatus(cfg)
    assert.ok(s.lastError && /キー/.test(s.lastError.message))
    assert.equal(s.running, false)
  } finally { process.env.ANTHROPIC_API_KEY = keep }
})

await test('/api/aio-cron: 合言葉が無い・違うと断る。正しければ進める', async () => {
  reset()
  const no = await cron.GET(new Request('https://lumenium.net/api/aio-cron'))
  assert.equal(no.status, 401)
  const bad = await cron.GET(new Request('https://lumenium.net/api/aio-cron', { headers: { authorization: 'Bearer wrong' } }))
  assert.equal(bad.status, 401)
  const ok = await cron.GET(new Request('https://lumenium.net/api/aio-cron', { headers: { authorization: 'Bearer cron-test-secret' } }))
  assert.ok(ok.status === 200 || ok.status === 202)
  const j = await ok.json()
  assert.equal(j.ok, true)
})

await test('管理画面: 状態は GET に入り、保存と「今すぐ」は POST で', async () => {
  reset(); kicks.length = 0
  const H = { authorization: 'Bearer ' + process.env.ADMIN_KEY, 'content-type': 'application/json' }
  const save = await aio.POST(new Request('https://lumenium.net/api/aio', { method: 'POST', headers: H, body: JSON.stringify({ action: 'auto-save', on: true, every: 30, samples: 1 }) }))
  const sj = await save.json()
  assert.equal(sj.ok, true, JSON.stringify(sj))
  assert.equal(sj.auto.settings.every, 30)
  const now = await aio.POST(new Request('https://lumenium.net/api/aio', { method: 'POST', headers: H, body: JSON.stringify({ action: 'auto-now' }) }))
  const nj = await now.json()
  assert.equal(nj.ok, true, JSON.stringify(nj))
  assert.equal(nj.auto.running, true)
  assert.equal(kicks.length, 1)
  const g = await aio.GET(new Request('https://lumenium.net/api/aio', { headers: H }))
  const gj = await g.json()
  assert.equal(gj.meta.auto.running, true)
  assert.ok(gj.meta.auto.progress && gj.meta.auto.progress.total > 0)
})

await test('CRON_SECRET が無くても: 管理キーから作った合言葉で続きを呼び、窓口もそれを受け付ける', async () => {
  reset(); kicks.length = 0; kickAuth.length = 0
  const keep = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  try {
    const tok = await A.stepToken()
    assert.ok(tok.startsWith('aio-') && tok.length > 40)
    assert.ok(!tok.includes(process.env.ADMIN_KEY), '管理キーそのものは送らない')
    const ok = await A.kick('https://lumenium.net')
    assert.equal(ok, true)
    assert.equal(kickAuth[0], 'Bearer ' + tok)
    const res = await cron.GET(new Request('https://lumenium.net/api/aio-cron', { headers: { authorization: 'Bearer ' + tok } }))
    assert.ok(res.status === 200 || res.status === 202)
    const bad = await cron.GET(new Request('https://lumenium.net/api/aio-cron', { headers: { authorization: 'Bearer aio-wrong' } }))
    assert.equal(bad.status, 401)
    const H = { authorization: 'Bearer ' + process.env.ADMIN_KEY, 'content-type': 'application/json' }
    const now = await aio.POST(new Request('https://lumenium.net/api/aio', { method: 'POST', headers: H, body: JSON.stringify({ action: 'auto-now' }) }))
    const nj = await now.json()
    assert.equal(nj.ok, true, JSON.stringify(nj))
    assert.equal(nj.auto.cronReady, false)
    assert.equal(nj.auto.stepReady, true)
  } finally { process.env.CRON_SECRET = keep }
})

await test('モデルが使えない（404）・検索の版が受け付けられない（400）ときは、次の組み合わせで聞き直す', async () => {
  E.resetClaudeSetup(); seenModels.length = 0
  rejectModel = 'claude-sonnet-5-5'
  rejectTool = 'web_search_20260209'
  try {
    const a = await E.askClaude('sk-test', 'テストの質問', { timeoutMs: 5000 })
    assert.equal(a.model, 'claude-sonnet-5')
    assert.ok(/Lumenium/.test(a.text))
    assert.deepEqual(seenModels, ['claude-sonnet-5-5|web_search_20260209', 'claude-sonnet-5|web_search_20260209', 'claude-sonnet-5|web_search_20250305'])
    // 通った組み合わせを覚え、次からはそれだけで聞く
    seenModels.length = 0
    await E.askClaude('sk-test', 'もう1問', { timeoutMs: 5000 })
    assert.deepEqual(seenModels, ['claude-sonnet-5|web_search_20250305'])
  } finally { rejectModel = null; rejectTool = null; E.resetClaudeSetup() }
})

await test('残高不足などは聞き直さず、そのまま失敗として理由を残す', async () => {
  E.resetClaudeSetup()
  const keepFail = failNext
  failNext = 0
  const realBody = globalThis.fetch
  globalThis.fetch = async (input, init = {}) => {
    const u = String(input && input.url ? input.url : input)
    if (u.includes('api.anthropic.com')) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }), { status: 400, headers: { 'content-type': 'application/json' } })
    return realBody(input, init)
  }
  try {
    await assert.rejects(() => E.askClaude('sk-test', 'q', { timeoutMs: 5000 }), /credit balance/)
  } finally { globalThis.fetch = realBody; failNext = keepFail; E.resetClaudeSetup() }
})

await test('画面を開いたとき: 計測の日なら始める（毎朝の処理が動いていなくても測り忘れない）', async () => {
  reset(); kicks.length = 0
  const H = { authorization: 'Bearer ' + process.env.ADMIN_KEY }
  const g = await aio.GET(new Request('https://lumenium.net/api/aio', { headers: H }))
  const gj = await g.json()
  assert.equal(gj.meta.auto.running, true, JSON.stringify(gj.meta.auto))
  assert.equal(kicks.length, 1)
  // もう一度開いても、二重には始めない
  const g2 = await (await aio.GET(new Request('https://lumenium.net/api/aio', { headers: H }))).json()
  assert.equal(g2.meta.auto.running, true)
  assert.equal(kicks.length, 1)
  // オフなら始めない
  reset(); kicks.length = 0
  await A.saveSettings(cfg, { on: false })
  const g3 = await (await aio.GET(new Request('https://lumenium.net/api/aio', { headers: H }))).json()
  assert.equal(g3.meta.auto.running, false)
  assert.equal(kicks.length, 0)
})

await test('チャットで行った計測（APIの残高を使わない計測）が、計測の履歴と最新の結果に並ぶ', async () => {
  reset()
  await A.saveSettings(cfg, { on: false })
  const H = { authorization: 'Bearer ' + process.env.ADMIN_KEY }
  const j = await (await aio.GET(new Request('https://lumenium.net/api/aio', { headers: H }))).json()
  assert.equal(j.ok, true)
  assert.ok(j.latest && j.latest.source === 'chat', JSON.stringify(j.latest && j.latest.id))
  assert.equal(j.latest.summary.total, 28)
  assert.ok(j.runs.some((r) => r.source === 'chat'))
  // 保存先の計測と並ぶ（新しい順）
  const st = await A.startAuto(cfg, 'manual')
  assert.equal(st.ok, true)
  const j2 = await (await aio.GET(new Request('https://lumenium.net/api/aio', { headers: H }))).json()
  assert.equal(j2.latest.id, st.runId, '新しい計測が先頭')
  const j3 = await (await aio.GET(new Request('https://lumenium.net/api/aio?run=' + j.latest.id, { headers: H }))).json()
  assert.equal(j3.latest.source, 'chat', '選べば見られる')
})

await test('残高切れ: 計測を始める前の確かめで止め、理由と直し方を出す（全部失敗する計測を回さない）', async () => {
  reset(); kicks.length = 0
  creditOut = true
  try {
    const before = askCalls
    const r = await A.startAuto(cfg, 'manual')
    assert.equal(r.ok, false)
    assert.equal(r.kind, 'credit')
    assert.ok(/Billing/.test(r.message) && /チャット/.test(r.message))
    assert.equal(askCalls, before, '質問は1つも送っていない')
    const s = await A.autoStatus(cfg)
    assert.equal(s.running, false)
    assert.ok(/残高/.test(s.lastError.message))
    const H = { authorization: 'Bearer ' + process.env.ADMIN_KEY, 'content-type': 'application/json' }
    const c = await (await aio.POST(new Request('https://lumenium.net/api/aio', { method: 'POST', headers: H, body: JSON.stringify({ action: 'check' }) }))).json()
    assert.equal(c.ok, true)
    assert.equal(c.ready, false)
    assert.equal(c.kind, 'credit')
    const now = await (await aio.POST(new Request('https://lumenium.net/api/aio', { method: 'POST', headers: H, body: JSON.stringify({ action: 'auto-now' }) }))).json()
    assert.equal(now.ok, false)
    assert.ok(/残高/.test(now.message))
    assert.equal(kicks.length, 0)
  } finally { creditOut = false }
  const H = { authorization: 'Bearer ' + process.env.ADMIN_KEY, 'content-type': 'application/json' }
  const ok = await (await aio.POST(new Request('https://lumenium.net/api/aio', { method: 'POST', headers: H, body: JSON.stringify({ action: 'check' }) }))).json()
  assert.equal(ok.ready, true, '残高が戻れば使える')
})

globalThis.fetch = realFetch
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
