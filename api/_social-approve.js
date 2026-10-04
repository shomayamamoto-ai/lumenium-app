// SNS（文章）の承認の流れ（担当者 → 責任者）。
//
// 担当者が作った投稿を「承認待ち」として保存し、責任者に送る1回きりのリンクを
// 作ります。責任者は管理画面の鍵が無くても、そのリンクから SNS ごとの見え方と
// 投稿前チェックの結果を見て「承認」か「差し戻し（コメントつき）」を選べます。
//
// リンクの仕組みは会員一覧の共有リンク（_share.js）と同じです：保存するのは
// リンクの文字列そのものではなく、その SHA-256 だけ。期限は7日、用途は
// 'social-approve' に固定し、1つの下書き（ref）にだけ効きます。承認か差し戻しを
// 押した時点でリンクは消える（1回きり）ので、転送されても二度は押せません。
//
// 承認されたものは、管理画面から投稿・予約します。担当者が日付を決めていた
// ときは、承認と同時にその日の予約に入れます（予約が使えない設定のときは
// 「承認済み」のまま残し、管理画面から出します）。
//
//   ${KV}social:approve  … HASH  id → { id, status, createdAt, payload, date, note,
//                                      comment, decidedAt, tokenHash, scheduledId, error }
//   status: pending（承認待ち） / approved（承認済み） / returned（差し戻し）
//           / scheduled（承認済み・予約済み） / done（投稿済み）
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { createShare, useShare, revokeHash } from './_share.js'
import { addScheduled } from './_social-queue.js'

export const APPROVE_KEY = `${KV}social:approve`
export const APPROVE_SCOPE = 'social-approve'
export const APPROVE_DAYS = 7
export const APPROVE_MAX = 30
export const STATUS_LABEL = { pending: '承認待ち', approved: '承認済み', returned: '差し戻し', scheduled: '承認済み・予約済み', done: '投稿済み' }

const NO_STORE = '承認の流れには、保存先（Upstash Redis）を Vercel の環境変数につなぐ必要があります（責任者はこの管理画面を開かずにリンクから見るため、この端末にだけ保存した保存先は使えません）。'

async function readAll() {
  const cfg = storeConfig()
  if (!cfg) return []
  try {
    const [flat] = await pipeline(cfg, [['HGETALL', APPROVE_KEY]])
    const out = []
    const a = Array.isArray(flat) ? flat : []
    for (let i = 0; i + 1 < a.length; i += 2) { try { out.push(JSON.parse(a[i + 1])) } catch (_) {} }
    return out.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))
  } catch (_) { return [] }
}

async function write(item) {
  await pipeline(storeConfig(), [['HSET', APPROVE_KEY, item.id, JSON.stringify(item)]])
}

export async function getApproval(id) {
  const cfg = storeConfig()
  if (!cfg) return null
  const [raw] = await pipeline(cfg, [['HGET', APPROVE_KEY, String(id || '')]])
  try { return raw ? JSON.parse(raw) : null } catch (_) { return null }
}

/** 承認待ちとして保存し、1回きりのリンク（の文字列）を返します。
 *  token はこの返事にしか出ません（保存するのはハッシュだけ）。 */
export async function createApproval(payload, { date, note } = {}) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: NO_STORE }
  const [count] = await pipeline(cfg, [['HLEN', APPROVE_KEY]])
  if (Number(count) >= APPROVE_MAX) return { ok: false, message: `承認の記録は${APPROVE_MAX}件までです。済んだものを消してから作ってください。` }
  const id = crypto.randomUUID()
  const made = await createShare({ label: 'SNSの承認', days: APPROVE_DAYS, scope: APPROVE_SCOPE, ref: id, listed: false })
  if (!made) return { ok: false, message: NO_STORE }
  const item = {
    id, status: 'pending', createdAt: new Date().toISOString(),
    expiresAt: made.link.expiresAt,
    payload,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : '',
    note: String(note || '').replace(/\r/g, '').trim().slice(0, 300),
    comment: '', decidedAt: null, tokenHash: made.hash,
  }
  await write(item)
  return { ok: true, item, token: made.token }
}

/** リンクから開いたとき。使えないリンクなら null。 */
export async function openApproval(token) {
  const rec = await useShare(token, APPROVE_SCOPE)
  if (!rec || !rec.ref) return null
  const item = await getApproval(rec.ref)
  if (!item || item.status !== 'pending') return null
  return item
}

/** 責任者の判断。approve / return。押したらリンクは消えます（1回きり）。 */
export async function decideApproval(token, decision, comment) {
  const item = await openApproval(token)
  if (!item) return { ok: false, message: 'このリンクは使えません（期限切れ、取り下げ、またはもう判断済みです）。' }
  if (decision !== 'approve' && decision !== 'return') return { ok: false, message: '承認か差し戻しを選んでください。' }
  const c = String(comment || '').replace(/\r/g, '').trim().slice(0, 500)
  if (decision === 'return' && !c) return { ok: false, retry: true, message: '差し戻すときは、どこを直してほしいかを一言書いてください。' }
  item.status = decision === 'approve' ? 'approved' : 'returned'
  item.comment = c
  item.decidedAt = new Date().toISOString()
  await revokeHash(item.tokenHash)
  item.tokenHash = ''
  // 日付が決まっていれば、承認と同時に予約します。
  if (item.status === 'approved' && item.date) {
    const r = await addScheduled(item.date, item.payload)
    if (r.ok) { item.status = 'scheduled'; item.scheduledId = r.item.id }
    else item.error = '予約に入れられませんでした：' + r.message + ' 管理画面から投稿・予約してください。'
  }
  await write(item)
  return { ok: true, item }
}

/** 管理画面から：投稿した・予約した、の印。 */
export async function markApproval(id, patch) {
  const item = await getApproval(id)
  if (!item) return null
  Object.assign(item, patch)
  await write(item)
  return item
}

/** 管理画面から：取り下げ・記録から消す。リンクも一緒に消します。 */
export async function removeApproval(id) {
  const item = await getApproval(id)
  if (!item) return false
  if (item.tokenHash) await revokeHash(item.tokenHash)
  await pipeline(storeConfig(), [['HDEL', APPROVE_KEY, item.id]])
  return true
}

/** 管理画面の一覧（新しい順）。中身（payload）も返します——「編集に戻す」で使うため。 */
export async function listApprovals() {
  const now = Date.now()
  return (await readAll()).map((i) => ({
    id: i.id, status: i.status, label: STATUS_LABEL[i.status] || i.status,
    createdAt: i.createdAt, decidedAt: i.decidedAt, date: i.date || '', note: i.note || '', comment: i.comment || '',
    error: i.error || '', scheduledId: i.scheduledId || '',
    expired: i.status === 'pending' && i.expiresAt ? Date.parse(i.expiresAt) < now : false,
    targets: (i.payload && i.payload.targets) || [], text: String((i.payload && i.payload.text) || '').slice(0, 140),
    payload: i.payload,
  }))
}

export function approvalUrl(base, token) {
  return `${String(base).replace(/\/$/, '')}/api/social-approve?t=${encodeURIComponent(token)}`
}
