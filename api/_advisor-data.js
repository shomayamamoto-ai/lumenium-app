// AIアドバイザーに渡す数字を集めます（読むだけ。どのツールの記録も書き換えません）。
//
// 土台は自動改善の「1日1枚のまとめ」（_auto-signals.js のスナップショット）です。
// 毎朝の処理が作ったものがあればそれを読み（Redis の GET 1回）、無ければ
// その場で同じ読み取りを走らせます（保存はしません。毎朝の処理の仕事です）。
// まとめに無いもの（問い合わせのジャンル別の件数・これからの予約の件数・
// お知らせの日付・自動改善の提案・クローラーの来訪・AIの答えの中身）は
// ここで足します。どれか1つが読めなくても、残りで相談はできます。
//
// 個人の情報（名前・メール・電話・本文）は、ここで件数にしてから渡します。
// 元の一覧はこの関数の外に出ません（_advisor-core.js の inquiryCounts ほか）。
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { pipeline } from './_analytics-store.js'
import { BRAND as SITE, KV } from './_brand.js'
import { readSnapshots, gatherSignals, defaultReaders, safely } from './_auto-signals.js'
import { VERDICTS, isHit, isBranded } from './_aio-catalog.js'
import { inquiryCounts, bookingCounts, newsInfo, autoInfo, groundingText, starters, jstDay } from './_advisor-core.js'

const DAY = 86400000

/** 文章編集で開ける項目の一覧（AIに path を選ばせるため）。
 *  見出しと説明文（text.*）と、サービスの紹介（services.*）の短い項目だけ。 */
export async function copyFields() {
  try {
    const { collectPaths } = await import('../src/lib/content-registry.js')
    const all = collectPaths()
    const pick = all.filter((e) => /^text\./.test(e.path) || /^services\.@[\w-]+\.(title|lead|summary|catch|desc|price)$/.test(e.path))
    return { fields: pick.slice(0, 80).map((e) => ({ path: e.path, value: String(e.value) })), paths: all.map((e) => e.path) }
  } catch (_) {
    return { fields: [], paths: null }
  }
}

async function latestSnapshot(cfg, req, now) {
  const dates = [0, 1, 2].map((d) => jstDay(now - d * DAY))
  const got = await readSnapshots(cfg, pipeline, dates).catch(() => [])
  if (got.length) return got.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  const snap = await gatherSignals(defaultReaders(cfg, pipeline, req), dates[0], { timeoutMs: 4000, now })
  return { ...snap, fresh: true }
}

/** AIの答えの中身（出てこなかった質問と、代わりに挙がった会社）。 */
async function aioDetail(cfg) {
  const [ids] = await pipeline(cfg, [['LRANGE', `${KV}aio:index`, 0, 0]])
  if (!Array.isArray(ids) || !ids.length) return null
  const [raw] = await pipeline(cfg, [['GET', `${KV}aio:run:${ids[0]}`]])
  const run = JSON.parse(raw)
  if (!run || !run.summary) return null
  const missed = [...new Map((run.results || [])
    .filter((r) => !r.error && !r.truncated && r.cat !== 'ブランド指名' && !isBranded(r) && !isHit(r.verdict))
    .map((r) => [r.id, { q: r.q, why: VERDICTS[r.verdict] ? VERDICTS[r.verdict].label : '判定できず' }])).values()]
  return { missed, competitors: (run.summary.competitors || []).slice(0, 8) }
}

async function newsList() {
  const res = await fetch(`${SITE.url}/news.json`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) return null
  const j = await res.json()
  return Array.isArray(j) ? j : Array.isArray(j && j.items) ? j.items : null
}

/** → { snap, crawl, aioDetail, social, inquiries, news, bookings, auto, copyFields, copyPaths } */
export async function loadGrounding(cfg, req, now = Date.now()) {
  const val = (r) => (r && r.status === 'ok' ? r.data : null)
  const [snap, crawl, aio, social, inq, bk, news, auto, copy] = await Promise.all([
    cfg ? safely(() => latestSnapshot(cfg, req, now), 9000) : null,
    cfg ? safely(async () => (await import('./_crawlers.js')).readCrawls(cfg, 30), 4000) : null,
    cfg ? safely(() => aioDetail(cfg), 3000) : null,
    safely(async () => {
      const m = await import('./_social.js')
      const [activity, nets] = await Promise.all([m.socialActivity(30, req), m.socialStatus(req).catch(() => [])])
      return { ...activity, ready: (nets || []).filter((x) => x.ready).map((x) => x.label) }
    }, 4000),
    cfg ? safely(async () => {
      const m = await import('./_inquiries.js')
      return inquiryCounts(await m.allSummaries(cfg), 30, now)
    }, 4000) : null,
    cfg ? safely(async () => {
      const b = await import('./_booking.js')
      return bookingCounts(await b.recentBookings(cfg, pipeline, 200), now)
    }, 4000) : null,
    safely(async () => newsInfo(await newsList(), now), 3500),
    cfg ? safely(async () => {
      const s = await import('./_auto-store.js')
      const [props, exps] = await Promise.all([s.readProps(cfg, pipeline), s.readExps(cfg, pipeline)])
      return autoInfo(props, exps)
    }, 3000) : null,
    copyFields(),
  ])
  return {
    snap: val(snap) || null,
    crawl: val(crawl), aioDetail: val(aio), social: val(social),
    inquiries: val(inq), bookings: val(bk), news: val(news), auto: val(auto),
    copyFields: copy.fields, copyPaths: copy.paths,
  }
}

export { groundingText, starters }
