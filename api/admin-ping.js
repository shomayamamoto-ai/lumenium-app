export const config = { runtime: 'edge' }

import { requireAdmin, json, whoOf } from './_admin-auth.js'
import { ROLE_LABEL } from './_permissions.js'
import { signSession, getStaff, staffReady } from './_staff.js'
import { setting } from './_settings.js'
import { BRAND } from './_brand.js'

// The admin's login check, and nothing else. Logging in used to call
// /api/members-list, so a missing RESEND_API_KEY refused the login with a
// message about ADMIN_KEY, and a Resend outage said 「管理キーが正しくありません」
// to someone whose key was fine. Signing in now depends on ADMIN_KEY alone; the
// member list is loaded afterwards and says for itself when it cannot be read.
//
// It answers only "is this key right" and "who is this" — no data — so it is
// safe to call on every page load, and it uses the same lockout as every other
// admin endpoint.
//
//   ADMIN_KEY     -> { ok, who: オーナー, staff: 担当者の機能が使えるか }
//   担当者のキー  -> { ok, who, staff, session, expiresAt } … 画面はこの session を
//                    キーの代わりに持ち、生のキーはここで手放します。
//   session       -> { ok, who, staff }（作り直しはしません。12時間で切れます）

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const who = whoOf(req)
  const out = {
    ok: true,
    who: { id: who.id, name: who.name, role: who.role, roleLabel: ROLE_LABEL[who.role] || who.role },
    staff: staffReady(),
    // 管理画面の左上の会社名とロゴ（ADMIN_BRAND_NAME / ADMIN_LOGO_URL。無ければ SITE_NAME）。
    brand: await brandOf(req),
  }
  if (who.via === 'key') {
    const rec = await getStaff(who.id)
    const s = await signSession(rec, (process.env.ADMIN_KEY || '').trim())
    out.session = s.token
    out.expiresAt = s.expiresAt
  }
  return json(out)
}

async function brandOf(req) {
  try {
    const name = (await setting('ADMIN_BRAND_NAME', '', req)) || BRAND.name
    const logo = (await setting('ADMIN_LOGO_URL', '', req)) || ''
    return { name: String(name).slice(0, 60), logo: /^(https:\/\/|\/(?!\/))/.test(logo) ? logo.slice(0, 500) : '' }
  } catch (_) {
    return { name: BRAND.name, logo: '' }
  }
}
