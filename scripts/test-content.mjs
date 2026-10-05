// お知らせ投稿と文章編集の確認（予約・下書き・画像・履歴から戻す・
// 1件ずつのページの住所、文章の id・追加と非表示・SEO・ブログ記事）。
//
// 外へ出る通信はすべてこの中の fetch が受け止めるので、オフラインで決まった
// 結果になります。prebuild で走り、壊れていればビルドが止まります。

import assert from 'node:assert/strict'

const REDIS = 'https://redis.content.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'content-admin-key-0123456789',
  GITHUB_REPO: 'sample/site',
  UPSTASH_REDIS_REST_URL: REDIS,
  UPSTASH_REDIS_REST_TOKEN: 'x',
  GITHUB_TOKEN: 'ghp_test',
})

/* ---- 小さな Redis ---- */
const store = new Map()
function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    if (op === 'GET') return { result: store.get(c[1]) ?? null }
    if (op === 'SET') { store.set(c[1], String(c[2])); return { result: 'OK' } }
    if (op === 'DEL') { store.delete(c[1]); return { result: 1 } }
    return { result: null }
  })
}

/* ---- 外向きの通信 ---- */
let handlers = []
const calls = []
const res = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
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
const req = (path, method = 'GET', body) => new Request(`https://example.com/api/${path}`, {
  method, headers: { ...KEYH, 'x-forwarded-for': `203.0.113.${++ipN}` }, body: body === undefined ? undefined : JSON.stringify(body),
})
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64')
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString())

/** GitHub の Contents API のふり。1つのファイルを持ち、PUT で書き換わる。 */
function fakeRepo(initial) {
  const repo = { content: initial, puts: [], history: [] }
  repo.handler = ['api.github.com/repos/', (u, init) => {
    if (/\/commits\?/.test(u)) return res(repo.history)
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body)
      repo.puts.push(body)
      repo.content = unb64(body.content)
      return res({ commit: { sha: 'c0ffee' + repo.puts.length } })
    }
    const ref = /[?&]ref=([0-9a-f]+)/.exec(u)
    if (ref) return repo.old && repo.old[ref[1]] !== undefined ? res({ content: b64(repo.old[ref[1]]) }) : res({ message: 'no' }, 404)
    return res({ sha: 'sha' + repo.puts.length, content: b64(repo.content) })
  }]
  return repo
}

/* ==== お知らせ ==== */
const news = await import('../src/lib/news.js')

await t('news: 予約は公開日（日本時間）まで出さない・公開日の朝から出す', () => {
  const items = [
    { id: 'n-1', date: '2026-10-10', title: '予約', status: 'scheduled', publishAt: '2026-10-10' },
    { id: 'n-2', date: '2026-10-01', title: '公開済み' },
    { id: 'n-3', date: '2026-10-02', title: '公開済み（印あり）', status: 'published' },
    { id: 'n-4', date: '2026-10-03', title: '日付が壊れた予約', status: 'scheduled', publishAt: '2026-02-30' },
  ]
  assert.deepEqual(news.liveNews(items, '2026-10-09').map((n) => n.id), ['n-2', 'n-3'])
  assert.deepEqual(news.liveNews(items, '2026-10-10').map((n) => n.id), ['n-1', 'n-2', 'n-3'])
  assert.deepEqual(news.dueScheduled(items, '2026-10-10').map((n) => n.id), ['n-1'])
  // 日本時間で数える：UTC の 10/9 15:00 は日本の 10/10 0:00
  assert.equal(news.jstToday(Date.parse('2026-10-09T15:00:00Z')), '2026-10-10')
  assert.equal(news.jstToday(Date.parse('2026-10-09T14:59:59Z')), '2026-10-09')
})

await t('slug: 英小文字・数字・ハイフンだけ、端はハイフン不可、連続ハイフン不可、64文字まで', () => {
  for (const ok of ['n-20260928-01', 'ai-guide', 'a', 'x1', 'a'.repeat(64)]) assert.ok(news.validSlug(ok), ok)
  for (const bad of ['', '-a', 'a-', 'A-b', 'a--b', 'a_b', 'お知らせ', 'a b', 'a/b', '../x', 'a'.repeat(65)]) assert.ok(!news.validSlug(bad), bad)
  assert.equal(news.newsSlug({ id: 'N-20260928-01' }), 'n-20260928-01')
  assert.equal(news.newsSlug({ id: 'bad id' }), '')
})

await t('news: 画像は https の住所と説明（alt）が要る', () => {
  assert.equal(news.checkImage(null).ok, true)
  assert.equal(news.checkImage({ url: 'https://x.public.blob.vercel-storage.com/a.jpg', alt: '' }).ok, false)
  assert.equal(news.checkImage({ url: 'http://x/a.jpg', alt: '説明' }).ok, false)
  assert.equal(news.checkImage({ url: 'https://x/a.jpg"><script>', alt: '説明' }).ok, false)
  assert.deepEqual(news.checkImage({ url: 'https://x/a.jpg', alt: ' 店の外観 ' }).image, { url: 'https://x/a.jpg', alt: '店の外観' })
})

await t('news: 予約で保存すると status と publishAt が付き、予約をやめると先の日付が残らない', async () => {
  const { applyNews } = await import('../api/news-post.js')
  const a = applyNews([], { action: 'add', title: '相談会', body: '', link: '', date: '2026-10-20', publishAt: '2026-10-20',
    image: { url: 'https://x/a.jpg', alt: '会場' } })
  assert.equal(a.items[0].status, 'scheduled')
  assert.equal(a.items[0].publishAt, '2026-10-20')
  assert.equal(a.items[0].image.alt, '会場')
  const id = a.items[0].id
  const b = applyNews(a.items, { action: 'edit', delId: id, title: '相談会', body: '', link: '', date: '2026-10-05', keepDate: '' })
  assert.equal(b.items[0].status, undefined)
  assert.equal(b.items[0].date, '2026-10-05', '予約をやめたら今日の日付')
  assert.equal(b.items[0].image, undefined, '画像を外したら消える')
})

await t('news: 下書きの保存は Redis だけ（GitHub に触らない＝ビルドが走らない）', async () => {
  const repo = fakeRepo([])
  on([repo.handler])
  const { POST, GET, DRAFTS_KEY } = await import('../api/news-post.js')
  const r = await POST(req('news-post', 'POST', { action: 'draft-save', title: '書きかけ', body: '途中', link: '' }))
  const d = await r.json()
  assert.equal(r.status, 200, JSON.stringify(d))
  assert.equal(calls.length, 0, 'GitHub を呼ばない')
  assert.equal(JSON.parse(store.get(DRAFTS_KEY))[0].title, '書きかけ')
  const id = d.drafts[0].id
  // 同じ id で保存し直すと上書き（増えない）
  await POST(req('news-post', 'POST', { action: 'draft-save', id, title: '書きかけ2', body: '', link: '' }))
  assert.equal(JSON.parse(store.get(DRAFTS_KEY)).length, 1)
  // 一覧の読み込みに下書きが付く
  const g = await (await GET(req('news-post'))).json()
  assert.equal(g.drafts[0].title, '書きかけ2')
  // 下書きから公開すると、その下書きは片付く
  const p = await POST(req('news-post', 'POST', { action: 'add', title: '公開', body: '', link: '', fromDraft: id }))
  assert.equal(p.status, 200)
  assert.equal(JSON.parse(store.get(DRAFTS_KEY)).length, 0)
  assert.equal(repo.puts.length, 1)
})

await t('news: 予約の日付は明日から1年先まで・画像の説明が無いと断る', async () => {
  const repo = fakeRepo([])
  on([repo.handler])
  const { POST } = await import('../api/news-post.js')
  const today = news.jstToday()
  let r = await POST(req('news-post', 'POST', { action: 'add', title: 'x', status: 'scheduled', publishAt: today }))
  assert.equal(r.status, 400)
  r = await POST(req('news-post', 'POST', { action: 'add', title: 'x', image: { url: 'https://x/a.jpg', alt: '' } }))
  assert.equal(r.status, 400)
  const tomorrow = news.jstToday(Date.now() + 86400000)
  r = await POST(req('news-post', 'POST', { action: 'add', title: '予約', status: 'scheduled', publishAt: tomorrow }))
  assert.equal(r.status, 200)
  assert.equal(repo.content[0].publishAt, tomorrow)
  assert.equal(repo.content[0].date, tomorrow)
  assert.equal(repo.puts.length, 1)
})

await t('news: 「この時点に戻す」はその時点の中身を新しいコミットで書き戻す', async () => {
  const { revertItems, POST } = await import('../api/news-post.js')
  assert.equal(revertItems('{"a":1}'), null)
  assert.equal(revertItems('not json'), null)
  assert.deepEqual(revertItems('[{"id":"a","title":"A"},{"bad":1}]'), [{ id: 'a', title: 'A' }])
  const repo = fakeRepo([{ id: 'b', title: 'いま' }])
  repo.old = { abcdef1: [{ id: 'a', date: '2026-09-01', title: '前' }] }
  on([repo.handler])
  const r = await POST(req('news-post', 'POST', { action: 'revert', sha: 'abcdef1' }))
  assert.equal(r.status, 200)
  assert.deepEqual(repo.content.map((n) => n.title), ['前'])
  assert.match(repo.puts[0].message, /abcdef1 の時点に戻す/)
  assert.equal((await POST(req('news-post', 'POST', { action: 'revert', sha: 'zzz' }))).status, 400)
})

await t('news: 保存の履歴は最近20回を GitHub から', async () => {
  const repo = fakeRepo([])
  repo.history = [{ sha: 'abc', commit: { message: 'news: 秋\n\nbody', committer: { date: '2026-10-01T00:00:00Z' } } }]
  on([repo.handler])
  const { GET } = await import('../api/news-post.js')
  const d = await (await GET(req('news-post?history=1'))).json()
  assert.deepEqual(d.history, [{ sha: 'abc', at: '2026-10-01T00:00:00Z', message: 'news: 秋' }])
  assert.match(calls[0].url, /per_page=20/)
})

await t('news-cron: 公開日が来た予約があれば、デプロイフックを1回だけ呼ぶ', async () => {
  const { runNewsCron, hookUrlOk, RELEASED_KEY } = await import('../api/_news-cron.js')
  assert.ok(hookUrlOk('https://api.vercel.com/v1/integrations/deploy/prj_abc123/XyZ987'))
  assert.ok(!hookUrlOk('https://evil.example/v1/integrations/deploy/prj_abc/x'))
  const repo = fakeRepo([{ id: 'n-1', date: '2026-10-10', title: '予約', status: 'scheduled', publishAt: '2026-10-10' }])
  let hooks = 0
  on([repo.handler, ['api.vercel.com/v1/integrations/deploy/', () => { hooks++; return res({ job: {} }) }]])
  process.env.DEPLOY_HOOK_URL = 'https://api.vercel.com/v1/integrations/deploy/prj_abc123/XyZ987'
  assert.equal((await runNewsCron(null, '2026-10-09')).due, 0, '前日は何もしない')
  assert.equal(hooks, 0)
  const r = await runNewsCron(null, '2026-10-10')
  assert.equal(r.via, 'hook')
  assert.equal(hooks, 1)
  await runNewsCron(null, '2026-10-11')
  assert.equal(hooks, 1, '同じ予約で2回呼ばない')
  assert.deepEqual(JSON.parse(store.get(RELEASED_KEY)), ['n-1'])
  assert.equal(repo.puts.length, 0, 'フックのときはコミットしない')
  delete process.env.DEPLOY_HOOK_URL
})

await t('news-cron: フックが無ければ「公開済み」にするコミットで作り直させる', async () => {
  const { runNewsCron } = await import('../api/_news-cron.js')
  const repo = fakeRepo([
    { id: 'n-1', date: '2026-10-10', title: '予約', status: 'scheduled', publishAt: '2026-10-10' },
    { id: 'n-2', date: '2026-10-12', title: '先の予約', status: 'scheduled', publishAt: '2026-10-12' },
  ])
  on([repo.handler])
  const r = await runNewsCron(null, '2026-10-10')
  assert.equal(r.via, 'commit')
  assert.equal(repo.puts.length, 1)
  assert.equal(repo.content[0].status, undefined)
  assert.equal(repo.content[1].status, 'scheduled', '先の予約はそのまま')
  await runNewsCron(null, '2026-10-10')
  assert.equal(repo.puts.length, 1, '2回目は何もしない')
})

/* ==== 文章編集：id の住所 ==== */
const registry = await import('../src/lib/content-registry.js')
const ids = await import('../src/lib/content-ids.js')
const { LEGACY_ORDER } = await import('../src/lib/content-legacy-order.js')
const site = await import('../src/data/site.js')
const clone = (x) => JSON.parse(JSON.stringify(x))

await t('id: 項目に id がある配列は @id の住所、文字だけの配列は番号のまま', () => {
  const paths = registry.collectPaths().map((p) => p.path)
  assert.ok(paths.some((p) => /^site\.TESTIMONIALS\.@voice-[a-z0-9]+\.text$/.test(p)))
  assert.ok(paths.some((p) => /^faq\.@faqg-[a-z0-9]+\.items\.@faq-[a-z0-9]+\.a$/.test(p)))
  assert.ok(paths.includes('site.ACHIEVEMENTS.0'))
  assert.ok(!paths.some((p) => /^site\.TESTIMONIALS\.\d/.test(p)), '番号の住所が残っていない')
  // id は重複しない
  for (const [k, list] of Object.entries(LEGACY_ORDER)) assert.equal(new Set(list).size, list.length, k)
})

await t('id: 並べ替えても、上書きは同じ項目（同じお客様の声）に付いたまま', () => {
  const list = clone(site.TESTIMONIALS)
  const target = list[1]
  const root = { site: { TESTIMONIALS: list.slice().reverse() } }
  const n = registry.applyOverrides({ [`site.TESTIMONIALS.@${target.id}.text`]: '並べ替えても残る' }, root)
  assert.equal(n, 1)
  const hit = root.site.TESTIMONIALS.find((x) => x.id === target.id)
  assert.equal(hit.text, '並べ替えても残る')
  assert.equal(root.site.TESTIMONIALS[1].text, list[3].text, 'いま2番目の項目は変わらない')
})

await t('id: 古い「何番目」の上書きは、切り替えた時点の並びで読み替える（あとで並べ替えても）', () => {
  const list = clone(site.TESTIMONIALS)
  const meant = LEGACY_ORDER['site.TESTIMONIALS'][1]
  const root = { site: { TESTIMONIALS: list.slice().reverse() } }
  registry.applyOverrides({ 'site.TESTIMONIALS.1.text': '古い書き方' }, root)
  assert.equal(root.site.TESTIMONIALS.find((x) => x.id === meant).text, '古い書き方')
  assert.equal(root.site.TESTIMONIALS.filter((x) => x.text === '古い書き方').length, 1)
  // 入れ子（FAQ のグループの中の質問）も
  const g = LEGACY_ORDER.faq[0]
  const q = LEGACY_ORDER[`faq.@${g}.items`][2]
  assert.equal(ids.migratePath('faq.0.items.2.a'), `faq.@${g}.items.@${q}.a`)
  assert.equal(ids.migratePath('site.ACHIEVEMENTS.3'), 'site.ACHIEVEMENTS.3', '文字だけの配列はそのまま')
  assert.equal(ids.migratePath('site.TESTIMONIALS.99.text'), null, '無かった番号は読み替えない')
})

await t('id: 新旧両方の書き方があれば新しい方を残し、古い方は数える', () => {
  const id = LEGACY_ORDER['site.CASE_STUDIES'][0]
  const { out, moved } = ids.migrateOverrides({
    'site.CASE_STUDIES.0.title': '古い', [`site.CASE_STUDIES.@${id}.title`]: '新しい', 'text.lp.title': 'そのまま',
  })
  assert.deepEqual(out, { [`site.CASE_STUDIES.@${id}.title`]: '新しい', 'text.lp.title': 'そのまま' })
  assert.equal(moved, 1)
})

await t('content-save: 次に保存するとき、古い書き方の上書きを id の書き方で書き直す', async () => {
  const id = LEGACY_ORDER['site.TESTIMONIALS'][0]
  const repo = fakeRepo({ 'site.TESTIMONIALS.0.name': '古い住所の名前' })
  on([repo.handler])
  const { GET, POST } = await import('../api/content-save.js')
  const g = await (await GET(req('content-save'))).json()
  assert.equal(g.overrides[`site.TESTIMONIALS.@${id}.name`], '古い住所の名前', '読むときに読み替える')
  assert.equal(g.stored['site.TESTIMONIALS.0.name'], '古い住所の名前')
  const r = await POST(req('content-save', 'POST', { changes: { 'text.lp.title': '新しい見出し' } }))
  assert.equal(r.status, 200)
  assert.deepEqual(Object.keys(repo.content).sort(), [`site.TESTIMONIALS.@${id}.name`, 'text.lp.title'].sort())
  assert.match(repo.puts[0].message, /1 件の住所を id に移行/)
})

console.log(`test-content: ${passed} passed`)
