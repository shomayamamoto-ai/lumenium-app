export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'

// Reads the pageview counters back for the admin page. Same admin-key auth
// and rate limiting as the member endpoints. The arithmetic lives in
// _analytics-report.js, which the weekly mail uses too, so the two can never
// disagree about what a number means.

import { storeFor, storeConfig, KEEP_DAYS } from './_analytics-store.js'
import { buildReport, MAX_RANGE } from './_analytics-report.js'

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const cfg = await storeFor(req)
  if (!cfg) {
    return json({
      ok: false, code: 'STORE_NOT_CONFIGURED',
      message: 'アクセス解析の保存先が未設定です。Vercel の Storage から Upstash Redis を接続してください（KV_REST_API_URL と KV_REST_API_TOKEN が自動で入ります）。手で入れる場合は UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN でも構いません。',
    }, 503)
  }

  const url = new URL(req.url)
  // 7 / 30 / 90 / 180 / 365. Data is kept 400 days, so a year still has a
  // (partial) year before it to compare against.
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), MAX_RANGE)

  let report
  try {
    report = await buildReport(cfg, { days })
  } catch (e) {
    return json({ ok: false, code: 'STORE_ERROR', message: 'アクセス解析データを読み込めませんでした。時間をおいて再度お試しください。' }, 502)
  }

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    keepDays: KEEP_DAYS,
    // Which kind of connection this is. A pageview is recorded while serving
    // the visitor's request, which carries nothing of the admin's — so a pair
    // held in the admin's browser can read this screen but can never fill it.
    storeFrom: storeConfig() ? 'env' : 'device',
    ...report,
  })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
