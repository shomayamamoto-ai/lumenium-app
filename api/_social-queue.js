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
export async function addScheduled(date, payload, extra) {
  const ready = scheduleReady()
  if (!ready.ok) return ready
  if (!validDate(date)) return { ok: false, message: '日付の形が正しくありません。' }
  if (date <= jstDate()) return { ok: false, message: '予約できるのは明日以降の日付です。今日出したいときは「今すぐ投稿」を使ってください。' }
  if (date > jstDate(-MAX_DAYS_AHEAD)) return { ok: false, message: `予約できるのは${MAX_DAYS_AHEAD}日先までです。` }
  const cfg = storeConfig()
  const [count] = await pipeline(cfg, [['HLEN', QUEUE]])
  if (Number(count) >= MAX_ITEMS) return { ok: false, message: `予約は${MAX_ITEMS}件までです。先に古い予約を取り消してください。` }
  const item = { id: crypto.randomUUID(), date, createdAt: new Date().toISOString(), payload, ...(extra || {}) }
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
    ...(item.repeatOf ? { repeatOf: item.repeatOf } : {}),
  }
}

/* ---- 繰り返し投稿（定型文から） ----
   定型文に「毎週◯曜日」「毎月◯日」を付けると、先の8週間ぶんを、ふつうの
   予約として入れておきます（予約の一覧に出て、1件ずつ取り消せます）。
   毎朝の自動処理が、8週間先までを足し続けます。

   取り消した1件が翌朝また入ってしまわないよう、「どこまで入れたか」（last）を
   覚えておき、その先だけを足します。定型文の中身や繰り返しの決まりを変えた
   ときは、まだ出ていない予約を入れ直します（古い本文のまま出ないように）。

   毎月の「31日」は「月末」の意味です。30日までしかない月は30日、2月は28日
   （うるう年は29日）に出します。29日・30日も、無い月はその月の最後の日です。

   ${KV}social:rep  … HASH 定型文id → { sig, last } */
export const REPEAT_WEEKS = 8
export const REP_STATE = `${KV}social:rep`
export const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function addDay(d, n) {
  return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
}

/** 繰り返しの決まりを確かめて返します（使えない形なら null）。 */
export function cleanRepeat(r) {
  if (!r || typeof r !== 'object') return null
  if (r.kind === 'weekly') {
    const w = Number(r.weekday)
    return Number.isInteger(w) && w >= 0 && w <= 6 ? { kind: 'weekly', weekday: w } : null
  }
  if (r.kind === 'monthly') {
    const d = Number(r.day)
    return Number.isInteger(d) && d >= 1 && d <= 31 ? { kind: 'monthly', day: d } : null
  }
  return null
}

/** 画面に出す言い方（「毎週火曜」「毎月15日」「毎月 月末」）。 */
export function repeatLabel(r) {
  const c = cleanRepeat(r)
  if (!c) return ''
  if (c.kind === 'weekly') return `毎週${WEEKDAY_NAMES[c.weekday]}曜`
  return c.day === 31 ? '毎月 月末' : `毎月${c.day}日`
}

/** from から to まで（両端を含む）の、決まりに合う日付。 */
export function repeatDates(rule, from, to) {
  const r = cleanRepeat(rule)
  const out = []
  if (!r || !validDate(from) || !validDate(to) || from > to) return out
  if (r.kind === 'weekly') {
    for (let d = from; d <= to; d = addDay(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() === r.weekday) out.push(d)
    return out
  }
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7))
  for (let i = 0; i < 24; i++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const day = Math.min(r.day, last)
    const d = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (d > to) break
    if (d >= from) out.push(d)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/** 定型文の中身と決まりの「しるし」。変わったら入れ直します。 */
export function repeatSig(t) {
  const s = JSON.stringify([t.text, t.link, t.campaign, t.nets, t.images, cleanRepeat(t.repeat)])
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

async function dropRepeat(cfg, tplId) {
  const items = await listScheduled()
  const ids = items.filter((i) => i.repeatOf === tplId).map((i) => i.id)
  if (ids.length) await pipeline(cfg, ids.map((id) => ['HDEL', QUEUE, id]))
  return ids.length
}

/** 繰り返しの予約を、8週間先まで足します（取り下げられた繰り返しは、予約も消します）。
 *  build(t) は定型文から { ok, payload } か { ok:false, message } を作る関数
 *  （送り先の確かめ方はサーバーの側にあるので、呼ぶ側が渡します）。 */
export async function planRepeats(templates, build, today = jstDate()) {
  const out = { ok: true, added: 0, removed: 0, problems: [] }
  const ready = scheduleReady()
  const cfg = storeConfig()
  if (!cfg) return { ...out, ok: false, message: ready.message }
  const [flat] = await pipeline(cfg, [['HGETALL', REP_STATE]])
  const state = {}
  const a = Array.isArray(flat) ? flat : []
  for (let i = 0; i + 1 < a.length; i += 2) { try { state[a[i]] = JSON.parse(a[i + 1]) } catch (_) {} }
  const live = (templates || []).filter((t) => cleanRepeat(t.repeat))
  // 繰り返しをやめた（または消した）定型文：まだ出ていない予約も消します。
  for (const id of Object.keys(state)) {
    if (live.some((t) => t.id === id)) continue
    out.removed += await dropRepeat(cfg, id)
    await pipeline(cfg, [['HDEL', REP_STATE, id]])
  }
  if (!ready.ok) {
    if (live.length) out.problems.push('繰り返しの予約は、予約投稿が使える設定のときだけ入ります：' + ready.message)
    return out
  }
  const until = addDay(today, REPEAT_WEEKS * 7)
  for (const t of live) {
    const sig = repeatSig(t)
    let st = state[t.id]
    if (!st || st.sig !== sig) {
      out.removed += await dropRepeat(cfg, t.id)
      st = { sig, last: today }
    }
    const from = addDay(st.last > today ? st.last : today, 1)
    const dates = repeatDates(t.repeat, from, until)
    if (!dates.length) { await pipeline(cfg, [['HSET', REP_STATE, t.id, JSON.stringify(st)]]); continue }
    const b = build(t)
    if (!b.ok) { out.problems.push(`「${t.title}」：${b.message}`); continue }
    for (const d of dates) {
      // 1回ごとに別の送信番号に（LINE は同じ番号の2回目を「受付済み」として送りません）。
      const r = await addScheduled(d, { ...b.payload, sendId: crypto.randomUUID() }, { repeatOf: t.id })
      if (!r.ok) { out.problems.push(`「${t.title}」${d}：${r.message}`); break }
      st.last = d
      out.added++
    }
    await pipeline(cfg, [['HSET', REP_STATE, t.id, JSON.stringify(st)]])
  }
  return out
}
