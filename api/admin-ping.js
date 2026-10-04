export const config = { runtime: 'edge' }

import { requireAdmin, json } from './_admin-auth.js'

// The admin's login check, and nothing else. Logging in used to call
// /api/members-list, so a missing RESEND_API_KEY refused the login with a
// message about ADMIN_KEY, and a Resend outage said 「管理キーが正しくありません」
// to someone whose key was fine. Signing in now depends on ADMIN_KEY alone; the
// member list is loaded afterwards and says for itself when it cannot be read.
//
// It answers only "is this key right" — no data — so it is safe to call on
// every page load, and it uses the same lockout as every other admin endpoint.

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  return json({ ok: true })
}
