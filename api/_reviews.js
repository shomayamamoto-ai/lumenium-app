// 口コミ管理（Googleレビュー）のサーバー側。画面は public/admin-reviews.js、
// 窓口は api/reviews.js、計算は _reviews-core.js です。
//
// 読み書きする相手。
//   Business Profile API v4 の accounts.locations.reviews
//     list        GET  …/accounts/{a}/locations/{l}/reviews?pageSize=50&orderBy=updateTime desc&pageToken=…
//     updateReply PUT  …/accounts/{a}/locations/{l}/reviews/{r}/reply  { comment }
//     deleteReply DELETE 同じURL
//   （2026年時点でも口コミは v4 のまま。店舗の一覧は新しい API に分かれています。）
//   鍵は SNS（文章）の画面で連携した Googleビジネスプロフィールのもの
//   （GBP_REFRESH_TOKEN、business.manage の許可）をそのまま使います。
//   この API は Google への利用申請が通るまで、割り当て 0 で断られます（403/429）。
//
// 保存（Upstash Redis、頭は `${KV}rev:`）。
//   rev:items:<店舗>  その店舗の口コミ（新しい順、最大1500件）。顔写真のURLなどは持ちません。
//   rev:meta          最後に同期した時刻・店舗ごとの平均と件数・未返信の数・エラー
//   rev:prefs         口調・署名・店名・お願いメールの設定など
//   rev:sent:<hash>   お願いを送った時刻（90日で消える）。hash はメールアドレスの要約
//   rev:optout:<hash> 配信停止（消えません）
//   rev:bk:<予約ID>   その予約にはもう送った印
//   rev:log           送った記録（直近100件）
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import Anthropic from '@anthropic-ai/sdk'
import { storeConfig, pipeline } from './_analytics-store.js'
import { BRAND, KV } from './_brand.js'
import { setting } from './_settings.js'
import { accessToken } from './_google-cal.js'
import { call } from './_social.js'
import { GBP_API, LOCATION_RE, gbpLocations } from './_social-more.js'
import { apiKey, spendGuard } from './_admin-auth.js'
import { recordUsage, monthUsage } from './_ai-pricing.js'
import { digest } from './_ratelimit.js'
import { bookingsBetween, recSpan, recStatus } from './_booking.js'
import { manageSecret, sandboxFrom, ownerAddress } from './_booking-mail.js'
import {
  normalizeReview, mergeReviews, needMore, filterCounts, replyPrompt, byteLength, REPLY_MAX_BYTES,
  reviewLink, requestEligibility, requestMail, REQUEST_GAP_DAYS, REQUEST_MAX_AGE_DAYS, TONES,
} from './_reviews-core.js'

const GBP_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1'
export const MODEL = 'claude-opus-5-5'
export const USAGE_KIND = 'reviews'
/** AIの下書きの1日の回数の上限（spendGuard）。 */
export const DAILY_DRAFTS = 40
/** 月の上限（円）の既定値。設定で変えられます。 */
export const DEFAULT_MONTHLY_YEN = 500
const KEEP = 1500
const MAX_LOCATIONS = 5
const DAY = 86400000

export const RK = {
  prefs: `${KV}rev:prefs`,
  meta: `${KV}rev:meta`,
  log: `${KV}rev:log`,
  lock: `${KV}rev:lock`,
  items: (loc) => `${KV}rev:items:${String(loc).replace(/[^0-9a-z]+/gi, '_')}`,
  sent: (h) => `${KV}rev:sent:${h}`,
  optout: (h) => `${KV}rev:optout:${h}`,
  booked: (id) => `${KV}rev:bk:${id}`,
}

const label = 'Googleビジネスプロフィール'
const errText = (e) => String((e && e.message) || e).slice(0, 200)
const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback } catch (_) { return fallback } }

/* ---------------------------------------------------------------- 設定 -- */

export function normalizePrefs(input, base) {
  const p = { ...defaultPrefs(), ...(base || {}) }
  const x = input && typeof input === 'object' ? input : {}
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n)
  if ('shopName' in x) p.shopName = str(x.shopName, 60)
  if ('tone' in x) p.tone = TONES[x.tone] ? x.tone : 'polite'
  if ('signature' in x) p.signature = str(x.signature, 80)
  if ('notes' in x) p.notes = str(x.notes, 600)
  if ('placeId' in x) p.placeId = /^[A-Za-z0-9_-]{10,300}$/.test(str(x.placeId, 300)) ? str(x.placeId, 300) : ''
  if ('requests' in x) p.requests = ['off', 'manual', 'auto'].includes(x.requests) ? x.requests : 'off'
  if ('contact' in x) p.contact = str(x.contact, 120)
  if ('monthlyYen' in x) { const n = Math.floor(Number(x.monthlyYen)); p.monthlyYen = n > 0 && n <= 100000 ? n : DEFAULT_MONTHLY_YEN }
  if ('locations' in x) p.locations = (Array.isArray(x.locations) ? x.locations : []).map(String).filter((l) => LOCATION_RE.test(l)).slice(0, MAX_LOCATIONS)
  return p
}
export function defaultPrefs() {
  return { shopName: BRAND.name, tone: 'polite', signature: '', notes: '', placeId: '', requests: 'off', contact: '', monthlyYen: DEFAULT_MONTHLY_YEN, locations: [] }
}

export async function readPrefs(cfg = storeConfig()) {
  if (!cfg) return defaultPrefs()
  try { const [raw] = await pipeline(cfg, [['GET', RK.prefs]]); return normalizePrefs(parse(raw, {})) } catch (_) { return defaultPrefs() }
}
export async function savePrefs(input, cfg = storeConfig()) {
  if (!cfg) return { ok: false, message: '保存先（Upstash Redis）が無いため保存できません。' }
  const p = normalizePrefs(input, await readPrefs(cfg))
  await pipeline(cfg, [['SET', RK.prefs, JSON.stringify(p)]])
  return { ok: true, prefs: p }
}

export async function readMeta(cfg = storeConfig()) {
  const blank = { lastSync: '', locs: {}, unreplied: 0, error: '', errorCode: '' }
  if (!cfg) return blank
  try { const [raw] = await pipeline(cfg, [['GET', RK.meta]]); return { ...blank, ...parse(raw, {}) } } catch (_) { return blank }
}
async function saveMeta(cfg, meta) {
  try { await pipeline(cfg, [['SET', RK.meta, JSON.stringify(meta)]]) } catch (_) {}
}

/** 同期する店舗。口コミ管理で選んだものが無ければ、SNSの投稿先の店舗。 */
export async function locationsFor(prefs, req) {
  if (prefs.locations && prefs.locations.length) return prefs.locations
  const one = await setting('GBP_LOCATION', '', req)
  return LOCATION_RE.test(one) ? [one] : []
}

/* ------------------------------------------------------------ つながり -- */

const STEPS = {
  no_store: ['Vercel › Storage で Upstash Redis をつなぐ（口コミの控えと設定を置く場所です）。', '「設定状況」で保存先が「利用可」になったか確かめる。'],
  no_client: ['「設定状況 › キーの入力」の「予約管理（Googleカレンダー）」にある Google クライアントID とシークレットを入れる。', 'Google Cloud のそのプロジェクトで「My Business Account Management API」「My Business Business Information API」「Google My Business API」を有効にする。'],
  not_connected: ['下の「Googleビジネスプロフィールを連携」を押す（SNS（文章）の画面と同じ連携です。どちらかで済ませれば両方で使えます）。', '開いたタブで、お店を管理している Google アカウントを選んで許可する。', 'この画面に戻って「状態を再取得」を押す。'],
  no_location: ['下の「店舗を選ぶ」を押し、口コミを見たい店舗にチェックを入れて保存する。'],
  not_approved: ['Google の「Business Profile API のアクセス申請」フォームから申請する（審査に数日かかることがあります）。', '申請が通ると、Google Cloud の「割り当て」の値が 0 から増えます。', '増えたら「今すぐ同期」を押す。それまでは、口コミへの返信は Google マップのアプリや検索結果から直接できます。'],
  not_owner: ['連携した Google アカウントが、その店舗の「オーナー」か「管理者」になっているか、Googleビジネスプロフィールの「ユーザー」で確かめる。', '違うアカウントで連携していたら、「Googleビジネスプロフィールを連携」からやり直す。'],
  expired: ['「Googleビジネスプロフィールを連携」を押して、許可をやり直す（パスワードを変えた・許可を取り消したときに起きます）。'],
}
const STATES = {
  ready: 'つながっています',
  no_store: '保存先（Upstash Redis）がまだありません',
  no_client: 'サイトの Google 接続（クライアントID）がまだありません',
  not_connected: 'Googleビジネスプロフィールとまだ連携していません',
  no_location: '口コミを見る店舗がまだ選ばれていません',
  not_approved: 'Google の API 利用申請がまだ通っていないようです',
  not_owner: '連携したアカウントでは、この店舗の口コミを読めません',
  expired: 'Google との連携が切れています',
}

export async function connection(req, prefs, meta) {
  const cfg = storeConfig()
  const out = (state) => ({ state, ok: state === 'ready', message: STATES[state], steps: STEPS[state] || [] })
  if (!cfg) return out('no_store')
  const [id, secret, token] = await Promise.all(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GBP_REFRESH_TOKEN'].map((n) => setting(n, '', req)))
  if (!id || !secret) return out('no_client')
  if (!token) return out('not_connected')
  if (!(await locationsFor(prefs, req)).length) return out('no_location')
  // 前回の同期で分かった問題は、次にうまくいくまで出しておきます。
  if (meta && meta.errorCode && STATES[meta.errorCode]) return { ...out(meta.errorCode), detail: meta.error || '' }
  return out('ready')
}

/** API の返事から、どの「つながらない」かを決めます。 */
export function classify(r) {
  const m = String((r && r.message) || '')
  if (/invalid_grant|接続が切れて/.test(m)) return 'expired'
  if (r && (r.status === 429 || (r.status === 403 && /quota|has not been used|disabled|not been approved|PERMISSION_DENIED.*API/i.test(m)))) return 'not_approved'
  if (r && (r.status === 403 || r.status === 404)) return 'not_owner'
  return ''
}

async function gbpToken(req) {
  const [clientId, clientSecret, refreshToken] = await Promise.all(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GBP_REFRESH_TOKEN'].map((n) => setting(n, '', req)))
  try { return { ok: true, token: await accessToken({ clientId, clientSecret, refreshToken }) } }
  catch (e) { return { ok: false, status: 401, message: `${label}：${errText(e)}` } }
}

/* ---------------------------------------------------------------- 同期 -- */

export async function readItems(cfg, locs) {
  if (!cfg || !locs.length) return []
  try {
    const rows = await pipeline(cfg, locs.map((l) => ['GET', RK.items(l)]))
    let all = []
    rows.forEach((raw) => { all = all.concat(parse(raw, [])) })
    return mergeReviews([], all)
  } catch (_) { return [] }
}

/** 店舗の Google 上の ID（口コミを書く画面のリンクに使う）。1回だけ取りに行きます。 */
async function placeInfo(loc, auth, ctx) {
  const id = loc.replace(/^accounts\/[0-9]+\//, '')
  const r = await call(`${GBP_INFO}/${id}?readMask=title,metadata`, auth, label, ctx, { ms: 5000 })
  if (!r.ok) return {}
  const md = r.data.metadata || {}
  return { title: String(r.data.title || ''), placeId: String(md.placeId || ''), reviewUri: String(md.newReviewUri || '') }
}

/** 口コミを読み直します。full なら最後まで（消えた口コミも反映）、そうでなければ
 *  前回より新しく更新されたものだけ。{ ok, message, added, changed } */
export async function syncReviews(req, opts = {}) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, code: 'no_store', message: STATES.no_store }
  const full = !!opts.full
  const maxPages = opts.maxPages || (full ? 30 : 3)
  const ctx = { deadline: Date.now() + (opts.budget || 20000) }
  const [got] = await pipeline(cfg, [['SET', RK.lock, '1', 'NX', 'EX', 60]])
  if (got !== 'OK' && !opts.ignoreLock) return { ok: false, code: 'busy', message: 'ほかの同期が動いています。1分ほどおいてからお試しください。' }
  try {
    const prefs = await readPrefs(cfg)
    const locs = await locationsFor(prefs, req)
    const meta = await readMeta(cfg)
    if (!locs.length) return { ok: false, code: 'no_location', message: STATES.no_location }
    const t = await gbpToken(req)
    if (!t.ok) {
      meta.errorCode = classify(t) || 'expired'
      meta.error = t.message
      await saveMeta(cfg, meta)
      return { ok: false, code: meta.errorCode, message: t.message }
    }
    const auth = { headers: { Authorization: `Bearer ${t.token}` } }
    let added = 0
    let fail = null
    const writes = []
    const all = []
    for (const loc of locs) {
      const old = parse((await pipeline(cfg, [['GET', RK.items(loc)]]))[0], [])
      const lm = meta.locs[loc] || {}
      const since = full ? '' : lm.high || ''
      const pages = []
      let token = ''
      let complete = false
      for (let i = 0; i < maxPages; i++) {
        const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' })
        if (token) q.set('pageToken', token)
        const r = await call(`${GBP_API}/${loc}/reviews?${q}`, auth, label, ctx, { ms: 8000 })
        if (!r.ok) { fail = r; break }
        pages.push(r.data)
        if (i === 0) { lm.avg = Number(r.data.averageRating) || null; lm.total = Number(r.data.totalReviewCount) || 0 }
        if (!r.data.nextPageToken) { complete = true; break }
        if (!needMore(r.data, since)) break
        token = r.data.nextPageToken
      }
      if (fail) break
      const fresh = pages.flatMap((p) => (p.reviews || []).map((x) => normalizeReview(x, loc)))
      const ids = new Set(old.map((x) => x.id))
      added += fresh.filter((x) => !ids.has(x.id)).length
      // 最後まで読めた full のときだけ、返ってこなかったもの（消された口コミ）を落とします。
      const merged = (full && complete ? mergeReviews([], fresh) : mergeReviews(old, fresh)).slice(0, KEEP)
      lm.high = merged.reduce((m, x) => (x.updatedAt > m ? x.updatedAt : m), lm.high || '')
      lm.syncedAt = new Date().toISOString()
      lm.complete = complete || !!lm.complete
      if (!lm.placeId && Date.now() < ctx.deadline - 3000) Object.assign(lm, await placeInfo(loc, auth, ctx))
      meta.locs[loc] = lm
      writes.push(['SET', RK.items(loc), JSON.stringify(merged)])
      all.push(...merged)
    }
    if (writes.length) await pipeline(cfg, writes)
    if (fail) {
      meta.errorCode = classify(fail)
      meta.error = fail.message
      await saveMeta(cfg, meta)
      return { ok: false, code: meta.errorCode || 'error', message: fail.message + (meta.errorCode ? `（${STATES[meta.errorCode]}）` : '') }
    }
    meta.errorCode = ''
    meta.error = ''
    meta.lastSync = new Date().toISOString()
    if (full) meta.lastFull = meta.lastSync
    meta.unreplied = filterCounts(all).unreplied
    await saveMeta(cfg, meta)
    return { ok: true, added, message: added ? `新しい口コミが ${added} 件ありました。` : '新しい口コミはありませんでした。' }
  } finally {
    try { await pipeline(cfg, [['DEL', RK.lock]]) } catch (_) {}
  }
}

/* ---------------------------------------------------------------- 返信 -- */

async function findItem(cfg, prefs, req, id) {
  const locs = await locationsFor(prefs, req)
  for (const loc of locs) {
    const list = parse((await pipeline(cfg, [['GET', RK.items(loc)]]))[0], [])
    const i = list.findIndex((x) => x.id === id)
    if (i >= 0) return { loc, list, i, item: list[i] }
  }
  return null
}

async function recount(cfg, prefs, req) {
  const meta = await readMeta(cfg)
  meta.unreplied = filterCounts(await readItems(cfg, await locationsFor(prefs, req))).unreplied
  await saveMeta(cfg, meta)
  return meta.unreplied
}

/** 返信を出す・直す（text あり）／消す（text が null）。 */
export async function setReply(req, id, text) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: STATES.no_store }
  if (!/^[\w-]{4,200}$/.test(String(id || ''))) return { ok: false, message: '口コミの指定が正しくありません。' }
  const del = text === null
  const body = del ? '' : String(text || '').trim()
  if (!del && !body) return { ok: false, message: '返信が空です。' }
  if (!del && byteLength(body) > REPLY_MAX_BYTES) return { ok: false, message: `返信が長すぎます（Google の上限は ${REPLY_MAX_BYTES} バイト、日本語でおよそ1,300字です）。` }
  const prefs = await readPrefs(cfg)
  const f = await findItem(cfg, prefs, req, id)
  if (!f || !f.item.name) return { ok: false, message: 'その口コミが見つかりませんでした。「今すぐ同期」を押してから、もう一度お試しください。' }
  const t = await gbpToken(req)
  if (!t.ok) return t
  const r = await call(`${GBP_API}/${f.item.name}/reply`, {
    method: del ? 'DELETE' : 'PUT',
    headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
    body: del ? undefined : JSON.stringify({ comment: body }),
  }, label, { deadline: Date.now() + 15000 }, { publish: !del })
  if (!r.ok) {
    const code = classify(r)
    return { ...r, res: undefined, message: r.message + (code ? `（${STATES[code]}）` : '') }
  }
  const item = { ...f.item, reply: del ? null : { text: String(r.data.comment || body), at: String(r.data.updateTime || new Date().toISOString()) } }
  f.list[f.i] = item
  await pipeline(cfg, [['SET', RK.items(f.loc), JSON.stringify(f.list)]])
  const unreplied = await recount(cfg, prefs, req)
  return { ok: true, item, unreplied, message: del ? '返信を消しました（Google でも消えています）。' : f.item.reply ? '返信を直しました。Google に出ている返信も変わります。' : '返信を出しました。Google に数分で表示されます。' }
}

/* ------------------------------------------------------------ AIの下書き -- */

export async function aiStatus(req, prefs) {
  const m = await monthUsage(USAGE_KIND, MODEL)
  return { ready: !!(await apiKey(req)), month: m.month, yen: m.yen, calls: m.usage.calls || 0, cap: prefs.monthlyYen, daily: DAILY_DRAFTS }
}

const DRAFT_SCHEMA = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false }

export async function draftReply(req, id, opts = {}) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, status: 503, message: STATES.no_store }
  const key = await apiKey(req)
  if (!key) return { ok: false, status: 503, code: 'AI_NOT_CONFIGURED', message: 'AIのキー（ANTHROPIC_API_KEY）が未設定です。「設定状況 › キーの入力」に貼ると使えます。返信は手で書いて出せます。' }
  const prefs = await readPrefs(cfg)
  const f = await findItem(cfg, prefs, req, String(id || ''))
  if (!f) return { ok: false, status: 404, message: 'その口コミが見つかりませんでした。' }
  const month = await monthUsage(USAGE_KIND, MODEL)
  if (month.recorded && month.yen >= prefs.monthlyYen) {
    return { ok: false, status: 429, message: `今月のAIの利用額が上限の目安（約${prefs.monthlyYen}円）に達しました。来月まで下書きは作りません（上限は「設定」で変えられます）。` }
  }
  const guard = await spendGuard('reviews', DAILY_DRAFTS)
  if (guard) return { ok: false, status: 429, message: `本日のAIの下書きの上限（${DAILY_DRAFTS}回）に達しました。日付が変わると再開します。` }
  const { system, user } = replyPrompt(f.item, prefs)
  const client = opts.client || new Anthropic({ apiKey: key, maxRetries: 0 })
  let out
  try {
    out = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1500,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      messages: [{ role: 'user', content: user }],
    }, { signal: AbortSignal.timeout(20000) })
  } catch (e) {
    const m = errText(e)
    return { ok: false, status: 502, message: /abort|timeout/i.test(m) ? 'AIから時間内に返ってきませんでした。もう一度お試しください。' : `下書きを作れませんでした（${m.slice(0, 120)}）` }
  }
  await recordUsage(USAGE_KIND, out.usage)
  if (out.stop_reason === 'refusal') return { ok: false, status: 422, message: 'この口コミには、AIが下書きを作りませんでした。手で書いてください。' }
  let text = ''
  try { text = String(JSON.parse((out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')).reply || '').trim() } catch (_) {}
  if (!text) return { ok: false, status: 502, message: '下書きの形が想定と違いました。もう一度お試しください。' }
  const after = await monthUsage(USAGE_KIND, MODEL)
  return { ok: true, draft: text, cost: { yen: after.yen, cap: prefs.monthlyYen, calls: after.usage.calls || 0 }, message: '下書きを作りました。読んで直してから「返信を出す」を押してください（このままでは出ません）。' }
}

/* ------------------------------------------------------ 口コミのお願い -- */

const emailHash = (email) => digest('rev', String(email || '').trim().toLowerCase())

async function hmac(secret, msg) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
export async function optoutToken(hash, secret) {
  return `${hash}.${await hmac(secret, `revopt|${hash}`)}`
}
export async function checkOptout(token, secret) {
  const m = /^([0-9a-f]{20})\.([0-9a-f]{32})$/.exec(String(token || ''))
  if (!m || !secret) return null
  const want = await hmac(secret, `revopt|${m[1]}`)
  let d = 0
  for (let i = 0; i < 32; i++) d |= want.charCodeAt(i) ^ m[2].charCodeAt(i)
  return d ? null : m[1]
}

/** 「来店済み」にした時刻（履歴に残っていなければ、予約の終わりの時刻）。 */
export function visitedAt(rec) {
  const h = (rec.history || []).filter((x) => x.what === 'visited').pop()
  return h ? h.at : new Date(recSpan(rec).end).toISOString()
}

/** お願いのリンク。店舗のプレイスIDを設定で入れていればそれ、無ければ同期で取ったもの。 */
export function linkFor(prefs, meta) {
  if (prefs.placeId) return reviewLink(prefs.placeId)
  for (const l of Object.values((meta && meta.locs) || {})) if (l.placeId) return reviewLink(l.placeId)
  return ''
}

/** 来店済みの予約（直近）と、それぞれ送ってよいか。 */
export async function requestCandidates(req, prefs, meta, now = Date.now()) {
  const cfg = storeConfig()
  if (!cfg) return []
  const recs = (await bookingsBetween(cfg, pipeline, now - (REQUEST_MAX_AGE_DAYS + 7) * DAY, now))
    .filter((r) => recStatus(r) === 'visited').slice(-40)
  if (!recs.length) return []
  const hashes = await Promise.all(recs.map((r) => emailHash(r.email)))
  const flat = await pipeline(cfg, recs.flatMap((r, i) => [['GET', RK.sent(hashes[i])], ['GET', RK.optout(hashes[i])], ['GET', RK.booked(r.id)]]))
  const link = linkFor(prefs, meta)
  const address = await setting('MAIL_SENDER_ADDRESS', '', req)
  return recs.map((r, i) => {
    const e = requestEligibility({
      enabled: prefs.requests !== 'off', hasLink: !!link, hasAddress: !!address, email: r.email,
      status: recStatus(r), visitedAt: visitedAt(r), lastSentAt: flat[i * 3], optedOut: !!flat[i * 3 + 1], sentForBooking: !!flat[i * 3 + 2], now,
    })
    return { id: r.id, name: r.name, email: maskEmail(r.email), service: (r.service && r.service.name) || '', when: r.when || '', visitedAt: visitedAt(r), ...e, _rec: r, _hash: hashes[i] }
  })
}

export function maskEmail(e) {
  const [u, d] = String(e || '').split('@')
  if (!d) return ''
  return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d
}

const pub = (c) => { const { _rec, _hash, ...rest } = c; return rest }

/** 1件送ります（送ってよいかはもう確かめてあること）。 */
async function sendOne(req, c, prefs, meta) {
  const cfg = storeConfig()
  const apiKeyMail = await setting('RESEND_API_KEY', '', req)
  if (!apiKeyMail) return { ok: false, message: 'メールの設定（RESEND_API_KEY）が無いため送れません。' }
  if (sandboxFrom()) return { ok: false, message: '送信元が Resend の試用アドレスのため、お客様には届きません。送信元のドメインを設定してください。' }
  const secret = await manageSecret(req)
  if (!secret) return { ok: false, message: '配信停止のリンクを作れません（SESSION_SECRET か ADMIN_KEY が必要です）。' }
  const optout = `${BRAND.url}/api/reviews?optout=${await optoutToken(c._hash, secret)}`
  const mail = requestMail({
    shop: prefs.shopName || BRAND.name, name: c._rec.name, link: linkFor(prefs, meta), optout,
    address: await setting('MAIL_SENDER_ADDRESS', '', req), contact: prefs.contact,
  })
  let ok = false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKeyMail}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: BRAND.from, to: [c._rec.email], reply_to: await ownerAddress(req), subject: mail.subject, text: mail.text,
        headers: { 'List-Unsubscribe': `<${optout}>` },
      }),
    })
    ok = res.ok
  } catch (_) {}
  const at = new Date().toISOString()
  const cmds = [['LPUSH', RK.log, JSON.stringify({ at, booking: c.id, name: c._rec.name, ok })], ['LTRIM', RK.log, 0, 99]]
  if (ok) cmds.push(['SET', RK.sent(c._hash), at, 'EX', REQUEST_GAP_DAYS * 86400], ['SET', RK.booked(c.id), at, 'EX', 200 * 86400])
  try { await pipeline(cfg, cmds) } catch (_) {}
  return ok ? { ok: true, message: `${c._rec.name} 様にお願いのメールを送りました。` } : { ok: false, message: 'メールを送れませんでした（メールの設定を確かめてください）。' }
}

export async function sendRequest(req, bookingId) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: STATES.no_store }
  const prefs = await readPrefs(cfg)
  const meta = await readMeta(cfg)
  const c = (await requestCandidates(req, prefs, meta)).find((x) => x.id === bookingId)
  if (!c) return { ok: false, message: 'その予約は見つかりませんでした（来店済みで、来店から' + REQUEST_MAX_AGE_DAYS + '日以内のものだけ送れます）。' }
  if (!c.ok) return { ok: false, message: '送れません：' + c.message + '。' }
  return sendOne(req, c, prefs, meta)
}

export async function requestLog(cfg = storeConfig()) {
  if (!cfg) return []
  try { const [rows] = await pipeline(cfg, [['LRANGE', RK.log, 0, 29]]); return (rows || []).map((r) => parse(r, null)).filter(Boolean) } catch (_) { return [] }
}

export async function recordOptout(hash) {
  const cfg = storeConfig()
  if (!cfg) return false
  try { await pipeline(cfg, [['SET', RK.optout(hash), new Date().toISOString()]]); return true } catch (_) { return false }
}

/* -------------------------------------------------------- 毎朝の自動処理 -- */

/** social-cron.js から。差分の同期（店舗ごとに2ページまで）と、
 *  「自動で送る」設定のときのお願いメール（1日5件まで）。 */
export async function runReviewsCron(req, budget = 6000) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, skipped: 'no_store' }
  const started = Date.now()
  const prefs = await readPrefs(cfg)
  const meta = await readMeta(cfg)
  const conn = await connection(req, prefs, { ...meta, errorCode: '' })
  let sync = null
  if (conn.ok) {
    try { sync = await syncReviews(req, { maxPages: 2, budget: Math.max(2000, budget - 2500) }) }
    catch (e) { sync = { ok: false, message: errText(e) } }
  }
  let sent = 0
  if (prefs.requests === 'auto' && Date.now() - started < budget - 1500) {
    try {
      const list = (await requestCandidates(req, prefs, await readMeta(cfg))).filter((c) => c.ok).slice(0, 5)
      for (const c of list) {
        if (Date.now() - started > budget - 800) break
        if ((await sendOne(req, c, prefs, meta)).ok) sent++
      }
    } catch (_) {}
  }
  return { ok: !sync || sync.ok, sync: sync && { ok: sync.ok, added: sync.added, code: sync.code }, sent }
}

export { gbpLocations, pub }
