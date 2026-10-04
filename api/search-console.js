export const config = { runtime: 'edge' }

// Google 検索での見え方を、Search Console から読んでくる。
//
// この画面には「AIの回答に出てくるか」はあっても、「ふつうの検索でどう
// 見えているか」がありませんでした。何の言葉で表示され、何回押され、平均で
// 何番目に出ているか——これは推測では出せず、Search Console にしかありません。
//
// AIO計測と同じ切り方（指名 / 非指名）で分けて出します。社名を含む検索で
// 表示されるのは当たり前で、勝負は社名を知らない人の検索です。両方を同じ
// 物差しで並べておかないと、合計の数字だけを見て安心することになります。
//
// 数字の出どころについて、正直に書いておくことが2つあります。
//
//   ・合計は「語ごとの行を足したもの」ではなく、Google に合計そのものを
//     聞いています。以前は上位100語を足していたので、それより下の語と、
//     Google が内容を伏せている検索（件数の少ない語は個人の特定を防ぐため
//     伏せられます）のぶんが抜け、実際より少なく出ていました。
//   ・指名と非指名は、語で絞り込んだ合計です。伏せられた検索はどちらにも
//     入らないので、指名＋非指名は合計より小さくなります。その差は
//     「Googleが内容を伏せている検索」として別に出します。
//
// 認証は商談カレンダーと同じ接続を使い回します（読み取り専用の権限を1つ
// 足しただけ）。まだ接続していない、あるいは権限を足す前の接続のままなら、
// その旨を返します。
//
// 1回の表示で Google に10回問い合わせるので、結果は6時間保存して使い回し
// ます（Search Console の数字は1日に1回しか更新されません）。「再取得」は
// ?fresh=1 で保存を飛ばします。

import { requireAdmin, json } from './_admin-auth.js'
import { creds, connected, accessToken } from './_google-cal.js'
import { storeFor, pipeline } from './_analytics-store.js'
import { BRAND, KV } from './_brand.js'

const API = 'https://www.googleapis.com/webmasters/v3'
const DAYS = 28
const CACHE_KEY = `${KV}gsc:v2`
const CACHE_TTL = 6 * 60 * 60
// 「あと少しで1ページ目」に入れる最低の表示回数。28日で10回未満の語は、
// 順位が上がっても増える人数がほとんどなく、手を入れる順番の判断に使えません。
export const NEAR_MIN_IMPRESSIONS = 10
const NEAR_FROM = 8
const NEAR_TO = 20

/** カタカナをひらがなに（ルメニウム → るめにうむ）。長音符などはそのまま。 */
export function toHiragana(s) {
  return String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/** 指名検索とみなす語。社名・読み（カタカナとひらがな）・ドメイン、
 *  それにドメインの最初の部分（lumenium.net なら lumenium）。 */
export function brandTerms(brand = BRAND) {
  const host = String(brand.host || '').replace(/^www\./, '')
  const terms = [
    brand.name, String(brand.name || '').replace(/\s+/g, ''),
    brand.kana, toHiragana(brand.kana),
    host, host.split('.')[0],
  ]
  return [...new Set(terms.map((t) => String(t || '').toLowerCase().trim()).filter((t) => t.length >= 2))]
}

/** 社名の入った検索かどうか。AIO計測の「指名 / 非指名」と同じ分け方です。 */
export function isBranded(query, terms = brandTerms()) {
  const q = String(query || '').toLowerCase()
  return terms.some((t) => q.includes(t))
}

/** Search Console の絞り込みに渡す正規表現（RE2）。(?i) で大文字小文字を
 *  区別しません。 */
export function brandRegex(terms = brandTerms()) {
  return '(?i)(' + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')'
}

const day = (back) => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10)

async function call(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return data
}

/** 登録されているプロパティから、このサイトのものを選ぶ。
 *  ドメイン全体（sc-domain:）で登録されている場合と、URLの前方一致で登録
 *  されている場合があり、前者のほうが取れる範囲が広いので優先します。 */
export function pickSite(list, host = BRAND.host) {
  const bare = String(host || '').replace(/^www\./, '')
  const sites = (list || []).filter((s) => s.siteUrl)
  const domain = sites.find((s) => s.siteUrl === `sc-domain:${bare}`)
  if (domain) return domain.siteUrl
  const url = sites.find((s) => {
    try { return new URL(s.siteUrl).hostname.replace(/^www\./, '') === bare } catch (_) { return false }
  })
  return url ? url.siteUrl : null
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

/** 次元なしの問い合わせの答え（1行）を、画面で使う形に。 */
export function totalsOf(res) {
  const r = (res && res.rows && res.rows[0]) || {}
  const clicks = r.clicks || 0
  const impressions = r.impressions || 0
  return {
    clicks,
    impressions,
    ctr: impressions ? round((clicks / impressions) * 100, 1) : 0,
    position: impressions ? round(r.position || 0) : 0,
  }
}

/** 今期と前期の差。順位は小さいほど良いので、符号はそのまま（画面側で
 *  「上がった／下がった」に言い換えます）。 */
export function changeOf(cur, prev) {
  return {
    clicks: cur.clicks - prev.clicks,
    impressions: cur.impressions - prev.impressions,
    ctr: round(cur.ctr - prev.ctr, 1),
    position: cur.position && prev.position ? round(cur.position - prev.position) : null,
  }
}

/** ページのURLを、サイト内のパスに。 */
const pathOf = (u) => {
  try { return new URL(u).pathname || '/' } catch (_) { return String(u || '/') }
}

const DEVICE = { MOBILE: ['mobile', 'スマホ'], DESKTOP: ['desktop', 'パソコン'], TABLET: ['tablet', 'タブレット'] }

/** Google の答え一式を、画面に出す形にまとめる。通信と切り離してあるのは、
 *  ここを作り物の答えで確かめられるようにするためです
 *  （scripts/test-search-console.mjs）。 */
export function summarise(r, { terms = brandTerms() } = {}) {
  const total = totalsOf(r.totalCur)
  // 前期が取れなかったときは「0から増えた」と見せないよう、差を出しません。
  const prev = r.totalPrev ? totalsOf(r.totalPrev) : null

  const rows = ((r.queries && r.queries.rows) || []).map((x) => ({
    query: x.keys[0],
    branded: isBranded(x.keys[0], terms),
    clicks: x.clicks || 0,
    impressions: x.impressions || 0,
    position: round(x.position || 0),
  }))

  // query × page: 語ごとに、どのページが出ているか。
  const byQuery = new Map()
  for (const x of (r.queryPages && r.queryPages.rows) || []) {
    if (!x.keys || x.keys.length < 2) continue
    const [q, page] = x.keys
    if (!byQuery.has(q)) byQuery.set(q, [])
    byQuery.get(q).push({ page: pathOf(page), clicks: x.clicks || 0, impressions: x.impressions || 0, position: round(x.position || 0) })
  }
  for (const list of byQuery.values()) list.sort((a, b) => b.impressions - a.impressions)

  // 指名・非指名の合計。絞り込みの問い合わせが取れなかったときだけ、
  // 語ごとの行を足したもの（少なめに出ます）に戻し、そう印を付けます。
  const fromRows = (list) => {
    const impressions = list.reduce((n, x) => n + x.impressions, 0)
    const clicks = list.reduce((n, x) => n + x.clicks, 0)
    return {
      clicks, impressions,
      ctr: impressions ? round((clicks / impressions) * 100, 1) : 0,
      // 表示回数で重みを付けた平均順位。単純平均だと、1回しか出ていない
      // 語が全体を引っぱります。
      position: impressions ? round(list.reduce((n, x) => n + x.position * x.impressions, 0) / impressions) : 0,
    }
  }
  const brandedRows = rows.filter((x) => x.branded)
  const openRows = rows.filter((x) => !x.branded)
  const exact = !!(r.brandedCur && r.openCur)
  const branded = { ...(exact ? totalsOf(r.brandedCur) : fromRows(brandedRows)), queries: brandedRows.length }
  const open = { ...(exact ? totalsOf(r.openCur) : fromRows(openRows)), queries: openRows.length }
  const brandedPrev = r.brandedPrev ? totalsOf(r.brandedPrev) : null
  const openPrev = r.openPrev ? totalsOf(r.openPrev) : null

  const byImpr = (a, b) => b.impressions - a.impressions
  const topQueries = rows.slice().sort(byImpr).slice(0, 25)

  return {
    days: DAYS,
    // 「あと少しで1ページ目」の条件。画面の説明文がこの数字を使います。
    near: { from: NEAR_FROM, to: NEAR_TO, minImpressions: NEAR_MIN_IMPRESSIONS },
    total,
    prev,
    change: prev ? changeOf(total, prev) : null,
    branded,
    open,
    brandedPrev,
    openPrev,
    openChange: openPrev ? changeOf(open, openPrev) : null,
    // 指名＋非指名に入らなかったぶん。Google が内容を伏せている検索です。
    hidden: exact
      ? { impressions: Math.max(0, total.impressions - branded.impressions - open.impressions),
          clicks: Math.max(0, total.clicks - branded.clicks - open.clicks) }
      : null,
    splitExact: exact,
    brandTerms: terms,
    // 非指名を上に。ここが動くかどうかが、やっていることの答えです。
    topOpen: openRows.slice().sort(byImpr).slice(0, 15),
    topBranded: brandedRows.slice().sort(byImpr).slice(0, 8),
    topPages: ((r.pages && r.pages.rows) || []).map((x) => ({
      page: pathOf(x.keys[0]),
      clicks: x.clicks || 0,
      impressions: x.impressions || 0,
      position: round(x.position || 0),
    })).slice(0, 15),
    // 上位25語と、それぞれで出ているページ（最大3つ）。同じ語で2ページ
    // 以上が出ているときは、Google がどちらを出すか迷っている合図です。
    queryPages: topQueries.map((q) => ({ ...q, pages: (byQuery.get(q.query) || []).slice(0, 3) })),
    // あと少しで1ページ目: 平均8〜20位で、表示がそれなりにある非指名の語。
    // 1ページ目（おおむね10位まで）に入るとクリックが大きく増える位置です。
    opportunities: openRows
      .filter((x) => x.position >= NEAR_FROM && x.position <= NEAR_TO && x.impressions >= NEAR_MIN_IMPRESSIONS)
      .sort(byImpr)
      .slice(0, 10)
      .map((x) => ({ ...x, page: ((byQuery.get(x.query) || [])[0] || {}).page || null })),
    devices: ((r.devices && r.devices.rows) || [])
      .map((x) => {
        const [key, label] = DEVICE[x.keys[0]] || [String(x.keys[0] || '').toLowerCase(), String(x.keys[0] || '')]
        const impressions = x.impressions || 0
        const clicks = x.clicks || 0
        return { key, label, clicks, impressions, ctr: impressions ? round((clicks / impressions) * 100, 1) : 0, position: round(x.position || 0) }
      })
      .sort(byImpr),
  }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  const cfg = await storeFor(req).catch(() => null)
  if (cfg && !fresh) {
    try {
      const [hit] = await pipeline(cfg, [['GET', CACHE_KEY]])
      if (hit) return json({ ...JSON.parse(hit), cached: true })
    } catch (_) { /* 保存が読めなければ、取りに行くだけ */ }
  }

  const c = await creds(req)
  if (!connected(c)) {
    return json({
      ok: true, connected: false,
      message: 'Googleと接続していません。設定状況の「商談の自動予約」からGoogleカレンダーに接続すると、検索の数字も一緒に読めるようになります（読み取りのみ）。',
    })
  }

  let token
  try {
    token = await accessToken(c)
  } catch (e) {
    return json({ ok: true, connected: false, message: String(e.message || e).slice(0, 200) })
  }

  // どのプロパティが登録されているか
  let sites
  try {
    sites = await call(token, '/sites')
  } catch (e) {
    const needsScope = e.status === 403
    return json({
      ok: true, connected: true, authorised: false,
      message: needsScope
        ? 'Search Console を読む権限がありません。設定状況の「Googleカレンダーに接続」をもう一度押して、権限を付け直してください（読み取りのみ追加されます）。'
        : String(e.message || e).slice(0, 200),
    })
  }

  const siteUrl = pickSite(sites.siteEntry)
  if (!siteUrl) {
    return json({
      ok: true, connected: true, authorised: true, registered: false,
      message: `Search Console に ${BRAND.host} が登録されていません。search.google.com/search-console でプロパティを追加し、設定状況の「検索エンジンへの登録」に確認ファイル名を貼ってください。`,
    })
  }

  // 直近2日は集計途中なので外す。今期と、その直前の同じ長さ。
  const range = { startDate: day(DAYS + 1), endDate: day(2) }
  const prevRange = { startDate: day(2 * DAYS + 1), endDate: day(DAYS + 2) }
  const terms = brandTerms()
  const re = brandRegex(terms)
  const only = (operator) => ({ dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator, expression: re }] }] })
  const q = (rng, body) => call(token, `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, { ...rng, ...body })
  // 欠けても画面が成り立つものは、失敗を null にして続けます。
  const soft = (p) => p.catch(() => null)

  let r
  try {
    const [totalCur, queries, pages, totalPrev, brandedCur, openCur, brandedPrev, openPrev, queryPages, devices] = await Promise.all([
      q(range, {}),
      q(range, { dimensions: ['query'], rowLimit: 250 }),
      q(range, { dimensions: ['page'], rowLimit: 25 }),
      soft(q(prevRange, {})),
      soft(q(range, only('includingRegex'))),
      soft(q(range, only('excludingRegex'))),
      soft(q(prevRange, only('includingRegex'))),
      soft(q(prevRange, only('excludingRegex'))),
      soft(q(range, { dimensions: ['query', 'page'], rowLimit: 1000 })),
      soft(q(range, { dimensions: ['device'] })),
    ])
    r = { totalCur, queries, pages, totalPrev, brandedCur, openCur, brandedPrev, openPrev, queryPages, devices }
  } catch (e) {
    return json({ ok: true, connected: true, authorised: true, registered: true, message: String(e.message || e).slice(0, 200) })
  }

  const body = {
    ok: true,
    connected: true,
    authorised: true,
    registered: true,
    siteUrl,
    range,
    prevRange,
    fetchedAt: new Date().toISOString(),
    ...summarise(r, { terms }),
  }
  if (cfg) {
    try { await pipeline(cfg, [['SET', CACHE_KEY, JSON.stringify(body), 'EX', CACHE_TTL]]) } catch (_) { /* 次回また取りに行くだけ */ }
  }
  return json({ ...body, cached: false })
}
