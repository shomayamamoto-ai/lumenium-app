// SNS（動画）の投稿と数字の取得（管理者のみ）。
//
//   GET  /api/video-publish                    予約の一覧と、24時間の投稿数
//   POST /api/video-publish {action, project, pub, …}
//     instagram.start   リールの準備を始める（Meta が Blob の動画を取りに来る）
//     instagram.status  準備の状況を確かめ、終わっていれば公開する（画面が数秒おきに呼ぶ）
//     youtube.token     ブラウザが YouTube に直接送るための、1時間だけの鍵
//     youtube.done      ブラウザが送り終えた動画の ID を記録する
//     tiktok.send       TikTok の受信箱（下書き）に送る
//     tiktok.status     TikTok 側の状況
//     metrics           その投稿の数字を取りに行き、記録する
//     schedule / unschedule  Instagram の予約（その日の朝9時ごろ、毎朝の自動処理が送ります）
//
// Node の関数（最大60秒、vercel.json）にしているのは、TikTok へ動画を流す
// 処理のためです。Instagram の「準備中」を1つの関数で待ち続けることは
// しません。数秒で返し、画面か毎朝の自動処理がもう一度聞きに来ます。

import { requireAdmin, json } from './_admin-auth.js'
import { pipeline, jstDate, storeConfig } from './_analytics-store.js'
import { scheduleReady } from './_social-queue.js'
import { VK, NO_STORE, videoStore, getProject, getItem, putItems, capLeft, capRecord, validId } from './_video-store.js'
import { fitCaption, PLATFORMS, RULES } from './_video-core.js'
import { igStartReel, igAdvance, igInsights, ytAccess, ytStats, ttInboxUpload, ttStatus, ttStats, readiness } from './_video-platforms.js'

const BUDGET_MS = 52000
const MAX_QUEUE = 50

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await videoStore(req)
  const ready = await readiness(req)
  if (!cfg) return json({ ...NO_STORE, ok: true, ready, queue: [], caps: {} })
  const [flat] = await pipeline(cfg, [['HGETALL', VK.queue]])
  const queue = []
  for (let i = 0; i + 1 < (flat || []).length; i += 2) { try { queue.push(JSON.parse(flat[i + 1])) } catch (_) {} }
  const caps = {}
  for (const net of Object.keys(RULES.post.DAILY_POST_CAP)) if (RULES.post.DAILY_POST_CAP[net]) caps[net] = await capLeft(cfg, net)
  const [last] = await pipeline(cfg, [['GET', `${VK.queue}:last`]])
  let cron = null
  try { cron = last ? JSON.parse(last) : null } catch (_) {}
  return json({ ok: true, ready, queue: queue.sort((a, b) => (a.date < b.date ? -1 : 1)), caps, cron, jstHour: 9 })
}

/** 投稿先ごとの本文。ハッシュタグを守るために本文を削るのは25%まで。 */
export function captionFor(pub) {
  const P = PLATFORMS[pub.platform] || PLATFORMS.instagram
  return fitCaption(pub.caption, pub.hashtags, P.caption)
}

async function savePub(cfg, pid, pub) {
  const r = await putItems(cfg, pid, 'pubs', [pub])
  return r.ok ? r.items[0] : pub
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let b
  try { b = await req.json() } catch (_) { b = null }
  if (!b || typeof b.action !== 'string') return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400)
  const a = b.action
  if (a === 'youtube.token') return json(await ytAccess(req))

  const cfg = await videoStore(req)
  if (!cfg) return json(NO_STORE, 503)
  const project = await getProject(cfg, b.project)
  if (!project) return json({ ok: false, message: 'プロジェクトが見つかりませんでした。' }, 400)
  const pid = project.id
  const pub = validId(b.pub) ? await getItem(cfg, pid, 'pubs', b.pub) : null
  if (!pub) return json({ ok: false, message: '投稿が見つかりませんでした（先に保存してください）。' }, 400)
  const started = Date.now()

  try {
    if (a === 'instagram.start') {
      if (pub.platform !== 'instagram') return json({ ok: false, message: 'Instagram の投稿ではありません。' }, 400)
      if (!pub.video_url) return json({ ok: false, message: '先に動画をアップロードしてください（Instagram は動画の URL を取りに来ます）。' }, 400)
      const cap = await capLeft(cfg, 'instagram')
      if (!cap.ok) return json({ ok: false, message: `24時間の投稿数が上限（${cap.cap}件）に達しました。自前の安全弁です。時間をおいてください。` }, 429)
      const r = await igStartReel(req, { videoUrl: pub.video_url, caption: captionFor(pub).text })
      if (!r.ok) {
        const saved = await savePub(cfg, pid, { ...pub, status: 'failed', error: r.message, attempts: (pub.attempts || 0) + 1 })
        return json({ ...r, pub: saved }, r.code ? 503 : 502)
      }
      const saved = await savePub(cfg, pid, { ...pub, status: 'processing', container_id: r.containerId, error: '', attempts: (pub.attempts || 0) + 1 })
      await pipeline(cfg, [['HSET', VK.processing, `${pid}:${pub.id}`, JSON.stringify({ project: pid, pub: pub.id })]])
      return json({ ok: true, pub: saved, message: 'Instagram が動画を受け取りました。準備（変換）が終わりしだい公開します。この画面を開いたままにしておくと、数秒おきに確かめます。' })
    }
    if (a === 'instagram.status') {
      const r = await advanceInstagram(req, cfg, pid, pub)
      return json(r, r.ok ? 200 : 502)
    }
    if (a === 'youtube.done') {
      const id = String(b.videoId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)
      if (!id) return json({ ok: false, message: '動画の ID が届きませんでした。' }, 400)
      const at = b.publishAt && !isNaN(Date.parse(b.publishAt)) ? new Date(b.publishAt).toISOString() : ''
      const saved = await savePub(cfg, pid, {
        ...pub, status: at ? 'scheduled' : 'published', external_id: id, external_url: `https://www.youtube.com/shorts/${id}`,
        published_at: at || new Date().toISOString(), scheduled_for: at ? at.slice(0, 16) : '', error: '',
      })
      return json({ ok: true, pub: saved })
    }
    if (a === 'tiktok.send') {
      if (pub.platform !== 'tiktok') return json({ ok: false, message: 'TikTok の投稿ではありません。' }, 400)
      if (!pub.video_url || !(pub.video_size > 0)) return json({ ok: false, message: '先に動画をアップロードしてください。' }, 400)
      const cap = await capLeft(cfg, 'tiktok')
      if (!cap.ok) return json({ ok: false, message: `24時間の投稿数が上限（${cap.cap}件）に達しました。時間をおいてください。` }, 429)
      const r = await ttInboxUpload(req, { videoUrl: pub.video_url, size: pub.video_size }, started + BUDGET_MS)
      const saved = await savePub(cfg, pid, r.ok
        ? { ...pub, status: 'inbox', publish_id: r.publishId, error: '', attempts: (pub.attempts || 0) + 1 }
        : { ...pub, status: 'failed', publish_id: r.publishId || pub.publish_id, error: r.message, attempts: (pub.attempts || 0) + 1 })
      if (r.ok) await capRecord(cfg, 'tiktok', pub.id)
      return json(r.ok
        ? { ok: true, pub: saved, message: 'TikTok アプリの受信箱（下書き）に送りました。アプリの通知から開き、文言を確かめて投稿してください。' }
        : { ...r, pub: saved }, r.ok ? 200 : (r.code ? 503 : 502))
    }
    if (a === 'tiktok.status') {
      if (!pub.publish_id) return json({ ok: false, message: 'まだ TikTok に送っていません。' }, 400)
      const r = await ttStatus(req, pub.publish_id)
      if (!r.ok) return json(r, r.code ? 503 : 502)
      let saved = pub
      if (r.status === 'PUBLISH_COMPLETE') saved = await savePub(cfg, pid, { ...pub, status: 'published', published_at: pub.published_at || new Date().toISOString(), external_id: pub.external_id || String(r.videoIds[0] || '') })
      if (r.status === 'FAILED') saved = await savePub(cfg, pid, { ...pub, status: 'failed', error: r.label })
      return json({ ok: true, pub: saved, label: r.label })
    }
    if (a === 'metrics') {
      if (!pub.external_id) return json({ ok: false, message: 'まだ公開されていない（または動画のIDが分からない）ため、数字を取れません。' }, 400)
      const r = pub.platform === 'instagram' ? await igInsights(req, pub.external_id)
        : pub.platform === 'youtube' ? await ytStats(req, pub.external_id) : await ttStats(req, pub.external_id)
      if (!r.ok) return json(r, r.code ? 503 : 502)
      const snap = { ...r.snapshot, captured_at: new Date().toISOString() }
      const saved = await savePub(cfg, pid, { ...pub, snapshots: (pub.snapshots || []).concat([snap]).slice(-60) })
      return json({ ok: true, pub: saved, snapshot: snap })
    }
    if (a === 'schedule') {
      if (pub.platform !== 'instagram') return json({ ok: false, message: '予約は Instagram だけです（YouTube は公開日時を指定してアップロード、TikTok は下書きに送ってアプリで公開します）。' }, 400)
      const ready = scheduleReady()
      if (!ready.ok) return json(ready, 503)
      const date = String(b.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= jstDate() || date > jstDate(-90)) return json({ ok: false, message: '予約できるのは明日から90日先までの日付です。' }, 400)
      if (!pub.video_url) return json({ ok: false, message: '先に動画をアップロードしてください。' }, 400)
      const [count] = await pipeline(cfg, [['HLEN', VK.queue]])
      if (Number(count) >= MAX_QUEUE) return json({ ok: false, message: `予約は${MAX_QUEUE}件までです。` }, 400)
      const item = { id: `${pid}:${pub.id}`, date, project: pid, pub: pub.id, createdAt: new Date().toISOString() }
      await pipeline(cfg, [['HSET', VK.queue, item.id, JSON.stringify(item)]])
      const saved = await savePub(cfg, pid, { ...pub, status: 'scheduled', scheduled_for: date, error: '' })
      return json({ ok: true, pub: saved, item, message: `${date} の朝9時ごろ（日本時間）に投稿します。` })
    }
    if (a === 'unschedule') {
      await pipeline(cfg, [['HDEL', VK.queue, `${pid}:${pub.id}`]])
      const saved = await savePub(cfg, pid, { ...pub, status: 'draft', scheduled_for: '' })
      return json({ ok: true, pub: saved })
    }
    return json({ ok: false, message: 'その操作には対応していません。' }, 400)
  } catch (e) {
    return json({ ok: false, message: `処理できませんでした（${String((e && e.message) || e).slice(0, 120)}）。もう一度お試しください。` }, 503)
  }
}

/** Instagram の準備を1回だけ確かめ、終わっていれば公開します。 */
async function advanceInstagram(req, cfg, pid, pub) {
  if (!pub.container_id) return { ok: false, message: 'まだ Instagram に送っていません。' }
  if (pub.status === 'published') return { ok: true, pub, state: 'published' }
  const r = await igAdvance(req, pub.container_id)
  if (r.ok && r.state === 'processing') return { ok: true, pub, state: 'processing' }
  await pipeline(cfg, [['HDEL', VK.processing, `${pid}:${pub.id}`]])
  if (!r.ok) {
    const saved = await savePub(cfg, pid, { ...pub, status: 'failed', error: r.message })
    return { ok: false, pub: saved, state: 'failed', message: r.message }
  }
  await capRecord(cfg, 'instagram', pub.id)
  const saved = await savePub(cfg, pid, { ...pub, status: 'published', external_id: r.mediaId || pub.external_id, external_url: r.url || pub.external_url, published_at: new Date().toISOString(), error: '' })
  return { ok: true, pub: saved, state: 'published', message: 'Instagram に公開しました。' }
}

/** 毎朝の自動処理から呼ばれます（api/social-cron.js）。
 *  1. 前回「準備中」のまま残ったリールを確かめて公開
 *  2. 今日の予約のリールの準備を始め、残り時間で何回か確かめる
 *  終わらなかったものは「準備中」のまま残り、画面を開いたときか翌朝に公開します。 */
export async function runVideoCron(budgetMs) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: '保存先がありません。' }
  const started = Date.now()
  const left = () => budgetMs - (Date.now() - started)
  const out = { started: 0, published: 0, failed: 0, waiting: 0 }
  const today = jstDate()
  const read = async (key) => {
    const [flat] = await pipeline(cfg, [['HGETALL', key]])
    const items = []
    for (let i = 0; i + 1 < (flat || []).length; i += 2) { try { items.push(JSON.parse(flat[i + 1])) } catch (_) {} }
    return items
  }
  const check = async (it) => {
    const pub = await getItem(cfg, it.project, 'pubs', it.pub)
    if (!pub) { await pipeline(cfg, [['HDEL', VK.processing, `${it.project}:${it.pub}`]]); return 'gone' }
    const r = await advanceInstagram(undefined, cfg, it.project, pub)
    if (r.state === 'published') out.published++
    else if (r.state === 'failed') out.failed++
    return r.state
  }
  for (const it of await read(VK.processing)) {
    if (left() < 4000) break
    await check(it)
  }
  const due = (await read(VK.queue)).filter((i) => i.date <= today)
  const fresh = []
  for (const it of due) {
    if (left() < 6000) break
    const [n] = await pipeline(cfg, [['HDEL', VK.queue, it.id]])
    if (Number(n) !== 1) continue
    const pub = await getItem(cfg, it.project, 'pubs', it.pub)
    if (!pub || !pub.video_url) continue
    const cap = await capLeft(cfg, 'instagram')
    if (!cap.ok) {
      await savePub(cfg, it.project, { ...pub, status: 'failed', error: '24時間の投稿数の上限（自前の安全弁）に達したため、予約を送りませんでした。画面から送り直してください。' })
      out.failed++
      continue
    }
    const r = await igStartReel(undefined, { videoUrl: pub.video_url, caption: captionFor(pub).text })
    if (!r.ok) {
      await savePub(cfg, it.project, { ...pub, status: 'failed', error: r.message, attempts: (pub.attempts || 0) + 1 })
      out.failed++
      continue
    }
    await savePub(cfg, it.project, { ...pub, status: 'processing', container_id: r.containerId, error: '', attempts: (pub.attempts || 0) + 1 })
    await pipeline(cfg, [['HSET', VK.processing, `${it.project}:${it.pub}`, JSON.stringify({ project: it.project, pub: it.pub })]])
    fresh.push({ project: it.project, pub: it.pub })
    out.started++
  }
  // 残り時間で、今始めたものを数回確かめます。
  let pending = fresh
  while (pending.length && left() > 7000) {
    await new Promise((r) => setTimeout(r, 4000))
    const next = []
    for (const it of pending) if ((await check(it)) === 'processing') next.push(it)
    pending = next
  }
  out.waiting = pending.length
  try { await pipeline(cfg, [['SET', `${VK.queue}:last`, JSON.stringify({ at: new Date().toISOString(), ...out }), 'EX', 30 * 86400]]) } catch (_) {}
  return { ok: true, ...out }
}
