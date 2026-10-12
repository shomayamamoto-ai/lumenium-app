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

/* 操作（本文の action）の呼び名。記録には英字の名前で残し、画面と CSV でこの言葉にします。
   ここに無い名前は、そのまま出します。 */
export const ACTION_LABEL = {
  post: '投稿', add: '追加', create: '作成', save: '保存', update: '更新', edit: '修正', delete: '削除', remove: '削除',
  send: '送信', reply: '返信', 'reply-delete': '返信を削除', draft: 'AIの下書き', 'draft-save': '下書きを保存', 'draft-delete': '下書きを削除',
  duplicate: '複製', invoice: '請求書を作成', 'from-inquiry': '問い合わせから作成', catalog: 'よく使う品目', settings: '設定',
  status: '状態を変更', memo: 'メモ', move: '日時を変更', cancel: '取り消し', confirmed: '確定', open: '開封の記録',
  sync: 'Googleから読み直し', prefs: '設定', locations: '店舗の一覧', 'request-send': '口コミのお願いを送信',
  schedule: '予約投稿', reschedule: '予約の日付を変更', 'queue-item': '予約を直すために読み込み', retry: '送り直し',
  'approval-create': '承認をお願い', 'approval-send': '承認の連絡を送信', 'approval-schedule': '承認済みを予約', 'approval-delete': '承認の依頼を削除',
  inbox: 'コメントを読み込み', 'inbox-reply': 'コメントに返信', 'inbox-hide': 'コメントを非表示', metrics: '反応を取得',
  'refresh-threads': 'Threadsのトークンを延長', 'gbp-locations': 'Googleの店舗一覧', 'gbp-pick': '投稿する店舗を選択',
  link: 'つなぐ', unsubscribe: '配信を停止', test: 'テスト送信', toggle: '切り替え', enable: '有効にする', disable: '止める',
  revoke: '取り消し', reset: '作り直し', kill: '止める', revert: 'この時点に戻す',
  start: '計測を開始', probe: '質問を送信', judge: '回答を判定', finalize: '集計', finish: '終了', check: '確認', ask: '相談',
  'domain.block': '迷惑ドメインを止める', 'mail.cancel': 'お知らせメールの予約を取り消し', 'mail.count': '送る人数を確認',
  'mail.preview': 'お知らせメールの見本', 'mail.send': 'お知らせメールを送信', 'mail.test': 'お知らせメールのテスト送信',
  'segment.create': 'グループを作成', 'segment.delete': 'グループを削除', 'segment.join': 'グループに入れる', 'segment.leave': 'グループから外す',
  'settings.save': '設定を保存', 'template.save': '定型文を保存', 'template.delete': '定型文を削除',
  'todo.add': 'ToDoを追加', 'todo.done': 'ToDoを済みに', 'todo.undo': 'ToDoを戻す', 'todo.delete': 'ToDoを削除', 'conv.delete': '相談を削除',
  'exp.start': '試しを開始', 'exp.stop': '試しを止める', 'exp.adopt': '試しを採用', 'exp.revert': '試しを元に戻す', 'log.undo': '変更を取り消し',
  'proposal.add': '提案を追加', 'proposal.adopt': '提案を採用', 'proposal.dismiss': '提案を見送り',
  'auto-now': '自動改善を今すぐ実行', 'auto-save': '自動改善の設定', handoff: '引き継ぎ', 'handoff-apply': '引き継ぎを反映', string: '文字の設定',
}
export function actionLabel(act) { return act ? ACTION_LABEL[act] || act : '' }
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
    e.name, ROLE_LABEL[e.role] || e.role, AREA_LABEL[e.area] || e.area, e.ep, e.m, actionLabel(e.act), e.target, e.ip,
    RESULT_LABEL[e.result] || e.result,
  ])
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
