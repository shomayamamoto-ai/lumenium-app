// 見積書・請求書の保存（Upstash Redis）と、お客様に送るリンク・メール。
//
// 置き方。
//   ${KV}quote:list              id → 一覧用の要約（JSON）。一覧・数字はこれだけで出します
//   ${KV}quote:r:<id>            1件の全部（品目・備考・社内メモ・履歴）
//   ${KV}quote:settings          発行元（会社名・住所・登録番号…）・端数処理・メールの文
//   ${KV}quote:catalog           よく使う品目（無ければサイトのサービスの価格から作ります）
//   ${KV}quote:seq:<頭>:<年>     番号の数え札（Q-2026-0001 の 0001）
//
// お客様に送るのは「見るだけのリンク」です（api/quote-view.js）。リンクには
// 見積書の id と期限を入れ、SESSION_SECRET（無ければ ADMIN_KEY）で署名します。
// 署名が合わない・期限を過ぎたリンクでは何も見せません。
//
// 計算と紙の形は _quote-core.js（画面と同じもの）にあります。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { pipeline } from './_analytics-store.js'
import { KV, BRAND } from './_brand.js'
import { setting } from './_settings.js'
import { sandboxFrom, manageSecret, ownerAddress } from './_booking-mail.js'
import { SERVICES } from '../src/data/services.js'
import {
  DEFAULT_QUOTE_SETTINGS, ROUNDING, QCAPS, checkRegNo, catalogFromServices, cleanCatalog, cleanQuote, quoteSummary,
  nextNumber, jstToday, fillMail, mailVars, applyStatus,
} from './_quote-core.js'

export const QK = {
  list: `${KV}quote:list`,
  rec: (id) => `${KV}quote:r:${id}`,
  settings: `${KV}quote:settings`,
  catalog: `${KV}quote:catalog`,
  seq: (prefix, year) => `${KV}quote:seq:${prefix}:${year}`,
}

export const quoteIdOk = (v) => /^qt[a-z0-9]{4,30}$/.test(String(v || ''))
export function newQuoteId(now = Date.now()) {
  return 'qt' + now.toString(36) + Math.random().toString(36).slice(2, 6)
}

function parse(raw, fb = null) {
  if (raw == null) return fb
  try { return JSON.parse(raw) } catch (_) { return fb }
}
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n)
const one = (v, n) => clip(v, n).replace(/[\r\n\t]+/g, ' ').trim()

/* ---------------------------------------------------------------- 設定 -- */

/** 印影の画像は data:image（小さく縮めたもの）だけ。公開の置き場所には置きません。 */
export const SEAL_MAX = 200 * 1024

/** 画面から来た設定を確かめてそろえる。{ ok, settings, message } */
export function cleanQuoteSettings(input, cur) {
  const x = input || {}
  const s = Object.assign({}, DEFAULT_QUOTE_SETTINGS, cur || {})
  const pick = (k, n, multi) => { if (x[k] !== undefined) s[k] = multi ? clip(x[k], n).trim() : one(x[k], n) }
  pick('company', 80); pick('address', 160, true); pick('tel', 30); pick('email', 100); pick('person', 40)
  pick('bank', 300, true); pick('payTerms', 120); pick('delivery', 120); pick('notes', 1500, true)
  pick('mailSubject', 120); pick('mailBody', 3000, true)
  if (x.regNo !== undefined) {
    const r = checkRegNo(x.regNo)
    if (!r.ok) return { ok: false, message: r.message }
    s.regNo = r.value
  }
  if (x.validDays !== undefined) {
    const n = Math.round(Number(x.validDays))
    if (!(n >= 1 && n <= 365)) return { ok: false, message: '有効期限の日数は1〜365日で入れてください。' }
    s.validDays = n
  }
  if (x.linkDays !== undefined) {
    const n = Math.round(Number(x.linkDays))
    if (!(n >= 7 && n <= 365)) return { ok: false, message: 'リンクを開ける日数は7〜365日で入れてください。' }
    s.linkDays = n
  }
  if (x.rounding !== undefined) {
    if (!ROUNDING[x.rounding]) return { ok: false, message: '端数処理の値が正しくありません。' }
    s.rounding = x.rounding
  }
  if (x.taxMode !== undefined) s.taxMode = x.taxMode === 'incl' ? 'incl' : 'excl'
  for (const k of ['prefix', 'invoicePrefix']) {
    if (x[k] === undefined) continue
    const v = String(x[k] || '').trim().toUpperCase()
    if (!/^[A-Z]{1,6}$/.test(v)) return { ok: false, message: '番号の頭は英字1〜6文字にしてください（例: Q）。' }
    s[k] = v
  }
  if (x.logo !== undefined) {
    const v = String(x.logo || '').trim()
    if (v && !/^https:\/\/[^\s"'<>]{1,400}$/.test(v)) return { ok: false, message: 'ロゴの画像のアドレスが正しくありません。' }
    s.logo = v
  }
  if (x.seal !== undefined) {
    const v = String(x.seal || '')
    if (v && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > SEAL_MAX)) {
      return { ok: false, message: '印影の画像が読めないか、大きすぎます（PNG・JPEG で、200KB まで）。' }
    }
    s.seal = v
  }
  if (s.prefix === s.invoicePrefix) return { ok: false, message: '見積書と請求書の番号の頭は、別の文字にしてください。' }
  return { ok: true, settings: s }
}

export async function loadQuoteSettings(cfg) {
  const [raw] = await pipeline(cfg, [['GET', QK.settings]])
  return Object.assign({}, DEFAULT_QUOTE_SETTINGS, parse(raw) || {})
}

export async function saveQuoteSettings(cfg, input) {
  const r = cleanQuoteSettings(input, await loadQuoteSettings(cfg))
  if (!r.ok) return r
  await pipeline(cfg, [['SET', QK.settings, JSON.stringify(r.settings)]])
  return r
}

/** よく使う品目。保存したものが無ければ、サイトのサービス紹介の価格から作ります
 *  （管理画面で文章を書き換えている場合、ここは初めの価格のままです）。 */
export async function loadCatalog(cfg) {
  const [raw] = await pipeline(cfg, [['GET', QK.catalog]])
  const saved = parse(raw)
  if (Array.isArray(saved)) return { items: saved, seeded: false }
  return { items: catalogFromServices(SERVICES), seeded: true }
}

export async function saveCatalog(cfg, list) {
  const items = cleanCatalog(list)
  await pipeline(cfg, [['SET', QK.catalog, JSON.stringify(items)]])
  return items
}

/* ---------------------------------------------------------------- 1件 -- */

export async function getQuote(cfg, id) {
  if (!quoteIdOk(id)) return null
  const [raw] = await pipeline(cfg, [['GET', QK.rec(id)]])
  return parse(raw)
}

export async function putQuote(cfg, q, rounding) {
  await pipeline(cfg, [
    ['SET', QK.rec(q.id), JSON.stringify(q)],
    ['HSET', QK.list, q.id, JSON.stringify(quoteSummary(q, rounding))],
  ])
}

export async function allQuoteSummaries(cfg) {
  const [flat] = await pipeline(cfg, [['HGETALL', QK.list]])
  const out = []
  const a = Array.isArray(flat) ? flat : []
  for (let i = 1; i < a.length; i += 2) {
    const s = parse(a[i])
    if (s && s.id) out.push(s)
  }
  return out.sort((x, y) => (x.date === y.date ? (x.number < y.number ? 1 : -1) : x.date < y.date ? 1 : -1))
}

/** 番号を1つ進めて返す。数え札と、いまある番号の大きい方の次です。 */
export async function takeNumber(cfg, list, kind, settings, date) {
  const prefix = kind === 'invoice' ? settings.invoicePrefix : settings.prefix
  const year = String(date).slice(0, 4)
  const [seq] = await pipeline(cfg, [['INCR', QK.seq(prefix, year)]])
  const r = nextNumber(list.filter((s) => (s.kind || 'quote') === kind).map((s) => s.number), prefix, year, seq)
  if (r.seq !== Number(seq)) await pipeline(cfg, [['SET', QK.seq(prefix, year), String(r.seq)]])
  return r.number
}

/** 新しく作る・直す。{ ok, quote, message } */
export async function saveQuote(cfg, input, now = Date.now()) {
  const settings = await loadQuoteSettings(cfg)
  const id = input && input.id ? String(input.id) : ''
  let prev = null
  if (id) {
    prev = await getQuote(cfg, id)
    if (!prev) return { ok: false, message: 'その見積書は見つかりませんでした（消されたかもしれません）。' }
  }
  const today = jstToday(now)
  const r = cleanQuote(input, prev, today)
  if (!r.ok) return r
  const q = r.quote
  const list = await allQuoteSummaries(cfg)
  if (list.length >= QCAPS.records && !prev) return { ok: false, message: `保存できる数（${QCAPS.records}件）に達しました。古いものを消してください。` }
  if (q.number && list.some((s) => s.id !== q.id && (s.kind || 'quote') === q.kind && s.number === q.number)) {
    return { ok: false, message: `番号「${q.number}」はもう使われています。別の番号にするか、空にして自動で振ってください。` }
  }
  const at = new Date(now).toISOString()
  if (!q.number) q.number = await takeNumber(cfg, list, q.kind, settings, q.date)
  if (!prev) {
    q.id = newQuoteId(now)
    q.createdAt = at
    q.history = [{ at, what: 'created', text: q.fromQuote ? '受注した見積書から作成' : q.inquiryId ? '問い合わせから作成' : '作成' }]
  } else {
    q.history.push({ at, what: 'edited', text: '内容を直した' })
    q.history = q.history.slice(-QCAPS.history)
  }
  await putQuote(cfg, q, settings.rounding)
  if (!prev && q.inquiryId) await noteOnInquiry(cfg, q.inquiryId, `${q.kind === 'invoice' ? '請求書' : '見積書'} ${q.number} を作成`, at)
  return { ok: true, quote: q, summary: quoteSummary(q, settings.rounding) }
}

/** 元の問い合わせの履歴に「見積書を作った」と書く（問い合わせ管理から見えるように）。
 *  書けなくても見積書の保存は止めません。 */
async function noteOnInquiry(cfg, inquiryId, text, at) {
  try {
    const { getRecord, putRecord } = await import('./_inquiries.js')
    const rec = await getRecord(cfg, inquiryId)
    if (!rec) return
    rec.history = (rec.history || []).concat([{ at, what: 'quote', text }]).slice(-80)
    await putRecord(cfg, rec)
  } catch (_) {}
}

export async function setQuoteStatus(cfg, id, status, now = Date.now()) {
  const q = await getQuote(cfg, id)
  if (!q) return { ok: false, message: 'その見積書は見つかりませんでした。' }
  const r = applyStatus(q, status, new Date(now).toISOString())
  if (!r.ok) return r
  if (r.changed) await putQuote(cfg, r.quote, (await loadQuoteSettings(cfg)).rounding)
  return { ok: true, quote: r.quote }
}

export async function deleteQuote(cfg, id) {
  if (!quoteIdOk(id)) return { ok: false, message: 'その見積書は見つかりませんでした。' }
  await pipeline(cfg, [['DEL', QK.rec(id)], ['HDEL', QK.list, id]])
  return { ok: true }
}

/* ------------------------------------------------- 見るだけのリンク -- */

const enc = new TextEncoder()
async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/** 「<id>.<期限(秒)>.<署名40桁>」。署名は id と期限の両方にかかるので、期限だけ延ばすことはできません。 */
export async function signView(id, expMs, secret) {
  const exp = Math.floor(expMs / 1000)
  const sig = (await hmacHex(`quote-view:${id}:${exp}`, secret)).slice(0, 40)
  return `${id}.${exp}.${sig}`
}

/** { ok, id } か { ok:false, reason:'bad'|'expired' } */
export async function verifyView(token, secret, now = Date.now()) {
  const m = /^(qt[a-z0-9]{4,30})\.(\d{9,11})\.([0-9a-f]{40})$/.exec(String(token || ''))
  if (!m || !secret) return { ok: false, reason: 'bad' }
  const want = (await hmacHex(`quote-view:${m[1]}:${m[2]}`, secret)).slice(0, 40)
  if (!sameText(want, m[3])) return { ok: false, reason: 'bad' }
  if (Number(m[2]) * 1000 < now) return { ok: false, reason: 'expired', id: m[1] }
  return { ok: true, id: m[1] }
}

export async function viewLink(req, q, settings, now = Date.now()) {
  const secret = await manageSecret(req)
  if (!secret) return ''
  const exp = now + (Number(settings.linkDays) || 60) * 86400000
  return `${BRAND.url}/api/quote-view?t=${await signView(q.id, exp, secret)}`
}

/** お客様がリンクを開いた。初めての日・最後の日・回数を残します。 */
export async function recordView(cfg, id, now = Date.now()) {
  const q = await getQuote(cfg, id)
  if (!q) return null
  const at = new Date(now).toISOString()
  if (!q.openedAt) {
    q.openedAt = at
    q.history = (q.history || []).concat([{ at, what: 'opened', text: 'お客様がリンクを開いた' }]).slice(-QCAPS.history)
  }
  q.lastViewedAt = at
  q.views = (q.views || 0) + 1
  await putQuote(cfg, q, (await loadQuoteSettings(cfg)).rounding)
  return q
}

/* ------------------------------------------------------------ メール -- */

export async function mailState(req) {
  return {
    key: !!(await setting('RESEND_API_KEY', '', req)),
    sandbox: sandboxFrom(),
    secret: !!(await manageSecret(req)),
    from: BRAND.from,
  }
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/

/** 見るだけのリンクを入れたメールを送り、「送付済み」にします。 */
export async function sendQuote(req, cfg, input, now = Date.now()) {
  const x = input || {}
  const q = await getQuote(cfg, String(x.id || ''))
  if (!q) return { ok: false, message: 'その見積書は見つかりませんでした。' }
  const st = await mailState(req)
  if (!st.key) return { ok: false, message: 'メールの設定（RESEND_API_KEY）が無いため送れません。「設定状況」でつないでください。リンクだけ作って、ふだんのメールやLINEで送ることもできます。' }
  if (st.sandbox) return { ok: false, message: '送信元が Resend の試用アドレス（onboarding@resend.dev）のため、お客様には届きません。送信元のドメインを設定してから送ってください。リンクだけ作って、ふだんのメールで送ることはできます。' }
  if (!st.secret) return { ok: false, message: 'リンクを作れません（SESSION_SECRET か ADMIN_KEY が必要です）。' }
  const to = one(x.to || q.toEmail, 100)
  if (!EMAIL_RE.test(to)) return { ok: false, message: 'お客様のメールアドレスが正しくありません。' }
  const settings = await loadQuoteSettings(cfg)
  const link = await viewLink(req, q, settings, now)
  const vars = mailVars(q, settings, link, settings.rounding)
  const subject = one(fillMail(x.subject || settings.mailSubject, vars), 200) || 'お見積書のご送付'
  let text = clip(fillMail(x.body || settings.mailBody, vars), 5000)
  if (text.indexOf(link) < 0) text += `\n\nお見積書: ${link}`
  const replyTo = settings.email && EMAIL_RE.test(settings.email) ? settings.email : await ownerAddress(req)
  const key = await setting('RESEND_API_KEY', '', req)
  let ok = false
  let err = ''
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: BRAND.from, to: [to], reply_to: replyTo, subject, text }),
    })
    ok = res.ok
    if (!ok) err = `Resend が ${res.status} を返しました`
  } catch (e) { err = String((e && e.message) || e).slice(0, 120) }
  if (!ok) return { ok: false, message: `メールを送れませんでした（${err}）。メールの設定を確かめてください。` }
  const at = new Date(now).toISOString()
  let r = q
  if (q.status === 'draft' || (q.kind !== 'invoice' && q.status === 'sent')) {
    r = applyStatus(q, 'sent', at).quote
  }
  r.sentAt = r.sentAt || at
  r.sentTo = to
  if (!r.toEmail) r.toEmail = to
  r.history = (r.history || []).concat([{ at, what: 'mail', text: `${to} にメールで送った` }]).slice(-QCAPS.history)
  await putQuote(cfg, r, settings.rounding)
  return { ok: true, quote: r, message: `${to} に送りました。お客様がリンクを開くと、ここに「開いた日」が出ます。` }
}
