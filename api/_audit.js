// 操作の記録（だれが・いつ・どの画面で・何をしたか）。
//
// requireAdmin を通る書き込み（POST / PUT / PATCH / DELETE）を、通したもの
// も断ったものも1行ずつ残します。残すのは要約だけです——本文・キー・
// メールの中身・お客様の名前などは入れません。対象は id のような短い印だけ。
// 接続元も IP そのものではなく、ADMIN_KEY を混ぜたハッシュの頭12文字です
// （同じ端末からかどうかは分かり、IP は戻せません）。
//
//   ${KV}audit … LIST（新しいものが先頭）。最大 5,000 件、180 日。
//
// 「結果」は権限の確認の時点のものです（通した / 断った / ログイン失敗）。
// 通したあと窓口の中で失敗したかどうかまでは入りません。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { AREA_LABEL, ROLE_LABEL } from './_permissions.js'

export const AUDIT_KEY = `${KV}audit`
export const AUDIT_MAX = 5000
export const AUDIT_DAYS = 180
export const RESULT_LABEL = { ok: '通した', denied: '断った', failed: 'ログイン失敗', login: 'ログイン' }
const DAY = 86400000

const enc = new TextEncoder()

/** 接続元のハッシュ。生の IP は残しません。 */
export async function ipHash(ip, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode('lum:audit-ip:v1:' + String(secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(ip || 'unknown')))
  return [...new Uint8Array(sig)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 印として残してよい形だけ（英数と - _ . :、60字まで。@ は入れないのでメールアドレスは残りません）。それ以外は捨てます。 */
export function safeRef(v) {
  if (Array.isArray(v)) return v.length ? `${v.length}件` : ''
  const s = String(v == null ? '' : v).trim()
  return /^[A-Za-z0-9_.:-]{1,60}$/.test(s) && !/^lsk_|^lss\./.test(s) ? s : ''
}

/** 本文から「何に対して」だけを拾います。値（文章・キー・宛先）は見ません。 */
export function targetOf(endpoint, body, url) {
  const b = body && typeof body === 'object' ? body : {}
  const q = url ? url.searchParams : null
  const cand = [b.id, b.ids, b.project, b.key && endpoint === 'booking' ? b.key : '', b.net, b.segment,
    endpoint === 'settings' ? b.name : '', endpoint === 'settings-test' ? b.target : '', q && q.get('id'), q && q.get('kind')]
  for (const c of cand) {
    const r = safeRef(c)
    if (r) return r
  }
  return ''
}

/** 1行の形。ここに無い項目は入りません。 */
export function entry({ who, area, endpoint, method, action, target, ip, result, at }) {
  return {
    at: at || new Date().toISOString(),
    by: String((who && who.id) || ''),
    name: String((who && who.name) || '').slice(0, 40),
    role: String((who && who.role) || ''),
    area: String(area || 'other'),
    ep: String(endpoint || ''),
    m: String(method || '').toUpperCase(),
    act: safeRef(action),
    target: safeRef(target),
    ip: String(ip || ''),
    result: RESULT_LABEL[result] ? result : 'ok',
  }
}

export async function record(e, cfg = storeConfig()) {
  if (!cfg) return
  try {
    await pipeline(cfg, [
      ['LPUSH', AUDIT_KEY, JSON.stringify(e)],
      ['LTRIM', AUDIT_KEY, 0, AUDIT_MAX - 1],
      // 180日だれも何もしなければ、記録ごと消えます。
      ['EXPIRE', AUDIT_KEY, AUDIT_DAYS * 86400],
    ])
  } catch (_) { /* 記録が書けなくても、操作そのものは止めません */ }
}

/** 古すぎる・壊れた行を除きます（純粋な関数。テストと読み出しで使います）。 */
export function keep(list, now = Date.now()) {
  const since = now - AUDIT_DAYS * DAY
  const out = []
  for (const raw of list || []) {
    let e = raw
    if (typeof raw === 'string') { try { e = JSON.parse(raw) } catch (_) { continue } }
    if (!e || typeof e !== 'object') continue
    const t = Date.parse(e.at)
    if (!(t >= since)) continue
    out.push(e)
  }
  return out.slice(0, AUDIT_MAX)
}

/** 末尾（いちばん古い側）から、期限切れの数。 */
export function expiredTail(list, now = Date.now()) {
  const since = now - AUDIT_DAYS * DAY
  let n = 0
  for (let i = list.length - 1; i >= 0; i--) {
    let t = NaN
    try { t = Date.parse(JSON.parse(list[i]).at) } catch (_) {}
    if (t >= since) break
    n++
  }
  return n
}

export async function readAll(cfg = storeConfig(), now = Date.now()) {
  if (!cfg) return []
  const [list] = await pipeline(cfg, [['LRANGE', AUDIT_KEY, 0, AUDIT_MAX - 1]])
  const arr = Array.isArray(list) ? list : []
  // 読むついでに、期限切れの尻尾を本当に消します。
  const drop = expiredTail(arr, now)
  if (drop) { try { await pipeline(cfg, [['LTRIM', AUDIT_KEY, 0, arr.length - drop - 1]]) } catch (_) {} }
  return keep(arr, now)
}

/** 絞り込み（だれ・画面・日付 YYYY-MM-DD は JST）。 */
export function filter(list, { by, area, from, to } = {}) {
  const jst = (iso) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10)
  return list.filter((e) =>
    (!by || e.by === by) && (!area || e.area === area) &&
    (!from || jst(e.at) >= from) && (!to || jst(e.at) <= to))
}

/** 表計算ソフトが式として読まないように（=, +, -, @ で始まる値の前に '）。 */
export function csvCell(v) {
  let s = String(v == null ? '' : v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv(list) {
  const head = ['日時（日本時間）', '名前', '役割', '画面', '窓口', 'やり方', '操作', '対象', '接続元（ハッシュ）', '結果']
  const rows = list.map((e) => [
    new Date(Date.parse(e.at) + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
    e.name, ROLE_LABEL[e.role] || e.role, AREA_LABEL[e.area] || e.area, e.ep, e.m, e.act, e.target, e.ip,
    RESULT_LABEL[e.result] || e.result,
  ])
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
