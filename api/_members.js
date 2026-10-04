// 会員（Resend の連絡先）をまとめて扱う1か所。
//
// 会員は、メール送信サービス Resend の「連絡先（Contacts）」として持って
// います。データベースを別に用意しなくて済むためです。
//
// Resend は 2025年11月に「Audiences（オーディエンス）」をやめ、連絡先を
// アカウント全体で1つの名簿にし、その中のグループを「Segments
// （セグメント）」と呼ぶ形に変えました。この画面では、セグメントを
// 「グループ」と呼んでいます。会員の名簿は、会員全員が入るグループ
// （既定の名前は「<社名> Members」）1つで表します。アカウントには
// 問い合わせなど別の用途の連絡先が入ることもあるため、「アカウントの
// 連絡先すべて」ではなく、このグループに入っている人を会員とします。
//
//   一覧        GET  /segments/{id}/contacts?limit=100&after=<最後のid>
//   1人         GET  /contacts/{id}             （会社名などの追加項目つき）
//   登録        POST /contacts {email, first_name, last_name, properties, segments}
//   変更        PATCH /contacts/{id} {first_name, last_name, unsubscribed, properties}
//   削除        DELETE /contacts/{id}
//   グループ    GET/POST /segments、DELETE /segments/{id}
//               POST/DELETE /contacts/{id}/segments/{segment_id}
//   追加の項目  POST /contact-properties {key, type:'string'}
//
// 古い形（Audiences）が残っているアカウントでも動くよう、/segments が
// 使えないときは /audiences/{id}/contacts に戻ります（legacy）。その間は
// グループとお知らせメールのグループ指定は使えません。
//
// 会社名は「company」という追加の項目（contact property）に入れます。
// ただし一覧（list）の応答には追加の項目が入らないため、これまでどおり
// 姓の欄（last_name）にも同じ値を入れています。Resend の管理画面で名前の
// 横に会社名が見えるのも、この欄のおかげです。読むときは追加の項目を先に
// 見て、無ければ姓の欄を会社名として扱います。
//
// 同意の記録（いつ・どのページで・どの文面に同意したか、IPは一方向の
// ハッシュ）は、登録の時点から Redis の `${KV}member:consent` に、
// メールアドレスのハッシュをキーにして入っています（api/register.js）。
// アドレスそのものは保存先に置きません。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { BRAND, KV } from './_brand.js'
import { digest } from './_ratelimit.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { setting } from './_settings.js'
import { senderInfo } from './_sender.js'

const API = 'https://api.resend.com'
export const ALL_NAME = `${BRAND.name} Members`
const PAGE = 100
const MAX_PAGES = 50 // 5,000人まで。それより多いときは truncated で知らせます。

export const MK = {
  consent: `${KV}member:consent`, // HSET <digest('member', email)> → JSON
  audit: `${KV}mem:audit`, // LPUSH 監査の記録（個人を指す値は入れない）
  broadcasts: `${KV}mem:bc`, // LPUSH 送ったお知らせメールの控え
}

/* ---- Resend への1回の呼び出し ----
   Resend は1秒あたりの回数に上限があり（429）、ページをたどると当たる
   ことがあります。1回だけ少し待って繰り返します。 */
export async function resend(apiKey, path, init = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await fetch(API + path, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      })
    } catch (e) {
      return { ok: false, status: 0, body: null }
    }
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(1500, Math.max(300, Number(res.headers.get('retry-after') || 1) * 1000))
      await new Promise((ok) => setTimeout(ok, wait))
      continue
    }
    const body = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, body }
  }
  return { ok: false, status: 429, body: null }
}

/** ページを最後までたどって1つの配列にする。同じ id は1度だけ。
 *  page(after) は {ok, body:{data, has_more}} を返す関数です。 */
export async function collectPages(page, maxPages = MAX_PAGES) {
  const out = []
  const seen = new Set()
  let after = ''
  for (let i = 0; i < maxPages; i++) {
    const r = await page(after)
    if (!r.ok || !Array.isArray(r.body?.data)) return i === 0 ? null : { items: out, truncated: true, partial: true }
    for (const x of r.body.data) {
      const id = x && (x.id || x.email)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(x)
    }
    const last = r.body.data[r.body.data.length - 1]
    // 古い形（Audiences）は has_more を返さず、全部を1回で返します。
    if (r.body.has_more !== true || !last || !last.id || last.id === after) return { items: out, truncated: false }
    after = last.id
  }
  return { items: out, truncated: true }
}

const qs = (after) => `?limit=${PAGE}${after ? `&after=${encodeURIComponent(after)}` : ''}`

/* ---- 会員の名簿（全員のグループ）の場所 ----
   1. 設定の RESEND_SEGMENT_ID
   2. 環境変数 RESEND_AUDIENCE_ID（移行で、元のオーディエンスは同じ id の
      セグメントになっています。/segments で見つからなければ古い形で使う）
   3. 名前「<社名> Members」のセグメントを探す → 無ければ古い形の
      オーディエンスを探す → どちらも無ければセグメントを作る */
const cache = { key: '', where: null, companyProp: null }

export async function whereMembers(apiKey) {
  if (cache.key === apiKey && cache.where) return cache.where
  const set = async (where) => { cache.key = apiKey; cache.where = where; return where }
  const fixed = (await setting('RESEND_SEGMENT_ID')) || (process.env.RESEND_AUDIENCE_ID || '').trim()
  if (fixed) {
    const seg = await resend(apiKey, `/segments/${encodeURIComponent(fixed)}`)
    if (seg.ok) return set({ mode: 'segments', id: fixed })
    if (seg.status === 404 || seg.status === 405 || seg.status === 400) return set({ mode: 'legacy', id: fixed })
    return null
  }
  const segs = await collectPages((after) => resend(apiKey, `/segments${qs(after)}`), 5)
  if (segs) {
    const found = segs.items.find((s) => s && s.name === ALL_NAME)
    if (found) return set({ mode: 'segments', id: found.id })
  }
  const auds = await resend(apiKey, '/audiences')
  if (auds.ok && Array.isArray(auds.body?.data)) {
    const found = auds.body.data.find((a) => a && a.name === ALL_NAME)
    if (found && !segs) return set({ mode: 'legacy', id: found.id })
    if (found) return set({ mode: 'segments', id: found.id })
  }
  if (!segs) return null
  const made = await resend(apiKey, '/segments', { method: 'POST', body: JSON.stringify({ name: ALL_NAME }) })
  if (made.ok && made.body?.id) return set({ mode: 'segments', id: made.body.id })
  return null
}

/** 会社名を入れる追加の項目（company）を、無ければ作る。作れなければ false
 *  （そのときは姓の欄にだけ入れます）。 */
async function companyProperty(apiKey) {
  if (cache.companyProp != null && cache.key === apiKey) return cache.companyProp
  const list = await resend(apiKey, '/contact-properties?limit=100')
  let ok = false
  if (list.ok && Array.isArray(list.body?.data)) {
    ok = list.body.data.some((p) => p && p.key === 'company')
    if (!ok) {
      const made = await resend(apiKey, '/contact-properties', {
        method: 'POST', body: JSON.stringify({ key: 'company', type: 'string', fallback_value: '' }),
      })
      ok = made.ok
    }
  }
  cache.companyProp = ok
  return ok
}

/** Resend の連絡先 → 画面の1人。 */
export function toMember(c, segmentIds) {
  const props = (c && c.properties) || {}
  const company = typeof props.company === 'string' && props.company ? props.company
    : (props.company && typeof props.company.value === 'string' ? props.company.value : (c.last_name || ''))
  return {
    id: c.id || '',
    name: c.first_name || '',
    company,
    email: c.email || '',
    created: c.created_at || '',
    unsubscribed: c.unsubscribed === true,
    segments: segmentIds || [],
  }
}

/** 会員の一覧。{members, segments, mode, truncated} か、取れなければ null。
 *  withSegments: 各グループの中身もたどり、1人ごとに入っているグループを付けます。 */
export async function listMembers(apiKey, { withSegments = false } = {}) {
  const where = await whereMembers(apiKey)
  if (!where) return null
  const base = where.mode === 'legacy' ? `/audiences/${where.id}/contacts` : `/segments/${where.id}/contacts`
  const got = await collectPages((after) => resend(apiKey, base + qs(after)))
  if (!got) return null
  let segments = []
  const inSeg = new Map()
  if (withSegments && where.mode === 'segments') {
    const segs = await collectPages((after) => resend(apiKey, `/segments${qs(after)}`), 5)
    segments = (segs ? segs.items : []).filter((s) => s && s.id !== where.id && s.name !== ALL_NAME)
      .map((s) => ({ id: s.id, name: s.name || '', created: s.created_at || '' }))
    for (const s of segments) {
      const m = await collectPages((after) => resend(apiKey, `/segments/${s.id}/contacts${qs(after)}`), 20)
      for (const c of (m ? m.items : [])) {
        const k = c.id || c.email
        if (!inSeg.has(k)) inSeg.set(k, [])
        inSeg.get(k).push(s.id)
      }
      s.count = m ? m.items.length : null
    }
  }
  const members = got.items.map((c) => toMember(c, inSeg.get(c.id || c.email)))
  members.sort((a, b) => (b.created || '').localeCompare(a.created || ''))
  return { members, segments, mode: where.mode, allId: where.id, truncated: got.truncated }
}

/** 会員1人（会社名などの追加項目つき）。 */
export async function getMember(apiKey, id) {
  const r = await resend(apiKey, `/contacts/${encodeURIComponent(id)}`)
  if (!r.ok || !r.body) return null
  const segs = await resend(apiKey, `/contacts/${encodeURIComponent(id)}/segments?limit=100`)
  const where = await whereMembers(apiKey)
  const ids = segs.ok && Array.isArray(segs.body?.data)
    ? segs.body.data.map((s) => s.id).filter((s) => !where || s !== where.id) : []
  return toMember(r.body, ids)
}

/** 新しい会員。登録ページ（api/register.js）から呼ばれます。 */
export async function addMember(apiKey, { name, email, company }) {
  const where = await whereMembers(apiKey)
  if (!where) return false
  if (where.mode === 'legacy') {
    const r = await resend(apiKey, `/audiences/${where.id}/contacts`, {
      method: 'POST', body: JSON.stringify({ email, first_name: name, last_name: company || '', unsubscribed: false }),
    })
    return r.ok
  }
  const body = { email, first_name: name, last_name: company || '', unsubscribed: false, segments: [{ id: where.id }] }
  if (company && (await companyProperty(apiKey))) body.properties = { company }
  const r = await resend(apiKey, '/contacts', { method: 'POST', body: JSON.stringify(body) })
  if (r.ok) return true
  // 前に登録して削除していない人など、もう連絡先がある場合。グループに入れ直し、
  // 名前を新しいものにします（配信停止の状態は変えません）。
  if (r.status === 409 || r.status === 422) {
    const id = encodeURIComponent(email)
    await resend(apiKey, `/contacts/${id}/segments/${where.id}`, { method: 'POST' })
    return (await updateMember(apiKey, email, { name, company })).ok
  }
  return false
}

/** 名前・会社名・配信停止を変える。 */
export async function updateMember(apiKey, id, { name, company, unsubscribed }) {
  const where = await whereMembers(apiKey)
  const body = {}
  if (name != null) body.first_name = String(name)
  if (company != null) {
    body.last_name = String(company)
    if (where && where.mode === 'segments' && (await companyProperty(apiKey))) body.properties = { company: String(company) }
  }
  if (unsubscribed === true) body.unsubscribed = true
  const path = where && where.mode === 'legacy'
    ? `/audiences/${where.id}/contacts/${encodeURIComponent(id)}` : `/contacts/${encodeURIComponent(id)}`
  return resend(apiKey, path, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deleteMember(apiKey, id) {
  const where = await whereMembers(apiKey)
  const path = where && where.mode === 'legacy'
    ? `/audiences/${where.id}/contacts/${encodeURIComponent(id)}` : `/contacts/${encodeURIComponent(id)}`
  return resend(apiKey, path, { method: 'DELETE' })
}

/* ---- グループ（セグメント） ---- */
export const createSegment = (apiKey, name) =>
  resend(apiKey, '/segments', { method: 'POST', body: JSON.stringify({ name }) })
export const deleteSegment = (apiKey, id) => resend(apiKey, `/segments/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const joinSegment = (apiKey, contactId, segId) =>
  resend(apiKey, `/contacts/${encodeURIComponent(contactId)}/segments/${encodeURIComponent(segId)}`, { method: 'POST' })
export const leaveSegment = (apiKey, contactId, segId) =>
  resend(apiKey, `/contacts/${encodeURIComponent(contactId)}/segments/${encodeURIComponent(segId)}`, { method: 'DELETE' })

/** グループで絞る。'' は全員、'none' はどのグループにも入っていない人。 */
export function inSegment(m, seg) {
  if (!seg) return true
  const s = m.segments || []
  return seg === 'none' ? s.length === 0 : s.indexOf(seg) !== -1
}

/** お知らせメールが届く人数。配信を止めた人は数えません。 */
export function recipientCount(members, seg) {
  return members.filter((m) => !m.unsubscribed && inSegment(m, seg)).length
}

/* ---- 同意の記録 ---- */
export const consentKey = (email) => digest('member', String(email || '').toLowerCase())

/** 保存されている形 → 画面の形。壊れた値や無い値は null。 */
export function consentView(raw) {
  if (!raw) return null
  let r = raw
  if (typeof raw === 'string') { try { r = JSON.parse(raw) } catch (_) { return null } }
  if (!r || typeof r !== 'object' || !r.at) return null
  return { at: String(r.at), version: String(r.version || ''), source: String(r.source || ''), hasIp: !!r.ipHash }
}

export async function readConsent(email) {
  const cfg = storeConfig()
  if (!cfg) return { stored: false, record: null }
  try {
    const [raw] = await pipeline(cfg, [['HGET', MK.consent, await consentKey(email)]])
    return { stored: true, record: consentView(raw) }
  } catch (_) { return { stored: false, record: null } }
}

/** 全員分の同意の記録を、アドレスのハッシュ → 記録 の Map で。 */
export async function allConsents() {
  const cfg = storeConfig()
  if (!cfg) return null
  try {
    const [flat] = await pipeline(cfg, [['HGETALL', MK.consent]])
    const out = new Map()
    const arr = Array.isArray(flat) ? flat : Object.entries(flat || {}).flat()
    for (let i = 0; i + 1 < arr.length; i += 2) {
      const v = consentView(arr[i + 1])
      if (v) out.set(String(arr[i]), v)
    }
    return out
  } catch (_) { return null }
}

/* ---- 監査の記録 ----
   削除や配信停止を「いつ・何を・なぜ」したかだけを残します。名前・
   アドレス・そのハッシュは入れません（削除の依頼に応えたあとに、その人を
   指す値が残らないように）。受付番号は、依頼した本人への返事に使えます。 */
export function auditEntry(action, { reason = '', hadConsent = null, now = Date.now(), ref } = {}) {
  const REASONS = { request: '本人からの削除の依頼', duplicate: '重複・テストの登録', other: 'その他' }
  return {
    ref: ref || 'A' + now.toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0'),
    at: new Date(now).toISOString(),
    action, // 'delete' | 'unsubscribe' | 'unsubscribe-link'
    reason: REASONS[reason] ? reason : (action === 'delete' ? 'other' : ''),
    reasonLabel: REASONS[reason] || '',
    hadConsent,
  }
}

export async function writeAudit(entry) {
  const cfg = storeConfig()
  if (!cfg) return false
  try {
    await pipeline(cfg, [['LPUSH', MK.audit, JSON.stringify(entry)], ['LTRIM', MK.audit, 0, 499]])
    return true
  } catch (_) { return false }
}

export async function readAudit(n = 50) {
  const cfg = storeConfig()
  if (!cfg) return null
  try {
    const [rows] = await pipeline(cfg, [['LRANGE', MK.audit, 0, n - 1]])
    return (rows || []).map((s) => { try { return JSON.parse(s) } catch (_) { return null } }).filter(Boolean)
  } catch (_) { return null }
}

export async function forgetConsent(email) {
  const cfg = storeConfig()
  if (!cfg) return false
  try { await pipeline(cfg, [['HDEL', MK.consent, await consentKey(email)]]); return true } catch (_) { return false }
}

/* ---- 増え方 ---- */
const JST = 9 * 3600 * 1000
const month = (iso) => { const t = Date.parse(iso); return isFinite(t) ? new Date(t + JST).toISOString().slice(0, 7) : '' }

/** 月ごとの新規と累計、配信停止の数、登録したページ。
 *  consents は allConsents() の Map（無ければ null）、keys は 会員の
 *  アドレス → ハッシュ の Map です。 */
export function growth(members, consents, keys, now = Date.now(), months = 12) {
  const byMonth = new Map()
  for (const m of members) {
    const k = month(m.created)
    if (k) byMonth.set(k, (byMonth.get(k) || 0) + 1)
  }
  const out = []
  const d = new Date(now + JST)
  let y = d.getUTCFullYear(), mo = d.getUTCMonth()
  for (let i = 0; i < months; i++) {
    out.unshift(`${y}-${String(mo + 1).padStart(2, '0')}`)
    if (--mo < 0) { mo = 11; y-- }
  }
  const before = members.filter((m) => { const k = month(m.created); return k && k < out[0] }).length
  let total = before
  const series = out.map((k) => { const n = byMonth.get(k) || 0; total += n; return { month: k, added: n, total } })
  const sources = new Map()
  let noRecord = 0
  for (const m of members) {
    const c = consents && keys ? consents.get(keys.get(m.email)) : null
    if (!c) { noRecord++; continue }
    const s = c.source || '（不明）'
    sources.set(s, (sources.get(s) || 0) + 1)
  }
  return {
    total: members.length,
    subscribed: members.filter((m) => !m.unsubscribed).length,
    unsubscribed: members.filter((m) => m.unsubscribed).length,
    thisMonth: series[series.length - 1].added,
    series,
    sources: [...sources].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    noRecord,
    consentsKnown: !!consents,
  }
}

/* ---- 配信停止のリンク（このサイトの api/unsubscribe.js） ----
   お知らせメール（一斉）は Resend の配信停止の仕組み
   {{{RESEND_UNSUBSCRIBE_URL}}} を使います。登録完了のメールや試し送りの
   ように1通ずつ送るメールにはそれが使えないため、このサイトの署名つき
   リンクを付けます。署名の鍵は SESSION_SECRET です（変えると、それまでに
   送ったメールのリンクは「無効」になります。メールの返信で止める依頼は
   いつでも受けられます）。 */
const enc = new TextEncoder()
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}
const unsubSecret = () => setting('SESSION_SECRET', 'lumenium-dev-secret-change-me')

export async function unsubscribeToken(email, secret) {
  return hmac(secret || (await unsubSecret()), 'unsub:' + String(email || '').trim().toLowerCase())
}
export async function unsubscribeUrl(email, { test = false, secret } = {}) {
  const t = await unsubscribeToken(email, secret)
  return `${BRAND.url}/api/unsubscribe?e=${encodeURIComponent(String(email).trim().toLowerCase())}&t=${t}${test ? '&test=1' : ''}`
}
export async function verifyUnsubscribe(email, token, secret) {
  if (!email || !/^[0-9a-f]{32}$/.test(String(token || ''))) return false
  const want = await unsubscribeToken(email, secret)
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ String(token).charCodeAt(i)
  return diff === 0
}

/* ---- お知らせメールの中身 ---- */
export const RESEND_UNSUB = '{{{RESEND_UNSUBSCRIBE_URL}}}'
export const LIMITS = { subject: 120, body: 10000 }

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 本文の簡単な書式: 空行で段落、「■ 」で始まる行は見出し、「・」「- 」で
 *  始まる行は箇条書き、**太字**、URL はリンク。HTML は書けません（全部
 *  文字として出します）。 */
export function bodyHtml(text) {
  const inline = (s) => escHtml(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" style="color:#3d3fbf">${u}</a>`)
  const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  return blocks.map((b) => {
    const lines = b.split('\n').filter((l) => l.trim() !== '')
    if (!lines.length) return ''
    if (lines.every((l) => /^\s*(・|- )/.test(l))) {
      return '<ul style="margin:0 0 14px;padding-left:20px">' +
        lines.map((l) => `<li style="margin:2px 0">${inline(l.replace(/^\s*(・|- )/, ''))}</li>`).join('') + '</ul>'
    }
    // 見出しの行はそのまま見出しに、続く行は1つの段落にまとめます。
    let html = ''
    let para = []
    const flush = () => { if (para.length) html += `<p style="margin:0 0 14px">${para.join('<br>')}</p>`; para = [] }
    for (const l of lines) {
      if (/^■\s*/.test(l)) { flush(); html += `<h2 style="font-size:16px;margin:18px 0 6px">${inline(l.replace(/^■\s*/, ''))}</h2>` }
      else para.push(inline(l))
    }
    flush()
    return html
  }).join('')
}

/** 特定電子メール法で、メールに書く決まりのもの。
 *  送信者の名前・住所・問い合わせ先・配信停止の方法（リンク）。 */
export function footerParts({ sender, address, contact, unsubscribe }) {
  return {
    sender: String(sender || BRAND.name),
    address: String(address || '').trim(),
    contact: String(contact || '').trim(),
    unsubscribe: String(unsubscribe || ''),
  }
}

export function compose({ subject, body, footer }) {
  const f = footerParts(footer || {})
  const textFooter = [
    '――――――――――――――――',
    `送信者: ${f.sender}`,
    `住所: ${f.address || '（未設定）'}`,
    `お問い合わせ: ${f.contact || BRAND.url}`,
    'このメールは、会員登録の際にお知らせメールの受け取りに同意いただいた方にお送りしています。',
    `配信の停止: ${f.unsubscribe}`,
  ].join('\n')
  const htmlFooter =
    '<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 12px">' +
    '<p style="font-size:12px;color:#666;line-height:1.8;margin:0">' +
    `送信者: ${escHtml(f.sender)}<br>住所: ${escHtml(f.address || '（未設定）')}<br>` +
    `お問い合わせ: ${escHtml(f.contact || BRAND.url)}<br>` +
    'このメールは、会員登録の際にお知らせメールの受け取りに同意いただいた方にお送りしています。<br>' +
    `今後このメールが不要な方は <a href="${escHtml(f.unsubscribe)}" style="color:#3d3fbf">配信を停止する</a></p>`
  const html =
    '<!doctype html><html lang="ja"><body style="margin:0;padding:0;background:#fff">' +
    '<div style="max-width:600px;margin:0 auto;padding:24px 18px;font-family:sans-serif;font-size:15px;line-height:1.8;color:#222">' +
    bodyHtml(body) + htmlFooter + '</div></body></html>'
  return { subject: String(subject || '').trim(), text: `${String(body || '').trim()}\n\n${textFooter}\n`, html }
}

/** 送れるか。送れないときは、直し方まで書いた文を返します。 */
export function sendBlockers({ from, address, subject, body, count }) {
  const out = []
  if (senderInfo(from).sandbox) out.push({ code: 'SANDBOX', text: '送信元が Resend の試用アドレス（onboarding@resend.dev）のままです。この状態では、Resend に登録した本人のアドレス以外には届かないため、一斉のお知らせメールは送れません。' })
  if (!String(address || '').trim()) out.push({ code: 'NO_ADDRESS', text: '送信者の住所が未設定です。特定電子メール法で、お知らせメールには送信者の住所を書くことが決まっています。「設定状況 › キーの入力」の「お知らせメールに書く住所」に入れてください。' })
  if (!String(subject || '').trim()) out.push({ code: 'NO_SUBJECT', text: '件名を入れてください。' })
  if (!String(body || '').trim()) out.push({ code: 'NO_BODY', text: '本文を入れてください。' })
  if (String(subject || '').length > LIMITS.subject) out.push({ code: 'LONG', text: `件名は${LIMITS.subject}文字までです。` })
  if (String(body || '').length > LIMITS.body) out.push({ code: 'LONG', text: `本文は${LIMITS.body}文字までです。` })
  if (count != null && count < 1) out.push({ code: 'NOBODY', text: '送る相手がいません（配信を止めた人には送りません）。' })
  return out
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')) && String(s).length <= 100

/** 共有リンクの一覧と Excel 用。会員の配列か、取れなければ null。 */
export async function listContacts(apiKey) {
  const r = await listMembers(apiKey)
  return r ? r.members : null
}
