export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'

// Reads the pageview counters back for the admin page. Same admin-key auth
// and rate limiting as the member endpoints.

import { storeConfig, pipeline, lastDays, jstDate, K, KEEP_DAYS } from './_analytics-store.js'
import { EVENTS } from './track.js'

const enc = new TextEncoder()

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

  const cfg = storeConfig()
  if (!cfg) {
    return json({
      ok: false, code: 'STORE_NOT_CONFIGURED',
      message: 'アクセス解析の保存先が未設定です。Vercel の Storage から Upstash Redis を接続し、UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を環境変数に設定して再デプロイしてください。',
    }, 503)
  }

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

  // The enquiry funnel, in order. Counting how many reach each step is the
  // only way to tell which page is doing the selling — pageviews alone say
  // nothing about whether anyone got as far as writing to us.
  const evTotals = {}
  for (const day of evDays) for (const { name, count } of day) evTotals[name] = (evTotals[name] || 0) + count
  const STEPS = [
    ['menu_open', 'メニューを開いた'],
    ['service_view', 'サービスを見た'],
    ['estimate_start', '見積りを開いた'],
    ['estimate_done', '概算を出した'],
    ['contact_view', '問い合わせ画面'],
    ['contact_start', '入力を始めた'],
    ['contact_submit', '送信した'],
  ]
  const rangeViews0 = views.reduce((x, y) => x + y, 0)
  const funnel = STEPS.map(([key, label]) => ({
    key, label,
    count: evTotals[key] || 0,
    // Against pageviews, so it reads as "of everyone who arrived".
    rate: rangeViews0 ? (evTotals[key] || 0) / rangeViews0 : 0,
  }))

  const series = dates.map((date, n) => ({ date, views: views[n], visitors: visitors[n] }))
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const today = jstDate()
  const todayIdx = dates.indexOf(today)
  const win = (n) => sum(views.slice(-n))

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    keepDays: KEEP_DAYS,
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
