// 予約投稿。日付を選んでおくと、その日の朝に毎日の自動処理が送ります。
//
// 時刻まで選べないのには理由があります。Vercel の無料プラン（Hobby）では、
// 自動処理（cron）は1日1回しか置けず、それより多い設定はデプロイそのものが
// 失敗します。さらに Hobby では、指定した時刻の「その1時間のどこか」で
// 動きます（0時指定なら 0:00〜0:59）。なので画面では「その日の朝9時ごろ」
// とだけ約束します。Pro プランなら1分単位にできますが、そのときは下の
// SCHEDULE と vercel.json の両方を直してください（テストが食い違いを
// 見つけます）。
//
// 予約は保存先（Upstash Redis）の環境変数が要ります。自動処理は管理者の
// ブラウザを通らないので、ブラウザにだけ保存した保存先や鍵は見えません。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, pipeline, jstDate } from './_analytics-store.js'
import { KV } from './_brand.js'

/* 毎日の自動処理の時刻。vercel.json の "crons" と同じ値でなければなりません。
   '0 0 * * *' は UTC の 0時台 = 日本時間の 9時台です。 */
export const SCHEDULE = { cron: '0 0 * * *', path: '/api/social-cron', jstHour: 9 }

export const QUEUE = `${KV}social:queue`
export const CRON_LAST = `${KV}social:cron:last`
const MAX_ITEMS = 50
const MAX_DAYS_AHEAD = 90

/** 予約を受け付けられる状態か。できないときは、その理由を返します。 */
export function scheduleReady() {
  if (!storeConfig()) {
    return { ok: false, code: 'NO_ENV_STORE',
      message: '予約投稿には、Vercel の環境変数に保存先（Upstash Redis）が必要です。毎朝の自動処理は管理画面のブラウザを通らないため、この端末にだけ保存した保存先は使えません。' }
  }
  if (!(process.env.CRON_SECRET || '').trim()) {
    return { ok: false, code: 'NO_CRON_SECRET',
      message: '予約投稿を動かすには、Vercel の環境変数に CRON_SECRET（推測できない長い文字列。パスワード管理アプリの自動生成がおすすめ）を入れて、再デプロイしてください。これが無いと、毎朝の自動処理を他人が呼べてしまうため止めています。' }
  }
  return { ok: true }
}

function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return false
  const t = Date.parse(d + 'T00:00:00Z')
  return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
}

/** 予約を1件入れます。日付は「明日以降」。今日を選べないのは、今日の
 *  自動処理がもう終わっているかもしれないからです（終わっていたら翌日に
 *  ずれ込み、「今日出たはず」が出ていない、になります）。 */
export async function addScheduled(date, payload) {
  const ready = scheduleReady()
  if (!ready.ok) return ready
  if (!validDate(date)) return { ok: false, message: '日付の形が正しくありません。' }
  if (date <= jstDate()) return { ok: false, message: '予約できるのは明日以降の日付です。今日出したいときは「今すぐ投稿」を使ってください。' }
  if (date > jstDate(-MAX_DAYS_AHEAD)) return { ok: false, message: `予約できるのは${MAX_DAYS_AHEAD}日先までです。` }
  const cfg = storeConfig()
  const [count] = await pipeline(cfg, [['HLEN', QUEUE]])
  if (Number(count) >= MAX_ITEMS) return { ok: false, message: `予約は${MAX_ITEMS}件までです。先に古い予約を取り消してください。` }
  const item = { id: crypto.randomUUID(), date, createdAt: new Date().toISOString(), payload }
  await pipeline(cfg, [['HSET', QUEUE, item.id, JSON.stringify(item)]])
  return { ok: true, item }
}

export async function listScheduled() {
  const cfg = storeConfig()
  if (!cfg) return []
  try {
    const [flat] = await pipeline(cfg, [['HGETALL', QUEUE]])
    const out = []
    const a = Array.isArray(flat) ? flat : []
    for (let i = 0; i + 1 < a.length; i += 2) {
      try { out.push(JSON.parse(a[i + 1])) } catch (_) {}
    }
    return out.sort((x, y) => (x.date === y.date ? (x.createdAt < y.createdAt ? -1 : 1) : (x.date < y.date ? -1 : 1)))
  } catch (_) { return [] }
}

export async function cancelScheduled(id) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: '保存先が未接続です。' }
  const [n] = await pipeline(cfg, [['HDEL', QUEUE, String(id || '')]])
  return Number(n) ? { ok: true } : { ok: false, message: 'その予約は見つかりませんでした（もう送られたか、取り消し済みです）。' }
}

/** 送る順番が来たものを1件「取り出し」ます。HDEL が 1 を返したときだけ
 *  自分のもの——自動処理が2回動いても、同じ予約が2回送られることはありません。 */
export async function claim(id) {
  const cfg = storeConfig()
  const [n] = await pipeline(cfg, [['HDEL', QUEUE, id]])
  return Number(n) === 1
}

/** 画面向けの要約（本文は先頭だけ）。 */
export function summarize(item) {
  const p = item.payload || {}
  return {
    id: item.id, date: item.date, createdAt: item.createdAt,
    text: String(p.text || '').slice(0, 140),
    targets: p.targets || [], images: (p.images || []).length, link: p.link || '',
  }
}
