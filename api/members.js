export const config = { runtime: 'edge' }

// 会員リストの操作（管理者のみ）。一覧そのものは api/members-list.js です。
//
//   GET  /api/members?id=<contact id>      1人（名前・会社・配信の状態・同意の記録・グループ）
//   GET  /api/members?view=audit           削除・配信停止の記録（個人を指す値は無し）
//   GET  /api/members?view=growth          増え方（月ごとの登録・配信停止・登録したページ）
//   POST /api/members {action, ...}
//        update          {id, name, company}        名前と会社名を直す
//        unsubscribe     {id}                       配信を止める（元に戻すのは本人だけ）
//        delete          {id, email, reason}        削除（個人情報の削除の依頼など）
//        segment.create  {name}                     グループを作る
//        segment.delete  {segment}                  グループを消す（会員は消えません）
//        segment.join    {id, segment}              グループに入れる
//        segment.leave   {id, segment}              グループから外す
//
//   お知らせメール（Resend の Broadcasts）
//   GET  /api/members?view=mail              送れるか（送信元・住所）と送った履歴
//   GET  /api/members?view=broadcast&id=…    1通の数字（届いた・開いた・押した…）
//   POST {action: 'mail.count',   segment}                    届く人数
//        {action: 'mail.preview', subject, body}             見本（実際と同じ中身）
//        {action: 'mail.test',    subject, body}             自分あてに1通
//        {action: 'mail.send',    subject, body, segment, scheduledAt?, confirmCount}
//        {action: 'mail.cancel',  id}                        予約の取り消し
//
// 送る前に画面で「◯人に送ります」と確かめてもらい、その人数を
// confirmCount で受け取ります。確かめたあとに人数が変わっていたら送らずに
// 新しい人数を返します（確かめた内容と違う送り方をしないため）。
//
// 配信停止を管理画面から「受け取る」に戻すことはできません。本人が止めた
// ものを事業者の側で戻すと、特定電子メール法の「拒否した人に送らない」に
// 反するためです。もう一度受け取りたい人には、登録し直してもらいます。

import { requireAdmin, json } from './_admin-auth.js'
import { setting } from './_settings.js'
import { BRAND } from './_brand.js'
import { senderInfo, DNS_STEPS } from './_sender.js'
import {
  getMember, updateMember, deleteMember, readConsent, forgetConsent, auditEntry, writeAudit, readAudit,
  createSegment, deleteSegment, joinSegment, leaveSegment, whereMembers,
  listMembers, allConsents, consentKey, growth, stopsByMonth,
  audienceFor, recipientCount, compose, sendBlockers, createBroadcast, cancelBroadcast, scheduleOk,
  logBroadcast, broadcastHistory, broadcastStats, unsubscribeUrl, resend, RESEND_UNSUB, LIMITS, mailFrom,
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
/** お知らせメールに必ず書くもの（特定電子メール法）。 */
async function footer(req, unsubscribe) {
  return {
    sender: BRAND.name,
    address: await setting('MAIL_SENDER_ADDRESS', '', req),
    contact: `${BRAND.url}/contact.html`,
    unsubscribe,
  }
}
async function mailState(req) {
  const from = mailFrom()
  const info = senderInfo(from)
  return {
    from, sandbox: info.sandbox, steps: info.sandbox ? DNS_STEPS : '',
    address: await setting('MAIL_SENDER_ADDRESS', '', req),
    owner: await setting('CONTACT_TO_EMAIL', BRAND.owner, req),
    limits: LIMITS,
  }
}

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

  const view = u.searchParams.get('view')
  if (view === 'mail') {
    const [state, history] = await Promise.all([mailState(req), broadcastHistory(apiKey)])
    return json({ ok: true, ...state, history: history.items, historyFromResend: history.remote })
  }
  if (view === 'broadcast') {
    const id = u.searchParams.get('id') || ''
    if (!idOk(id)) return json({ ok: false, message: 'メールの指定が正しくありません。' }, 400)
    return json({ ok: true, id, stats: await broadcastStats(apiKey, id) })
  }
  if (view === 'growth') {
    const [got, consents, audit] = await Promise.all([listMembers(apiKey), allConsents(), readAudit(500)])
    if (!got) return UPSTREAM('会員リストを読むことが')
    const keys = new Map()
    if (consents) for (const m of got.members) keys.set(m.email, await consentKey(m.email))
    const g = growth(got.members, consents, keys)
    return json({ ok: true, ...g, stops: stopsByMonth(audit || [], g.series.map((x) => x.month)), auditStored: audit !== null, truncated: got.truncated })
  }
  if (view === 'audit') {
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

  if (action.startsWith('mail.')) return mail(req, apiKey, action, b)

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

async function mail(req, apiKey, action, b) {
  const subject = clean(b.subject, LIMITS.subject + 1)
  const body = String(b.body == null ? '' : b.body).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, LIMITS.body + 1)
  const seg = b.segment ? String(b.segment) : ''
  if (seg && !idOk(seg)) return json({ ok: false, message: 'グループの指定が正しくありません。' }, 400)

  if (action === 'mail.cancel') {
    if (!idOk(b.id)) return json({ ok: false, message: 'メールの指定が正しくありません。' }, 400)
    const r = await cancelBroadcast(apiKey, b.id)
    if (!r.ok) return json({ ok: false, message: '取り消せませんでした。すでに送り始めているかもしれません。Resend の管理画面 › Broadcasts で確かめてください。' }, 409)
    return json({ ok: true })
  }

  if (action === 'mail.count') {
    const aud = await audienceFor(apiKey, seg)
    if (!aud) return UPSTREAM('人数を数えることが')
    return json({ ok: true, count: recipientCount(aud.members, ''), stopped: aud.members.filter((m) => m.unsubscribed).length })
  }

  if (action === 'mail.preview') {
    const out = compose({ subject, body, footer: await footer(req, '#preview-unsubscribe') })
    return json({ ok: true, ...out, blockers: sendBlockers({ from: mailFrom(), address: (await footer(req)).address, subject, body }) })
  }

  if (action === 'mail.test') {
    if (!subject || !body.trim()) return json({ ok: false, message: '件名と本文を入れてから送ってください。' }, 400)
    const state = await mailState(req)
    // 試し送りの配信停止リンクは、押しても何も止めない「見本」の印つき。
    const out = compose({ subject: `【テスト】${subject}`, body, footer: await footer(req, await unsubscribeUrl(state.owner, { test: true })) })
    const r = await resend(apiKey, '/emails', {
      method: 'POST',
      body: JSON.stringify({ from: state.from, to: [state.owner], subject: out.subject, html: out.html, text: out.text }),
    })
    if (!r.ok) return json({ ok: false, message: `テストのメールを送れませんでした（Resend の応答 ${r.status || 'なし'}）。` + (state.sandbox ? '送信元が試用アドレスのため、Resend に登録した本人のアドレスにしか届きません。宛先（CONTACT_TO_EMAIL）がそのアドレスか確かめてください。' : '') }, 502)
    return json({ ok: true, to: state.owner, sandbox: state.sandbox })
  }

  if (action === 'mail.send') {
    const state = await mailState(req)
    const when = scheduleOk(String(b.scheduledAt || ''))
    if (!when.ok) return json({ ok: false, message: when.text }, 400)
    const pre = sendBlockers({ from: state.from, address: state.address, subject, body })
    if (pre.length) return json({ ok: false, code: pre[0].code, blockers: pre, steps: state.steps, message: pre.map((x) => x.text).join(' ') }, 409)
    const aud = await audienceFor(apiKey, seg)
    if (!aud) return UPSTREAM('送る相手を確かめることが')
    const count = recipientCount(aud.members, '')
    const none = sendBlockers({ from: state.from, address: state.address, subject, body, count })
    if (none.length) return json({ ok: false, code: none[0].code, message: none[0].text }, 409)
    if (Number(b.confirmCount) !== count) {
      return json({ ok: false, code: 'COUNT_CHANGED', count, message: `送る相手の人数が ${count}人 に変わりました。人数を確かめて、もう一度「送信する」を押してください。` }, 409)
    }
    const out = compose({ subject, body, footer: await footer(req, RESEND_UNSUB) })
    const r = await createBroadcast(apiKey, {
      from: state.from, replyTo: state.owner, subject: out.subject, html: out.html, text: out.text,
      targetId: aud.targetId, legacy: aud.where.mode === 'legacy', scheduledAt: when.at,
    })
    if (!r.ok || !r.body?.id) {
      const why = r.body && r.body.message ? `（Resend: ${String(r.body.message).slice(0, 120)}）` : ''
      return json({ ok: false, message: `送れませんでした${why}。何も送られていません。少し時間をおいて、もう一度お試しください。` }, 502)
    }
    const group = seg ? String(b.segmentName || '').slice(0, 50) : '会員全員'
    await logBroadcast({ id: r.body.id, at: new Date().toISOString(), subject: out.subject, count, group, scheduledAt: when.at })
    return json({ ok: true, id: r.body.id, count, scheduledAt: when.at })
  }
  return json({ ok: false, message: 'その操作はできません。' }, 400)
}
