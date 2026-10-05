// AIアドバイザーのテスト。外には一切出ません（AIも呼びません）。
//
//   node scripts/test-advisor.mjs
//
// 確かめること。
//   ・渡す数字: 名前・メール・電話・問い合わせの本文が入らない（件数だけ）
//   ・数字が少ないときは「判断できません」と書き、無い数字は「まだありません」
//   ・「実行」ボタン: 形と長さ・行き先の確かめ・押したときに起きることの説明
//   ・保存: 会話は20件まで・長い会話は古い方から・ToDo の上限と重複
//   ・料金の目安: 安いモデルの方が安い・実際の usage から円
//   ・窓口（/api/advisor-store）: 読む・足す・消す・保存先が無いとき

import assert from 'node:assert/strict'
import * as C from '../api/_advisor-core.js'
import * as ST from '../api/_advisor-store.js'
import * as P from '../api/_ai-pricing.js'

let n = 0
async function t(name, fn) {
  try { await fn(); n++ } catch (e) { console.error('✗ ' + name); throw e }
}

function fakeRedis() {
  const kv = new Map(), hashes = new Map(), lists = new Map()
  const run = (c) => {
    const [op, k, ...a] = c
    switch (String(op).toUpperCase()) {
      case 'GET': return kv.has(k) ? kv.get(k) : null
      case 'SET': kv.set(k, a[0]); return 'OK'
      case 'DEL': kv.delete(k); hashes.delete(k); return 1
      case 'EXPIRE': return 1
      case 'INCR': { const v = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(v)); return v }
      case 'HINCRBY': { const h = hashes.get(k) || new Map(); h.set(a[0], String((Number(h.get(a[0])) || 0) + Number(a[1]))); hashes.set(k, h); return 1 }
      case 'HSET': { const h = hashes.get(k) || new Map(); h.set(a[0], a[1]); hashes.set(k, h); return 1 }
      case 'HGETALL': { const h = hashes.get(k); return h ? [...h].flat() : [] }
      case 'LRANGE': { const l = lists.get(k) || []; return l.slice(Number(a[0]), Number(a[1]) + 1) }
      default: return null
    }
  }
  return { cfg: { url: 'fake', token: 'fake' }, pipeline: async (_cfg, cmds) => cmds.map(run), kv, hashes }
}

/* ---------------- 渡す数字に個人の情報が入らない ---------------- */

const NOW = Date.parse('2026-10-05T03:00:00Z')
const PEOPLE = [
  { name: '山田太郎', company: '山田商店', email: 'taro@yamada.example.jp', phone: '090-1234-5678', message: '至急お電話ください 03-1234-5678', topics: ['動画制作'], status: 'new', receivedAt: '2026-10-01T00:00:00Z' },
  { name: '佐藤花子', email: 'hanako@sato.example', message: '見積もりをお願いします', topics: ['AI導入・研修', '佐藤花子 080-9999-0000'], status: 'done', receivedAt: '2026-09-20T00:00:00Z' },
  { name: '迷惑', email: 'spam@spam.example', message: 'buy', topics: [], status: 'new', spam: true, receivedAt: '2026-10-02T00:00:00Z' },
  { name: '古い人', email: 'old@example.com', message: '古い', topics: ['動画制作'], status: 'done', receivedAt: '2026-06-01T00:00:00Z' },
]
const SNAP = {
  date: '2026-10-05',
  analytics: {
    days: 30, visits: 1200, prevVisits: 1000, arrivals: 900,
    funnel: [{ key: 'service_view', label: 'サービスを見た', people: 400, rate: 0.44 }, { key: 'contact_view', label: '問い合わせ画面', people: 42, rate: 0.05 }],
    drop: { key: 'contact_view', label: '問い合わせ画面', from: 'サービスを見た', before: 400, after: 42, drop: 0.895 },
    form: { cur: { k: 9, n: 42, p: 0.214, lo: 0.11, hi: 0.36, label: '参考程度' }, prev: null, change: 'na' },
    exits: [{ path: '/', exits: 300, opened: 900, rate: 0.33 }], lowRead: [], ai: { visits: 12, sources: [{ name: 'ChatGPT', count: 10 }] },
  },
  seo: { at: '2026-10-01T00:00:00Z', stale: false, must: 2, should: 5, items: [{ problem: '説明文が短い', count: 3, pages: ['/about.html'] }] },
  aio: { at: '2026-09-21T00:00:00Z', asked: 84, mention: { k: 3, n: 84, p: 0.036, lo: 0.01, hi: 0.1, label: '' }, missing: ['料金'] },
  sns: { posts: 4, measured: 4, pillars: [{ name: '制作事例', posts: 4, visits: 20, inquiries: 1, label: '参考程度' }], cadence: { weekLeft: 2, rows: [] } },
  inquiries: { median30: 30, replied30: 3, open30: 1, late: 1, warn: 0, promised: 48, autoReply: false, label: '参考程度' },
  booking: { all: 12, cancel: { k: 1, n: 12, p: 0.08, lo: 0.01, hi: 0.35, label: '判断できません' }, noshow: null },
  members: { total: 40, subscribed: 38, unsubscribed: 2, thisMonth: 3, lastMonth: 5 },
}

await t('問い合わせはジャンル別の件数だけ（名前・メール・電話・本文・迷惑・古いものは数えない）', () => {
  const c = C.inquiryCounts(PEOPLE, 30, NOW)
  assert.equal(c.total, 2)
  assert.equal(c.open, 1)
  assert.deepEqual(Object.fromEntries(c.byTopic), { 動画制作: 1, 'AI導入・研修': 1, その他: 1 })
  assert.ok(!JSON.stringify(c).includes('佐藤'), 'ジャンルに紛れた名前は「その他」に')
})

await t('渡す文章に個人の情報が入らない', () => {
  const g = {
    snap: SNAP, inquiries: C.inquiryCounts(PEOPLE, 30, NOW),
    bookings: C.bookingCounts([{ start: NOW + 2 * 86400000, status: 'confirmed', name: '鈴木一郎', email: 'ichiro@suzuki.example', phone: '09011112222' }, { start: NOW + 20 * 86400000 }, { start: NOW - 86400000, status: 'confirmed' }, { start: NOW + 86400000, status: 'cancelled' }], NOW),
    news: C.newsInfo([{ date: '2026-08-01', title: '夏季休業のお知らせ' }, { date: '2026-09-10', title: '新サービス開始' }], NOW),
    auto: C.autoInfo({ a: { status: 'open', title: 'トップの相談ボタンの言葉を比べる', area: 'site', evidence: [{ text: '訪問→問い合わせ画面で90%減' }] }, b: { status: 'dismissed', title: '見送った' } }, []),
    crawl: { total: 0 },
    // 万一、集計の外から混ざっても消える
    aioDetail: { missed: [{ q: '連絡先は info@leak.example か 03-5555-1234 ？', why: '出てこない' }], competitors: [] },
    copyFields: [{ path: 'services.@web.title', value: 'Web制作' }],
  }
  assert.deepEqual(g.bookings, { next7: 1, next30: 2 })
  const { text, sources } = C.groundingText(g)
  for (const bad of ['山田', '佐藤', '鈴木', 'taro@', 'hanako@', 'ichiro@', '090-1234-5678', '080-9999-0000', '03-1234-5678', '至急お電話', '見積もりをお願い', 'info@leak.example', '03-5555-1234']) {
    assert.ok(!text.includes(bad), `漏れた: ${bad}`)
  }
  assert.ok(!C.hasPII(text.split('【文章編集で開ける項目')[0]))
  // 件数・出典の名前・小ささの印は入る
  assert.match(text, /［アクセス解析：過去30日］/)
  assert.match(text, /ジャンル別: 動画制作 1/)
  assert.match(text, /7日以内 1件・30日以内 2件/)
  assert.match(text, /参考程度/)
  assert.match(text, /0件。どのクローラーも/)
  assert.match(text, /services\.@web\.title = Web制作/, '文章編集の項目（メールに似た形）は消さない')
  assert.match(text, /［会員：人数］\n登録 40人/)
  assert.equal(sources.length, Object.keys(C.SOURCE_LABELS).length)
  assert.ok(sources.every((s) => s.ok), JSON.stringify(sources.filter((s) => !s.ok)))
})

await t('無い数字は「まだありません」、訪問が少ないと「判断できません」', () => {
  const { text, sources } = C.groundingText({ snap: { analytics: { ...SNAP.analytics, arrivals: 12, drop: null, funnel: [] } } })
  assert.match(text, /30人未満のため、率から判断できません/)
  assert.match(text, /［SEO点検：最後の点検］\nまだありません（SEO点検をまだ実行していません）/)
  assert.equal(sources.find((s) => s.id === 'seo').ok, false)
  assert.equal(sources.find((s) => s.id === 'analytics').ok, true)
})

await t('最初の質問は数字から作る（根拠つき）・数字が無ければ一般的な質問', () => {
  const g = { snap: SNAP, news: C.newsInfo([{ date: '2026-08-01', title: 'x' }], NOW), crawl: { total: 0 }, auto: { open: [{ title: 'a', evidence: [] }], running: [] } }
  const s = C.starters(g)
  assert.ok(s.length >= 4 && s.length <= 6)
  assert.ok(s.some((x) => /問い合わせ画面」の手前/.test(x.q) && /400人→42人/.test(x.why)))
  assert.ok(s.some((x) => /必ず直す」2件/.test(x.q)))
  assert.ok(s.some((x) => /AIの答えに名前が出ない/.test(x.q)))
  assert.ok(s.some((x) => /お知らせが65日止まっています/.test(x.q)), JSON.stringify(s))
  assert.ok(s.every((x) => x.q.length <= 40 && x.why))
  const empty = C.starters({})
  assert.equal(empty[0].q, 'いま何がいちばん問題？')
})

/* ---------------- 「実行」ボタン ---------------- */

await t('ボタン: 6種類・道具の名前と対応・押したときに起きることを書く', () => {
  const tools = C.actionTools()
  assert.equal(tools.length, 6)
  for (const tool of tools) {
    const kind = C.TOOL_TO_KIND[tool.name]
    assert.ok(kind, tool.name)
    assert.equal(tool.input_schema.additionalProperties, false)
    assert.ok(tool.input_schema.required.includes('why'))
    assert.ok(tool.eager_input_streaming)
    assert.match(C.ACTIONS[kind].does, /(まだ|ほかには何もしません)/, '押しても公開・保存されないことを書く')
  }
})

await t('ボタン: 正しい中身は通り、そろえた形になる', () => {
  C.setCopyPaths(['text.lp.lead', 'services.@web.title'])
  const ok = (kind, input) => { const r = C.checkAction(kind, input); assert.ok(r.ok, kind + ': ' + r.message); return r.action }
  const news = ok('news', { title: '  秋の無料相談会  ', body: '10月に開きます。', why: '更新が止まっているため' })
  assert.equal(news.input.title, '秋の無料相談会')
  assert.equal(news.where, 'news-admin')
  assert.equal(news.button, 'お知らせの入力欄に入れる')
  assert.equal(ok('copy', { path: 'text.lp.lead', text: '新しい説明文', why: 'x' }).input.path, 'text.lp.lead')
  assert.equal(ok('sns', { text: '投稿', why: '' }).where, 'social-admin')
  const ex = ok('experiment', { key: 'text.lp.ctaPrimary', b: 'まずは相談する', why: 'x' })
  assert.equal(ex.input.label, 'トップのボタン（無料で相談する）')
  const pd = ok('pdca', { title: '冒頭を問いかけに', hypothesis: '最初の3秒で止まる', metric: 'nope', next_actions: ['a', '', 'b', 'c', 'd', 'e', 'f'] })
  assert.equal(pd.input.metric, 'views', '知らない指標は再生数に')
  assert.equal(pd.input.next_actions.length, 5)
  const todo = ok('todo', { title: 'Googleビジネスプロフィールに写真を足す', detail: '外観と店内', tab: 'nope' })
  assert.equal(todo.input.tab, '')
})

await t('ボタン: おかしな中身は理由つきで断る', () => {
  C.setCopyPaths(['text.lp.lead'])
  const no = (kind, input, re) => { const r = C.checkAction(kind, input); assert.equal(r.ok, false, kind); assert.match(r.message, re) }
  no('nope', {}, /種類はありません/)
  no('news', { title: '' }, /題名が空/)
  no('news', { title: 'あ'.repeat(81) }, /80文字/)
  no('news', { title: 'a', body: 'あ'.repeat(601) }, /600文字/)
  no('copy', { path: 'text.nothing', text: 'x' }, /項目にありません/)
  no('copy', { path: 'text.lp.lead', text: '' }, /空/)
  no('sns', { text: '   ' }, /空/)
  no('experiment', { key: 'text.lp.lead.x', b: 'x' }, /実験できる項目ではありません/)
  no('experiment', { key: 'text.lp.lead', b: 'あ'.repeat(201) }, /200文字/)
  no('pdca', { title: 'x', hypothesis: '' }, /仮説の中身/)
  no('todo', { title: 'あ'.repeat(61) }, /60文字/)
  no('todo', null, /題名が空/)
  C.setCopyPaths(null)
})

await t('前の答えのボタンは、次の相談で読める一文にする', () => {
  const act = C.checkAction('news', { title: '秋の相談会', body: '' }).action
  const h = C.historyForModel([{ role: 'user', content: 'q' }, { role: 'assistant', content: '答え', actions: [act] }])
  assert.match(h[1].content, /［この回答で出したボタン］\n・お知らせの入力欄に入れる: 秋の相談会/)
  assert.equal(h[0].content, 'q')
})

await t('答えの最後の2行（使った数字・次の質問）を外す', () => {
  const r = C.parseTail('本文です。\n\nSOURCES:: アクセス解析：過去30日 || SEO点検：最後の点検\nNEXT:: その文面を書いて || なぜそれが先か')
  assert.equal(r.body, '本文です。')
  assert.deepEqual(r.sources, ['アクセス解析：過去30日', 'SEO点検：最後の点検'])
  assert.deepEqual(r.next, ['その文面を書いて', 'なぜそれが先か'])
  assert.deepEqual(C.parseTail('本文だけ').next, [])
})

/* ---------------- 保存の上限 ---------------- */

await t('会話: 題名・40件まで・合計の長さ・質問から始まる・ボタンも確かめ直す', () => {
  const title = C.titleFor([{ role: 'assistant', content: 'x' }, { role: 'user', content: '  今週やることを3つ、順番に教えてください。できれば理由も添えて。 ' }])
  assert.equal([...title].length, C.TITLE_MAX)
  assert.ok(title.startsWith('今週やることを3つ') && title.endsWith('…'))
  assert.equal(C.titleFor([{ role: 'user', content: '短い質問' }]), '短い質問')
  assert.equal(C.titleFor([]), '（題名なし）')
  const many = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }))
  const c1 = C.cleanMessages(many)
  assert.ok(c1.length <= C.MSGS_MAX)
  assert.equal(c1[0].role, 'user')
  const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'あ'.repeat(7000) }))
  const c2 = C.cleanMessages(long)
  assert.ok(c2.reduce((s, m) => s + m.content.length, 0) <= C.CONV_CHARS)
  assert.equal(c2[0].role, 'user')
  const c3 = C.cleanMessages([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a', actions: [{ kind: 'news', input: { title: 'ok' } }, { kind: 'news', input: { title: '' } }, { kind: 'rm -rf', input: {} }] }, { role: 'system', content: 'x' }])
  assert.equal(c3.length, 2)
  assert.equal(c3[1].actions.length, 1)
})

await t('会話の一覧: 新しい順に20件まで・あふれたものは消す', () => {
  let index = []
  const removed = []
  for (let i = 0; i < 25; i++) {
    const r = C.upsertIndex(index, { id: 'c' + String(i).padStart(7, '0'), title: 't' + i, updatedAt: new Date(NOW + i * 1000).toISOString(), count: 2 })
    index = r.index; removed.push(...r.removed)
  }
  assert.equal(index.length, C.CONV_MAX)
  assert.equal(index[0].title, 't24')
  assert.equal(removed.length, 5)
  assert.ok(removed.includes('c0000000'))
  // 同じ会話は1行のまま、先頭に
  const again = C.upsertIndex(index, { id: index[10].id, title: 'x', updatedAt: new Date(NOW + 99999).toISOString(), count: 4 })
  assert.equal(again.index.length, C.CONV_MAX)
  assert.equal(again.index[0].id, index[10].id)
  assert.equal(C.removeFromIndex(again.index, index[10].id).length, C.CONV_MAX - 1)
})

await t('ToDo: 足す・同じものは足さない・まだのものは30件まで・済んだものは20件残す', () => {
  let list = []
  const r1 = C.addTodo(list, { title: '写真を足す', detail: '', tab: 'news-admin' }, NOW)
  assert.ok(r1.ok && r1.item.id.startsWith('t'))
  list = r1.list
  assert.ok(C.addTodo(list, { title: '写真を足す' }, NOW).dup)
  for (let i = 0; i < 40; i++) {
    const r = C.addTodo(list, { title: 'やること' + i }, NOW + i)
    if (!r.ok) { assert.match(r.message, /30件/); break }
    list = r.list
  }
  assert.equal(list.filter((x) => !x.done).length, C.TODO_OPEN_MAX)
  for (const x of list.slice(0, 25)) list = C.setTodoDone(list, x.id, true, NOW)
  assert.equal(list.filter((x) => x.done).length, C.TODO_DONE_KEEP)
  assert.ok(!C.addTodo(list, { title: '' }).ok)
})

await t('保存先: 会話を保存・読む・21件目で一番古いものが消える・消す', async () => {
  const R = fakeRedis()
  let first = null
  for (let i = 0; i < 21; i++) {
    const meta = await ST.saveConv(R.cfg, R.pipeline, { messages: [{ role: 'user', content: '質問' + i }, { role: 'assistant', content: '答え' }] }, NOW + i * 1000)
    if (!first) first = meta
  }
  const list = await ST.listConvs(R.cfg, R.pipeline)
  assert.equal(list.length, 20)
  assert.equal(list[0].title, '質問20')
  assert.equal(await ST.readConv(R.cfg, R.pipeline, first.id), null, 'あふれた会話は中身も消す')
  // 続き: 同じ id に保存すると、題名はそのまま・件数が増える
  const cont = await ST.saveConv(R.cfg, R.pipeline, { id: list[5].id, messages: [{ role: 'user', content: '別の題名' }, { role: 'assistant', content: 'a' }, { role: 'user', content: '続き' }, { role: 'assistant', content: 'b' }] }, NOW + 99999)
  assert.equal(cont.title, list[5].title)
  assert.equal((await ST.listConvs(R.cfg, R.pipeline))[0].count, 4)
  assert.ok(await ST.deleteConv(R.cfg, R.pipeline, cont.id))
  assert.equal((await ST.listConvs(R.cfg, R.pipeline)).length, 19)
  assert.equal(await ST.readConv(R.cfg, R.pipeline, '../etc'), null)
  assert.equal(await ST.deleteConv(R.cfg, R.pipeline, 'bad id'), false)
})

/* ---------------- 料金の目安 ---------------- */

await t('料金: 安いモデルの方が安い・lo < hi・usage から円・2つのモデルの月の合計', async () => {
  const deep = C.estimateMessage(P.ADVISOR_MODELS.deep, { systemChars: 12000, historyChars: 1500 })
  const quick = C.estimateMessage(P.ADVISOR_MODELS.quick, { systemChars: 12000, historyChars: 1500 })
  assert.ok(deep.lo < deep.hi && quick.lo < quick.hi)
  assert.ok(quick.hi < deep.hi && quick.lo <= deep.lo, JSON.stringify({ deep, quick }))
  assert.ok(deep.hi < 60, '1回の目安が桁違いでない: ' + deep.hi)
  assert.equal(C.estimateMessage('no-such-model', {}), null)
  // 入力100万 $4 + 出力10万 $2 + 検索2回 $0.02 = $6.02 → 903円
  assert.equal(C.usageYen('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e5, server_tool_use: { web_search_requests: 2 } }), 903)
  assert.ok(P.PRICES[P.ADVISOR_MODELS.deep] && P.PRICES[P.ADVISOR_MODELS.quick], '料金表に両方ある')
  const R = fakeRedis()
  const realFetch = globalThis.fetch
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test.invalid'
  process.env.UPSTASH_REDIS_REST_TOKEN = 't'
  globalThis.fetch = async (u, init) => new Response(JSON.stringify((await R.pipeline(null, JSON.parse(init.body))).map((result) => ({ result }))))
  try {
    await P.recordUsage(P.ADVISOR_KINDS.deep, { input_tokens: 1e6 })
    await P.recordUsage(P.ADVISOR_KINDS.quick, { input_tokens: 1e6 })
    const m = await P.advisorMonth()
    assert.equal(m.calls, 2)
    assert.equal(m.yen, Math.round(4 * P.YEN_PER_USD) + Math.round(2 * P.YEN_PER_USD))
  } finally {
    globalThis.fetch = realFetch
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  }
})

/* ---------------- 窓口 /api/advisor-store ---------------- */

await t('窓口: 保存先が無いと 503（相談そのものはできると書く）・状態は読める', async () => {
  process.env.ADMIN_KEY = 'test-admin-key-0123456789'
  const realFetch = globalThis.fetch
  globalThis.fetch = async (u) => { if (String(u).includes('/news.json')) return new Response('[]'); throw new Error('offline: ' + u) }
  try {
    const mod = await import('../api/advisor-store.js')
    const H = { authorization: 'Bearer test-admin-key-0123456789', 'content-type': 'application/json' }
    const r1 = await mod.POST(new Request('https://x.example/api/advisor-store', { method: 'POST', headers: H, body: JSON.stringify({ action: 'todo.add', input: { title: 'x' } }) }))
    assert.equal(r1.status, 503)
    assert.match((await r1.json()).message, /相談はこのままでもできます/)
    const r2 = await mod.GET(new Request('https://x.example/api/advisor-store?view=state', { headers: H }))
    assert.equal(r2.status, 200)
    const d = await r2.json()
    assert.equal(d.stored, false)
    assert.ok(d.estimate.deep.hi > 0 && d.estimate.quick.hi > 0)
    assert.ok(d.starters.length >= 1)
    assert.equal(d.sources.length, Object.keys(C.SOURCE_LABELS).length)
    const r3 = await mod.GET(new Request('https://x.example/api/advisor-store?view=state', { headers: { authorization: 'Bearer wrong' } }))
    assert.equal(r3.status, 401)
  } finally {
    globalThis.fetch = realFetch
  }
})

console.log(`✓ test-advisor: ${n} 件`)
