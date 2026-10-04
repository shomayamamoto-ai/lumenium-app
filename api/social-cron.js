export const config = { runtime: 'edge' }

// 毎朝の自動処理（Vercel Cron）。予約投稿のうち、日付が来たものを送ります。
// ついでに、期限が近い Threads のトークンを延長します。
//
// Vercel は CRON_SECRET が環境変数にあると、それを
// `Authorization: Bearer <CRON_SECRET>` として付けて呼びます。それ以外の
// 呼び出しは断ります。CRON_SECRET が無いときは、誰でも呼べてしまうので
// 何もしません（予約の画面にもその旨が出ます）。
//
// 時刻は _social-queue.js の SCHEDULE と vercel.json の "crons" で決まります。

import { json } from './_admin-auth.js'
import { storeConfig, pipeline, jstDate } from './_analytics-store.js'
import { listScheduled, claim, CRON_LAST } from './_social-queue.js'
import { sendPost, threadsTokenInfo, refreshThreadsToken, socialStatus } from './_social.js'

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

  const summary = { at: new Date().toISOString(), date: today, sent: done, left, threads }
  try { await pipeline(cfg, [['SET', CRON_LAST, JSON.stringify(summary), 'EX', 30 * 86400]]) } catch (_) {}
  return json({ ok: true, ...summary })
}
