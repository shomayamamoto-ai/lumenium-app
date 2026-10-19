export const config = { runtime: 'edge' }

import { requireAdmin } from './_admin-auth.js'

// Reads the pageview counters back for the admin page. Same admin-key auth
// and rate limiting as the member endpoints. The arithmetic lives in
// _analytics-report.js, which the weekly mail uses too, so the two can never
// disagree about what a number means.

import { storeFor, storeConfig, KEEP_DAYS, K, pipeline, jstDate, lastDays } from './_analytics-store.js'
import { buildReport, MAX_RANGE, toPairs } from './_analytics-report.js'
import { analyticsAttention, seenSnapshot, LOOKBACK_DAYS } from './_analytics-attention.js'
import { liveReadCommands, liveSummary } from './_analytics-live.js'
import { buildMarks, cleanNote, tidyNotes, MARK_KINDS } from './_analytics-marks.js'
import { AIO_INDEX } from './_aio-catalog.js'

//   GET ?days=30&end=0   -> その期間の数字（end は「何日前で終わる期間か」。◀▶ で前の期間を見るため）
//   GET ?view=badge      -> 要対応の数（新しい404・問い合わせフォームの送信の失敗）
//   GET ?view=live       -> いまサイトにいる人（最近5分の人数と、見られているページ）
//   GET ?view=marks&from=&to= -> グラフに付ける出来事（文章の保存・お知らせ・SNS・AIO計測・メモ）
//   POST { action:'seen' } -> 「確認しました」（ここまでの404と失敗を、要対応から外す）
//   POST { action:'note-add', date, text } / { action:'note-del', id } -> グラフのメモ

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

/* ---- グラフに付ける出来事 ----
   記録はそれぞれ別の場所にあります。どれか1つが読めなくても（GitHub の
   キーが無い・SNS をまだ使っていない等）、残りは出します。 */
async function readNotes(cfg) {
  const [raw] = await pipeline(cfg, [['GET', K.notes]])
  try { return tidyNotes(raw ? JSON.parse(raw) : []) } catch (_) { return [] }
}

async function marks(cfg, req, from, to) {
  const quiet = (p) => p.then((v) => v, () => null)
  const [notes, runs, posts, saves, news] = await Promise.all([
    quiet(readNotes(cfg)),
    quiet(pipeline(cfg, [['LRANGE', AIO_INDEX, 0, 59]]).then(([ids]) => (Array.isArray(ids) ? ids : []).map((id) => ({ id: String(id) })))),
    quiet(import('./_social.js').then((m) => m.recentPosts(200, req))),
    quiet((async () => {
      const { setting } = await import('./_settings.js')
      const token = await setting('GITHUB_TOKEN', '', req)
      if (!token) return null
      const G = await import('./_github.js')
      return G.fileHistory(token, G.repoName(), 'public/content.json', 60)
    })()),
    // 公開中のお知らせ（予約で、まだ公開日が来ていないものは除きます）。
    quiet((async () => {
      const r = await fetch(new URL('/news.json', req.url), { signal: AbortSignal.timeout(4000), cache: 'no-store' })
      if (!r.ok) return null
      const items = await r.json()
      const { liveNews } = await import('../src/lib/news.js')
      return Array.isArray(items) ? liveNews(items) : null
    })()),
  ])
  return {
    from, to,
    kinds: MARK_KINDS,
    marks: buildMarks({ notes, runs, posts, saves, news }, from, to),
    // 読めなかった記録。画面が「その種類は出ていません」と言えるように。
    missing: Object.entries({ copy: saves, news, sns: posts, aio: runs }).filter(([, v]) => !v).map(([k]) => k),
  }
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
  if (url.searchParams.get('view') === 'live') {
    try {
      const raw = await pipeline(cfg, liveReadCommands(K, Date.now()))
      return json({ ok: true, at: new Date().toISOString(), storeFrom: storeConfig() ? 'env' : 'device', ...liveSummary(raw) })
    } catch (_) {
      return json({ ok: false, message: 'いまの人数を読めませんでした。' }, 502)
    }
  }
  if (url.searchParams.get('view') === 'marks') {
    const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')
    const to = ok(url.searchParams.get('to')) ? url.searchParams.get('to') : jstDate()
    const from = ok(url.searchParams.get('from')) ? url.searchParams.get('from') : jstDate(29)
    if (from > to) return json({ ok: false, message: '期間が正しくありません。' }, 400)
    try { return json({ ok: true, ...(await marks(cfg, req, from, to)) }) } catch (_) {
      return json({ ok: false, message: '出来事を読めませんでした。' }, 502)
    }
  }
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
  /* グラフのメモ。数字の動きの理由になりそうな、画面の外の出来事を残します。 */
  if (body && (body.action === 'note-add' || body.action === 'note-del')) {
    try {
      const list = await readNotes(cfg)
      let next
      if (body.action === 'note-add') {
        const c = cleanNote(body)
        if (!c.ok) return json({ ok: false, message: c.message }, 400)
        next = tidyNotes([c.note, ...list])
      } else {
        next = list.filter((n) => n.id !== String(body.id || ''))
        if (next.length === list.length) return json({ ok: false, message: 'そのメモは見つかりませんでした（もう消えています）。' }, 404)
      }
      await pipeline(cfg, [['SET', K.notes, JSON.stringify(next)]])
      return json({ ok: true, notes: next })
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
