// The crawler middleware, called the way Vercel calls it, with nothing real
// on the other end.
//
// middleware.js sits in front of every page on the site. The one thing it
// must never do is get in the way, so what is checked here is mostly what it
// does NOT do: no network for an ordinary visitor, no network for an image,
// nothing returned (which is what lets the page through untouched), and no
// exception when the store is down. Then, once, that a crawler's visit
// actually reaches the store through waitUntil.
//
// Offline and deterministic; runs in prebuild.

const REDIS = 'https://redis.middleware-test.invalid'
process.env.UPSTASH_REDIS_REST_URL = REDIS
process.env.UPSTASH_REDIS_REST_TOKEN = 'test'
delete process.env.KV_REST_API_URL
delete process.env.KV_REST_API_TOKEN

let calls = []
let mode = 'ok'
globalThis.fetch = async (input, init = {}) => {
  const url = String(input && input.url ? input.url : input)
  calls.push({ url, body: init.body ? JSON.parse(init.body) : null })
  if (mode === 'throw') throw new Error('store is down')
  if (!url.startsWith(REDIS)) throw new Error(`middleware tried to reach ${url}`)
  const cmds = JSON.parse(init.body || '[]')
  return new Response(JSON.stringify(cmds.map(() => ({ result: 0 }))), { status: 200 })
}

const { default: middleware, config } = await import(new URL('../middleware.js', import.meta.url))

const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const LINE_APP = BROWSER + ' Line/14.12.0'
const CUBOT = 'Mozilla/5.0 (Linux; Android 12; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
const GPTBOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)'

let failed = 0
const check = (cond, label) => {
  if (cond) console.log(`  ✓ ${label}`)
  else { console.error(`  ✗ ${label}`); failed++ }
}

async function run(label, { ua, path = '/services/web.html', method = 'GET', withContext = true }) {
  calls = []
  const waited = []
  const context = withContext ? { waitUntil: (p) => { waited.push(p) } } : undefined
  const req = new Request(`https://example.com${path}`, { method, headers: ua ? { 'user-agent': ua } : {} })
  let out, threw = null
  try { out = middleware(req, context) } catch (e) { threw = e }
  // Let anything handed to waitUntil finish before counting fetches.
  const settled = await Promise.allSettled(waited)
  return { label, out, threw, waited, settled, fetches: calls.slice() }
}

// 1. An ordinary visitor: nothing at all happens.
for (const [name, ua] of [['普通のブラウザ', BROWSER], ['LINEアプリ内ブラウザ', LINE_APP], ['機種名に bot を含むスマホ', CUBOT], ['UAなし', '']]) {
  const r = await run(name, { ua })
  check(r.out === undefined && !r.threw, `${name}: 何も返さない`)
  check(r.waited.length === 0 && r.fetches.length === 0, `${name}: 通信も waitUntil も無い`)
}

// 2. A crawler asking for an asset: not a page read, nothing recorded.
for (const path of ['/assets/index-abc123.js', '/lumenium-logo.png', '/api/track', '/favicon.ico', '/intro.mp4', '/sitemap-urls.txt', '/fonts/a.woff2']) {
  const r = await run(`asset ${path}`, { ua: GPTBOT, path })
  check(r.out === undefined && r.waited.length === 0 && r.fetches.length === 0, `GPTBot が ${path}: 記録しない`)
}

// 3. A crawler reading a page: one deferred write that reaches the store.
{
  const r = await run('bot page', { ua: GPTBOT })
  check(r.out === undefined && !r.threw, 'GPTBot がページ: 何も返さない（ページはそのまま）')
  check(r.waited.length === 1, 'GPTBot がページ: waitUntil に1回だけ渡す')
  check(r.fetches.length === 1 && r.fetches[0].url === `${REDIS}/pipeline`, 'GPTBot がページ: 保存先の pipeline に1回だけ書く')
  const flat = JSON.stringify(r.fetches[0] && r.fetches[0].body)
  check(flat.includes('"HINCRBY"') && flat.includes('"GPTBot"'), 'GPTBot がページ: エージェント名を日ごとに数える')
  check(flat.includes('GPTBot\\t/services/web.html') && flat.includes('"/services/web.html"'), 'GPTBot がページ: エージェント×ページと、ページを記録')
  check(flat.includes('"EVAL"') && flat.includes('300'), 'GPTBot がページ: ページの欄は上限つき（300）')
  check(r.settled.every((s) => s.status === 'fulfilled'), 'GPTBot がページ: waitUntil の Promise は失敗しない')
}

// 3b. robots.txt, llms.txt and the sitemap are crawler reads too.
for (const path of ['/robots.txt', '/llms.txt', '/sitemap.xml', '/sitemap-content.xml']) {
  const r = await run(path, { ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', path })
  check(r.out === undefined && r.waited.length === 1 && r.fetches.length === 1, `ClaudeBot が ${path}: 1回記録する`)
}

// 4. HEAD counts too; POST does not.
{
  const head = await run('HEAD', { ua: GPTBOT, method: 'HEAD' })
  check(head.waited.length === 1, 'HEAD は記録する')
  const post = await run('POST', { ua: GPTBOT, method: 'POST' })
  check(post.waited.length === 0 && post.fetches.length === 0, 'POST は記録しない')
}

// 5. The store throws: nothing escapes, the page is unaffected.
{
  mode = 'throw'
  const r = await run('store down', { ua: GPTBOT })
  check(r.out === undefined && !r.threw, '保存先が落ちている: 例外を出さない')
  check(r.settled.every((s) => s.status === 'fulfilled'), '保存先が落ちている: waitUntil の Promise も失敗しない')
  mode = 'ok'
}

// 6. No context at all (an older runtime): still nothing thrown.
{
  const r = await run('no context', { ua: GPTBOT, withContext: false })
  check(r.out === undefined && !r.threw, 'context なし: 例外を出さない')
  await new Promise((ok) => setTimeout(ok, 20))
}

// 7. No store configured: no I/O.
{
  const saved = process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_URL
  const r = await run('no store', { ua: GPTBOT })
  check(r.out === undefined && r.waited.length === 0 && r.fetches.length === 0, '保存先が未設定: 何もしない')
  process.env.UPSTASH_REDIS_REST_URL = saved
}

// 8. A request object that is not what we expect: still nothing thrown.
{
  let threw = null, out
  try { out = middleware({ headers: { get: () => { throw new Error('bad headers') } } }, {}) } catch (e) { threw = e }
  check(out === undefined && !threw, '壊れたリクエスト: 例外を出さない')
}

// 9. The matcher, read as a regular expression the way the platform reads it.
{
  const src = config.matcher[0]
  const re = new RegExp('^' + src.replace(/^\//, '/') + '$')
  const pages = ['/', '/services/web.html', '/blog/post-3.html', '/sitemap.xml', '/about']
  const assets = ['/assets/x.js', '/api/track', '/favicon.ico', '/intro.mp4', '/content.json', '/sitemap-urls.txt', '/logo.svg', '/a.css']
  const res = config.matcher.slice(1)
  check(pages.every((p) => re.test(p)), 'matcher: ページと sitemap.xml は通す')
  check(assets.every((p) => !re.test(p)), 'matcher: 画像・スクリプト・スタイル・API は通さない')
  check(res.includes('/robots.txt') && res.includes('/llms.txt'), 'matcher: robots.txt と llms.txt は個別に通す')
}

if (failed) {
  console.error(`\nmiddleware: ${failed} 件の確認に失敗しました。`)
  process.exit(1)
}
console.log('\nmiddleware: すべての確認に通りました。')
