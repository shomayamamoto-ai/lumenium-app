export const config = { runtime: 'edge' }

// 毎朝の自動処理（Vercel Cron）。予約投稿のうち、日付が来たものを送ります。
// 予約管理の前日のお知らせ（booking-cron.js）、口コミの同期（_reviews.js）、自動改善（auto-cron.js）もここから動かします。
// ついでに、期限が近い Threads のトークンを延長し、1日後・7日後の投稿の反応を取ります。
//
// Vercel は CRON_SECRET が環境変数にあると、それを
// `Authorization: Bearer <CRON_SECRET>` として付けて呼びます。それ以外の
// 呼び出しは断ります。CRON_SECRET が無いときは、誰でも呼べてしまうので
// 何もしません（予約の画面にもその旨が出ます）。
//
// 時刻は _social-queue.js の SCHEDULE と vercel.json の "crons" で決まります。

import { json } from './_admin-auth.js'
import { storeConfig, pipeline, jstDate } from './_analytics-store.js'
import { listScheduled, claim, CRON_LAST, planRepeats } from './_social-queue.js'
import { sendPost, threadsTokenInfo, refreshThreadsToken, socialStatus, refreshDue, repeatBuilder } from './_social.js'
import { readPrefs, readTemplates } from './_social-store.js'
import { runVideoCron } from './video-publish.js'
import { runBookingCron } from './booking-cron.js'
import { runAutoCron } from './auto-cron.js'
import { runNewsCron } from './_news-cron.js'
import { runReviewsCron } from './_reviews.js'

// 全体で使ってよい時間。Edge は25秒以内に返事を始める必要があります。
const BUDGET_MS = 21000
const PARALLEL = 3

async function same(a, b) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s)))))
  const u = new Uint8Array(x)
  const v = new Uint8Array(y)
  let d = 0
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]
  return d === 0
}

export async function GET(req) {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) {
    return json({ ok: false, code: 'NO_CRON_SECRET', message: 'CRON_SECRET が未設定のため動きません。' }, 503)
  }
  const auth = req.headers.get('authorization') || ''
  if (!(await same(auth, `Bearer ${secret}`))) return json({ ok: false, message: '認証できませんでした。' }, 401)
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: '保存先（Upstash Redis）の環境変数がありません。' }, 503)

  const started = Date.now()
  const today = jstDate()
  const due = (await listScheduled()).filter((i) => i.date <= today)
  const done = []
  let left = 0

  // 3件ずつ。各件の中では投稿先を並べて送ります。時間が足りなくなったら、
  // まだ手を付けていないものは取り出さずに残し、翌朝に回します。
  for (let i = 0; i < due.length; i += PARALLEL) {
    const remaining = BUDGET_MS - (Date.now() - started)
    if (remaining < 8000) { left = due.length - i; break }
    const batch = due.slice(i, i + PARALLEL)
    const ran = await Promise.all(batch.map(async (item) => {
      if (!(await claim(item.id))) return null
      const r = await sendPost(item.payload, undefined, { budget: remaining - 2000, scheduledFor: item.date })
      return { id: item.id, date: item.date, ok: r.results.filter((x) => x.ok).length, total: r.results.length, kept: r.kept }
    }))
    done.push(...ran.filter(Boolean))
  }

  // 繰り返し投稿：8週間先までの予約を足します（今日の分を送ったあとに）。
  let repeats = null
  if (BUDGET_MS - (Date.now() - started) > 9000) {
    try {
      const tpls = await readTemplates()
      if (tpls.some((t) => t.repeat)) repeats = await planRepeats(tpls, await repeatBuilder())
    } catch (e) { repeats = { ok: false, message: String((e && e.message) || e).slice(0, 160) } }
  }

  // Threads のトークン。期限が分かっていて、残り10日を切ったら延ばします。
  let threads = null
  try {
    const nets = await socialStatus()
    if (nets.some((n) => n.id === 'threads' && n.ready)) {
      const info = await threadsTokenInfo()
      if (info.canRefresh && info.daysLeft != null && info.daysLeft <= 10 && Date.now() - started < BUDGET_MS - 6000) {
        const r = await refreshThreadsToken()
        threads = { ok: r.ok, message: r.message }
      }
    }
  } catch (e) {
    threads = { ok: false, message: String((e && e.message) || e).slice(0, 160) }
  }

  // 1日後・7日後の反応を取ります（時間が残っているときだけ。X は設定で許したときだけ）。
  let metrics = null
  try {
    const remaining = BUDGET_MS - (Date.now() - started)
    if (remaining > 11000) {
      // 動画の予約のぶんの時間（6秒）を残しておきます。
      metrics = await refreshDue({ allowX: (await readPrefs()).xAutoMetrics, budget: remaining - 8500 })
    }
  } catch (e) {
    metrics = { ok: false, message: String((e && e.message) || e).slice(0, 160) }
  }

  // 予約の前日のお知らせと、オーナーへの今日の予約一覧（booking-cron.js）。
  // 数件のメールだけなので、動画より先に回します。
  let booking = null
  if (BUDGET_MS - (Date.now() - started) > 4000) {
    try { booking = await runBookingCron(req) }
    catch (e) { booking = { ok: false, message: String((e && e.message) || e).slice(0, 160) } }
  }

  // お知らせの予約：公開日が来たものがあれば、サイトを作り直させます（_news-cron.js）。
  // 呼ぶのはフック1回だけなので、自動改善より先に。
  let news = null
  if (BUDGET_MS - (Date.now() - started) > 5000) {
    try { news = await runNewsCron(req) }
    catch (e) { news = { ok: false, message: String((e && e.message) || e).slice(0, 160) } }
  }

  // 口コミ管理（_reviews.js）: 新しい口コミだけ読み直し、「自動で送る」設定なら
  // 来店済みのお客様へのお願いメール（1日5件まで）。長くても4秒、足りない日は翌朝に。
  let reviews = null
  if (BUDGET_MS - (Date.now() - started) > 14000) {
    try { reviews = await runReviewsCron(req, 4000) }
    catch (e) { reviews = { ok: false, message: String((e && e.message) || e).slice(0, 160) } }
  }

  // 自動改善（auto-cron.js）: 観測 → 実験の判定 → 設定しだいで採用・戻す → 提案。
  // 動画のぶん（6秒）を残し、長くても12秒まで。足りない日は翌朝に回します。
  let auto = null
  {
    const remaining = BUDGET_MS - (Date.now() - started)
    if (remaining > 9000) auto = await runAutoCron(req, Math.min(12000, remaining - 6000))
  }

  // SNS（動画）の Instagram リールの予約と「準備中」。残り時間の中でだけ動きます。
  let video = null
  if (BUDGET_MS - (Date.now() - started) > 6000) {
    try { video = await runVideoCron(BUDGET_MS - (Date.now() - started) - 1000) }
    catch (e) { video = { ok: false, message: String((e && e.message) || e).slice(0, 160) } }
  }

  const summary = { at: new Date().toISOString(), date: today, sent: done, left, repeats, threads, metrics, booking, news, reviews, auto: auto && { ok: auto.ok, paused: auto.paused, steps: (auto.steps || []).map((x) => x.step + (x.ok === false ? '!' : '')) }, video }
  try { await pipeline(cfg, [['SET', CRON_LAST, JSON.stringify(summary), 'EX', 30 * 86400]]) } catch (_) {}
  return json({ ok: true, ...summary })
}
