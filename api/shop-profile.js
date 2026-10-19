export const config = { runtime: 'edge' }

// お店のプロフィール（管理者）。中身と欄は _shop-profile.js。
//   GET                     -> { profile, fields, filled }
//   POST { profile }        -> 保存

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import { PROFILE_FIELDS, GOAL_FIELDS, readProfile, saveProfile, profileFilled } from './_shop-profile.js'

const FIELDS = PROFILE_FIELDS.map(([key, label, hint, max]) => ({ key, label, hint, max }))
const GOALS = GOAL_FIELDS.map(([key, label, unit]) => ({ key, label, unit }))

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  const profile = await readProfile(cfg)
  return json({ ok: true, stored: !!cfg, profile, fields: FIELDS, goals: GOALS, filled: profileFilled(profile) })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: '保存先（Upstash Redis）が無いため保存できません。「設定状況」で保存先をつないでください。' }, 503)
  let b
  try { b = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  const profile = await saveProfile(cfg, (b && b.profile) || {})
  return json({ ok: true, profile, filled: profileFilled(profile), message: '保存しました。AIアドバイザーは、次の相談からこの内容を前提にします。' })
}
