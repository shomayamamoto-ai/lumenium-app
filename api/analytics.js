export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'

// Reads the pageview counters back for the admin page. Same admin-key auth
// and rate limiting as the member endpoints. The arithmetic lives in
// _analytics-report.js, which the weekly mail uses too, so the two can never
// disagree about what a number means.

import { storeFor, storeConfig, KEEP_DAYS, K, pipeline, jstDate, lastDays } from './_analytics-store.js'
import { buildReport, MAX_RANGE, toPairs } from './_analytics-report.js'
import { analyticsAttention, seenSnapshot, LOOKBACK_DAYS } from './_analytics-attention.js'

//   GET ?days=30&end=0   -> その期間の数字（end は「何日前で終わる期間か」。◀▶ で前の期間を見るため）
//   GET ?view=badge      -> 要対応の数（新しい404・問い合わせフォームの送信の失敗）
//   POST { action:'seen' } -> 「確認しました」（ここまでの404と失敗を、要対応から外す）

const asObj = (flat) => Object.fromEntries(toPairs(flat).map((p) => [p.name, p.count]))

/** 最近の日ごとの 404 と送信結果、前回の「確認しました」、最後の送信エラー。 */
async function attentionInput(cfg) {
  const dates = lastDays(LOOKBACK_DAYS)
  const raw = await pipeline(cfg, [
    ...dates.flatMap((d) => [['HGETALL', K.dayEventPaths(d, 'not_found')], ['HGETALL', K.dayContact(d)]]),
    ['GET', K.analyticsSeen],
    ['GET', K.contactLastError],
  ])
  const days = dates.map((date, i) => ({ date, notFound: asObj(raw[i * 2]), contact: asObj(raw[i * 2 + 1]) }))
  const parse = (v) => { try { return v ? JSON.parse(v) : null } catch (_) { return null } }
  return { days, seen: parse(raw[dates.length * 2]), lastError: parse(raw[dates.length * 2 + 1]) }
}

async function markSeen(cfg, days) {
  const today = jstDate()
  const snap = seenSnapshot(Date.now(), today, days.find((d) => d.date === today))
  await pipeline(cfg, [['SET', K.analyticsSeen, JSON.stringify(snap)]])
  return snap
}

async function badge(cfg) {
  const { days, seen, lastError } = await attentionInput(cfg)
  // 初めてのときは「いま」を基準にします（昔の404を全部「要対応」にしないため）。
  if (!seen) { const snap = await markSeen(cfg, days); return { ...analyticsAttention(days, snap, lastError), seenAt: snap.at } }
  return { ...analyticsAttention(days, seen, lastError), seenAt: seen.at || 0 }
}

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
  if (url.searchParams.get('view') === 'badge') {
    try { return json({ ok: true, ...(await badge(cfg)) }) } catch (_) {
      return json({ ok: false, message: '要対応の数を読めませんでした。' }, 502)
    }
  }
  // 7 / 30 / 90 / 180 / 365. Data is kept 400 days, so a year still has a
  // (partial) year before it to compare against.
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), MAX_RANGE)

  // 何日前で終わる期間か。比べる「前の期間」も残っている範囲までにします。
  const endOffset = Math.min(Math.max(parseInt(url.searchParams.get('end') || '0', 10) || 0, 0), Math.max(0, KEEP_DAYS - days * 2))

  let report
  try {
    report = await buildReport(cfg, { days, endOffset })
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
    // end は「何日前で終わる期間か」（画面の ◀▶）。
    range: { ...(report.range || {}), end: endOffset },
  })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await storeFor(req)
  if (!cfg) return json({ ok: false, code: 'STORE_NOT_CONFIGURED', message: 'アクセス解析の保存先が未設定です。' }, 503)
  let body = {}
  try { body = await req.json() } catch (_) {}
  if (body && body.action === 'seen') {
    try {
      const { days, lastError } = await attentionInput(cfg)
      const snap = await markSeen(cfg, days)
      return json({ ok: true, seenAt: snap.at, ...analyticsAttention(days, snap, lastError) })
    } catch (_) {
      return json({ ok: false, message: '保存できませんでした。時間をおいてもう一度お試しください。' }, 502)
    }
  }
  return json({ ok: false, message: '知らない操作です。' }, 400)
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
