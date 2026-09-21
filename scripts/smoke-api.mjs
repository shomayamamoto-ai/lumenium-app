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
  ANTHROPIC_API_KEY: 'sk-ant-smoke',
  RESEND_AUDIENCE_ID: 'aud_smoke',
  CONTACT_TO_EMAIL: 'smoke@example.com',
  MEMBER_CODE: 'SMOKE',
  SESSION_SECRET: 'smoke-secret',
  GITHUB_TOKEN: 'smoke-token',
  GITHUB_REPO: 'smoke/smoke',
  // 商談の自動予約。接続済みのつもりで呼ぶ（枠の計算と同意画面URLの組み立て
  // まで通すため）。実際の Google へは出ない — 上の fetch が受け止める。
  GOOGLE_CLIENT_ID: 'smoke.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'smoke',
  GOOGLE_REFRESH_TOKEN: 'smoke',
  UPSTASH_REDIS_REST_URL: REDIS,
  UPSTASH_REDIS_REST_TOKEN: 'smoke',
  // The five networks, so POST /api/social is exercised on the path where it
  // actually sends rather than on the "not configured" refusal.
  X_ACCESS_TOKEN: 'smoke',
  FB_PAGE_ID: '1', FB_PAGE_TOKEN: 'smoke',
  IG_USER_ID: '2', IG_TOKEN: 'smoke',
  THREADS_USER_ID: '3', THREADS_TOKEN: 'smoke',
  LI_AUTHOR_URN: 'urn:li:person:smoke', LI_TOKEN: 'smoke',
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
  if (u.includes('api.anthropic.com')) {
    return ok({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'スモークテストの回答です。' }], usage: { input_tokens: 1, output_tokens: 1 } })
  }
  if (u.includes('oauth2.googleapis.com')) return ok({ access_token: 'at', expires_in: 3600 })
  if (u.includes('googleapis.com/calendar')) return ok({ calendars: { primary: { busy: [] } } })
  if (u.includes('api.github.com')) return ok({ sha: 'deadbeef', content: '', commit: { sha: 'deadbeef' } })
  // The site reading itself, for /api/site-audit: a sitemap with one page in
  // it, and a page with enough in it to be checked. Without these the audit
  // would be exercised only on its error path, which is the half that was
  // already working.
  if (u.includes('/sitemap-urls.txt')) return ok('https://lumenium.net/\nhttps://lumenium.net/about.html', 'text/plain')
  if (u.includes('api.indexnow.org')) return ok({}, 'application/json')
  if (u.includes('/sitemap.xml')) {
    return ok('<urlset><url><loc>https://lumenium.net/about.html</loc></url></urlset>', 'application/xml')
  }
  if (u.includes('lumenium.net/about.html')) {
    return ok('<html><head><title>ルメニウム（Lumenium）とは | 東京の制作会社</title>' +
      '<meta name="description" content="' + 'あ'.repeat(80) + '"></head>' +
      '<body><h1>ルメニウム（Lumenium）とは</h1><p>東京都・3万円〜・お問い合わせから48時間以内。</p>' +
      '<script>fetch("/api/track")</scr' + 'ipt></body></html>', 'text/html')
  }
  // The publishing endpoints. Shapes match what each platform documents, so a
  // handler that reads the wrong field here reads the wrong field in
  // production too.
  if (u.includes('api.twitter.com')) return ok({ data: { id: '1770000000000000000', text: 'smoke' } })
  if (u.includes('graph.facebook.com') || u.includes('graph.threads.net')) {
    if (u.includes('permalink')) return ok({ permalink: 'https://example.invalid/p/smoke' })
    if (u.includes('media_publish') || u.includes('threads_publish')) return ok({ id: 'published_1' })
    return ok({ id: 'container_1', post_id: '1_2' })
  }
  if (u.includes('api.linkedin.com')) return ok({ id: 'urn:li:share:1' })
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
  // 1問だけのお試し。壊れているかどうかを $1.54 払わずに確かめる入口なので、
  // これ自体が壊れていては意味がない。
  ['aio', 'POST', '', JSONH, { action: 'probe', index: 0 }],
  ['site-audit', 'GET', '', KEY],
  // 検索エンジンへの登録まわり。確認ファイルは鍵を持たない相手（Google /
  // Bing のクローラー）が読みに来るので、認証なしで呼ぶ。
  ['verify', 'GET', '', {}],
  ['indexnow', 'GET', '', KEY],
  ['indexnow', 'POST', '', JSONH, {}],
  // 商談の自動予約。GET は訪問者、?recent= は管理者、POST は枠を指定しない
  // 呼び方（= 断られる側）を通す。ここで見たいのは、どの入り方でも 500 を
  // 返さないこと。
  ['booking', 'GET', '', {}],
  ['booking', 'GET', '?recent=1', KEY],
  ['booking', 'POST', '', { 'content-type': 'application/json' },
    { key: '2099-01-01T01:00:00.000Z', name: 'スモーク', email: 'smoke@example.com', message: 'テスト' }],
  ['google-oauth', 'GET', '?start=1', KEY],
  ['google-oauth', 'GET', '', {}],
  // Served to crawlers, so they are called the way a crawler calls them: no
  // key, and a user-agent that gets recorded.
  ['robots', 'GET', '', { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2)' }],
  ['llms', 'GET', '', { 'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)' }],
  ['social', 'GET', '', KEY],
  ['social', 'POST', '', JSONH,
    { text: 'スモークテストの投稿です。', link: 'https://lumenium.net/',
      imageUrl: 'https://lumenium.net/ogp.png',
      targets: ['x', 'facebook', 'instagram', 'threads', 'linkedin'] }],
  // The committed-state reads behind the two editors.
  ['settings', 'GET', '', KEY],
  ['settings', 'POST', '', JSONH, { name: 'CONTACT_TO_EMAIL', value: 'smoke@example.com' }],
  ['news-post', 'GET', '', KEY],
  ['content-save', 'GET', '', KEY],
  // Members-only pages. Called without a session, so what is exercised is the
  // redirect — which is the path every logged-out visitor takes, and the one
  // that must not throw. (api/og.jsx is left out: it is JSX and needs the
  // build's transform to import at all.)
  ['members-game', 'GET', '', {}],
  ['members-puzzle', 'GET', '', {}],
  ['members-territory', 'GET', '', {}],
  ['members-game', 'GET', '', MEMBER],
  ['members-puzzle', 'GET', '', MEMBER],
  ['members-territory', 'GET', '', MEMBER],
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

// The other half of the key panel: with no store, a key has to be storable in
// the admin's own browser, and the ones a visitor's request reads have to
// refuse rather than appear to save. Both paths are one endpoint, so a change
// to either can break the other silently.
{
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  try {
    const mod = await import(new URL('../api/settings.js', import.meta.url))
    const call = (body) => mod.POST(new Request('https://lumenium.net/api/settings', {
      method: 'POST',
      headers: { ...JSONH, 'x-forwarded-for': '203.0.113.200' },
      body: JSON.stringify(body),
    }))
    const kept = await call({ name: 'ANTHROPIC_API_KEY', value: 'sk-ant-smoke-1234' })
    const cookie = kept.headers.get('set-cookie') || ''
    if (kept.status !== 200 || !cookie.includes('lum_k_ANTHROPIC_API_KEY=')) {
      console.error(`✗ 保存先なしでの端末保存 — ${kept.status} / cookie=${cookie.slice(0, 40)}`)
      failed++
    } else {
      // …and it has to come back on the next request.
      const { setting } = await import(new URL('../api/_settings.js', import.meta.url))
      const back = new Request('https://lumenium.net/api/aio', { headers: { cookie: cookie.split(';')[0] } })
      const got = await setting('ANTHROPIC_API_KEY', '', back)
      if (got !== 'sk-ant-smoke-1234') { console.error(`✗ 端末保存したキーが読めない — ${got}`); failed++ }
      else console.log('  端末保存 → 次のリクエストで有効')
    }
    const refused = await call({ name: 'SESSION_SECRET', value: 'nope' })
    if (refused.status !== 503) {
      console.error(`✗ 訪問者側で読む値が端末保存を受け付けてしまう — ${refused.status}`)
      failed++
    } else console.log('  訪問者側で読む値は端末保存を拒否')
  } catch (e) {
    console.error(`✗ 端末保存 — threw ${e && e.message}`)
    failed++
  }
  process.env.UPSTASH_REDIS_REST_URL = url
  process.env.UPSTASH_REDIS_REST_TOKEN = token
}

if (failed) {
  console.error(`\n${failed} 件のエンドポイントが認証後に失敗します。デプロイすると 500 になります。`)
  process.exit(1)
}
console.log(`\n${CALLS.length} 件すべて応答しました。`)
