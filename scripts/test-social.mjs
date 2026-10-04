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
    if (op === 'EXPIRE' || op === 'DEL') return { result: 1 }
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

console.log(`\n${passed} 件成功、${failed} 件失敗`)


if (failed) process.exit(1)
