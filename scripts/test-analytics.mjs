// アクセス解析の数え方を、本物の handler に送って確かめます。
//
// smoke-api.mjs は「500 を返さないか」だけを見ます。ここで見るのは中身です。
// 流入元を訪問の最初の1回だけ数えているか、直帰・滞在時間・成果の流入元が
// 正しい鍵に入るか、よそのページやロボットからの送信を断っているか。
// そして読み出し側（_analytics-report.js）が、比較・直帰率・期間に関係
// ない 7日/30日 を正しく計算しているか。
//
// Redis はこのファイルの中の小さな偽物で、外へは何も出ません。prebuild で
// 動くので、数え方を壊す変更はデプロイの前に止まります。

const REDIS = 'https://redis.test.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'test-admin-key',
  UPSTASH_REDIS_REST_URL: REDIS,
  UPSTASH_REDIS_REST_TOKEN: 'test',
  RESEND_API_KEY: 'test',
})
delete process.env.KV_REST_API_URL
delete process.env.KV_REST_API_TOKEN
delete process.env.KV_PREFIX

/* ---- a small Redis ---- */
const str = new Map()
const hashes = new Map()
const hll = new Map()
const hash = (k) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k) }
function run(c) {
  const op = String(c[0]).toUpperCase()
  const k = c[1]
  switch (op) {
    case 'GET': return str.has(k) ? str.get(k) : null
    case 'SET': {
      if (c.slice(3).map(String).map((x) => x.toUpperCase()).includes('NX') && str.has(k)) return null
      str.set(k, String(c[2])); return 'OK'
    }
    case 'DEL': { const had = str.delete(k) || hashes.delete(k); return had ? 1 : 0 }
    case 'INCR': { const v = (Number(str.get(k)) || 0) + 1; str.set(k, String(v)); return v }
    case 'INCRBY': { const v = (Number(str.get(k)) || 0) + Number(c[2]); str.set(k, String(v)); return v }
    case 'EXPIRE': return 1
    case 'TTL': return 60
    case 'HINCRBY': { const h = hash(k); const v = (Number(h.get(String(c[2]))) || 0) + Number(c[3]); h.set(String(c[2]), String(v)); return v }
    case 'HSET': { hash(k).set(String(c[2]), String(c[3])); return 1 }
    case 'HLEN': return hashes.has(k) ? hashes.get(k).size : 0
    case 'HEXISTS': return hashes.has(k) && hashes.get(k).has(String(c[2])) ? 1 : 0
    case 'HGET': return hashes.has(k) ? (hashes.get(k).get(String(c[2])) ?? null) : null
    case 'HMGET': return c.slice(2).map((f) => (hashes.has(k) ? (hashes.get(k).get(String(f)) ?? null) : null))
    case 'HGETALL': return hashes.has(k) ? [...hashes.get(k)].flat() : []
    case 'PFADD': { if (!hll.has(k)) hll.set(k, new Set()); c.slice(2).forEach((v) => hll.get(k).add(v)); return 1 }
    case 'PFCOUNT': { const u = new Set(); c.slice(1).forEach((key) => (hll.get(key) || []).forEach((v) => u.add(v))); return u.size }
    default: throw new Error('test redis: unsupported ' + op)
  }
}
const sent = []
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) {
    const cmds = JSON.parse(init.body || '[]')
    return new Response(JSON.stringify(cmds.map((c) => ({ result: run(c) }))), { status: 200 })
  }
  if (u.includes('api.resend.com')) { sent.push(JSON.parse(init.body)); return new Response('{"id":"t"}', { status: 200 }) }
  throw new Error('test tried to reach the network: ' + u)
}
const reset = () => { str.clear(); hashes.clear(); hll.clear() }

const { K, jstDate } = await import(new URL('../api/_analytics-store.js', import.meta.url))
const track = await import(new URL('../api/track.js', import.meta.url))
const alias = await import(new URL('../api/p.js', import.meta.url))
const { buildReport } = await import(new URL('../api/_analytics-report.js', import.meta.url))
const analytics = await import(new URL('../api/analytics.js', import.meta.url))
const weekly = await import(new URL('../api/weekly-report.js', import.meta.url))

let failed = 0, passed = 0
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name) }
  else { failed++; console.error('  ✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')) }
}

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
let ipN = 0
async function hit(body, extra = {}, handler = alias.POST) {
  const headers = {
    'content-type': 'application/json', 'user-agent': CHROME,
    'sec-fetch-site': 'same-origin', origin: 'https://lumenium.net',
    // A fresh address per hit, so the per-minute limit never interferes.
    'x-forwarded-for': `198.51.100.${(++ipN % 250) + 1}`,
    ...extra,
  }
  // undefined = 「その合図を送ってこない」。Headers に渡すと文字列の
  // "undefined" になってしまうので、ここで外します。
  for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k]
  const res = await handler(new Request('https://lumenium.net/api/p', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }))
  if (res.status !== 204) throw new Error('beacon answered ' + res.status)
}
const d = jstDate()
const H = (key) => Object.fromEntries(hashes.get(key) || [])
const S = (key) => Number(str.get(key) || 0)

console.log('track: 訪問と流入元')
reset()
await hit({ p: '/', n: 0, r: 'https://www.google.com' })
check('訪問の最初の1回は流入元に数える', H(K.dayRefs(d))['google.com'] === '1', H(K.dayRefs(d)))
check('訪問数 +1', S(K.daySessions(d)) === 1)
check('入口ページ / +1', H(K.dayLanding(d))['/'] === '1')
await hit({ p: '/services/web.html', n: 1, g: 1, l: '/' })
await hit({ p: '/about.html', n: 2 })
check('2ページ目以降は流入元に数えない', H(K.dayRefs(d))['google.com'] === '1' && Object.keys(H(K.dayRefs(d))).length === 1, H(K.dayRefs(d)))
check('2ページ目以降も閲覧数には入る', S(K.dayViews(d)) === 3)
check('訪問数は増えない', S(K.daySessions(d)) === 1)
check('直帰ではなくなった印 → engaged +1', S(K.dayEngaged(d)) === 1)
check('入口ごとの engaged', H(K.dayLandingEngaged(d))['/'] === '1')

console.log('track: 古いページ（n なし）')
await hit({ p: '/faq.html', r: 'https://lumenium.net/' }, {}, track.POST)
check('サイト内の移動（紹介元が自分）は「直接」に数えない', !H(K.dayRefs(d)).direct, H(K.dayRefs(d)))
await hit({ p: '/faq.html', r: 'https://t.co/abc' }, {}, track.POST)
check('古いページでも、よそからの紹介元は数える', H(K.dayRefs(d))['t.co'] === '1')

console.log('track: 成果と流入元')
await hit({ p: '/', e: 'contact_submit', r: 'https://www.google.com' })
check('問い合わせの流入元 → evs', H(K.dayEventSources(d, 'contact_submit'))['google.com'] === '1', H(K.dayEventSources(d, 'contact_submit')))
check('問い合わせ自体も数える', H(K.dayEvents(d)).contact_submit === '1')
await hit({ p: '/', e: 'click_tel', s: 'instagram', m: 'social', c: 'autumn' })
check('計測用リンクの訪問の電話 → src:instagram', H(K.dayEventSources(d, 'click_tel'))['src:instagram'] === '1')
check('キャンペーン × 成果', H(K.dayCampaignEvents(d, 'click_tel'))['instagram/social/autumn'] === '1', H(K.dayCampaignEvents(d, 'click_tel')))
await hit({ p: '/', e: 'read_half', r: 'https://www.google.com' })
check('成果でないもの（read_half）は evs に入れない', !hashes.has(K.dayEventSources(d, 'read_half')))

console.log('track: キャンペーンの訪問')
await hit({ p: '/', n: 0, s: 'instagram', m: 'social', c: 'autumn' })
check('キャンペーンの訪問 +1', H(K.dayCampaigns(d))['instagram/social/autumn'] === '1', H(K.dayCampaigns(d)))
check('流入元は src:instagram', H(K.dayRefs(d))['src:instagram'] === '1')

console.log('track: 見ていた時間')
await hit({ p: '/about.html', e: 'exit', t: 15000 })
await hit({ p: '/about.html', e: 'page_time', t: 5000 })
check('合計と件数', H(K.dayTime(d)).sum === '20000' && H(K.dayTime(d)).n === '2', H(K.dayTime(d)))
check('ページごと', H(K.dayPathTime(d))['/about.html'] === '20000' && H(K.dayPathTimeN(d))['/about.html'] === '2')
check('離脱は exit だけ数える（page_time は数えない）', H(K.dayEventPaths(d, 'exit'))['/about.html'] === '1')
check('page_time は閲覧数を増やさない', S(K.dayViews(d)) === 6, S(K.dayViews(d)))
await hit({ p: '/about.html', e: 'exit', t: 99 * 60 * 1000 })
check('30分を超える時間は捨てる', H(K.dayTime(d)).n === '2')

console.log('track: 見つからないページから始まった訪問')
await hit({ p: '/nope', e: 'not_found', n: 0, r: 'https://old.example.org' })
check('訪問数 +1', S(K.daySessions(d)) === 3)
check('入口は /(404)', H(K.dayLanding(d))['/(404)'] === '1')
check('見つからなかったURL', H(K.dayEventPaths(d, 'not_found'))['/nope'] === '1')
check('閲覧数には入らない', S(K.dayViews(d)) === 6)

console.log('track: 断るもの・通すもの')
const before = JSON.stringify([...str].sort())
await hit({ p: '/', n: 0 }, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })
await hit({ p: '/', n: 0 }, { 'sec-fetch-site': undefined, origin: 'https://evil.example' })
check('よそのページからの送信は数えない', JSON.stringify([...str].sort()) === before)
await hit({ p: '/', n: 0 }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })
await hit({ p: '/', n: 0 }, { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36' })
check('ロボット・自動ブラウザは数えない', S(K.dayViews(d)) === 6)
await hit({ p: '/', n: 0 }, { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]' })
check('Pinterest のアプリ内ブラウザは数える', S(K.dayViews(d)) === 7)
await hit({ p: '/', n: 0 }, { 'user-agent': 'Mozilla/5.0 (Linux; Android 12; CUBOT KINGKONG 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' })
check('Cubot（スマートフォン）は数える', S(K.dayViews(d)) === 8)
await hit({ p: '/', n: 0 }, { 'sec-fetch-site': undefined, origin: undefined })
check('どちらの合図も無い古いブラウザは通す', S(K.dayViews(d)) === 9)
await hit({ p: '/', e: 'menu_open' })
check('無くなった段（menu_open）は受け付けない', !H(K.dayEvents(d)).menu_open)

console.log('track: AIアシスタントからの訪問')
reset()
// ChatGPT のアプリから: 紹介元は空で、手がかりは utm_source=chatgpt.com だけ。
await hit({ p: '/services/web.html', n: 0, s: 'chatgpt.com' })
// 同じ訪問の2ページ目。流入元も、AIからの入口も、もう数えない。
await hit({ p: '/about.html', n: 1, s: 'chatgpt.com' })
await hit({ p: '/', n: 0, r: 'https://www.perplexity.ai/search?q=x' })
await hit({ p: '/', n: 0, r: 'https://www.google.com' })
await hit({ p: '/', n: 0, s: 'lumenium.net' })
check('utm_source=chatgpt.com は chatgpt.com として数える', H(K.dayRefs(d))['chatgpt.com'] === '1', H(K.dayRefs(d)))
check('自分のドメインの utm_source は流入元にしない', !H(K.dayRefs(d))['lumenium.net'], H(K.dayRefs(d)))
check('AIからの入口は訪問の最初の1回だけ', H(K.dayAiLandings(d))['chatgpt.com\t/services/web.html'] === '1' && !H(K.dayAiLandings(d))['chatgpt.com\t/about.html'], H(K.dayAiLandings(d)))
check('紹介元から来た Perplexity も入口を数える', H(K.dayAiLandings(d))['perplexity.ai\t/'] === '1', H(K.dayAiLandings(d)))
check('検索エンジンからの訪問は AI の入口に入れない', Object.keys(H(K.dayAiLandings(d))).length === 2, H(K.dayAiLandings(d)))
{
  const r = await buildReport({ url: REDIS, token: 'test' }, { days: 7 })
  const ai = r.referrerKinds.find((k) => k.key === 'ai')
  check('種類は「AIアシスタントから」で2訪問', ai && ai.label === 'AIアシスタントから' && ai.count === 2, ai)
  check('AIごとの内訳は呼び名で', r.aiSources.map((x) => x.name).sort().join() === 'ChatGPT,Perplexity', r.aiSources)
  check('AIからの入口ページ', r.aiLandings.some((x) => x.source === 'ChatGPT' && x.path === '/services/web.html' && x.count === 1), r.aiLandings)
}

console.log('report: 比較・直帰率・期間に関係ない 7日/30日')
reset()
// 今日から 13日前まで: 前半7日（前の期間）と後半7日（いまの期間）。
for (let i = 0; i < 40; i++) {
  const day = jstDate(i)
  str.set(K.dayViews(day), String(i < 7 ? 20 : i < 14 ? 10 : 1))
  if (i < 7) {
    str.set(K.daySessions(day), '10'); str.set(K.dayEngaged(day), '4')
    hash(K.dayTime(day)).set('sum', '30000'); hash(K.dayTime(day)).set('n', '2')
    hash(K.dayEvents(day)).set('contact_submit', '1')
    hash(K.dayLanding(day)).set('/', '6'); hash(K.dayLanding(day)).set('/blog/a.html', '4')
    hash(K.dayLandingEngaged(day)).set('/', '3'); hash(K.dayLandingEngaged(day)).set('/blog/a.html', '1')
    hash(K.dayEventSources(day, 'contact_submit')).set('google.com', '1')
    hash(K.dayRefs(day)).set('google.com', '7'); hash(K.dayRefs(day)).set('direct', '3')
  } else if (i < 14) {
    str.set(K.daySessions(day), '8'); str.set(K.dayEngaged(day), '4')
    hash(K.dayTime(day)).set('sum', '10000'); hash(K.dayTime(day)).set('n', '1')
  }
}
const rep = await buildReport({ url: REDIS, token: 'test' }, { days: 7 })
const c = rep.summary.cur, p = rep.summary.prev
check('いまの期間の閲覧数', c.views === 140, c.views)
check('前の期間の閲覧数', p.views === 70, p.views)
check('訪問数（いま / 前）', c.visits === 70 && p.visits === 56, [c.visits, p.visits])
check('直帰率 = (訪問 − engaged) / 訪問', Math.abs(c.bounceRate - 0.6) < 1e-9 && Math.abs(p.bounceRate - 0.5) < 1e-9, [c.bounceRate, p.bounceRate])
check('平均滞在 = 合計 / 件数', c.avgTimeMs === 15000 && p.avgTimeMs === 10000, [c.avgTimeMs, p.avgTimeMs])
check('問い合わせ', c.submits === 7 && p.submits === 0)
check('過去7日は期間に関係なく今日から', rep.totals.last7 === 140, rep.totals.last7)
check('過去30日は 7日を選んでいても30日ぶん', rep.totals.last30 === 140 + 70 + 16, rep.totals.last30)
const top = rep.landings[0]
check('入口ごとの直帰率', top.name === '/' && top.visits === 42 && Math.abs(top.bounceRate - 0.5) < 1e-9, top)
check('問い合わせにつながった流入元', rep.convSources[0] && rep.convSources[0].name === 'google.com' && rep.convSources[0].submits === 7 && rep.convSources[0].visits === 49, rep.convSources[0])
check('日別にも訪問・直帰率', rep.series[6].visits === 10 && Math.abs(rep.series[6].bounceRate - 0.6) < 1e-9)
const rep30 = await buildReport({ url: REDIS, token: 'test' }, { days: 30 })
check('30日を選んでも 7日のカードは同じ', rep30.totals.last7 === 140 && rep30.totals.last30 === rep.totals.last30)
check('前の期間の範囲', rep30.previous.to === jstDate(30) && rep30.previous.from === jstDate(59))
const rep365 = await buildReport({ url: REDIS, token: 'test' }, { days: 365 })
check('365日（分割して読む）', rep365.summary.cur.views === 140 + 70 + 26, rep365.summary.cur.views)
check('365日の前の期間は保存期間を越える', rep365.previous.partial === true)

console.log('report: 管理画面の窓口')
const res = await analytics.GET(new Request('https://lumenium.net/api/analytics?days=7', { headers: { Authorization: 'Bearer test-admin-key', 'x-forwarded-for': '192.0.2.1' } }))
const body = await res.json()
check('GET /api/analytics → summary と前の期間', res.status === 200 && body.summary && body.summary.prev.views === 70, res.status)
const res2 = await analytics.GET(new Request('https://lumenium.net/api/analytics?days=9999', { headers: { Authorization: 'Bearer test-admin-key', 'x-forwarded-for': '192.0.2.1' } }))
check('期間の上限は365日', (await res2.json()).range.days === 365)

console.log('weekly: 文面と、定期実行の合言葉')
check('前の週が少ないときは割合を出さない', weekly.changeText(12, 8, '件') === '（前の週 8件）')
check('12% 増', weekly.changeText(112, 100) === '（前の週より 12% 増）')
check('25% 減', weekly.changeText(75, 100) === '（前の週より 25% 減）')
const wr = weekly.compose(await buildReport({ url: REDIS, token: 'test' }, { days: 7, endOffset: 0 }))
check('文面に「問い合わせにつながった流入元」', /問い合わせにつながった流入元[\s\S]*google\.com/.test(wr.text))
check('ひとことがある', /■ ひとこと\n\S+/.test(wr.text))
delete process.env.CRON_SECRET
const noSecret = await weekly.GET(new Request('https://lumenium.net/api/weekly-report', { headers: { 'user-agent': 'vercel-cron/1.0' } }))
check('CRON_SECRET が無ければ定期実行を断る', noSecret.status === 401)
process.env.CRON_SECRET = 'cron-test-secret'
const wrong = await weekly.GET(new Request('https://lumenium.net/api/weekly-report', { headers: { 'user-agent': 'vercel-cron/1.0', Authorization: 'Bearer nope' } }))
check('合言葉が違えば断る', wrong.status === 401)
sent.length = 0
const okCron = await weekly.GET(new Request('https://lumenium.net/api/weekly-report', { headers: { 'user-agent': 'vercel-cron/1.0', Authorization: 'Bearer cron-test-secret' } }))
check('合言葉が合えば送る', okCron.status === 200 && sent.length === 1, okCron.status)
const again = await weekly.GET(new Request('https://lumenium.net/api/weekly-report', { headers: { 'user-agent': 'vercel-cron/1.0', Authorization: 'Bearer cron-test-secret' } }))
check('同じ週に二度は送らない', (await again.json()).skipped === 'already-sent' && sent.length === 1)
str.set(K.weeklyOff, '1')
str.delete(K.weeklySent(jstDate()))
const off = await weekly.GET(new Request('https://lumenium.net/api/weekly-report', { headers: { 'user-agent': 'vercel-cron/1.0', Authorization: 'Bearer cron-test-secret' } }))
check('止めてあれば送らない', (await off.json()).skipped === 'off' && sent.length === 1)
delete process.env.CRON_SECRET

if (failed) {
  console.error(`\nアクセス解析のテスト: ${failed} 件失敗（${passed} 件成功）`)
  process.exit(1)
}
console.log(`\nアクセス解析のテスト: ${passed} 件すべて成功`)
