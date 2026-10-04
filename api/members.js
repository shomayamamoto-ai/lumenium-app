export const config = { runtime: 'edge' }

// 会員リストの操作（管理者のみ）。一覧そのものは api/members-list.js です。
//
//   GET  /api/members?id=<contact id>      1人（名前・会社・配信の状態・同意の記録・グループ）
//   GET  /api/members?view=audit           削除・配信停止の記録（個人を指す値は無し）
//   POST /api/members {action, ...}
//        update          {id, name, company}        名前と会社名を直す
//        unsubscribe     {id}                       配信を止める（元に戻すのは本人だけ）
//        delete          {id, email, reason}        削除（個人情報の削除の依頼など）
//        segment.create  {name}                     グループを作る
//        segment.delete  {segment}                  グループを消す（会員は消えません）
//        segment.join    {id, segment}              グループに入れる
//        segment.leave   {id, segment}              グループから外す
//
// 配信停止を管理画面から「受け取る」に戻すことはできません。本人が止めた
// ものを事業者の側で戻すと、特定電子メール法の「拒否した人に送らない」に
// 反するためです。もう一度受け取りたい人には、登録し直してもらいます。

import { requireAdmin, json } from './_admin-auth.js'
import { setting } from './_settings.js'
import {
  getMember, updateMember, deleteMember, readConsent, forgetConsent, auditEntry, writeAudit, readAudit,
  createSegment, deleteSegment, joinSegment, leaveSegment, whereMembers,
} from './_members.js'

const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v)
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n)

const NO_KEY = {
  ok: false, code: 'NOT_CONFIGURED',
  message: '会員リストは未設定です。メール送信サービス Resend の API キー（RESEND_API_KEY）を「設定状況 › キーの入力」に入れると使えます。',
}
const UPSTREAM = (what) => json({
  ok: false, code: 'UPSTREAM_ERROR',
  message: `${what}できませんでした（Resend 側の応答がありません）。少し時間をおいて、もう一度お試しください。`,
}, 502)
const NOT_FOUND = json({ ok: false, code: 'NOT_FOUND', message: 'その会員は見つかりませんでした（すでに削除されたかもしれません）。一覧を「更新」してください。' }, 404)
const LEGACY = json({
  ok: false, code: 'LEGACY',
  message: 'この Resend のアカウントは古い形（Audiences）のままのため、グループは使えません。Resend の管理画面で Segments への移行が済むと使えるようになります。',
}, 409)

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const apiKey = await setting('RESEND_API_KEY')
  if (!apiKey) return json(NO_KEY, 503)
  const u = new URL(req.url)

  if (u.searchParams.get('view') === 'audit') {
    const items = await readAudit(50)
    return json({ ok: true, stored: items !== null, items: items || [] })
  }

  const id = u.searchParams.get('id') || ''
  if (!idOk(id)) return json({ ok: false, message: '会員の指定が正しくありません。' }, 400)
  const m = await getMember(apiKey, id)
  if (!m) return NOT_FOUND
  const consent = await readConsent(m.email)
  return json({ ok: true, member: m, consent: consent.record, consentStored: consent.stored })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const apiKey = await setting('RESEND_API_KEY')
  if (!apiKey) return json(NO_KEY, 503)
  let b
  try { b = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  const action = String((b && b.action) || '')

  if (action === 'segment.create') {
    const name = clean(b.name, 50)
    if (!name) return json({ ok: false, message: 'グループの名前を入れてください。' }, 400)
    if ((await whereMembers(apiKey))?.mode === 'legacy') return LEGACY
    const r = await createSegment(apiKey, name)
    if (!r.ok) return UPSTREAM('グループを作成')
    return json({ ok: true, segment: { id: r.body.id, name, count: 0 } })
  }
  if (action === 'segment.delete') {
    if (!idOk(b.segment)) return json({ ok: false, message: 'グループの指定が正しくありません。' }, 400)
    const where = await whereMembers(apiKey)
    if (where && where.id === b.segment) return json({ ok: false, message: '会員全員のグループは消せません。' }, 400)
    const r = await deleteSegment(apiKey, b.segment)
    if (!r.ok && r.status !== 404) return UPSTREAM('グループを削除')
    return json({ ok: true })
  }

  if (!idOk(b.id)) return json({ ok: false, message: '会員の指定が正しくありません。' }, 400)

  if (action === 'segment.join' || action === 'segment.leave') {
    if (!idOk(b.segment)) return json({ ok: false, message: 'グループの指定が正しくありません。' }, 400)
    if ((await whereMembers(apiKey))?.mode === 'legacy') return LEGACY
    const r = await (action === 'segment.join' ? joinSegment : leaveSegment)(apiKey, b.id, b.segment)
    if (!r.ok && !(action === 'segment.leave' && r.status === 404)) return UPSTREAM(action === 'segment.join' ? 'グループに追加' : 'グループから外すことが')
    return json({ ok: true })
  }

  if (action === 'update') {
    const name = clean(b.name, 50)
    const company = clean(b.company, 80)
    if (!name) return json({ ok: false, message: 'お名前は空にできません。' }, 400)
    const r = await updateMember(apiKey, b.id, { name, company })
    if (r.status === 404) return NOT_FOUND
    if (!r.ok) return UPSTREAM('保存')
    return json({ ok: true })
  }

  if (action === 'unsubscribe') {
    const r = await updateMember(apiKey, b.id, { unsubscribed: true })
    if (r.status === 404) return NOT_FOUND
    if (!r.ok) return UPSTREAM('配信の停止が')
    const audited = await writeAudit(auditEntry('unsubscribe'))
    return json({ ok: true, audited })
  }

  if (action === 'delete') {
    // 画面に出ていた人と、いまの Resend の中身が同じ人であることを確かめて
    // から消します（一覧が古いまま、別の人を消さないように）。
    const m = await getMember(apiKey, b.id)
    if (!m) return NOT_FOUND
    if (String(b.email || '').trim().toLowerCase() !== m.email.toLowerCase()) {
      return json({ ok: false, message: '画面の会員と、Resend の中身が一致しません。一覧を「更新」してから、もう一度お試しください。' }, 409)
    }
    const consent = await readConsent(m.email)
    const r = await deleteMember(apiKey, b.id)
    if (!r.ok && r.status !== 404) return UPSTREAM('削除')
    const consentRemoved = consent.record ? await forgetConsent(m.email) : false
    const entry = auditEntry('delete', { reason: String(b.reason || ''), hadConsent: !!consent.record })
    const audited = await writeAudit(entry)
    return json({ ok: true, ref: entry.ref, at: entry.at, audited, consentRemoved })
  }

  return json({ ok: false, message: 'その操作はできません。' }, 400)
}
