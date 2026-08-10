export const config = { runtime: 'edge' }

import { issueSession } from './_session.js'
import { addContact } from './_resend-audience.js'

// New-member registration: capture name+email, grant a session immediately,
// and (best-effort) email the member code for future logins on other devices.
// Failures collapse into one generic code — no probing which part failed.
const FAIL = { ok: false, code: 'REGISTER_FAILED' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Best-effort per-instance rate limit: 5 registrations / 15 min per IP.
const WINDOW_MS = 15 * 60 * 1000
const MAX_HITS = 5
const hits = new Map()

function limited(ip) {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    if (hits.size > 1000) hits.clear()
    return false
  }
  rec.count += 1
  return rec.count > MAX_HITS
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  let payload
  try {
    payload = await req.json()
  } catch {
    return json(FAIL, 400)
  }

  const name = String(payload?.name ?? '').trim()
  const email = String(payload?.email ?? '').trim()
  const company = String(payload?.company ?? '').trim()

  if (limited(ip)) return json(FAIL, 429)
  if (!name || name.length > 50) return json(FAIL, 400)
  if (!email || !EMAIL_RE.test(email) || email.length > 100) return json(FAIL, 400)
  if (company.length > 80) return json(FAIL, 400)

  // Registration = instant membership (12h session; the emailed code covers
  // longer-term / cross-device access).
  const { token, maxAge } = await issueSession(false)

  // Best-effort side effects — registration must succeed even if these fail.
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    // Persist the lead into the Resend audience (member list page reads this).
    await addContact(apiKey, { name, email, company }).catch((err) =>
      console.error('[api/register] addContact failed', err)
    )
    const memberCode = process.env.MEMBER_CODE || 'LUMEN2026'
    const from = process.env.CONTACT_FROM_EMAIL || 'Lumenium <onboarding@resend.dev>'
    const owner = process.env.CONTACT_TO_EMAIL || 'shoma.yamamoto@lumenium.net'
    const send = (body) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch((err) => console.error('[api/register] mail error', err))
    // Welcome mail with the member code (to the registrant)
    await send({
      from,
      to: [email],
      subject: '【Lumenium】会員登録が完了しました',
      text:
        `${name} 様\n\nLumenium 会員登録ありがとうございます。\n` +
        `ミニゲームで遊ぶ際の会員コードは以下のとおりです。\n\n` +
        `会員コード: ${memberCode}\n\n` +
        `ログインページ: https://lumenium.net/login.html\n\n` +
        `※このメールに心当たりがない場合は破棄してください。\n\n` +
        `Lumenium — 散文化した目的に、焦点を当てる。\nhttps://lumenium.net`,
    })
    // Lead notification (to the owner)
    await send({
      from,
      to: [owner],
      reply_to: email,
      subject: `【会員登録】${name} 様が登録しました`,
      text: `新規会員登録がありました。\n\nお名前: ${name}\n会社名: ${company || '（未入力）'}\nメール: ${email}\nIP: ${ip}`,
    })
  } else {
    console.error('[api/register] RESEND_API_KEY not set — skipped code email')
  }

  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  const base = `Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`
  headers.append('Set-Cookie', `lum_session=${token}; ${base}; HttpOnly`)
  headers.append('Set-Cookie', `lum_member=1; ${base}`)
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
