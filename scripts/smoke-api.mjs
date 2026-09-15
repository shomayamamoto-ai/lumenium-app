// Call every endpoint once, authorised, with nothing real on the other end.
//
// This exists because two endpoints were broken in production and nothing
// said so. Factoring the auth check into one guard deleted each endpoint's
// local `url` and `submitted`; two of them still referenced those, so every
// authorised request threw a ReferenceError and Vercel answered 500. The
// tests written at the time only exercised the refusal path — wrong key,
// lockout, content type — which returns before reaching any of it.
//
// So the assertion here is deliberately shallow and deliberately on the happy
// path: with a valid key, does the handler come back at all? A 503 for a
// missing integration is a pass — that is the endpoint working. A thrown
// exception, or a 500, is not.
//
// Every outbound call is stubbed, so this is offline and deterministic. It
// runs in prebuild: a deploy that would 500 fails here instead.
//
// Not covered: POST /api/aio and /api/advisor. Reaching their bodies means a
// real model call, and a build step should not spend money. Their GET and
// their refusal paths are here; the rest is covered by the AIO tests.

const REDIS = 'https://redis.smoke.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'smoke-admin-key',
  RESEND_API_KEY: 'smoke',
  RESEND_AUDIENCE_ID: 'aud_smoke',
  CONTACT_TO_EMAIL: 'smoke@example.com',
  MEMBER_CODE: 'SMOKE',
  SESSION_SECRET: 'smoke-secret',
  GITHUB_TOKEN: 'smoke-token',
  GITHUB_REPO: 'smoke/smoke',
  UPSTASH_REDIS_REST_URL: REDIS,
  UPSTASH_REDIS_REST_TOKEN: 'smoke',
})

const store = new Map()
const hashes = new Map()

function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    if (op === 'GET') return { result: store.get(k) ?? null }
    if (op === 'SET') { store.set(k, c[2]); return { result: 'OK' } }
    if (op === 'DEL') { store.delete(k); hashes.delete(k); return { result: 1 } }
    if (op === 'INCR') { const v = (Number(store.get(k)) || 0) + 1; store.set(k, String(v)); return { result: v } }
    if (op === 'HSET') { const h = hashes.get(k) || new Map(); h.set(String(c[2]), String(c[3])); hashes.set(k, h); return { result: 1 } }
    if (op === 'HGET') { const h = hashes.get(k); return { result: h?.get(String(c[2])) ?? null } }
    if (op === 'HGETALL') { const h = hashes.get(k); return { result: h ? [...h].flat() : [] } }
    if (op === 'LRANGE') return { result: [] }
    return { result: null }
  })
}

const ok = (body, type = 'application/json') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200, headers: { 'content-type': type },
  })

globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) return ok(redis(JSON.parse(init.body || '[]')))
  if (u.includes('api.resend.com')) {
    if (u.includes('/contacts')) {
      return ok({ data: [{ email: 'a@example.com', first_name: 'ス', last_name: '', unsubscribed: false, created_at: '2026-01-01T00:00:00Z' }] })
    }
    return ok({ id: 'smoke' })
  }
  if (u.includes('api.github.com')) return ok({ sha: 'deadbeef', content: '', commit: { sha: 'deadbeef' } })
  throw new Error(`smoke test tried to reach the network: ${u}`)
}

const KEY = { Authorization: 'Bearer smoke-admin-key' }
const JSONH = { ...KEY, 'content-type': 'application/json' }

// A real signed session, so the members-only pages are exercised on the path a
// logged-in member takes and not only on the redirect.
const { issueSession } = await import(new URL('../api/_session.js', import.meta.url))
const MEMBER = { cookie: `lum_session=${(await issueSession(false)).token}` }

// One authorised call per endpoint. Bodies are the smallest thing the handler
// will accept — the point is to reach the end of the function, not to test it.
const CALLS = [
  ['health', 'GET', '', KEY],
  ['members-list', 'GET', '', KEY],
  ['members-view', 'GET', '?key=smoke-admin-key', {}],
  ['members-xlsx', 'GET', '?key=smoke-admin-key', {}],
  ['analytics', 'GET', '?days=30', KEY],
  ['share-links', 'GET', '', KEY],
  ['share-links', 'POST', '', JSONH, { action: 'create', label: 'smoke', days: 7 }],
  ['aio', 'GET', '', KEY],
  // The committed-state reads behind the two editors.
  ['news-post', 'GET', '', KEY],
  ['content-save', 'GET', '', KEY],
  // Members-only pages. Called without a session, so what is exercised is the
  // redirect — which is the path every logged-out visitor takes, and the one
  // that must not throw. (api/og.jsx is left out: it is JSX and needs the
  // build's transform to import at all.)
  ['members-game', 'GET', '', {}],
  ['members-puzzle', 'GET', '', {}],
  ['members-game', 'GET', '', MEMBER],
  ['members-puzzle', 'GET', '', MEMBER],
  // These two write through GitHub, which is stubbed above — nothing leaves
  // the process. They are called with a body that passes validation, because a
  // 400 would stop short of the part that was broken elsewhere.
  ['news-post', 'POST', '', JSONH, { action: 'add', title: 'スモークテスト', body: '', link: '' }],
  ['content-save', 'POST', '', JSONH, { changes: { 'text.hero.lead': 'DIGITAL CREATIVE STUDIO · TOKYO' } }],
  ['track', 'POST', '', { 'content-type': 'application/json' }, { e: 'menu_open' }],
  ['contact', 'POST', '', { 'content-type': 'application/json' },
    { name: 'スモーク', email: 'smoke@example.com', message: 'これは自動チェックの送信です。' }],
  ['register', 'POST', '', { 'content-type': 'application/json' },
    { name: 'スモーク', email: 'smoke@example.com', code: 'SMOKE' }],
  ['auth', 'POST', '', { 'content-type': 'application/json' }, { code: 'SMOKE' }],
]

let failed = 0
let n = 0
for (const [name, method, query, headers, body] of CALLS) {
  const label = `${method} /api/${name}`
  // A fresh address each time, so the public endpoints' own rate limits do not
  // turn a later call in the list into a false failure.
  const ip = `203.0.113.${++n}`
  try {
    const mod = await import(new URL(`../api/${name}.js`, import.meta.url))
    const fn = mod[method]
    if (!fn) { console.error(`✗ ${label} — no ${method} export`); failed++; continue }
    const req = new Request(`https://lumenium.net/api/${name}${query}`, {
      method,
      headers: { ...headers, 'x-forwarded-for': ip },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const res = await fn(req)
    if (!(res instanceof Response)) { console.error(`✗ ${label} — returned ${typeof res}, not a Response`); failed++; continue }
    if (res.status >= 500 && res.status !== 503) {
      console.error(`✗ ${label} — ${res.status}: ${(await res.text()).slice(0, 160)}`)
      failed++
      continue
    }
    console.log(`  ${label} → ${res.status}`)
  } catch (e) {
    console.error(`✗ ${label} — threw ${e && e.constructor && e.constructor.name}: ${e && e.message}`)
    failed++
  }
}

if (failed) {
  console.error(`\n${failed} 件のエンドポイントが認証後に失敗します。デプロイすると 500 になります。`)
  process.exit(1)
}
console.log(`\n${CALLS.length} 件すべて応答しました。`)
