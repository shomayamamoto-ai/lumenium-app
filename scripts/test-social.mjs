// SNS投稿まわりのテスト。外には一切出ません（fetch はすべてここで受けます）。
//
//   node scripts/test-social.mjs
//
// 確かめること。
//   ・X の文字数（日本語=2、URL=23、絵文字=2）が X と同じ数え方になっているか
//   ・自社サイトへのリンクにだけ ?ref=<SNS名> が付くか
//   ・各SNSへの送り方（成功・時間切れ・エラー・Instagram の準備待ち・LINE の通数）
//   ・同時に送って一部だけ失敗したとき、どれがどうだったかが正しく返り、記録されるか
//   ・画面用に書き出したファイルと、毎朝の自動処理の時刻が、元とずれていないか

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const REDIS = 'https://redis.test.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'test-admin-key',
  UPSTASH_REDIS_REST_URL: REDIS, UPSTASH_REDIS_REST_TOKEN: 't',
  X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'ts',
  FB_PAGE_ID: '10', FB_PAGE_TOKEN: 'fb',
  IG_USER_ID: '20', IG_TOKEN: 'ig',
  THREADS_USER_ID: '30', THREADS_TOKEN: 'th',
  LI_AUTHOR_URN: 'urn:li:organization:1', LI_TOKEN: 'li',
  LINE_CHANNEL_TOKEN: 'line',
  SITE_URL: 'https://lumenium.net',
})

/* ---- Redis（リストとハッシュだけ） ---- */
const kv = new Map()
const lists = new Map()
const hashes = new Map()
function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    if (op === 'GET') return { result: kv.get(k) ?? null }
    if (op === 'SET') { kv.set(k, c[2]); return { result: 'OK' } }
    if (op === 'INCR') { const v = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(v)); return { result: v } }
    if (op === 'EXPIRE') return { result: 1 }
    if (op === 'DEL') { const had = kv.delete(k) || hashes.delete(k) || lists.delete(k); return { result: had ? 1 : 0 } }
    if (op === 'LPUSH') { const l = lists.get(k) || []; l.unshift(c[2]); lists.set(k, l); return { result: l.length } }
    if (op === 'LTRIM') { const l = lists.get(k) || []; lists.set(k, l.slice(c[2], c[3] + 1)); return { result: 'OK' } }
    if (op === 'LRANGE') { const l = lists.get(k) || []; return { result: l.slice(c[2], c[3] + 1) } }
    const h = hashes.get(k) || new Map()
    hashes.set(k, h)
    if (op === 'HSET') { h.set(String(c[2]), String(c[3])); return { result: 1 } }
    if (op === 'HGET') return { result: h.get(String(c[2])) ?? null }
    if (op === 'HDEL') return { result: h.delete(String(c[2])) ? 1 : 0 }
    if (op === 'HLEN') return { result: h.size }
    if (op === 'HGETALL') return { result: [...h].flat() }
    return { result: null }
  })
}

/* ---- fetch：テストごとに route を差し替えます ---- */
let route = () => null
const calls = []
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) return json(redis(JSON.parse(init.body || '[]')))
  calls.push({ url: u, init })
  const r = await route(u, init)
  if (r) return r
  throw new Error('test tried to reach: ' + u)
}
/** 返事をしない相手。中断されたら AbortError で終わります。 */
const hang = (init) => new Promise((_, no) => {
  const s = init && init.signal
  if (s) s.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' })))
})

const T = await import('../api/_social-text.js')
const S = await import('../api/_social.js')
const Q = await import('../api/_social-queue.js')

let passed = 0
let failed = 0
async function test(name, fn) {
  calls.length = 0
  try { await fn(); passed++; console.log('  ✓ ' + name) } catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')) }
}

const base = (over = {}) => ({ text: '', link: '', campaign: '', images: [], variants: {}, targets: [], sendId: '6f1c1a2e-1d1c-4c1e-9a1e-0123456789ab', ...over })

console.log('Xの文字数')
await test('ASCII 280 は通り、281 は超える', () => {
  assert.equal(T.xLength('a'.repeat(280)), 280)
  assert.equal(T.check('x', T.compose('x', base({ text: 'a'.repeat(280) }), 'lumenium.net')).errors.length, 0)
  assert.ok(T.check('x', T.compose('x', base({ text: 'a'.repeat(281) }), 'lumenium.net')).errors.length)
})
await test('日本語 140 は通り、141 は超える', () => {
  assert.equal(T.xLength('あ'.repeat(140)), 280)
  assert.equal(T.check('x', T.compose('x', base({ text: 'あ'.repeat(140) }), 'h')).errors.length, 0)
  assert.equal(T.xLength('あ'.repeat(141)), 282)
  assert.ok(T.check('x', T.compose('x', base({ text: 'あ'.repeat(141) }), 'h')).errors.length)
})
await test('URL は長さにかかわらず 23', () => {
  assert.equal(T.xLength('https://example.com/' + 'a'.repeat(200)), 23)
  assert.equal(T.xLength('見て https://a.jp'), 2 + 2 + 1 + 23)
  assert.equal(T.xLength('example.com'), 23)
  // 国別ドメインは / が無ければ URL ではない（twitter-text と同じ）
  assert.equal(T.xLength('example.jp'), 10)
  assert.equal(T.xLength('example.jp/a'), 23)
})
await test('絵文字は組み合わせでも 2', () => {
  assert.equal(T.xLength('😀'), 2)
  assert.equal(T.xLength('👨‍👩‍👧‍👦'), 2)
  assert.equal(T.xLength('👍🏽'), 2)
  assert.equal(T.xLength('🇯🇵'), 2)
  assert.equal(T.xLength('1️⃣'), 2)
  assert.equal(T.xLength('©'), 1)
})
await test('全角記号・半角カナ', () => {
  assert.equal(T.xLength('！'), 2)
  assert.equal(T.xLength('ｱ'), 2)
  assert.equal(T.xLength('—'), 1)   // U+2014 は 1 の範囲
})

console.log('計測用リンク')
await test('自社サイトにだけ ref が付く', () => {
  assert.equal(T.tagUrl('https://lumenium.net/a?b=1', 'x', '', 'lumenium.net'), 'https://lumenium.net/a?b=1&ref=x')
  assert.equal(T.tagUrl('https://www.lumenium.net/', 'line', '', 'lumenium.net'), 'https://www.lumenium.net/?ref=line')
  assert.equal(T.tagUrl('https://other.example/', 'x', 'c', 'lumenium.net'), 'https://other.example/')
  assert.equal(T.tagUrl('https://lumenium.net.evil.example/', 'x', '', 'lumenium.net'), 'https://lumenium.net.evil.example/')
})
await test('キャンペーン名は utm_campaign に', () => {
  const u = new URL(T.tagUrl('https://lumenium.net/', 'instagram', '秋 セール', 'lumenium.net'))
  assert.equal(u.searchParams.get('ref'), 'instagram')
  assert.equal(u.searchParams.get('utm_campaign'), '秋-セール')
})
await test('投稿先ごとに別の ref（本文の中のリンクにも）', () => {
  const p = base({ text: '詳しくは https://lumenium.net/menu 。', link: 'https://lumenium.net/' })
  for (const net of ['x', 'facebook', 'instagram', 'threads', 'linkedin', 'line']) {
    const c = T.compose(net, p, 'lumenium.net')
    assert.ok(c.text.includes(`https://lumenium.net/menu?ref=${net}`), net + ': ' + c.text)
    assert.ok(c.link === `https://lumenium.net/?ref=${net}`, net + ': ' + c.link)
  }
})
await test('Facebook は画像なしならリンクを別に（カード表示）', () => {
  const c = T.compose('facebook', base({ text: '本文', link: 'https://lumenium.net/' }), 'lumenium.net')
  assert.equal(c.text, '本文')
  assert.ok(c.linkSeparate)
})
await test('投稿先ごとの本文とリンクなし指定', () => {
  const p = base({ text: '共通', link: 'https://lumenium.net/', variants: { instagram: { text: 'IG用', noLink: true } } })
  assert.equal(T.compose('instagram', p, 'lumenium.net').text, 'IG用')
  assert.equal(T.compose('threads', p, 'lumenium.net').text, '共通\nhttps://lumenium.net/?ref=threads')
})
await test('X と LinkedIn は画像だけの投稿を断る', () => {
  const p = base({ images: [{ url: 'https://a.public.blob.vercel-storage.com/x.jpg' }], targets: ['x', 'linkedin', 'facebook'] })
  const probs = S.precheck(p, 'lumenium.net')
  assert.ok(probs.some((m) => m.startsWith('X：')))
  assert.ok(probs.some((m) => m.startsWith('LinkedIn：')))
  assert.ok(!probs.some((m) => m.startsWith('Facebook：')))
})
await test('X に付く画像はアップロードしたものだけ', () => {
  const c = T.compose('x', base({ text: 'a', images: [{ url: 'https://example.com/a.jpg' }, { url: 'https://s.public.blob.vercel-storage.com/b.jpg' }] }), 'h')
  assert.equal(c.images.length, 1)
  assert.ok(T.check('x', c).warnings.some((w) => w.includes('アップロード')))
})
await test('readPayload は http:// を断る', () => {
  const r = S.readPayload({ text: 'a', link: 'http://lumenium.net/', targets: ['x'] })
  assert.equal(r.ok, false)
  assert.ok(/https/.test(r.message))
})

console.log('各SNSへの送り方')
// 標準の相手：全部うまくいく
function happy(u, init) {
  if (u.includes('.public.blob.vercel-storage.com/')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0]), { headers: { 'content-type': 'image/jpeg' } })
  if (u.includes('api.x.com/2/media/upload/initialize')) return json({ data: { id: 'M1' } })
  if (u.includes('/append')) return new Response(null, { status: 204 })
  if (u.includes('/finalize')) return json({ data: { id: 'M1' } })
  if (u.includes('api.x.com/2/tweets')) return json({ data: { id: '111' } })
  if (u.includes('graph.facebook.com') && u.includes('/feed')) return json({ id: '10_1' })
  if (u.includes('graph.facebook.com') && u.includes('/photos')) return json({ id: 'p1', post_id: '10_2' })
  if (u.includes('/media_publish')) return json({ id: 'IG1' })
  if (u.includes('graph.facebook.com/v') && u.endsWith('/media')) return json({ id: 'C1' })
  if (u.includes('fields=status_code')) return json({ status_code: 'FINISHED' })
  if (u.includes('fields=permalink')) return json({ permalink: 'https://example.invalid/p/1' })
  if (u.includes('/threads_publish')) return json({ id: 'TH1' })
  if (u.includes('graph.threads.net') && u.endsWith('/threads')) return json({ id: 'TC1' })
  if (u.includes('fields=status,error_message')) return json({ status: 'FINISHED' })
  if (u.includes('api.linkedin.com/rest/posts')) return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } })
  if (u.includes('api.line.me/v2/bot/message/broadcast')) return json({}, 200, { 'x-line-request-id': 'req-1' })
  return null
}

await test('6つすべて成功し、記録される', async () => {
  route = happy
  const p = base({ text: 'テスト投稿です。', link: 'https://lumenium.net/', targets: ['x', 'facebook', 'instagram', 'threads', 'linkedin', 'line'],
    images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }] })
  const { results, kept, entry } = await S.sendPost(p, undefined)
  assert.equal(kept, true)
  assert.deepEqual(results.map((r) => [r.net, r.ok]), p.targets.map((t) => [t, true]))
  assert.equal(results.find((r) => r.net === 'x').url, 'https://x.com/i/web/status/111')
  assert.equal(results.find((r) => r.net === 'linkedin').id, 'urn:li:share:9')
  assert.equal(results.find((r) => r.net === 'line').id, 'req-1')
  assert.ok(entry.texts.x.includes('?ref=x'))
  // X には画像が1枚付いている
  const tweet = calls.find((c) => c.url.endsWith('/2/tweets'))
  assert.deepEqual(JSON.parse(tweet.init.body).media, { media_ids: ['M1'] })
  assert.ok(calls.some((c) => c.url.includes('/media/upload/M1/append')))
  // LINE は二重送信よけの鍵を付けている
  const line = calls.find((c) => c.url.includes('broadcast'))
  assert.equal(line.init.headers['X-Line-Retry-Key'], p.sendId)
  // LinkedIn は版を指定し、記号を逃がしている
  const li = calls.find((c) => c.url.includes('rest/posts'))
  assert.equal(li.init.headers['LinkedIn-Version'], S.LINKEDIN_VERSION)
  assert.ok(calls.some((c) => c.url.includes('graph.facebook.com/' + S.GRAPH_VERSION)))
})

await test('LinkedIn の本文は記号を逃がす', () => {
  assert.equal(S.liEscape('価格(税込) #新商品 @店'), '価格\\(税込\\) \\#新商品 \\@店')
})

await test('一部だけ失敗：結果は投稿先ごとに正しく、記録も残る', async () => {
  lists.clear()
  route = (u, init) => {
    if (u.includes('graph.facebook.com') && u.includes('/feed')) return json({ error: { message: 'Invalid OAuth access token.', code: 190 } }, 400)
    return happy(u, init)
  }
  const p = base({ text: '一部失敗のテスト', targets: ['x', 'facebook', 'threads'] })
  const { results, kept } = await S.sendPost(p, undefined)
  assert.deepEqual(results.map((r) => [r.net, r.ok]), [['x', true], ['facebook', false], ['threads', true]])
  assert.ok(results[1].message.startsWith('Facebook：'))
  assert.ok(results[1].message.includes('Invalid OAuth'))
  assert.equal(results[1].unknown, false)
  assert.equal(kept, true)
  const logged = JSON.parse(lists.get('lum:social:log')[0])
  assert.deepEqual(logged.results.map((r) => r.ok), [true, false, true])
})

await test('全部失敗した投稿は「発信量」に数えない', async () => {
  lists.clear()
  route = (u) => (u.includes('api.x.com') ? json({ detail: 'nope' }, 500) : null)
  await S.sendPost(base({ text: 'だめ', targets: ['x'] }), undefined)
  route = happy
  await S.sendPost(base({ text: 'よし', targets: ['x'] }), undefined)
  const a = await S.socialActivity(30)
  assert.equal(a.posts, 1)
  assert.equal(a.attempts, 2)
  assert.equal(a.failed, 1)
})

await test('公開の呼び出しが時間切れ → 「分からない」（再送を勧めない）', async () => {
  route = (u, init) => (u.includes('/feed') ? hang(init) : happy(u, init))
  const t0 = Date.now()
  const { results } = await S.sendPost(base({ text: '遅い', targets: ['facebook', 'x'] }), undefined, { budget: 2500 })
  assert.ok(Date.now() - t0 < 6000, 'budget not respected')
  const fb = results.find((r) => r.net === 'facebook')
  assert.equal(fb.ok, false)
  assert.equal(fb.unknown, true)
  assert.ok(fb.message.includes('分かりません'))
  assert.equal(results.find((r) => r.net === 'x').ok, true)
})

await test('下書き作成で時間切れ → 失敗（投稿していないと言える）', async () => {
  route = (u, init) => (u.includes('graph.threads.net') && u.endsWith('/threads') ? hang(init) : happy(u, init))
  const { results } = await S.sendPost(base({ text: '遅い', targets: ['threads'] }), undefined, { budget: 2000 })
  assert.equal(results[0].ok, false)
  assert.equal(results[0].unknown, false)
  assert.ok(results[0].message.includes('投稿はしていません'))
})

await test('Instagram：準備中を待ってから公開する', async () => {
  let asked = 0
  route = (u, init) => {
    if (u.includes('fields=status_code')) { asked++; return json({ status_code: asked < 3 ? 'IN_PROGRESS' : 'FINISHED' }) }
    return happy(u, init)
  }
  const { results } = await S.sendPost(base({ text: 'IG', targets: ['instagram'], images: [{ url: 'https://example.com/a.jpg' }] }), undefined)
  assert.equal(results[0].ok, true, results[0].message)
  assert.equal(asked, 3)
  const iStatus = calls.findIndex((c) => c.url.includes('fields=status_code'))
  const iPub = calls.findIndex((c) => c.url.includes('media_publish'))
  assert.ok(iStatus < iPub)
})

await test('Instagram：ERROR なら公開しない', async () => {
  route = (u, init) => (u.includes('fields=status_code') ? json({ status_code: 'ERROR' }) : happy(u, init))
  const { results } = await S.sendPost(base({ text: 'IG', targets: ['instagram'], images: [{ url: 'https://example.com/a.jpg' }] }), undefined)
  assert.equal(results[0].ok, false)
  assert.ok(!calls.some((c) => c.url.includes('media_publish')))
})

await test('LINE：同じ内容の再送（409）は「受け付け済み」', async () => {
  route = (u, init) => (u.includes('broadcast') ? json({ message: 'The retry key is already accepted' }, 409) : happy(u, init))
  const { results } = await S.sendPost(base({ text: 'お知らせ', targets: ['line'] }), undefined)
  assert.equal(results[0].ok, true)
  assert.ok(results[0].message.includes('二重送信'))
})

await test('LINE：今月の通数と、届く人数', async () => {
  route = (u) => {
    if (u.includes('/quota/consumption')) return json({ totalUsage: 150 })
    if (u.includes('/message/quota')) return json({ type: 'limited', value: 200 })
    if (u.includes('/insight/followers')) return json({ status: 'ready', followers: 60, targetedReaches: 55, blocks: 5 })
    if (u.includes('publishing_limit')) return json({ data: [{ quota_usage: 3, config: { quota_total: 100 } }] })
    return null
  }
  const q = await S.socialQuotas(undefined)
  assert.equal(q.line.limit, 200)
  assert.equal(q.line.used, 150)
  assert.equal(q.line.remaining, 50)
  assert.equal(q.line.reach, 55)
  assert.equal(q.instagram.remaining, 97)
  const d = calls.find((c) => c.url.includes('followers')).url.match(/date=(\d{8})/)[1]
  assert.equal(d.length, 8)
})

await test('接続テスト：期限切れと権限不足を言い分ける', async () => {
  route = (u) => (u.includes('/me?') ? json({ error: { message: 'Session has expired', code: 190 } }, 400) : null)
  const a = await S.testNetwork('threads', undefined)
  assert.equal(a.state, 'expired')
  route = (u) => (u.includes('users/me') ? json({ title: 'Forbidden' }, 403) : null)
  const b = await S.testNetwork('x', undefined)
  assert.equal(b.state, 'permission')
  route = (u) => (u.includes('bot/info') ? json({ displayName: '店' }) : null)
  const c = await S.testNetwork('line', undefined)
  assert.equal(c.ok, true)
})

await test('環境変数の Threads トークンは延長しない（理由を言う）', async () => {
  const r = await S.refreshThreadsToken(undefined)
  assert.equal(r.ok, false)
  assert.ok(r.message.includes('環境変数'))
})

console.log('ずれの確認')
await test('画面用の social-text.js が元と同じ', async () => {
  const { build } = await import('./build-social-text.mjs')
  assert.equal(readFileSync(new URL('../public/social-text.js', import.meta.url), 'utf8'), build(),
    'public/social-text.js が古いままです。node scripts/build-social-text.mjs を実行してください。')
})
await test('毎朝の時刻が vercel.json と同じ', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const c = (v.crons || []).find((x) => x.path === Q.SCHEDULE.path)
  assert.ok(c, 'vercel.json に ' + Q.SCHEDULE.path + ' の crons がありません')
  assert.equal(c.schedule, Q.SCHEDULE.cron)
  // Hobby プランは1日1回まで。分と時が数字1つでないと、デプロイが失敗します。
  assert.match(c.schedule, /^\d{1,2} \d{1,2} \* \* \*$/)
  assert.equal((Number(c.schedule.split(' ')[1]) + 9) % 24, Q.SCHEDULE.jstHour)
})
await test('自動処理は CRON_SECRET が無いと動かない', async () => {
  delete process.env.CRON_SECRET
  const m = await import('../api/social-cron.js')
  const r = await m.GET(new Request('https://lumenium.net/api/social-cron'))
  assert.equal(r.status, 503)
  process.env.CRON_SECRET = 'sec'
  const r2 = await m.GET(new Request('https://lumenium.net/api/social-cron', { headers: { authorization: 'Bearer wrong' } }))
  assert.equal(r2.status, 401)
})
await test('予約：明日以降だけ、取り出しは1回だけ', async () => {
  process.env.CRON_SECRET = 'sec'
  const bad = await Q.addScheduled(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), base({ text: 'a', targets: ['x'] }))
  assert.equal(bad.ok, false)
  const tomorrow = new Date(Date.now() + 33 * 3600000).toISOString().slice(0, 10)
  const ok = await Q.addScheduled(tomorrow, base({ text: 'a', targets: ['x'] }))
  assert.equal(ok.ok, true)
  assert.equal((await Q.listScheduled()).length, 1)
  assert.equal(await Q.claim(ok.item.id), true)
  assert.equal(await Q.claim(ok.item.id), false)
})
await test('アップロード：中身で形式を確かめる', async () => {
  const { sniff } = await import('../api/social-upload.js')
  assert.equal(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png')
  assert.equal(sniff(new TextEncoder().encode('<svg onload=alert(1)>')), '')
})
await test('AI下書き：ハッシュタグは3つまで、Xは日本語で収まる長さ', async () => {
  const { assemble, budgetFor } = await import('../api/social-write.js')
  assert.equal(assemble('x', { text: '本文', hashtags: ['a', '#b', 'c', 'd'] }), '本文\n\n#a #b #c')
  assert.equal(assemble('linkedin', { text: '本文', hashtags: ['a'] }), '本文')
  assert.ok(T.xLength('あ'.repeat(budgetFor('x', true)) + '\n\n#ab #cd #ef\nhttps://lumenium.net/') <= 280)
})

console.log('投稿前チェック（表現）')
const kinds = (t, net, st) => T.review(t, net, st).map((r) => r.kind + ':' + r.level)
await test('景品表示法：根拠の無い「最安」「No.1」「絶対〜痩せる」は warn', () => {
  const k = kinds('地域最安値！No.1の味。絶対に痩せる！', 'facebook')
  assert.ok(k.includes('keihyo:warn'))
  assert.equal(T.review('地域最安値', 'x').find((r) => r.kind === 'keihyo').word, '地域最安')
  assert.ok(T.review('No.1の味', 'x').some((r) => r.word === 'No.1'))
  assert.ok(k.includes('yakki:warn'))
  assert.ok(T.review('最安値です', 'x')[0].alt.includes('当店調べ'))
})
await test('景品表示法：根拠（※〜調べ）があれば note に下がる', () => {
  assert.deepEqual(kinds('満足度No.1 ※2026年8月 当社調べ', 'x'), ['keihyo:note'])
})
await test('事実の説明は拾わない（完全予約制・果汁100%・必ずご予約・ご来店いただきました）', () => {
  assert.deepEqual(kinds('完全予約制です。果汁100%ジュース。必ずご予約ください。ご来店いただきました。', 'facebook'), [])
  assert.ok(kinds('効果100%保証', 'x').includes('keihyo:warn'))
  // 「最高」は感想のことが多いので note
  assert.deepEqual(kinds('最高の一日でした', 'x'), ['keihyo:note'])
})
await test('薬機法：効き目をうたう言い方（シミが消える・アンチエイジング）', () => {
  const r = T.review('シミが消える美容液。アンチエイジングに。', 'instagram')
  assert.deepEqual(r.map((x) => x.word), ['シミが消え', 'アンチエイジング'])
  assert.ok(r.every((x) => x.alt))
})
await test('ステマ規制：提供を受けた紹介で PR 表示が無いときだけ', () => {
  assert.ok(kinds('〇〇さんから商品をご提供いただきました！', 'x').includes('stema:warn'))
  assert.deepEqual(kinds('【PR】〇〇さんから商品をご提供いただきました', 'x'), [])
  assert.deepEqual(kinds('#PR 〇〇さんから商品をご提供いただきました', 'x'), [])
  assert.deepEqual(kinds('自分のお店の新商品です', 'x'), [])
})
await test('二重価格：期間が無いと warn、あると note、比べていなければ何も出ない', () => {
  assert.deepEqual(kinds('通常価格3,000円→2,400円', 'facebook'), ['nijuu:warn'])
  assert.deepEqual(kinds('通常価格3,000円→9月30日まで2,400円', 'facebook'), ['nijuu:note'])
  assert.deepEqual(kinds('通常料金 3,000円です', 'facebook'), [])
})
await test('個人の情報：電話・メール・住所（URL の中は見ない）', () => {
  const r = T.review('お電話は 090-1234-5678 まで。mail: shop@example.com 東京都渋谷区神南1-2-3', 'facebook')
  assert.deepEqual(r.map((x) => x.kind), ['privacy', 'privacy', 'privacy'])
  assert.deepEqual(kinds('https://example.com/09012345678', 'facebook'), [])
})
await test('ハッシュタグの数：X は3個から、Instagram は6個から、Threads は2個から', () => {
  assert.equal(T.hashtags('#a ＃b 本文 https://x.com/p#frag #1').length, 2)
  assert.deepEqual(kinds('#a #b 本文', 'x'), [])
  assert.deepEqual(kinds('#a #b #c 本文', 'x'), ['platform:warn'])
  assert.deepEqual(kinds('#a #b #c #d #e', 'instagram'), [])
  assert.deepEqual(kinds('#a #b #c #d #e #f', 'instagram'), ['platform:note'])
  assert.deepEqual(kinds('#a', 'threads'), [])
  assert.deepEqual(kinds('#a #b', 'threads'), ['platform:note'])
})
await test('このサイトの決まり：行から読み、確かめ、使わない言葉を拾う', () => {
  const parsed = T.parseStyleLines('激安 → お求めやすい（安っぽく見えるため）\n\n激安', 'お客様 → お客さま ／ 例外: お客様各位, 関係ない\nWeb → Webサイト\n同じ → 同じ\n片方だけ')
  const { style, problems } = T.validateStyle(parsed)
  assert.deepEqual(style.ng, [{ word: '激安', alt: 'お求めやすい', why: '安っぽく見えるため' }])
  assert.deepEqual(style.notation, [{ from: 'お客様', to: 'お客さま', except: ['お客様各位'] }, { from: 'Web', to: 'Webサイト', except: [] }])
  assert.equal(problems.length, 2)
  assert.deepEqual(T.validateStyle(T.parseStyleLines(T.styleToLines(style).ng, T.styleToLines(style).notation)).style, style)
  const r = T.review('激安セール', 'x', style)
  assert.equal(r[0].kind, 'ng')
  assert.equal(r[0].alt, '「お求めやすい」')
  assert.equal(T.validateStyle({ ng: Array.from({ length: 150 }, (_, i) => 'w' + i) }).style.ng.length, 100)
  assert.equal(T.validateStyle({ ng: ['a'.repeat(99)] }).style.ng[0].word.length, 30)
})
await test('表記の自動修正：例外・直した形・URL の中は変えない', () => {
  const rules = [{ from: 'お客様', to: 'お客さま', except: ['お客様各位'] }, { from: 'Web', to: 'Webサイト', except: [] }]
  const r = T.applyNotation('お客様各位　お客様へ。Webサイト と Web の話 https://Web.example.com/Web', rules)
  assert.equal(r.text, 'お客様各位　お客さまへ。Webサイト と Webサイト の話 https://Web.example.com/Web')
  assert.equal(r.changes, 2)
  assert.equal(T.applyNotation(r.text, rules).changes, 0)
  const item = T.review('お客様へ', 'x', { notation: rules }).find((x) => x.kind === 'notation')
  assert.equal(item.fix, true)
  assert.equal(item.count, 1)
})
await test('決まりの保存：管理キーが要り、確かめた形だけを保存する', async () => {
  const api = await import('../api/social.js')
  const put = (body, key = 'test-admin-key') => api.PUT(new Request('https://lumenium.net/api/social', {
    method: 'PUT', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  assert.equal((await put({ style: { ng: ['激安'] } }, 'wrong')).status, 401)
  const res = await put({ style: { ng: ['激安', ''], notation: [{ from: 'A', to: 'A' }] } })
  const d = await res.json()
  assert.equal(d.ok, true)
  assert.deepEqual(d.style.ng.map((w) => w.word), ['激安'])
  assert.equal(d.problems.length, 1)
  const { readStyle } = await import('../api/_social-store.js')
  assert.deepEqual((await readStyle()).ng.map((w) => w.word), ['激安'])
})

console.log('投稿ごとの成果')
const I = await import('../api/_social-insights.js')
await test('アクセス解析と同じ名前で数える（ref と utm_campaign）', () => {
  assert.equal(I.fieldFor('x', ''), 'x/-/-')
  assert.equal(I.fieldFor('instagram', '秋 セール'), 'instagram/-/秋-セール')
  assert.equal(I.fieldFor('line', 'Autumn!'), 'line/-/autumn')
})
await test('送った記録に、印を付けた投稿先が残る', async () => {
  route = happy
  const p = base({ text: '見てね', link: 'https://lumenium.net/', campaign: 'aki', targets: ['x', 'facebook'] })
  const { entry } = await S.sendPost(p, undefined)
  assert.deepEqual(entry.refs, { x: 'x/-/aki', facebook: 'facebook/-/aki' })
  const { entry: e2 } = await S.sendPost(base({ text: 'リンクなし', targets: ['x'] }), undefined)
  assert.deepEqual(e2.refs, {})
})
await test('7日間の訪問と問い合わせを足す。重なる投稿は「重なり」と出し、まとめでは二重に数えない', () => {
  const at = (day, h = 10) => new Date(Date.parse(day + 'T00:00:00+09:00') + h * 3600000).toISOString()
  const ok = (net) => ({ net, ok: true })
  const posts = [
    { id: 'a', at: at('2026-09-01'), refs: { x: 'x/-/-', line: 'line/-/sale' }, results: [ok('x'), ok('line')] },
    { id: 'b', at: at('2026-09-05'), refs: { x: 'x/-/-' }, results: [ok('x'), { net: 'threads', ok: false }] },
    { id: 'c', at: at('2026-09-20'), refs: {}, results: [ok('x')] },
  ]
  const daily = {}
  for (let i = 0; i < 30; i++) {
    const d = I.addDays('2026-08-31', i)
    daily[d] = { visits: { 'x/-/-': 1, 'line/-/sale': 2 }, contact_submit: d === '2026-09-03' ? { 'x/-/-': 1 } : {}, booking_confirm: d === '2026-09-12' ? { 'x/-/-': 1 } : {} }
  }
  const r = I.attribute(posts, daily, '2026-09-25', 'lumenium.net')
  // 9/1〜9/8 の8日分
  assert.equal(r.a.x.visits, 8)
  assert.equal(r.a.x.inquiries, 1)
  assert.equal(r.a.line.visits, 16)
  assert.deepEqual(r.a.x.shared.map((o) => o.id), ['b'])
  assert.deepEqual(r.a.line.shared, [])
  // 9/5〜9/12：問い合わせ（9/3）は入らず、予約（9/12）は入る
  assert.equal(r.b.x.visits, 8)
  assert.equal(r.b.x.contact, 1 - 1)
  assert.equal(r.b.x.booking, 1)
  assert.equal(r.b.threads, undefined)
  assert.equal(r.c.x.untagged, true)
  const s = I.summarizeByNet(posts, daily, '2026-09-25', 30, 'lumenium.net')
  // 9/1〜9/12 の12日分（重なった 9/5〜9/8 は1回だけ）
  assert.equal(s.x.visits, 12)
  assert.equal(s.x.posts, 3)
  assert.equal(s.x.tagged, 2)
  assert.equal(s.x.inquiries, 2)
})
await test('まだ7日たっていない投稿は「集計中」、今日までしか数えない', () => {
  const posts = [{ id: 'n', at: new Date(Date.parse('2026-09-24T01:00:00Z')).toISOString(), refs: { x: 'x/-/-' }, results: [{ net: 'x', ok: true }] }]
  const daily = { '2026-09-24': { visits: { 'x/-/-': 3 } }, '2026-09-25': { visits: { 'x/-/-': 4 } } }
  const r = I.attribute(posts, daily, '2026-09-25', 'h')
  assert.equal(r.n.x.open, true)
  assert.equal(r.n.x.to, '2026-09-25')
  assert.equal(r.n.x.visits, 7)
})
await test('古い記録（refs なし）は、送った本文とリンクから判断する', () => {
  assert.equal(I.taggedField({ texts: { x: '見て https://lumenium.net/?ref=x' }, campaign: '' }, 'x', 'lumenium.net'), 'x/-/-')
  assert.equal(I.taggedField({ texts: {}, link: 'https://lumenium.net/', campaign: 'c' }, 'facebook', 'lumenium.net'), 'facebook/-/c')
  assert.equal(I.taggedField({ texts: {}, link: 'https://other.example/' }, 'x', 'lumenium.net'), '')
})
await test('成果の読み込み：アクセス解析の日ごとの数を引く', async () => {
  const day = I.jstDay(Date.now())
  hashes.set(`${(await import('../api/_brand.js')).KV}cp:d:${day}`, new Map([['x/-/aki', '5']]))
  const posts = [{ id: 'z', at: new Date().toISOString(), refs: { x: 'x/-/aki' }, results: [{ net: 'x', ok: true }] }]
  const r = await I.socialInsights(posts, undefined)
  assert.equal(r.ok, true)
  assert.equal(r.results.z.x.visits, 5)
  assert.equal(r.summary.d30.x.visits, 5)
})

console.log('いつ出すと良いか')
await test('材料が足りないときは一般論で、足りないものを言う', () => {
  const r = I.recommend([], {}, '2026-09-25', ['x', 'line'])
  assert.equal(r.x.basis, 'general')
  assert.equal(r.x.missing.length, 2)
  assert.ok(r.x.missing[0].includes('0 件'))
  assert.deepEqual(r.line.weekdays, I.GENERAL.line.weekdays)
})
await test('反応のある投稿が10件以上なら、反応のいちばん大きい曜日と時間帯', () => {
  const posts = []
  for (let i = 0; i < 12; i++) {
    // 火曜 19時（JST）に出した投稿だけ反応が大きい
    const tue = i % 2 === 0
    const day = tue ? `2026-09-${String(1 + (i % 4) * 7).padStart(2, '0')}` : `2026-09-${String(3 + (i % 4) * 7).padStart(2, '0')}`
    const at = new Date(Date.parse(day + 'T00:00:00+09:00') + (tue ? 19 : 8) * 3600000).toISOString()
    posts.push({ at, results: [{ net: 'x', ok: true, metrics: { ok: true, likes: tue ? 30 : 2, comments: 1 } }] })
  }
  const r = I.recommend(posts, {}, '2026-09-25', ['x'])
  assert.equal(r.x.basis, 'posts')
  assert.deepEqual(r.x.hours, [[18, 21]])
  assert.equal(r.x.weekdays[0], 2)
  // 9件では出さない
  assert.equal(I.recommend(posts.slice(0, 9), {}, '2026-09-25', ['x']).x.basis, 'general')
})
await test('計測リンクからの訪問が30件以上なら、サイトの数字から', () => {
  const hourly = { '2026-09-18': { 'line\t12': 20, 'line\t20': 5, 'x\t9': 3 }, '2026-09-21': { 'line\t13': 10 } }
  const r = I.recommend([], hourly, '2026-09-25', ['line', 'x'])
  assert.equal(r.line.basis, 'site')
  assert.deepEqual(r.line.hours, [[12, 15]])
  assert.equal(r.line.weekdays[0], 5)   // 2026-09-18 は金曜
  assert.equal(r.x.basis, 'general')
  // 90日より前は数えない
  assert.equal(I.recommend([], { '2026-05-01': { 'line\t12': 99 } }, '2026-09-25', ['line']).line.basis, 'general')
})
await test('訪問の時間帯は、計測リンクの名前ごとに数える（キャンペーン名は入れない）', async () => {
  const { visitPlan } = await import('../api/_visit.js')
  const plan = visitPlan({ kind: 'view', ev: '', body: { n: 0, s: 'x', c: 'aki' }, path: '/', date: '2026-09-25', source: 'src:x', selfRef: false, clean: (p) => p, hour: 21 })
  const slot = plan.slots.find((s) => s[0].endsWith('cp:h:2026-09-25'))
  assert.deepEqual(slot.slice(1), ['x\t21', 'other'])
  const none = visitPlan({ kind: 'view', ev: '', body: { n: 1, s: 'x' }, path: '/', date: '2026-09-25', source: 'src:x', selfRef: false, clean: (p) => p, hour: 21 })
  assert.ok(!none.slots.some((s) => s[0].includes('cp:h:')))
})

console.log('Googleビジネスプロフィール・Bluesky')
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec', GBP_REFRESH_TOKEN: 'gbp-refresh-token-1', GBP_LOCATION: 'accounts/11/locations/22',
  BSKY_HANDLE: '@shop.bsky.social', BSKY_APP_PASSWORD: 'abcd-efgh-ijkl-mnop',
})
await test('数え方：GBP は1500文字、Bluesky は見た目の文字数で300', () => {
  assert.equal(T.lengthFor('bluesky', '👨‍👩‍👧‍👦あ'), 2)
  assert.equal(T.lengthFor('gbp', 'あいう'), 3)
  assert.equal(T.check('bluesky', T.compose('bluesky', base({ text: 'あ'.repeat(300) }), 'h')).errors.length, 0)
  assert.ok(T.check('bluesky', T.compose('bluesky', base({ text: 'あ'.repeat(301) }), 'h')).errors.length)
  assert.ok(T.check('gbp', T.compose('gbp', base({ text: 'あ'.repeat(1501) }), 'h')).errors.length)
})
await test('GBP：リンクは本文に入れずボタンへ（ref=gbp 付き）。本文の電話番号は注意', () => {
  const c = T.compose('gbp', base({ text: '秋の新メニュー', link: 'https://lumenium.net/menu' }), 'lumenium.net')
  assert.equal(c.text, '秋の新メニュー')
  assert.equal(c.link, 'https://lumenium.net/menu?ref=gbp')
  assert.ok(c.linkSeparate)
  const k = T.check('gbp', T.compose('gbp', base({ text: 'お電話は 03-1234-5678 へ' }), 'h'))
  assert.ok(k.warnings.some((w) => w.includes('電話番号')))
})
await test('Bluesky の facets：日本語の位置は UTF-8 のバイト数', () => {
  const text = '新メニュー https://lumenium.net/a?ref=bluesky と #秋限定 です'
  const f = T.blueskyFacets(text)
  assert.equal(f.length, 2)
  const enc = new TextEncoder()
  // 「新メニュー 」= 5文字×3バイト + 空白1 = 16
  assert.deepEqual(f[0].index, { byteStart: 16, byteEnd: 16 + 'https://lumenium.net/a?ref=bluesky'.length })
  assert.equal(f[0].features[0].uri, 'https://lumenium.net/a?ref=bluesky')
  const bytes = enc.encode(text)
  assert.equal(new TextDecoder().decode(bytes.slice(f[1].index.byteStart, f[1].index.byteEnd)), '#秋限定')
  assert.deepEqual(f[1].features[0], { $type: 'app.bsky.richtext.facet#tag', tag: '秋限定' })
})
function gbpRoute(u, init) {
  if (u.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'g-at', expires_in: 3600 })
  if (u.includes('mybusiness.googleapis.com/v4/accounts/11/locations/22/localPosts')) {
    return json({ name: 'accounts/11/locations/22/localPosts/99', searchUrl: 'https://local.google.com/place?id=1&use=posts&lpsid=99' })
  }
  if (u.startsWith('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')) return json({ accounts: [{ name: 'accounts/11', accountName: '店' }] })
  if (u.startsWith('https://mybusinessbusinessinformation.googleapis.com/v1/accounts/11/locations')) {
    return json({ locations: [{ name: 'locations/22', title: '本店', storefrontAddress: { administrativeArea: '東京都', locality: '渋谷区', addressLines: ['神南1-2-3'] } }] })
  }
  return happy(u, init)
}
await test('GBP：localPosts.create にボタン・写真・本文を渡す', async () => {
  route = gbpRoute
  const p = base({ text: '秋の新メニュー', link: 'https://lumenium.net/menu', targets: ['gbp'], gbp: { action: 'BOOK' },
    images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }] })
  const { results, entry } = await S.sendPost(p, undefined)
  assert.equal(results[0].ok, true, results[0].message)
  assert.equal(results[0].id, 'accounts/11/locations/22/localPosts/99')
  const sent = calls.find((c) => c.url.includes('/localPosts'))
  assert.equal(sent.init.headers.Authorization, 'Bearer g-at')
  const body = JSON.parse(sent.init.body)
  assert.equal(body.summary, '秋の新メニュー')
  assert.equal(body.topicType, 'STANDARD')
  assert.deepEqual(body.callToAction, { actionType: 'BOOK', url: 'https://lumenium.net/menu?ref=gbp' })
  assert.deepEqual(body.media, [{ mediaFormat: 'PHOTO', sourceUrl: 'https://s.public.blob.vercel-storage.com/a.jpg' }])
  assert.equal(entry.refs.gbp, 'gbp/-/-')
})
await test('GBP：電話ボタンは URL なし、知らないボタンは「詳細」、403 は申請の案内', async () => {
  const { gbpBody } = await import('../api/_social-more.js')
  const c = T.compose('gbp', base({ text: 'a', link: 'https://lumenium.net/' }), 'lumenium.net')
  assert.deepEqual(gbpBody(c, { gbp: { action: 'CALL' } }).callToAction, { actionType: 'CALL' })
  assert.equal(S.readPayload({ text: 'a', targets: ['gbp'], gbp: { action: 'HACK' } }).payload.gbp.action, 'LEARN_MORE')
  route = (u, init) => (u.includes('/localPosts') ? json({ error: { code: 403, message: 'denied' } }, 403) : gbpRoute(u, init))
  const { results } = await S.sendPost(base({ text: 'a', targets: ['gbp'] }), undefined)
  assert.equal(results[0].ok, false)
  assert.ok(results[0].message.includes('利用申請'))
})
await test('GBP：店舗の一覧（accounts/…/locations/… の形で返す）', async () => {
  route = gbpRoute
  const { gbpLocations } = await import('../api/_social-more.js')
  const r = await gbpLocations(undefined)
  assert.deepEqual(r.locations, [{ name: 'accounts/11/locations/22', title: '本店', address: '東京都 渋谷区 神南1-2-3', account: '店' }])
})
function bskyRoute(u, init) {
  if (u.endsWith('/xrpc/com.atproto.server.createSession')) return json({ accessJwt: 'jwt', did: 'did:plc:abc', handle: 'shop.bsky.social' })
  if (u.endsWith('/xrpc/com.atproto.repo.uploadBlob')) return json({ blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/jpeg', size: 4 } })
  if (u.endsWith('/xrpc/com.atproto.repo.createRecord')) return json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', cid: 'c' })
  return happy(u, init)
}
await test('Bluesky：ログイン → 画像 → 投稿（facets と画像つき）', async () => {
  route = bskyRoute
  const p = base({ text: '見てね #秋', link: 'https://lumenium.net/', targets: ['bluesky'], images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }] })
  const { results } = await S.sendPost(p, undefined)
  assert.equal(results[0].ok, true, results[0].message)
  assert.equal(results[0].url, 'https://bsky.app/profile/shop.bsky.social/post/3kxyz')
  const login = JSON.parse(calls.find((c) => c.url.endsWith('createSession')).init.body)
  assert.equal(login.identifier, 'shop.bsky.social')
  const rec = JSON.parse(calls.find((c) => c.url.endsWith('createRecord')).init.body)
  assert.equal(rec.repo, 'did:plc:abc')
  assert.equal(rec.record.text, '見てね #秋\nhttps://lumenium.net/?ref=bluesky')
  assert.deepEqual(rec.record.facets.map((f) => f.features[0].$type), ['app.bsky.richtext.facet#tag', 'app.bsky.richtext.facet#link'])
  assert.equal(rec.record.embed.images[0].image.ref.$link, 'bafy')
})
await test('Bluesky：パスワード違いは分かる言葉で、1MB を超える画像は送らない', async () => {
  route = (u, init) => (u.endsWith('createSession') ? json({ error: 'AuthenticationRequired', message: 'Invalid' }, 401) : bskyRoute(u, init))
  let { results } = await S.sendPost(base({ text: 'a', targets: ['bluesky'] }), undefined)
  assert.ok(results[0].message.includes('アプリパスワード'))
  route = (u, init) => (u.includes('vercel-storage.com') ? new Response(new Uint8Array(1000001), { headers: { 'content-type': 'image/jpeg' } }) : bskyRoute(u, init))
  ;({ results } = await S.sendPost(base({ text: 'a', targets: ['bluesky'], images: [{ url: 'https://s.public.blob.vercel-storage.com/big.jpg' }] }), undefined))
  assert.equal(results[0].ok, false)
  assert.ok(results[0].message.includes('1MB'))
  assert.ok(!calls.some((c) => c.url.endsWith('createRecord')))
})
await test('Google 接続：GBP は用途つきの署名で、別のトークンに保存する', async () => {
  const g = await import('../api/google-oauth.js')
  const s = await g.makeState('gbp')
  assert.equal(await g.checkState(s), 'gbp')
  assert.equal(await g.checkState(await g.makeState()), 'cal')
  const [exp, , sig] = s.split('.')
  assert.equal(await g.checkState(`${exp}.cal.${sig}`), false)
  assert.equal(await g.checkState(`${exp}.${sig}`), false)
  const res = await g.GET(new Request('https://lumenium.net/api/google-oauth?start=1&for=gbp', { headers: { authorization: 'Bearer test-admin-key' } }))
  const d = await res.json()
  assert.ok(decodeURIComponent(d.url).includes('business.manage'))
  assert.ok(!decodeURIComponent(d.url).includes('calendar'))
})

console.log('反応の自動取得')
await test('1日後と7日後だけ、X は許したときだけ、取れないSNSと取得済みは外す', () => {
  const now = Date.parse('2026-09-25T00:00:00Z')
  const H = 3600000
  const ok = (net, metrics) => ({ net, ok: true, id: net + '-1', metrics })
  const posts = [
    { id: 'p1', at: new Date(now - 26 * H).toISOString(), results: [ok('x'), ok('threads'), ok('linkedin'), ok('gbp'), { net: 'line', ok: false }] },
    { id: 'p7', at: new Date(now - 7 * 24 * H).toISOString(), results: [ok('facebook', { ok: true, at: new Date(now - 0.2 * 24 * H).toISOString() }), ok('bluesky', { ok: true, at: new Date(now - 7 * 24 * H + 2 * H).toISOString() })] },
    { id: 'p4', at: new Date(now - 4 * 24 * H).toISOString(), results: [ok('threads')] },
    { id: 'p0', at: new Date(now - 5 * H).toISOString(), results: [ok('threads')] },
  ]
  const due = S.dueForRefresh(posts, now)
  assert.deepEqual(due.map((d) => d.entryId + ':' + d.net + ':' + d.stage), ['p1:threads:d1', 'p7:bluesky:d7'])
  assert.ok(S.dueForRefresh(posts, now, { allowX: true }).some((d) => d.net === 'x'))
  assert.equal(S.dueForRefresh(posts, now, { allowX: true, max: 1 }).length, 1)
  assert.deepEqual(S.dueForRefresh(posts, now, { ready: ['bluesky'] }).map((d) => d.net), ['bluesky'])
})
await test('毎朝の取得：数字を保存し、履歴に載る', async () => {
  lists.clear()
  hashes.clear()
  const at = new Date(Date.now() - 30 * 3600000).toISOString()
  await S.logPosts({ id: 'auto1', at, text: 't', results: [{ net: 'threads', label: 'Threads', ok: true, id: 'TH9' }, { net: 'x', label: 'X', ok: true, id: '1' }] })
  route = (u) => (u.includes('/TH9/insights') ? json({ data: [{ name: 'likes', values: [{ value: 4 }] }, { name: 'views', values: [{ value: 50 }] }] }) : null)
  const r = await S.refreshDue({ allowX: false })
  assert.equal(r.fetched, 1)
  assert.ok(!calls.some((c) => c.url.includes('api.x.com')))
  const p = (await S.recentPosts(5)).find((x) => x.id === 'auto1')
  assert.equal(p.results.find((x) => x.net === 'threads').metrics.likes, 4)
  assert.equal(p.results.find((x) => x.net === 'threads').metrics.stage, 'd1')
  assert.equal((await S.refreshDue({ allowX: false })).fetched, 0)
})
await test('設定：X の自動取得は true のときだけ', async () => {
  const st = await import('../api/_social-store.js')
  assert.deepEqual(st.cleanPrefs({ xAutoMetrics: 'yes' }), { xAutoMetrics: false })
  await st.savePrefs({ xAutoMetrics: true })
  assert.deepEqual(await st.readPrefs(), { xAutoMetrics: true })
})

console.log('定型文')
await test('定型文：題名と本文が要り、知らない投稿先・http のリンクは落とす', async () => {
  const st = await import('../api/_social-store.js')
  const { templates, problems } = st.validateTemplates([
    { title: '定休日', text: '〇日は休みです', nets: ['x', 'line', 'myspace'], campaign: '秋 セール', link: 'http://a.example/' },
    { title: '', text: 'a' },
    { title: '空', text: '  ' },
  ])
  assert.equal(templates.length, 1)
  assert.deepEqual(templates[0].nets, ['x', 'line'])
  assert.equal(templates[0].campaign, '秋-セール')
  assert.equal(templates[0].link, '')
  assert.equal(problems.length, 2)
  assert.equal(st.validateTemplates(Array.from({ length: 40 }, (_, i) => ({ title: 't' + i, text: 'x' }))).templates.length, 30)
})
await test('定型文の保存：PUT で全体を置き換え、GET で返る', async () => {
  const api = await import('../api/social.js')
  const res = await api.PUT(new Request('https://lumenium.net/api/social', {
    method: 'PUT', headers: { authorization: 'Bearer test-admin-key', 'content-type': 'application/json' },
    body: JSON.stringify({ templates: [{ id: 'tpl-000001', title: '新メニュー', text: '始めました', nets: ['instagram'], link: 'https://lumenium.net/menu' }] }) }))
  const d = await res.json()
  assert.equal(d.ok, true)
  const st = await import('../api/_social-store.js')
  const list = await st.readTemplates()
  assert.deepEqual(list.map((t) => [t.id, t.title, t.link]), [['tpl-000001', '新メニュー', 'https://lumenium.net/menu']])
})

console.log('見え方の区切り（目安）')
await test('短い本文は畳まれない。Threads・Bluesky・X には区切りが無い', () => {
  assert.equal(T.foldAt('instagram', '秋の新メニューです。'), -1)
  assert.equal(T.foldAt('threads', 'あ'.repeat(400)), -1)
  assert.equal(T.foldAt('bluesky', 'あ'.repeat(290)), -1)
  assert.equal(T.foldAt('x', 'あ'.repeat(140)), -1)
})
await test('Instagram：日本語は125文字より先に2行で畳まれる（全角=半角2つ分の幅）', () => {
  const at = T.foldAt('instagram', 'あ'.repeat(200))
  // 1行目はアカウント名（幅12）のぶん短い：(50-12)/2 = 19文字、2行目 25文字
  assert.equal(at, 19 + 25)
  // 半角だけでも、125文字より先に2行（幅50×2 − 名前の12 = 88文字）に届く
  assert.equal(T.foldAt('instagram', 'a'.repeat(300)), 38 + 50)
})
await test('改行は1行として数え、区切りの前の改行は見えている側に入れない', () => {
  const t = '1行目\n2行目\n3行目は見えない'
  assert.equal(T.foldAt('instagram', t), '1行目\n2行目'.length)
  assert.equal(T.foldAt('facebook', '一\n二\n三\n四'), '一\n二\n三'.length)
})
await test('LinkedIn は約210文字、Facebook は約480文字か3行の早いほう', () => {
  assert.equal(T.foldAt('linkedin', 'a'.repeat(300)), 168) // 3行 × 幅56
  assert.equal(T.foldAt('linkedin', 'a b '.repeat(100)) <= 210, true)
  assert.equal(T.foldAt('facebook', 'a'.repeat(170)), 168)
})
await test('LINE は通知に出る約30文字', () => {
  assert.equal(T.foldAt('line', 'あ'.repeat(29)), -1)
  assert.equal(T.foldAt('line', 'あ'.repeat(31)), 30)
  assert.equal(T.foldCheck('line', 'あ'.repeat(40) + 'ご予約はこちら').notice, true)
})
await test('URL の途中では区切らない', () => {
  const t = 'あ'.repeat(40) + 'https://lumenium.net/menu-autumn-limited'
  const at = T.foldAt('instagram', t)
  assert.equal(at, 40)
})
await test('大事なこと（リンク・予約・値段）が区切りの後ろだけにあると知らせる', () => {
  const late = T.foldCheck('facebook', 'あ'.repeat(200) + '\nご予約は https://lumenium.net/ から。680円です。')
  assert.deepEqual(late.late, ['リンク', '「ご予約」', '値段や日付（680円）'])
  assert.match(late.warnings[0], /大事なことは最初の1〜2行に/)
  const early = T.foldCheck('facebook', 'ご予約は https://lumenium.net/ から。680円です。\n' + 'あ'.repeat(200))
  assert.deepEqual(early.late, [])
  assert.equal(early.warnings.length, 0)
  // Instagram の本文のリンクは押せないので、リンクは数えない
  assert.deepEqual(T.foldCheck('instagram', 'あ'.repeat(60) + 'https://lumenium.net/').late, [])
})

console.log('画像の切り抜き・代替テキスト')
await test('切り抜き：横長の写真から 4:5 の枠（真ん中・画像の中）', () => {
  const f = T.cropFrame(4000, 3000, 4 / 5, 1)
  assert.deepEqual(f, { x: 800, y: 0, w: 2400, h: 3000 })
  assert.ok(T.igAspectOk(f.w, f.h))
})
await test('切り抜き：丸めても Instagram の範囲からはみ出さない', () => {
  for (const [iw, ih] of [[1000, 999], [3001, 1999], [1234, 4567], [999, 523], [5000, 2617]]) {
    for (const p of T.CROP_PRESETS.filter((x) => x.id !== '9:16')) {
      for (const s of [1, 0.73, 0.2]) {
        const f = T.cropFrame(iw, ih, p.ratio, s)
        assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= iw && f.y + f.h <= ih, `${iw}x${ih} ${p.id} ${s}`)
        assert.ok(T.igAspectOk(f.w, f.h), `${iw}x${ih} ${p.id} ${s}: ${f.w}x${f.h}`)
        const o = T.cropOutput(f, 2160, p.ratio)
        assert.ok(Math.max(o.w, o.h) <= 2161 && T.igAspectOk(o.w, o.h), `out ${o.w}x${o.h}`)
      }
    }
  }
})
await test('切り抜き：枠を外へ動かしても端で止まる・小さくしても比は同じ', () => {
  assert.deepEqual(T.cropFrame(1000, 1000, 1, 0.5, -500, 5000), { x: 0, y: 500, w: 500, h: 500 })
  const f = T.cropFrame(1080, 1920, 9 / 16, 1)
  assert.deepEqual([f.w, f.h], [1080, 1920])
  assert.equal(T.cropFrame(1000, 800, 1.91, 0.1).w, Math.floor(1000 * 0.2))
  assert.equal(T.igAspectOk(1080, 1920), false)
  assert.equal(T.igAspectOk(1080, 1350), true)
})
await test('代替テキスト：X は metadata、Instagram・Threads は alt_text、Bluesky は alt', async () => {
  route = (u, init) => (u.endsWith('/2/media/metadata') ? json({ data: { id: 'M1' } }) : bskyRoute(u, init))
  const img = [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg', alt: '栗のモンブラン\nとコーヒー' }]
  const read = S.readPayload({ text: '秋の新作', targets: ['x', 'instagram', 'threads', 'bluesky'], images: img })
  assert.equal(read.payload.images[0].alt, '栗のモンブラン とコーヒー')
  const { results } = await S.sendPost(read.payload, undefined)
  assert.ok(results.every((r) => r.ok), JSON.stringify(results))
  const meta = calls.find((c) => c.url.endsWith('/2/media/metadata'))
  assert.deepEqual(JSON.parse(meta.init.body), { id: 'M1', metadata: { alt_text: { text: '栗のモンブラン とコーヒー' } } })
  // metadata は確定（finalize）のあと、投稿の前
  const order = calls.map((c) => c.url)
  assert.ok(order.findIndex((u) => u.endsWith('/finalize')) < order.findIndex((u) => u.endsWith('/media/metadata')))
  assert.ok(order.findIndex((u) => u.endsWith('/media/metadata')) < order.findIndex((u) => u.endsWith('/2/tweets')))
  const ig = calls.find((c) => c.url.includes('graph.facebook.com') && c.url.endsWith('/media'))
  assert.equal(new URLSearchParams(ig.init.body).get('alt_text'), '栗のモンブラン とコーヒー')
  const th = calls.find((c) => c.url.includes('graph.threads.net') && c.url.endsWith('/threads'))
  assert.equal(new URLSearchParams(th.init.body).get('alt_text'), '栗のモンブラン とコーヒー')
  const rec = JSON.parse(calls.find((c) => c.url.endsWith('createRecord')).init.body)
  assert.equal(rec.record.embed.images[0].alt, '栗のモンブラン とコーヒー')
})
await test('代替テキスト：無いと知らせる（送れる先だけ）。X で付けられなくても投稿は出す', async () => {
  const c = T.compose('instagram', base({ text: 'a', images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }] }), 'h')
  assert.ok(T.check('instagram', c).warnings.some((w) => w.includes('代替テキスト')))
  const fb = T.compose('facebook', base({ text: 'a', images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }] }), 'h')
  assert.ok(!T.check('facebook', fb).warnings.some((w) => w.includes('代替テキスト')))
  route = (u, init) => (u.endsWith('/2/media/metadata') ? json({ title: 'Bad' }, 400) : happy(u, init))
  const { results } = await S.sendPost(base({ text: 'a', targets: ['x'], images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg', alt: '説明' }] }), undefined)
  assert.equal(results[0].ok, true)
  assert.ok(results[0].message.includes('代替テキスト'))
})

console.log('Instagram の最初のコメント')
await test('公開のあとにコメントする（Instagram に出すときだけ受け取る）', async () => {
  route = (u, init) => (/\/IG1\/comments$/.test(u) ? json({ id: 'CM1' }) : happy(u, init))
  const read = S.readPayload({ text: '秋の新作', targets: ['instagram'], images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }], firstComment: ' #カフェ #秋 ' })
  assert.equal(read.payload.firstComment, '#カフェ #秋')
  assert.equal(S.readPayload({ text: 'a', targets: ['x'], firstComment: '#a' }).payload.firstComment, undefined)
  const { results } = await S.sendPost(read.payload, undefined)
  assert.equal(results[0].ok, true)
  assert.match(results[0].message, /最初のコメントも付けました/)
  const order = calls.map((c) => c.url)
  const cm = calls.find((c) => c.url.endsWith('/IG1/comments'))
  assert.equal(new URLSearchParams(cm.init.body).get('message'), '#カフェ #秋')
  assert.ok(order.findIndex((u) => u.endsWith('/media_publish')) < order.indexOf(cm.url))
})
await test('コメントが付けられなくても、投稿は成功のまま理由を言う', async () => {
  route = (u, init) => (/\/comments$/.test(u) ? json({ error: { message: 'permission' } }, 403) : happy(u, init))
  const read = S.readPayload({ text: 'a', targets: ['instagram'], images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }], firstComment: '#a' })
  const { results } = await S.sendPost(read.payload, undefined)
  assert.equal(results[0].ok, true)
  assert.match(results[0].message, /instagram_manage_comments/)
})

console.log('スレッド分割')
const LONG = '秋の限定メニューを始めました。栗のモンブランは、熊本の和栗を使っています。' +
  'ほうじ茶のラテもご用意しました！ 平日は14時から、土日は12時からです。' +
  'お席に限りがありますので、ご予約がおすすめです。詳しくは https://lumenium.net/menu?from=sns&a=b をご覧ください。' +
  'たくさんのご来店をお待ちしています。テイクアウトもできます。お電話でのご注文は、前の日までにお願いします。'
await test('収まるなら1件のまま', () => {
  assert.deepEqual(T.splitThread('x', '短い本文です。', { number: true }), ['短い本文です。'])
})
await test('X：日本語=2で数え、文の切れ目で分け、番号の分も数に入れる', () => {
  const parts = T.splitThread('x', LONG, { number: true })
  assert.ok(parts.length >= 2)
  parts.forEach((p, i) => {
    assert.ok(T.xLength(p) <= 280, p)
    assert.ok(p.endsWith(`\n(${i + 1}/${parts.length})`))
  })
  // 番号を外してつなぐと元の本文（空白の違いを除く）。文の途中で切れていない。
  const body = parts.map((p) => p.replace(/\n\(\d+\/\d+\)$/, ''))
  assert.equal(body.join('').replace(/\s/g, ''), LONG.replace(/\s/g, ''))
  body.forEach((b) => assert.match(b, /[。！？]$/))
  // URL はどこかの1件にまるごと入る
  assert.ok(body.some((b) => b.includes('https://lumenium.net/menu?from=sns&a=b')))
})
await test('番号なし・Bluesky は見た目の文字数・Threads は 500', () => {
  const b = T.splitThread('bluesky', LONG + LONG + LONG, { number: false })
  assert.ok(b.length >= 2 && b.every((p) => T.graphemes(p) <= 300 && !/\(\d+\/\d+\)$/.test(p)))
  const th = T.splitThread('threads', 'あ。'.repeat(400), { number: true })
  assert.ok(th.length >= 2 && th.every((p) => p.length <= 500))
})
await test('切れ目の無い長い文は、読点・空白の後ろで切る（URL の途中では切らない）', () => {
  const t = 'あ'.repeat(130) + '、' + 'い'.repeat(100) + ' https://lumenium.net/' + 'z'.repeat(40) + ' おわり'
  const parts = T.splitThread('x', t, { number: false })
  assert.ok(parts.every((p) => T.xLength(p) <= 280))
  assert.ok(parts[0].endsWith('、'))
  assert.ok(parts.some((p) => p.includes('https://lumenium.net/' + 'z'.repeat(40))))
})
await test('10件以上になると番号は2けたぶんを数え、11件以上は送らない', () => {
  const t = Array.from({ length: 14 }, (_, i) => 'あ'.repeat(120) + i + '。').join('')
  const parts = T.splitThread('x', t, { number: true })
  assert.ok(parts.length >= 10)
  assert.ok(parts.every((p) => T.xLength(p) <= 280))
  assert.ok(parts[0].endsWith(`(1/${parts.length})`))
  const c = T.compose('x', base({ text: t, thread: { nets: ['x'], number: true } }), 'h')
  assert.ok(T.check('x', c).errors.some((e) => e.includes('10件まで')))
})
await test('compose：選んだ投稿先で上限を超えたときだけ分け、X は件数ぶんの料金を言う', () => {
  const p = base({ text: LONG, thread: { nets: ['x', 'threads'], number: true } })
  const cx = T.compose('x', p, 'lumenium.net')
  assert.ok(cx.parts.length >= 2)
  const k = T.check('x', cx)
  assert.equal(k.errors.length, 0)
  assert.ok(k.warnings.some((w) => w.includes('1件ずつ料金')))
  assert.equal(T.compose('threads', p, 'lumenium.net').parts, null) // 500 に収まる
  assert.ok(T.lengthFor('threads', T.compose('threads', p, 'lumenium.net').text) <= 500)
  assert.equal(T.compose('bluesky', p, 'lumenium.net').parts, null) // 選んでいない
  assert.equal(T.threadCost(['a', 'b https://a.jp/', 'c']), 0.23)
})
await test('送信：X は in_reply_to_tweet_id、Threads は reply_to_id、Bluesky は root と parent', async () => {
  let n = 0
  route = (u, init) => {
    if (u.endsWith('/2/tweets')) return json({ data: { id: 'T' + (++n) } })
    if (u.includes('graph.threads.net') && u.endsWith('/threads')) return json({ id: 'TC' + (++n) })
    if (u.endsWith('/threads_publish')) return json({ id: 'TP' + (++n) })
    if (u.endsWith('createRecord')) { n++; return json({ uri: 'at://did:plc:abc/app.bsky.feed.post/r' + n, cid: 'c' + n }) }
    return bskyRoute(u, init)
  }
  const text = LONG + LONG + LONG
  const read = S.readPayload({ text, targets: ['x', 'threads', 'bluesky'], thread: { nets: ['x', 'threads', 'bluesky', 'line'], number: true } })
  assert.deepEqual(read.payload.thread.nets, ['x', 'threads', 'bluesky'])
  const { results, entry } = await S.sendPost(read.payload, undefined)
  assert.ok(results.every((r) => r.ok && r.parts >= 2), JSON.stringify(results))
  const tw = calls.filter((c) => c.url.endsWith('/2/tweets')).map((c) => JSON.parse(c.init.body))
  assert.equal(tw[0].reply, undefined)
  assert.ok(tw.slice(1).every((b) => /^T\d+$/.test(b.reply.in_reply_to_tweet_id)))
  const th = calls.filter((c) => c.url.includes('graph.threads.net') && c.url.endsWith('/threads')).map((c) => new URLSearchParams(c.init.body))
  assert.equal(th[0].get('reply_to_id'), null)
  assert.ok(th.slice(1).every((f) => /^TP\d+$/.test(f.get('reply_to_id'))))
  const bs = calls.filter((c) => c.url.endsWith('createRecord')).map((c) => JSON.parse(c.init.body).record)
  assert.equal(bs[0].reply, undefined)
  assert.equal(bs[1].reply.root.uri, bs[2] ? bs[2].reply.root.uri : bs[1].reply.root.uri)
  assert.equal(bs[1].reply.parent.uri, bs[1].reply.root.uri)
  if (bs[2]) assert.notEqual(bs[2].reply.parent.uri, bs[2].reply.root.uri)
  assert.ok(entry.texts.x.includes('―'))
})
await test('送信：途中で止まっても1件目は出ているので成功のまま、何件目かを言う', async () => {
  let n = 0
  route = (u, init) => (u.endsWith('/2/tweets') ? (++n === 1 ? json({ data: { id: 'T1' } }) : json({ title: 'Too Many Requests' }, 429)) : happy(u, init))
  const read = S.readPayload({ text: LONG, targets: ['x'], thread: { nets: ['x'] } })
  const { results } = await S.sendPost(read.payload, undefined)
  assert.equal(results[0].ok, true)
  assert.match(results[0].message, /2\/\d 件目で止まりました/)
})

console.log('プロフィールのリンク集（/links）')
await test('自社サイトへのリンクにだけ ?ref=<from>&utm_campaign=bio、知らない from は instagram', () => {
  assert.equal(T.bioUrl('https://lumenium.net/menu?x=1', 'tiktok', 'lumenium.net'), 'https://lumenium.net/menu?x=1&ref=tiktok&utm_campaign=bio')
  assert.equal(T.bioUrl('https://www.lumenium.net/', 'evil<script>', 'lumenium.net'), 'https://www.lumenium.net/?ref=instagram&utm_campaign=bio')
  assert.equal(T.bioUrl('https://reserve.example.jp/shop', 'instagram', 'lumenium.net'), 'https://reserve.example.jp/shop')
})
await test('一覧の保存：名前と https が要り、20個まで、最近の投稿は0〜10件', async () => {
  const st = await import('../api/_social-store.js')
  const { links, problems } = st.validateLinks({ latest: 99, title: 'お店\n', items: [
    { title: 'ご予約', url: 'https://lumenium.net/booking' },
    { title: 'メニュー', url: 'http://lumenium.net/menu' },
    { title: '', url: 'https://a.jp/' },
    { title: '地図', url: 'https://maps.example.com/x', on: false },
  ] })
  assert.equal(links.latest, 10)
  assert.equal(links.title, 'お店')
  assert.deepEqual(links.items.map((i) => [i.title, i.on]), [['ご予約', true], ['地図', false]])
  assert.equal(problems.length, 2)
  assert.equal(st.validateLinks({ items: Array.from({ length: 30 }, (_, i) => ({ title: 't' + i, url: 'https://a.jp/' + i })) }).links.items.length, 20)
})
await test('/links：保存した一覧と最近の投稿のリンク、canonical はクエリなし、計測つき', async () => {
  const api = await import('../api/social.js')
  const put = await api.PUT(new Request('https://lumenium.net/api/social', {
    method: 'PUT', headers: { authorization: 'Bearer test-admin-key', 'content-type': 'application/json' },
    body: JSON.stringify({ links: { latest: 2, note: 'ご予約はこちら', items: [
      { title: 'ご予約', url: 'https://lumenium.net/booking' }, { title: '地図', url: 'https://maps.example.com/x' }, { title: '隠す', url: 'https://lumenium.net/h', on: false }] } }) }))
  assert.equal((await put.json()).ok, true)
  const L = await import('../api/links.js')
  const res = await L.GET(new Request('https://lumenium.net/links?from=tiktok'))
  const html = await res.text()
  assert.match(res.headers.get('content-type'), /text\/html/)
  assert.ok(html.includes('href="https://lumenium.net/booking?ref=tiktok&amp;utm_campaign=bio"'))
  assert.ok(html.includes('href="https://maps.example.com/x" rel="noopener"'))
  assert.ok(!html.includes('/h?'))
  assert.ok(html.includes('<link rel="canonical" href="https://lumenium.net/links">'))
  assert.ok(html.includes('ご予約はこちら'))
  assert.ok(html.includes('lumBeacon') || html.includes('/api/p'), '計測が入っていません')
  // 最近の投稿：自社サイトへのリンクで、どこかに出たものだけ、同じ行き先は1つ
  const posts = [
    { at: '2026-10-01T00:00:00Z', text: '秋の新作です https://lumenium.net/menu', link: 'https://lumenium.net/menu?ref=x', results: [{ ok: true }] },
    { at: '2026-09-30T00:00:00Z', text: '同じ行き先', link: 'https://lumenium.net/menu', results: [{ ok: true }] },
    { at: '2026-09-29T00:00:00Z', text: '失敗', link: 'https://lumenium.net/f', results: [{ ok: false }] },
    { at: '2026-09-28T00:00:00Z', text: '他社', link: 'https://other.example/', results: [{ ok: true }] },
  ]
  assert.deepEqual(L.latestLinks(posts, 5).map((x) => [x.title, x.url]), [['秋の新作です', 'https://lumenium.net/menu?ref=x']])
})
await test('関数のページ用の計測（api/_beacon-snippet.js）が元と同じ', async () => {
  const { build } = await import('./build-beacon-snippet.mjs')
  assert.equal(readFileSync(new URL('../api/_beacon-snippet.js', import.meta.url), 'utf8'), build(),
    'api/_beacon-snippet.js が古いままです。node scripts/build-beacon-snippet.mjs を実行してください。')
})
await test('/links は vercel.json で関数につながっている', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const i = v.rewrites.findIndex((r) => r.source === '/links' && r.destination === '/api/links')
  const all = v.rewrites.findIndex((r) => r.source === '/(.*)')
  assert.ok(i !== -1 && i < all)
})

console.log('承認の流れ')
const SETS = []
await test('リンク：保存するのはハッシュだけ、7日の期限、用途は social-approve、会員の共有リンクには出ない', async () => {
  process.env.CRON_SECRET = 'sec'
  const A = await import('../api/_social-approve.js')
  const sh = await import('../api/_share.js')
  const p = S.readPayload({ text: '秋の新作です', targets: ['x'] }).payload
  const r = await A.createApproval(p, { note: '確認お願いします' })
  assert.equal(r.ok, true)
  assert.match(r.token, /^[0-9a-f]{48}$/)
  const tokKey = [...kv.keys()].find((k) => k.includes('share:t:'))
  assert.ok(tokKey && !tokKey.includes(r.token) && !JSON.stringify([...kv.values()]).includes(r.token), 'リンクの文字列そのものは保存しない')
  assert.equal(JSON.parse(kv.get(tokKey)).scope, 'social-approve')
  assert.equal(JSON.parse(kv.get(tokKey)).ref, r.item.id)
  assert.ok(Math.abs(Date.parse(r.item.expiresAt) - Date.now() - 7 * 86400000) < 60000)
  assert.deepEqual((await sh.listShares()).filter((x) => x.scope === 'social-approve'), [])
  // 会員一覧のリンクとしては使えない
  assert.equal(await sh.useShare(r.token, 'members'), null)
  SETS.push(r)
})
await test('リンク：開ける → 承認 → もう使えない（1回きり）。差し戻しはコメントが要る', async () => {
  const A = await import('../api/_social-approve.js')
  const r = SETS[0]
  assert.equal((await A.openApproval(r.token)).id, r.item.id)
  assert.equal(await A.openApproval('0'.repeat(48)), null)
  const noComment = await A.decideApproval(r.token, 'return', '  ')
  assert.equal(noComment.ok, false)
  assert.equal(noComment.retry, true)
  const ok = await A.decideApproval(r.token, 'approve', 'OKです')
  assert.equal(ok.ok, true)
  assert.equal(ok.item.status, 'approved')
  assert.equal(await A.openApproval(r.token), null)
  assert.equal((await A.decideApproval(r.token, 'return', 'やっぱり')).ok, false)
  const list = await A.listApprovals()
  assert.equal(list.find((x) => x.id === r.item.id).comment, 'OKです')
})
await test('日付つきは承認と同時に予約、差し戻しはコメントが管理画面に残る、取り下げでリンクも消える', async () => {
  const A = await import('../api/_social-approve.js')
  const tomorrow = new Date(Date.now() + 33 * 3600000).toISOString().slice(0, 10)
  const p = S.readPayload({ text: '予約つき', targets: ['x'] }).payload
  const a = await A.createApproval(p, { date: tomorrow })
  const d = await A.decideApproval(a.token, 'approve', '')
  assert.equal(d.item.status, 'scheduled')
  assert.ok((await Q.listScheduled()).some((x) => x.id === d.item.scheduledId))
  const b = await A.createApproval(p, {})
  assert.equal((await A.decideApproval(b.token, 'return', '日付を直してください')).item.status, 'returned')
  const c = await A.createApproval(p, {})
  assert.equal(await A.removeApproval(c.item.id), true)
  assert.equal(await A.openApproval(c.token), null)
})
await test('承認ページ：鍵なしで開け、見え方とチェックが出て、フォームで承認できる', async () => {
  const A = await import('../api/_social-approve.js')
  const page = await import('../api/social-approve.js')
  const p = S.readPayload({ text: '業界最安！ご予約はこちら https://lumenium.net/', targets: ['x', 'instagram'], images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg' }] }).payload
  const a = await A.createApproval(p, { note: '急ぎです' })
  const res = await page.GET(new Request('https://lumenium.net/api/social-approve?t=' + a.token))
  const html = await res.text()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  assert.ok(html.includes('急ぎです') && html.includes('Instagram') && html.includes('景品表示法'))
  assert.ok(html.includes('?ref=x'))
  const form = new FormData()
  form.set('t', a.token); form.set('decision', 'approve'); form.set('comment', '')
  const done = await page.POST(new Request('https://lumenium.net/api/social-approve', { method: 'POST', body: form }))
  assert.ok((await done.text()).includes('承認しました'))
  const again = await page.GET(new Request('https://lumenium.net/api/social-approve?t=' + a.token))
  assert.equal(again.status, 410)
})
await test('管理画面：承認済みだけをそのまま投稿でき、投稿済みになる', async () => {
  route = happy
  const A = await import('../api/_social-approve.js')
  const api = await import('../api/social.js')
  const call = (body) => api.POST(new Request('https://lumenium.net/api/social', { method: 'POST', headers: { authorization: 'Bearer test-admin-key', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  const made = await (await call({ action: 'approval-create', text: '承認のテスト', targets: ['x'], note: 'n' })).json()
  assert.equal(made.ok, true)
  assert.match(made.link, /^https:\/\/lumenium\.net\/api\/social-approve\?t=[0-9a-f]{48}$/)
  const id = made.approvals[0].id
  const early = await call({ action: 'approval-send', id })
  assert.equal(early.status, 400)
  await A.decideApproval(new URL(made.link).searchParams.get('t'), 'approve', '')
  const sent = await (await call({ action: 'approval-send', id })).json()
  assert.equal(sent.ok, true)
  assert.equal(sent.approvals.find((x) => x.id === id).status, 'done')
})

console.log('コメントの受信箱')
function inboxRoute(u, init) {
  if (/\/20\?fields=username/.test(u)) return json({ username: 'shop' })
  if (/\/20\/media\?/.test(u)) return json({ data: [{ id: '501', caption: '秋の新作', permalink: 'https://instagram.example/p/1', comments_count: 2 }, { id: '502', caption: '静か', comments_count: 0 }] })
  if (/\/501\/comments\?/.test(u)) return json({ data: [
    { id: '601', text: '予約できますか？', username: 'a', hidden: false, replies: { data: [] } },
    { id: '602', text: 'おいしそう', username: 'b', hidden: false, replies: { data: [{ username: 'shop' }] } },
    { id: '603', text: '宣伝です', username: 'c', hidden: true },
  ] })
  if (/\/10\/posts\?/.test(u)) return json({ data: [{ id: '10_1', message: 'ページの投稿', permalink_url: 'https://facebook.example/1' }] })
  if (/\/10_1\/comments\?/.test(u)) return json({ data: [
    { id: '10_7', message: '料金は？', from: { id: '99', name: '山田' }, can_hide: true },
    { id: '10_8', message: 'ありがとう', from: { id: '98', name: '佐藤' }, comments: { data: [{ from: { id: '10' } }] } },
  ] })
  if (/\/601\/replies$/.test(u)) return json({ id: '701' })
  if (/\/10_7\/comments$/.test(u)) return json({ id: '702' })
  if (/\/(601|10_7)$/.test(u)) return json({ success: true })
  return null
}
await test('読み込み：最近の投稿のコメント、自分の返信があれば返信済み、未返信の数', async () => {
  route = inboxRoute
  const I = await import('../api/_social-inbox.js')
  const r = await I.readInbox(undefined)
  assert.equal(r.nets.instagram.ok, true)
  assert.deepEqual(r.nets.instagram.posts[0].comments.map((c) => [c.id, c.answered, c.hidden]), [['601', false, false], ['602', true, false], ['603', false, true]])
  assert.equal(r.nets.instagram.posts[1].comments.length, 0)
  assert.ok(!calls.some((c) => c.url.includes('/502/comments')), 'コメントの無い投稿は読まない')
  assert.deepEqual(r.nets.facebook.posts[0].comments.map((c) => [c.from, c.answered]), [['山田', false], ['佐藤', true]])
  assert.equal(r.unanswered, 2)
  assert.ok(calls.find((c) => c.url.includes('/10_1/comments')).url.includes('filter=toplevel'))
})
await test('返信と非表示：Instagram は /replies と hide、Facebook は /comments と is_hidden', async () => {
  route = inboxRoute
  const I = await import('../api/_social-inbox.js')
  assert.equal((await I.replyComment('instagram', '601', 'ご予約はプロフィールのリンクからどうぞ', undefined)).ok, true)
  assert.equal(new URLSearchParams(calls.find((c) => c.url.endsWith('/601/replies')).init.body).get('message'), 'ご予約はプロフィールのリンクからどうぞ')
  assert.equal((await I.replyComment('facebook', '10_7', '3万円からです', undefined)).ok, true)
  assert.equal((await I.hideComment('instagram', '601', true, undefined)).ok, true)
  assert.equal(new URLSearchParams(calls.find((c) => c.url.endsWith('/601') && c.init.method === 'POST').init.body).get('hide'), 'true')
  assert.equal((await I.hideComment('facebook', '10_7', false, undefined)).ok, true)
  assert.equal(new URLSearchParams(calls.find((c) => c.url.endsWith('/10_7')).init.body).get('is_hidden'), 'false')
  assert.equal((await I.replyComment('instagram', '../me', 'x', undefined)).ok, false)
  assert.equal((await I.replyComment('x', '1', 'x', undefined)).ok, false)
})
await test('権限が足りないときは、Meta の返事に要る権限を添える', async () => {
  route = (u) => (/\/media\?|\/posts\?|username/.test(u) ? json({ error: { message: '(#10) Requires instagram_manage_comments' } }, 403) : null)
  const I = await import('../api/_social-inbox.js')
  const r = await I.readInbox(undefined)
  assert.equal(r.nets.instagram.ok, false)
  assert.match(r.nets.instagram.message, /instagram_manage_comments/)
  assert.match(r.nets.facebook.message, /pages_manage_engagement/)
})

console.log('週次メールのSNSの一節')
await test('先週の投稿数・いちばん人を連れてきた投稿・予約と承認待ちの数', async () => {
  const W = await import('../api/weekly-report.js')
  const I = await import('../api/_social-insights.js')
  const today = I.jstDay(Date.now())
  const from = I.addDays(today, -7), to = I.addDays(today, -1)
  const at = (d) => new Date(Date.parse(d + 'T03:00:00Z')).toISOString()
  // 先週の投稿2件（1件は X で計測リンクつき）、それより前の1件、どこにも出なかった1件
  const P = (id, d, text, ok, refs) => JSON.stringify({ id, at: at(d), text, link: 'https://lumenium.net/menu', results: [{ net: 'x', ok }, { net: 'line', ok }], refs: refs || {} })
  const LOG = [...lists.keys()].find((k) => k.endsWith('social:log'))
  lists.set(LOG, [P('w1', I.addDays(today, -2), '秋の新作のお知らせです', true, { x: I.fieldFor('x', '') }), P('w2', I.addDays(today, -4), '臨時休業', true), P('w3', I.addDays(today, -20), '前の月', true), P('w4', I.addDays(today, -3), '失敗', false)])
  // 計測：x からの訪問を2日ぶん
  const { K } = await import('../api/_analytics-store.js')
  for (const d of [I.addDays(today, -2), I.addDays(today, -1)]) {
    const h = new Map([[I.fieldFor('x', ''), '6']])
    hashes.set(K.dayCampaigns(d), h)
  }
  const s = await W.snsSummary({ from, to })
  assert.equal(s.posts, 2)
  assert.deepEqual(s.byNet, { x: 2, line: 2 })
  assert.equal(s.top && s.top.text, '秋の新作のお知らせです')
  assert.ok(s.top.visits >= 6)
  assert.equal(typeof s.scheduled, 'number')
  const lines = W.snsLines({ ...s, pending: 1, approved: 0, returned: 2, scheduled: 3 })
  assert.equal(lines[0], '■ SNS（この管理画面から出した投稿）')
  assert.ok(lines.some((l) => l.startsWith('・投稿: 2件（X 2・LINE公式アカウント 2）')))
  assert.ok(lines.some((l) => l.includes('「秋の新作のお知らせです」') && l.includes('サイトへの訪問')))
  assert.ok(lines.some((l) => l === '・予約中: 3件　承認待ち 1件・差し戻し 2件'))
  const empty = W.snsLines({ posts: 0, byNet: {}, top: null, scheduled: 0, pending: 0, approved: 0, returned: 0 })
  assert.ok(empty.includes('先週は、この管理画面からの投稿はありませんでした。'))
})

console.log('繰り返し投稿')
await test('日付：毎週◯曜日（両端を含む）', () => {
  assert.deepEqual(Q.repeatDates({ kind: 'weekly', weekday: 2 }, '2026-10-05', '2026-10-27'), ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'])
  assert.deepEqual(Q.repeatDates({ kind: 'weekly', weekday: 7 }, '2026-10-05', '2026-10-27'), [])
  assert.equal(Q.repeatLabel({ kind: 'weekly', weekday: 0 }), '毎週日曜')
})
await test('日付：毎月◯日。31日は月末、無い日はその月の最後の日（うるう年も）', () => {
  assert.deepEqual(Q.repeatDates({ kind: 'monthly', day: 31 }, '2027-01-01', '2027-04-30'), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  assert.deepEqual(Q.repeatDates({ kind: 'monthly', day: 30 }, '2028-02-01', '2028-03-31'), ['2028-02-29', '2028-03-30'])
  assert.deepEqual(Q.repeatDates({ kind: 'monthly', day: 15 }, '2026-12-16', '2027-02-15'), ['2027-01-15', '2027-02-15'])
  assert.deepEqual(Q.repeatDates({ kind: 'monthly', day: 1 }, '2026-10-02', '2026-11-27'), ['2026-11-01'])
  assert.equal(Q.repeatLabel({ kind: 'monthly', day: 31 }), '毎月 月末')
  assert.equal(Q.cleanRepeat({ kind: 'monthly', day: 0 }), null)
})
await test('予約：8週間先まで入れ、取り消した1件は入れ直さず、中身を変えたら入れ直す', async () => {
  process.env.CRON_SECRET = 'sec'
  for (const k of [...hashes.keys()]) if (k.endsWith('social:queue') || k.endsWith('social:rep')) hashes.delete(k)
  const tpl = { id: 'tpl-rep-1', title: '定休日', text: '明日は定休日です', nets: ['x'], campaign: '', link: '', images: [], repeat: { kind: 'weekly', weekday: 1 } }
  const build = (t) => S.readPayload({ text: t.text, targets: t.nets })
  // addScheduled は「明日以降」を本物の今日で見るので、今日を本物に合わせます。
  const real = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const r = await Q.planRepeats([tpl], build, real)
  assert.equal(r.added, 8)
  let items = (await Q.listScheduled()).filter((i) => i.repeatOf === 'tpl-rep-1')
  assert.equal(items.length, 8)
  assert.ok(items.every((i) => new Date(i.date + 'T00:00:00Z').getUTCDay() === 1 && i.date > real))
  assert.equal(new Set(items.map((i) => i.payload.sendId)).size, 8, '1回ごとに別の送信番号')
  // 1件取り消す → もう一度計画しても戻らない
  await Q.cancelScheduled(items[0].id)
  const again = await Q.planRepeats([tpl], build, real)
  assert.equal(again.added, 0)
  assert.equal((await Q.listScheduled()).filter((i) => i.repeatOf === 'tpl-rep-1').length, 7)
  // 本文を変えたら入れ直す
  const changed = await Q.planRepeats([{ ...tpl, text: '明日はお休みです' }], build, real)
  assert.equal(changed.removed, 7)
  assert.equal(changed.added, 8)
  items = (await Q.listScheduled()).filter((i) => i.repeatOf === 'tpl-rep-1')
  assert.ok(items.every((i) => i.payload.text === '明日はお休みです'))
  // 繰り返しをやめたら、まだの予約も消す
  const stop = await Q.planRepeats([{ ...tpl, repeat: null }], build, real)
  assert.equal(stop.removed, 8)
  assert.equal((await Q.listScheduled()).filter((i) => i.repeatOf === 'tpl-rep-1').length, 0)
})
await test('予約：作れない中身（Instagram に画像なし）は入れずに理由を言う', async () => {
  const tpl = { id: 'tpl-rep-2', title: '新作', text: '新作です', nets: ['instagram'], images: [], repeat: { kind: 'monthly', day: 31 } }
  const build = (t) => { const r = S.readPayload({ text: t.text, targets: t.nets }); const p = S.precheck(r.payload); return p.length ? { ok: false, message: p.join(' / ') } : r }
  const r = await Q.planRepeats([tpl], build)
  assert.equal(r.added, 0)
  assert.ok(r.problems[0].includes('「新作」') && r.problems[0].includes('画像'))
  await Q.planRepeats([], build)
})
await test('定型文の保存：繰り返しと画像を確かめて残す', async () => {
  const st = await import('../api/_social-store.js')
  const { templates } = st.validateTemplates([{ title: 'a', text: 'b', repeat: { kind: 'weekly', weekday: 3 }, images: [{ url: 'https://s.public.blob.vercel-storage.com/a.jpg', alt: '写真' }, { url: 'http://x/a.jpg' }] },
    { title: 'c', text: 'd', repeat: { kind: 'yearly' } }])
  assert.deepEqual(templates[0].repeat, { kind: 'weekly', weekday: 3 })
  assert.equal(templates[0].images.length, 1)
  assert.equal(templates[0].images[0].alt, '写真')
  assert.equal(templates[1].repeat, null)
})

console.log(`\n${passed} 件成功、${failed} 件失敗`)






if (failed) process.exit(1)
