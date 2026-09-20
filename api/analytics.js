export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'

// Reads the pageview counters back for the admin page. Same admin-key auth
// and rate limiting as the member endpoints.

import { storeFor, storeConfig, pipeline, lastDays, jstDate, K, KEEP_DAYS } from './_analytics-store.js'

// The enquiry path, and the two things that are measured but are not steps on
// it. They used to be one flat list of seven, which made the report say things
// that were not true: 見積り is an optional detour most visitors skip, so the
// row after it always looked like a gain rather than a loss, and the admin
// rendered that gain as "−-1700%". メニューを開いた is engagement, not a stage.
export const MAIN = [
  ['service_view', 'サービスを見た'],
  ['contact_view', '問い合わせ画面'],
  ['contact_start', '入力を始めた'],
  ['contact_submit', '送信した'],
]
export const SIDE = [
  ['estimate_start', '見積りを開いた'],
  ['estimate_done', '概算を出した'],
]
export const ENGAGE = [['menu_open', 'メニューを開いた']]
export const STEP_KEYS = [...MAIN, ...SIDE, ...ENGAGE].map(([k]) => k)

/** Upstash returns hashes as a flat [field, value, ...] array. */
function toPairs(flat) {
  const out = []
  if (!Array.isArray(flat)) return out
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ name: String(flat[i]), count: Number(flat[i + 1]) || 0 })
  }
  return out
}

function merge(lists, limit) {
  const totals = new Map()
  for (const list of lists) {
    for (const { name, count } of list) totals.set(name, (totals.get(name) || 0) + count)
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const cfg = await storeFor(req)
  if (!cfg) {
    return json({
      ok: false, code: 'STORE_NOT_CONFIGURED',
      message: 'アクセス解析の保存先が未設定です。Vercel の Storage から Upstash Redis を接続し、UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を環境変数に設定して再デプロイしてください。',
    }, 503)
  }

  // The same `url` the endpoint parsed for itself before the guard was
  // factored out. Without it every authorised request threw here.
  const url = new URL(req.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 90)
  const dates = lastDays(days)

  let raw
  try {
    raw = await pipeline(cfg, [
      ['GET', K.totalViews],
      ...dates.map((d) => ['GET', K.dayViews(d)]),
      ...dates.map((d) => ['PFCOUNT', K.dayVisitors(d)]),
      ...dates.map((d) => ['HGETALL', K.dayPaths(d)]),
      ...dates.map((d) => ['HGETALL', K.dayRefs(d)]),
      ...dates.map((d) => ['HGETALL', K.dayDevices(d)]),
      ...dates.map((d) => ['HGETALL', K.dayEvents(d)]),
      // One union per step. PFCOUNT over many keys returns the cardinality of
      // their union, so this is 8 commands rather than 8 × days.
      ['PFCOUNT', ...dates.map((d) => K.dayVisitors(d))],
      ...STEP_KEYS.map((ev) => ['PFCOUNT', ...dates.map((d) => K.dayEventUsers(d, ev))]),
    ])
  } catch (e) {
    return json({ ok: false, code: 'STORE_ERROR', message: 'アクセス解析データを読み込めませんでした。時間をおいて再度お試しください。' }, 502)
  }

  let i = 0
  const totalAllTime = Number(raw[i++]) || 0
  const views = dates.map(() => Number(raw[i++]) || 0)
  const visitors = dates.map(() => Number(raw[i++]) || 0)
  const paths = dates.map(() => toPairs(raw[i++]))
  const refs = dates.map(() => toPairs(raw[i++]))
  const devices = dates.map(() => toPairs(raw[i++]))
  const evDays = dates.map(() => toPairs(raw[i++]))
  const arrivals = Number(raw[i++]) || 0
  const people = {}
  for (const ev of STEP_KEYS) people[ev] = Number(raw[i++]) || 0

  const evTotals = {}
  for (const day of evDays) for (const { name, count } of day) evTotals[name] = (evTotals[name] || 0) + count

  // Two numbers per step, because they answer different questions and only one
  // of them can be turned into a rate: `count` is how many times it happened,
  // `people` is how many visitors did it at least once that day. `rate` is
  // always people ÷ arrivals — the same unit on both sides.
  const step = ([key, label]) => ({
    key, label,
    count: evTotals[key] || 0,
    people: people[key] || 0,
    rate: arrivals ? (people[key] || 0) / arrivals : 0,
  })

  const main = MAIN.map(step)
  // Step-over-step loss, and only when it is a loss. A step larger than the one
  // above it means visitors arrived straight into it — a real and useful thing
  // to see, but it is not a negative drop.
  main.forEach((s, n) => {
    const prev = n === 0 ? arrivals : main[n - 1].people
    s.drop = prev > 0 && s.people <= prev ? 1 - s.people / prev : null
    s.direct = prev > 0 && s.people > prev
  })

  const side = SIDE.map(step)
  const funnel = {
    // Visitor-days: the id is re-salted daily on purpose, so someone returning
    // on a second day counts twice. Both sides of every rate share that, so the
    // ratio is right even though the total is not a headcount.
    arrivals,
    unit: 'visitor-days',
    main,
    side,
    // Of those who opened the estimator, how many saw a figure.
    sideCompletion: side[0] && side[0].people
      ? (side[1] ? side[1].people : 0) / side[0].people
      : null,
    engagement: ENGAGE.map(step),
  }

  const series = dates.map((date, n) => ({ date, views: views[n], visitors: visitors[n] }))
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const today = jstDate()
  const todayIdx = dates.indexOf(today)
  const win = (n) => sum(views.slice(-n))

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    keepDays: KEEP_DAYS,
    // Which kind of connection this is. A pageview is recorded while serving
    // the visitor's request, which carries nothing of the admin's — so a pair
    // held in the admin's browser can read this screen but can never fill it.
    // Zeros that will stay zero look exactly like zeros that are about to
    // fill up, and the screen has to be able to tell the operator which.
    storeFrom: storeConfig() ? 'env' : 'device',
    range: { days, from: dates[0], to: dates[dates.length - 1] },
    funnel,
    funnelSeries: dates.map((date, n) => ({
      date,
      submit: (evDays[n].find((e) => e.name === 'contact_submit') || {}).count || 0,
    })),
    totals: {
      allTime: totalAllTime,
      today: todayIdx >= 0 ? views[todayIdx] : 0,
      todayVisitors: todayIdx >= 0 ? visitors[todayIdx] : 0,
      last7: win(7),
      last30: win(30),
      rangeViews: sum(views),
      // Per-day uniques cannot be added into a period unique — a returning
      // visitor is counted once a day. Labelled as such in the UI.
      rangeVisitorDays: sum(visitors),
    },
    series,
    topPaths: merge(paths, 20),
    topReferrers: merge(refs, 12),
    devices: merge(devices, 5),
  })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
