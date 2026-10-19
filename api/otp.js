export const config = { runtime: 'edge' }

// 自分の2段階認証（担当者がログインしているとき）。中身の計算は _totp.js。
//
//   GET                              -> { on, required, recoveryLeft, owner }
//   POST { action:'start' }          -> 新しい秘密の値を作り、認証アプリに読ませる形を返す（まだオンにはしない）
//   POST { action:'enable', code }   -> アプリの6けたが合えばオン。予備のコード（8つ）を1回だけ返す
//   POST { action:'disable', code }  -> 6けた（か予備のコード）が合えばオフ（決まりで必須のときはできない）
//   POST { action:'recovery', code } -> 予備のコードを作り直す
//
// オーナーの管理キー（Vercel の ADMIN_KEY）は、ここでは扱いません。長い乱数のキーで、
// オーナーだけが持つものです。ふだんの作業は担当者のキー＋2段階認証で、という使い分けを勧めます。

import { requireAdmin, json, whoOf } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import { getStaff, putStaff, readPolicy, otpOn } from './_staff.js'
import { newSecret, otpauthUri, verifyTotp, newRecoveryCodes, checkSecondFactor } from './_totp.js'
import { BRAND } from './_brand.js'

const OWNER_NOTE = 'オーナーの管理キーは、Vercel の環境変数（ADMIN_KEY）にある長い乱数のキーです。2段階認証は、担当者のキーで入る人が使います。ふだんの作業はオーナーも担当者のキー（管理者の役割）＋2段階認証で行い、管理キーは保管しておく使い方がおすすめです。'

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const who = whoOf(req)
  const cfg = storeConfig()
  const policy = await readPolicy(cfg)
  if (who.via === 'owner' || who.id === 'owner') return json({ ok: true, owner: true, required: policy.otpRequired, message: OWNER_NOTE })
  const rec = await getStaff(who.id, cfg)
  if (!rec) return json({ ok: false, message: 'あなたの記録が見つかりませんでした。' }, 404)
  return json({ ok: true, owner: false, on: otpOn(rec), required: policy.otpRequired, recoveryLeft: otpOn(rec) ? (rec.totp.recovery || []).length : 0 })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const who = whoOf(req)
  if (who.via === 'owner' || who.id === 'owner') return json({ ok: false, message: OWNER_NOTE }, 400)
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: '保存先が無いため使えません。' }, 503)
  let b = null
  try { b = await req.json() } catch (_) {}
  const action = String((b && b.action) || '')
  const rec = await getStaff(who.id, cfg)
  if (!rec) return json({ ok: false, message: 'あなたの記録が見つかりませんでした。' }, 404)
  const now = new Date().toISOString()

  if (action === 'start') {
    if (otpOn(rec)) return json({ ok: false, message: 'すでにオンです。作り直すときは、いったんオフにしてください。' }, 400)
    const secret = newSecret()
    rec.totpPending = { secret, at: now }
    await putStaff(rec, cfg)
    return json({ ok: true, secret, uri: otpauthUri(BRAND.name || '管理画面', rec.name, secret) })
  }
  if (action === 'enable') {
    const p = rec.totpPending
    if (!p || !p.secret || Date.now() - Date.parse(p.at) > 30 * 60000) return json({ ok: false, message: '最初からやり直してください（「設定を始める」から30分を過ぎました）。' }, 400)
    if (!(await verifyTotp(p.secret, b && b.code))) return json({ ok: false, message: 'コードが合いません。認証アプリの、いま出ている6けたを入れてください。スマートフォンの時刻が合っているかも確かめてください。' }, 400)
    const rc = await newRecoveryCodes()
    rec.totp = { on: true, secret: p.secret, recovery: rc.hashes, at: now }
    delete rec.totpPending
    await putStaff(rec, cfg)
    return json({ ok: true, on: true, codes: rc.codes, message: '2段階認証をオンにしました。次から、キーのあとに認証アプリの6けたを入れて入ります。' })
  }
  if (action === 'disable' || action === 'recovery') {
    if (!otpOn(rec)) return json({ ok: false, message: '2段階認証はオフです。' }, 400)
    if (action === 'disable' && (await readPolicy(cfg)).otpRequired) return json({ ok: false, message: 'オーナーが「担当者は2段階認証を必ず使う」にしているため、オフにはできません。スマートフォンを替えたときは、オーナーにリセットを頼んでください。' }, 400)
    const r = await checkSecondFactor(rec.totp, b && b.code)
    if (!r.ok) return json({ ok: false, message: 'コードが合いません。' }, 400)
    if (action === 'disable') {
      delete rec.totp
      await putStaff(rec, cfg)
      return json({ ok: true, on: false, message: '2段階認証をオフにしました。' })
    }
    const rc = await newRecoveryCodes()
    rec.totp.recovery = rc.hashes
    await putStaff(rec, cfg)
    return json({ ok: true, on: true, codes: rc.codes, message: '予備のコードを作り直しました。前の予備のコードはもう使えません。' })
  }
  return json({ ok: false, message: 'その操作はありません。' }, 400)
}
