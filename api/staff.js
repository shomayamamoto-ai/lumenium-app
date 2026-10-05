export const config = { runtime: 'edge' }

// 担当者と権限（オーナーだけ）。
//
//   GET                                       -> { ready, staff, roles }
//   POST { action:'create', name, email?, role } -> { key }  ← キーはこの返事にだけ出ます
//   POST { action:'update', id, name?, email?, role? }
//   POST { action:'disable' | 'enable', id }     止める・戻す（止めるとその場でログアウト）
//   POST { action:'reset', id }                  キーを作り直す（古いキーとログイン中の画面は無効）
//   POST { action:'remove', id }                 消す（操作の記録は残ります）
//
// 権限は requireAdmin が api/_permissions.js の表で確かめます（staff はオーナーだけ）。
// しくみと保存の形は api/_staff.js にあります。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import { ROLE_LABEL } from './_permissions.js'
import {
  allStaff, getStaff, putStaff, removeStaff, publicStaff, makeCredential, newId, cleanInput,
  STAFF_ROLES, MAX_STAFF,
} from './_staff.js'

const NO_STORE = '担当者の機能には、保存先（Upstash Redis）を Vercel の環境変数につなぐ必要があります。いまはオーナーの管理キーだけで使えます。'
const ROLES = STAFF_ROLES.map((r) => ({ id: r, label: ROLE_LABEL[r] }))

async function list(cfg) {
  return (await allStaff(cfg)).map(publicStaff)
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: true, ready: false, staff: [], roles: ROLES, message: NO_STORE })
  try {
    return json({ ok: true, ready: true, staff: await list(cfg), roles: ROLES })
  } catch (e) {
    return json({ ok: false, message: '保存先から読めませんでした。少し待ってから開き直してください。' }, 503)
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, code: 'NOT_CONFIGURED', message: NO_STORE }, 503)
  let b = null
  try { b = await req.json() } catch (_) {}
  if (!b || typeof b.action !== 'string') return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400)
  const now = new Date().toISOString()

  if (b.action === 'create') {
    const c = cleanInput(b)
    if (!c.ok) return json({ ok: false, message: c.message }, 400)
    const all = await allStaff(cfg)
    if (all.length >= MAX_STAFF) return json({ ok: false, message: `担当者は${MAX_STAFF}人までです。使わない人を消してから足してください。` }, 400)
    if (all.some((x) => x.name === c.value.name)) return json({ ok: false, message: '同じ名前の人がいます。見分けがつく名前にしてください。' }, 400)
    const id = newId()
    const cred = await makeCredential(id)
    const rec = {
      id, ...c.value, active: true, createdAt: now, lastLoginAt: null, keyIssuedAt: now,
      salt: cred.salt, hash: cred.hash, iter: cred.iter, gen: 1,
    }
    await putStaff(rec, cfg)
    return json({
      ok: true, key: cred.key, member: publicStaff(rec), staff: await list(cfg),
      message: `${rec.name}さんを足しました。下のキーは今だけ表示します。コピーして本人に渡してください。`,
    })
  }

  const rec = await getStaff(String(b.id || ''), cfg)
  if (!rec) return json({ ok: false, message: 'その人は見つかりませんでした。', staff: await list(cfg) }, 404)

  if (b.action === 'update') {
    const c = cleanInput(b, { partial: true })
    if (!c.ok) return json({ ok: false, message: c.message }, 400)
    const roleChanged = c.value.role && c.value.role !== rec.role
    Object.assign(rec, c.value)
    // 役割が変わったら、ログイン中の画面にも新しい役割が効くよう入り直してもらいます。
    if (roleChanged) rec.gen = (Number(rec.gen) || 0) + 1
    await putStaff(rec, cfg)
    return json({ ok: true, staff: await list(cfg), message: roleChanged ? '役割を変えました。本人はもう一度キーで入り直します。' : '保存しました。' })
  }
  if (b.action === 'disable' || b.action === 'enable') {
    rec.active = b.action === 'enable'
    if (!rec.active) rec.gen = (Number(rec.gen) || 0) + 1
    await putStaff(rec, cfg)
    return json({ ok: true, staff: await list(cfg), message: rec.active ? '使えるように戻しました。' : '止めました。ログイン中の画面もすぐに使えなくなります。' })
  }
  if (b.action === 'reset') {
    const cred = await makeCredential(rec.id)
    Object.assign(rec, { salt: cred.salt, hash: cred.hash, iter: cred.iter, keyIssuedAt: now, gen: (Number(rec.gen) || 0) + 1 })
    await putStaff(rec, cfg)
    return json({
      ok: true, key: cred.key, member: publicStaff(rec), staff: await list(cfg),
      message: `${rec.name}さんのキーを作り直しました。古いキーはもう使えません。新しいキーは今だけ表示します。`,
    })
  }
  if (b.action === 'remove') {
    await removeStaff(rec.id, cfg)
    return json({ ok: true, staff: await list(cfg), message: `${rec.name}さんを消しました（操作の記録は残ります）。` })
  }
  return json({ ok: false, message: 'その操作はありません。' }, 400)
}
