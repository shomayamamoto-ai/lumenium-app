export const config = { runtime: 'edge' }

// Reads the pageview counters back for the admin page. Same admin-key auth
// and rate limiting as the member endpoints.

import { storeConfig, pipeline, lastDays, jstDate, K, KEEP_DAYS } from './_analytics-store.js'

const enc = new TextEncoder()

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function keyMatches(submitted, configured) {
  const a = await hmacHex(String(submitted), 'lumenium-admin-compare')
  const b = await hmacHex(String(configured), 'lumenium-admin-compare')
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const fails = new Map()
function limited(ip) {
  const rec = fails.get(ip)
  return !!rec && Date.now() <= rec.resetAt && rec.count >= MAX_FAILS
}
function recordFail(ip) {
  const now = Date.now()
  const rec = fails.get(ip)
  if (!rec || now > rec.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  else rec.count += 1
  if (fails.size > 1000) fails.clear()
}

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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const adminKey = (process.env.ADMIN_KEY || '').trim()
  if (!adminKey) return json({ ok: false, code: 'NOT_CONFIGURED', message: 'ADMIN_KEY が未設定です。' }, 503)

  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  const submitted = ((auth.startsWith('Bearer ') ? auth.slice(7) : '') || url.searchParams.get('key') || '').trim()
  if (limited(ip) || !submitted || !(await keyMatches(submitted, adminKey))) {
    recordFail(ip)
    return json({ ok: false, code: 'UNAUTHORIZED', message: '管理キーが正しくありません。' }, 401)
  }
  fails.delete(ip)

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
