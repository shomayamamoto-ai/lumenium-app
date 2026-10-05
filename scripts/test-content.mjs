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

/* ==== 文章編集：保存の履歴と「この時点に戻す」 ==== */
await t('history: 変わった項目の一覧（古い書き方も id で比べる・節は id ごと）', async () => {
  const { diffContent } = await import('../api/content-save.js')
  const v = LEGACY_ORDER['site.TESTIMONIALS'][0]
  const prev = { 'site.TESTIMONIALS.0.text': '同じ', 'text.lp.title': '前', added: { faq: [{ id: 'faq-a-1', q: 'x' }] } }
  const next = { [`site.TESTIMONIALS.@${v}.text`]: '同じ', 'text.lp.title': '後', added: { faq: [{ id: 'faq-a-1', q: 'y' }] },
    hidden: { cases: ['case-1'] }, seo: { '/faq.html': { title: 't', description: '' } } }
  assert.deepEqual(diffContent(prev, next).sort(), ['added.faq:faq-a-1', 'hidden.cases:case-1', 'seo:/faq.html', 'text.lp.title'].sort())
  assert.deepEqual(diffContent(next, next), [])
})

await t('revert: 書き戻す中身を作る（壊れたファイル・文字以外の値は戻さない）', async () => {
  const { revertContent } = await import('../api/content-save.js')
  assert.equal(revertContent('[1]'), null)
  assert.equal(revertContent('{'), null)
  assert.deepEqual(revertContent('{"b":"x","a":"y","n":3,"added":{"faq":[]},"bogus":{"x":1}}'), { a: 'y', added: { faq: [] }, b: 'x' })
})

await t('revert: 「この時点に戻す」は新しいコミットとして書き戻し、履歴は20回分を変更点つきで返す', async () => {
  const repo = fakeRepo({ 'text.lp.title': 'いま' })
  repo.old = { aaaaaaa: { 'text.lp.title': '前' }, bbbbbbb: {} }
  repo.history = [
    { sha: 'aaaaaaa', commit: { message: 'content: 1 件の文章を更新', committer: { date: '2026-10-02T00:00:00Z' } } },
    { sha: 'bbbbbbb', commit: { message: 'content: 最初', committer: { date: '2026-10-01T00:00:00Z' } } },
  ]
  on([repo.handler])
  const { GET, POST } = await import('../api/content-save.js')
  const h = await (await GET(req('content-save?history=1'))).json()
  assert.equal(h.history.length, 2)
  assert.deepEqual(h.history[0].changes, ['text.lp.title'])
  assert.deepEqual(h.history[1].changes, [], '最初の回は空のファイルと比べる')
  const r = await POST(req('content-save', 'POST', { revert: 'aaaaaaa' }))
  assert.equal(r.status, 200)
  assert.deepEqual(repo.content, { 'text.lp.title': '前' })
  assert.match(repo.puts[0].message, /aaaaaaa の時点に戻す/)
  assert.equal((await POST(req('content-save', 'POST', { revert: 'nothex!' }))).status, 400)
  // 節の名前は文字の上書きとしては保存できない
  assert.equal((await POST(req('content-save', 'POST', { changes: { added: 'x' } }))).status, 400)
})

/* ==== 文章編集：項目を足す・隠す ==== */
const extra = await import('../src/lib/content-extra.js')
const faqMod = await import('../src/data/faq.js')

await t('added/hidden: 足した項目は後ろに付き、隠した項目は外れる（2回当てても同じ）', () => {
  const root = { site: { TESTIMONIALS: clone(site.TESTIMONIALS), CASE_STUDIES: clone(site.CASE_STUDIES) }, faq: clone(faqMod.FAQ_GROUPS) }
  const g = root.faq[1].id
  const hideQ = root.faq[0].items[0].id
  const data = {
    added: {
      faq: [{ id: 'faq-a-1', group: g, q: '土日も対応できますか?', a: 'はい、事前にご相談いただければ対応します。' }],
      testimonials: [{ id: 'voice-a-1', text: '早くて分かりやすかったです。', name: '工務店 代表', detail: '' }],
      cases: [{ id: 'case-a-1', tag: 'Web', title: '工務店のサイト', desc: '施工事例を自分で足せる作りにしました。' },
        { id: 'case-a-2', tag: 'Web', title: '短', desc: '短すぎる題名は飛ばす' }],
    },
    hidden: { testimonials: [root.site.TESTIMONIALS[4].id], faq: [hideQ] },
  }
  const before = root.site.TESTIMONIALS.length
  extra.applyExtra(data, root)
  extra.applyExtra(data, root)
  assert.equal(root.site.TESTIMONIALS.length, before, '1件足して1件隠したので同じ数')
  assert.equal(root.site.TESTIMONIALS.at(-1).id, 'voice-a-1')
  assert.equal(root.site.TESTIMONIALS.at(-1).initial, '工')
  assert.equal(root.site.CASE_STUDIES.filter((c) => c.id.startsWith('case-a-')).length, 1, '決まりに合わない項目は出さない')
  assert.equal(root.faq[1].items.at(-1).id, 'faq-a-1')
  assert.ok(!root.faq[0].items.some((x) => x.id === hideQ))
})

await t('added/hidden: applyOverrides 経由でも同じ（表示もビルドも同じ関数）', () => {
  const root = { site: { TESTIMONIALS: clone(site.TESTIMONIALS) } }
  const target = root.site.TESTIMONIALS[0].id
  registry.applyOverrides({ [`site.TESTIMONIALS.@${target}.name`]: '上書き', hidden: { testimonials: [target] },
    added: { testimonials: [{ id: 'voice-a-9', text: '足した声です。ありがとう。', name: '店主', detail: '' }] } }, root)
  assert.ok(!root.site.TESTIMONIALS.some((x) => x.id === target))
  assert.equal(root.site.TESTIMONIALS.at(-1).id, 'voice-a-9')
})

await t('added: 文字数の決まり（短すぎ・長すぎ・グループなし）', () => {
  assert.match(extra.checkItem('faq', { id: 'faq-a-1', group: 'g-1', q: '短', a: '十分な長さの回答です。はい。' }), /質問は4文字以上/)
  assert.match(extra.checkItem('faq', { id: 'faq-a-1', group: '', q: '十分な質問?', a: '十分な長さの回答です。はい。' }), /グループ/)
  assert.match(extra.checkItem('testimonials', { id: 'voice-a-1', text: 'あ'.repeat(201), name: '店主' }), /200文字まで/)
  assert.match(extra.checkItem('cases', { id: 'BAD', tag: 'x', title: '題名です', desc: '説明は十分に長いです。' }), /id/)
  assert.equal(extra.checkItem('cases', { id: 'case-a-1', tag: 'x', title: '題名です', desc: '説明は十分に長いです。' }), '')
})

await t('content-save: ops は id ごとに重ねる（別の画面で足した項目を消さない）', async () => {
  const repo = fakeRepo({ 'text.lp.title': '見出し', added: { faq: [{ id: 'faq-a-other', group: 'g-1', q: '別の人の質問?', a: '別の人が足した回答です。' }] } })
  on([repo.handler])
  const { POST } = await import('../api/content-save.js')
  let r = await POST(req('content-save', 'POST', { ops: { added: { faq: { 'faq-a-mine': { group: 'g-1', q: '私の質問ですか?', a: '私が足した回答です。はい。' } } }, hidden: { cases: { 'case-x1': true } } } }))
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()))
  assert.deepEqual(repo.content.added.faq.map((x) => x.id), ['faq-a-other', 'faq-a-mine'])
  assert.deepEqual(repo.content.hidden, { cases: ['case-x1'] })
  assert.equal(repo.content['text.lp.title'], '見出し')
  r = await POST(req('content-save', 'POST', { ops: { added: { faq: { 'faq-a-mine': null } }, hidden: { cases: { 'case-x1': false } } } }))
  assert.equal(r.status, 200)
  assert.deepEqual(repo.content.added.faq.map((x) => x.id), ['faq-a-other'])
  assert.equal(repo.content.hidden, undefined, '空になった節は残さない')
  r = await POST(req('content-save', 'POST', { ops: { added: { faq: { 'faq-a-bad': { group: 'g-1', q: '?', a: 'x' } } } } }))
  assert.equal(r.status, 400)
})

/* ==== 文章編集：検索結果の見え方（SEO） ==== */
await t('seo: 長さの決まり（上限で断る・目安は知らせるだけ）', () => {
  assert.equal(extra.checkSeo('/pricing.html', { title: '料金の目安', description: '' }), '')
  assert.match(extra.checkSeo('/pricing.html', { title: '', description: '' }), /どちらか/)
  assert.match(extra.checkSeo('/pricing.html', { title: 'あ'.repeat(81), description: '' }), /80文字/)
  assert.match(extra.checkSeo('/pricing.html', { title: '', description: 'あ'.repeat(201) }), /200文字/)
  assert.match(extra.checkSeo('../etc.html', { title: 'x' }), /ページ/)
  assert.match(extra.checkSeo('/a.html', { title: '<script>' }), /< と >/)
  assert.equal(extra.seoHint('title', 'あ'.repeat(14)).startsWith('短め'), true)
  assert.equal(extra.seoHint('title', 'あ'.repeat(15)), '')
  assert.equal(extra.seoHint('title', 'あ'.repeat(62)), '')
  assert.equal(extra.seoHint('title', 'あ'.repeat(63)).startsWith('長め'), true)
  assert.equal(extra.seoHint('description', 'あ'.repeat(59)).startsWith('短め'), true)
  assert.equal(extra.seoHint('description', 'あ'.repeat(160)), '')
  assert.equal(extra.seoHint('description', 'あ'.repeat(161)).startsWith('長め'), true)
})

await t('seo: ビルドでタイトル・説明・OGP を差し替える（空の欄は元のまま・壊れた指定は無視）', async () => {
  const { applySeo } = await import('./_seo.mjs')
  const html = '<title>元 | 社名</title>\n<meta name="description" content="元の説明">\n<meta property="og:title" content="元 | 社名">\n<meta property="og:description" content="元の説明">'
  const a = applySeo('/pricing.html', html, { title: '新しい "題名" & 料金', description: '' })
  assert.match(a, /<title>新しい &quot;題名&quot; &amp; 料金<\/title>/)
  assert.match(a, /og:title" content="新しい &quot;題名&quot; &amp; 料金"/)
  assert.match(a, /name="description" content="元の説明"/)
  assert.equal(applySeo('/pricing.html', html, { title: 'x'.repeat(81) }), html)
  assert.equal(applySeo('/pricing.html', html, undefined), html)
})

await t('content-save: SEO は path ごとに保存・null で元に戻す', async () => {
  const repo = fakeRepo({ seo: { '/faq.html': { title: 'FAQ の題名です', description: '' } } })
  on([repo.handler])
  const { POST } = await import('../api/content-save.js')
  let r = await POST(req('content-save', 'POST', { ops: { seo: { '/pricing.html': { title: '料金の目安とお見積り', description: '' } } } }))
  assert.equal(r.status, 200)
  assert.deepEqual(Object.keys(repo.content.seo).sort(), ['/faq.html', '/pricing.html'])
  r = await POST(req('content-save', 'POST', { ops: { seo: { '/faq.html': null, '/pricing.html': null } } }))
  assert.equal(repo.content.seo, undefined)
})

/* ==== 文章編集：ブログ記事を書く ==== */
const ART = { slug: 'ai-first-steps', title: 'AIを使い始める前に', date: '2026-10-01', category: 'AI活用',
  description: '社内でAIを使い始める前に決めておくことをまとめました。', body: '## はじめに\n\n' + 'あ'.repeat(60) + '\n\n- 箇条書き\n- **太字**' }

await t('blog: 英字の名前の決まり（形・予約語・重なり）', () => {
  for (const ok of ['ai-first-steps', 'a1', '2026-plan']) assert.ok(extra.validArticleSlug(ok), ok)
  for (const bad of ['', 'index', 'post-3', 'Post', 'a--b', '-a', 'a-', 'あ', 'a_b', 'a'.repeat(61)]) assert.ok(!extra.validArticleSlug(bad), bad)
  assert.equal(extra.checkArticle(ART), '')
  assert.match(extra.checkArticle(ART, ['ai-first-steps']), /ほかの記事で使っています/)
  assert.match(extra.checkArticle({ ...ART, body: '短い' }), /本文は50文字以上/)
  assert.match(extra.checkArticle({ ...ART, date: '' }), /公開日/)
  assert.equal(extra.checkArticle({ slug: 'draft-x', title: '書きかけ', draft: true }), '', '下書きは書きかけでよい')
})

await t('blog: 記事の形に直して一覧に足す（下書きは出さない）', () => {
  const root = { articles: [{ id: 1, title: '元からある記事' }] }
  extra.applyExtra({ added: { articles: [ART, { ...ART, slug: 'draft-x', draft: true }] } }, root)
  assert.equal(root.articles.length, 2)
  const a = root.articles[1]
  assert.deepEqual([a.id, a.slug, a.date, a.summary, a.added], ['ai-first-steps', 'ai-first-steps', '2026.10.01', ART.description, true])
  assert.equal(a.content, ART.body)
})

await t('content-save: 記事の保存・名前の付け替え・重なりは断る・削除', async () => {
  const repo = fakeRepo({})
  on([repo.handler])
  const { POST } = await import('../api/content-save.js')
  let r = await POST(req('content-save', 'POST', { ops: { articles: { [ART.slug]: ART } } }))
  assert.equal(r.status, 200)
  r = await POST(req('content-save', 'POST', { ops: { articles: { other: { ...ART, slug: 'other' } } } }))
  assert.equal(r.status, 200)
  r = await POST(req('content-save', 'POST', { ops: { articles: { other: { ...ART, slug: 'ai-first-steps' } } } }))
  assert.equal(r.status, 400, '別の記事と同じ名前にはできない')
  r = await POST(req('content-save', 'POST', { ops: { articles: { 'ai-first-steps': null, 'ai-start': { ...ART, slug: 'ai-start' } } } }))
  assert.equal(r.status, 200)
  assert.deepEqual(repo.content.added.articles.map((x) => x.slug).sort(), ['ai-start', 'other'])
  r = await POST(req('content-save', 'POST', { ops: { articles: { other: null, 'ai-start': null } } }))
  assert.equal(repo.content.added, undefined)
})

console.log(`test-content: ${passed} passed`)
