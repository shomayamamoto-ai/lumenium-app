// /api/search-console, read against made-up Google answers.
//
// The numbers on that panel are shown to clients as fact, so the parts that
// turn Google's answer into them are checked here: totals come from Google's
// own total and not from adding up the top rows, the 指名 / 非指名 split uses
// the names in _brand.js, 「あと少しで1ページ目」 picks the right rows, each
// query carries its page, and the cache is used — and skipped on 「再取得」.
//
// Offline and deterministic; runs in prebuild.

const REDIS = 'https://redis.gsc-test.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'gsc-test-admin-key',
  GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test',
  GOOGLE_REFRESH_TOKEN: 'test',
  UPSTASH_REDIS_REST_URL: REDIS,
  UPSTASH_REDIS_REST_TOKEN: 'test',
  SITE_NAME: 'Lumenium',
  SITE_NAME_KANA: 'ルメニウム',
  SITE_URL: 'https://lumenium.net',
})

const store = new Map()
let googleCalls = 0
const bodies = []

const row = (keys, clicks, impressions, position) => ({ keys, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position })

// What Google would answer, keyed on what was asked. The total is larger than
// the sum of the query rows on purpose: that gap is real (rows beyond the
// limit, and queries Google withholds) and is what the old code lost.
function google(body) {
  const dims = (body.dimensions || []).join(',')
  const filter = body.dimensionFilterGroups && body.dimensionFilterGroups[0].filters[0]
  const prev = body.endDate < new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10)
  if (!dims) {
    if (filter && filter.operator === 'includingRegex') return { rows: [row(undefined, prev ? 20 : 25, prev ? 60 : 70, 1.3)] }
    if (filter && filter.operator === 'excludingRegex') return { rows: [row(undefined, prev ? 8 : 14, prev ? 700 : 900, 15.2)] }
    return { rows: [row(undefined, prev ? 30 : 42, prev ? 900 : 1200, prev ? 14.8 : 13.1)] }
  }
  if (dims === 'query') {
    return { rows: [
      row(['lumenium'], 18, 46, 1.2),
      row(['るめにうむ'], 2, 9, 1.5),
      row(['ホームページ制作 東京 中小企業'], 6, 214, 14.2),
      row(['生成ai 研修 社員向け'], 4, 167, 11.8),
      row(['line公式アカウント 構築 代行'], 3, 98, 9.4),
      row(['sns運用代行 相場'], 0, 54, 27.9),
      row(['会社紹介動画 費用'], 1, 41, 6.0),
      row(['採用動画 制作 費用'], 0, 8, 12.0),
    ] }
  }
  if (dims === 'page') return { rows: [row(['https://lumenium.net/'], 22, 260, 8.1), row(['https://lumenium.net/services/web.html'], 7, 231, 13.5)] }
  if (dims === 'query,page') {
    return { rows: [
      row(['ホームページ制作 東京 中小企業', 'https://lumenium.net/services/web.html'], 5, 180, 13.9),
      row(['ホームページ制作 東京 中小企業', 'https://lumenium.net/'], 1, 34, 16.0),
      row(['生成ai 研修 社員向け', 'https://lumenium.net/services/ai.html'], 4, 167, 11.8),
      row(['lumenium', 'https://lumenium.net/'], 18, 46, 1.2),
    ] }
  }
  if (dims === 'device') return { rows: [row(['MOBILE'], 30, 800, 12.0), row(['DESKTOP'], 11, 380, 14.9), row(['TABLET'], 1, 20, 13.0)] }
  return { rows: [] }
}

globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  const ok = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
  if (u.startsWith(REDIS)) {
    const cmds = JSON.parse(init.body || '[]')
    return ok(cmds.map((c) => {
      const op = String(c[0]).toUpperCase()
      if (op === 'GET') return { result: store.get(c[1]) ?? null }
      if (op === 'SET') { store.set(c[1], c[2]); return { result: 'OK' } }
      return { result: null }
    }))
  }
  if (u.includes('oauth2.googleapis.com')) return ok({ access_token: 'at', expires_in: 3600 })
  if (u.includes('webmasters/v3')) {
    googleCalls++
    if (u.endsWith('/sites')) return ok({ siteEntry: [{ siteUrl: 'https://other.example/' }, { siteUrl: 'sc-domain:lumenium.net' }] })
    const body = JSON.parse(init.body || '{}')
    bodies.push(body)
    return ok(google(body))
  }
  throw new Error(`test tried to reach ${u}`)
}

let failed = 0
const check = (cond, label, got) => {
  if (cond) console.log(`  ✓ ${label}`)
  else { console.error(`  ✗ ${label}${got !== undefined ? ' — ' + JSON.stringify(got) : ''}`); failed++ }
}

const sc = await import(new URL('../api/search-console.js', import.meta.url))

// Names, from _brand.js rather than written into the file.
const terms = sc.brandTerms()
check(terms.includes('lumenium') && terms.includes('ルメニウム') && terms.includes('るめにうむ') && terms.includes('lumenium.net'),
  '指名の語: 社名・カタカナ・ひらがな・ドメイン', terms)
check(sc.brandTerms({ name: 'Acme Studio', kana: 'アクメ', host: 'www.acme.co.jp' }).join(',') === 'acme studio,acmestudio,アクメ,あくめ,acme.co.jp,acme',
  '指名の語: 別の会社の名前でも同じ作り方', sc.brandTerms({ name: 'Acme Studio', kana: 'アクメ', host: 'www.acme.co.jp' }))
check(sc.brandRegex(['a.b', 'ルメ']) === '(?i)(a\\.b|ルメ)', '絞り込みの正規表現: 記号をエスケープ', sc.brandRegex(['a.b', 'ルメ']))
check(sc.isBranded('Lumenium 評判') && sc.isBranded('るめにうむ') && !sc.isBranded('東京 制作会社'), '指名の判定')
check(sc.pickSite([{ siteUrl: 'https://lumenium.net/' }, { siteUrl: 'sc-domain:lumenium.net' }]) === 'sc-domain:lumenium.net', 'プロパティ: ドメイン全体を優先')
check(sc.pickSite([{ siteUrl: 'https://notlumenium.net.evil.example/' }]) === null, 'プロパティ: ホスト名が違えば選ばない')

// End to end, through the handler.
const KEY = { Authorization: 'Bearer gsc-test-admin-key', 'x-forwarded-for': '203.0.113.9' }
const get = async (q = '') => (await sc.GET(new Request('https://lumenium.net/api/search-console' + q, { headers: KEY }))).json()

const d = await get()
check(d.ok && d.registered && d.siteUrl === 'sc-domain:lumenium.net', '登録済みのプロパティを読む', d.message)
check(d.total.impressions === 1200 && d.total.clicks === 42, '合計は Google の合計そのもの（行の足し算ではない）', d.total)
check(d.prev && d.prev.impressions === 900, '前の28日も取る', d.prev)
check(d.change.impressions === 300 && d.change.clicks === 12 && d.change.position === -1.7, '前期との差', d.change)
check(d.branded.impressions === 70 && d.open.impressions === 900 && d.splitExact, '指名 / 非指名は絞り込みの合計', [d.branded, d.open])
check(d.hidden && d.hidden.impressions === 230, 'Googleが伏せた検索 = 合計 − 指名 − 非指名', d.hidden)
check(d.topBranded.map((q) => q.query).join() === 'lumenium,るめにうむ', '指名の語にひらがなの社名も入る', d.topBranded)
check(d.opportunities.map((o) => o.query).join() === 'ホームページ制作 東京 中小企業,生成ai 研修 社員向け,line公式アカウント 構築 代行',
  'あと少しで1ページ目: 8〜20位・表示10回以上・表示の多い順', d.opportunities)
check(d.opportunities[0].page === '/services/web.html', 'あと少しで1ページ目: 着地ページ付き', d.opportunities[0])
const qp = d.queryPages.find((q) => q.query === 'ホームページ制作 東京 中小企業')
check(qp && qp.pages.length === 2 && qp.pages[0].page === '/services/web.html', '語ごとのページ（表示の多い順）', qp)
check(d.devices.map((x) => x.label).join() === 'スマホ,パソコン,タブレット' && d.devices[0].ctr === 3.8, '端末別', d.devices)
check(d.topPages[0].page === '/', 'ページのURLはパスに', d.topPages[0])
check(d.cached === false && d.fetchedAt, '1回目は Google から')
check(bodies.some((b) => b.dimensionFilterGroups && b.dimensionFilterGroups[0].filters[0].expression.includes('るめにうむ')), 'Google に渡す絞り込みに社名の語が入る')

const before = googleCalls
const again = await get()
check(again.cached === true && googleCalls === before, '2回目は保存した結果（Google に問い合わせない）', { cached: again.cached, calls: googleCalls - before })
const forced = await get('?fresh=1')
check(forced.cached === false && googleCalls > before, '「再取得」は保存を飛ばす', { cached: forced.cached })

// When the previous period cannot be read, no delta is invented from zero.
{
  const s = sc.summarise({ totalCur: { rows: [{ clicks: 5, impressions: 50, position: 9 }] }, queries: { rows: [] }, pages: { rows: [] } })
  check(s.prev === null && s.change === null, '前期が取れないときは差を出さない', s.change)
  check(s.splitExact === false && s.hidden === null, '絞り込みが取れないときは「伏せた検索」を出さない')
}

if (failed) {
  console.error(`\nsearch-console: ${failed} 件の確認に失敗しました。`)
  process.exit(1)
}
console.log('\nsearch-console: すべての確認に通りました。')
