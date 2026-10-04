export const config = { runtime: 'edge' }

import { issueSession } from './_session.js'
import { setting } from './_settings.js'
import { addMember } from './_members.js'
import { hit, seenBefore, digest } from './_ratelimit.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { BRAND, KV } from './_brand.js'

// New-member registration: capture name+email, grant a session immediately,
// and (best-effort) email the member code for future logins on other devices.
// Failures collapse into one generic code — no probing which part failed.
//
// Hardening, and why:
//   · The limiter is the shared Redis one contact.js uses. The old in-memory
//     Map reset with every new serverless instance, so "5 per 15 minutes"
//     was closer to "unlimited".
//   · A honeypot field that people never see. Bots fill every field; a filled
//     one gets a plain success and nothing else (no session, no mail, no code),
//     so the bot learns nothing.
//   · Cloudflare Turnstile, only when both keys are set in 設定状況.
//   · An explicit consent checkbox. The welcome mail is a 特定電子メール (the
//     member code plus future notices), which needs opt-in; the old page
//     treated pressing 登録 as consent. Without the box ticked nothing is
//     registered and nothing is mailed. What was agreed to, when and from
//     which page is kept with the member (IP only as a one-way hash).
//   · The same address is mailed at most once a day, so the form cannot be
//     used to send the member code to someone else's inbox over and over.
const FAIL = { ok: false, code: 'REGISTER_FAILED' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const BURST = { max: 5, windowS: 15 * 60 }
const DAILY = { max: 20, windowS: 24 * 3600 }

/** 同意の文面の版。文面を変えたら上げると、誰がどの文面に同意したか分かります。 */
export const CONSENT_VERSION = '2026-10'

/** The page asks which extras to show (Turnstile's public site key). */
export async function GET() {
  const [siteKey, secret] = await Promise.all([setting('TURNSTILE_SITE_KEY'), setting('TURNSTILE_SECRET')])
  return json({ ok: true, turnstile: siteKey && secret ? siteKey : null, consentVersion: CONSENT_VERSION }, 200)
}

async function turnstileOk(secret, token, ip) {
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: String(token).slice(0, 2048), remoteip: ip }),
    })
    const data = await res.json().catch(() => ({}))
    return data.success === true
  } catch (_) {
    // Cloudflare unreachable: let the person through rather than lock out
    // every genuine registration; the limiter and honeypot still apply.
    return true
  }
}

/** Keep the consent record with the member, keyed by a hash of the address
 *  (the address itself is already in the Resend audience). */
async function recordConsent(email, record) {
  const cfg = storeConfig()
  if (!cfg) return false
  try {
    const id = await digest('member', email.toLowerCase())
    await pipeline(cfg, [['HSET', `${KV}member:consent`, id, JSON.stringify(record)]])
    return true
  } catch (_) { return false }
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

  // The limiter counts by a hash of the address too, so no raw IP is written
  // anywhere by this endpoint, even for fifteen minutes.
  const ipHash = await digest('reg-ip', ip)
  const burst = await hit(`${KV}reg:rl:${ipHash}`, BURST.max, BURST.windowS)
  const daily = await hit(`${KV}reg:rl:d:${ipHash}`, DAILY.max, DAILY.windowS)
  if (burst.limited || daily.limited) return json(FAIL, 429)

  // Honeypot: looks like success, does nothing.
  if (String(payload?.website ?? '').trim()) return json({ ok: true }, 200)

  if (!name || name.length > 50) return json(FAIL, 400)
  if (!email || !EMAIL_RE.test(email) || email.length > 100) return json(FAIL, 400)
  if (company.length > 80) return json(FAIL, 400)
  if (payload?.consent !== true) return json({ ok: false, code: 'CONSENT_REQUIRED' }, 400)

  const [siteKey, secret] = await Promise.all([setting('TURNSTILE_SITE_KEY'), setting('TURNSTILE_SECRET')])
  if (siteKey && secret && !(await turnstileOk(secret, payload?.turnstile, ip))) {
    return json({ ok: false, code: 'CHALLENGE_FAILED' }, 400)
  }

  // Registration = instant membership (12h session; the emailed code covers
  // longer-term / cross-device access).
  const { token, maxAge } = await issueSession(false)

  let source = ''
  try { source = new URL(String(payload?.source || req.headers.get('referer') || '')).pathname.slice(0, 120) } catch (_) {}
  await recordConsent(email, {
    at: new Date().toISOString(), version: CONSENT_VERSION, source: source || '/register.html', ipHash,
  })

  // Best-effort side effects — registration must succeed even if these fail.
  const memberCode = await setting('MEMBER_CODE', 'LUMEN2026')
  let mailed = false
  const apiKey = await setting('RESEND_API_KEY')
  const mailedRecently = await seenBefore(`${KV}reg:mail:${await digest('member', email.toLowerCase())}`, 24 * 3600)
  if (apiKey) {
    // Persist the member as a Resend contact in the members segment (api/_members.js).
    await addMember(apiKey, { name, email, company }).catch((err) =>
      console.error('[api/register] addMember failed', err)
    )
    const from = BRAND.from
    const owner = await setting('CONTACT_TO_EMAIL', BRAND.owner)
    const send = (body) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch((err) => console.error('[api/register] mail error', err))
    // Welcome mail with the member code (to the registrant, who ticked the
    // consent box). NOTE: with the resend.dev sandbox sender this only
    // delivers to the Resend account owner — 設定状況 warns about that.
    if (!mailedRecently) {
      const wRes = await send({
        from,
        to: [email],
        subject: `【${BRAND.name}】会員登録が完了しました`,
        text:
          `${name} 様\n\n${BRAND.name} 会員登録ありがとうございます。\n` +
          `ミニゲームで遊ぶ際の会員コードは以下のとおりです。\n\n` +
          `会員コード: ${memberCode}\n\n` +
          `ログインページ: ${BRAND.url}/login.html\n\n` +
          `※このメールに心当たりがない場合は破棄してください。\n\n` +
          `${BRAND.name}\n${BRAND.url}`,
      })
      mailed = !!(wRes && wRes.ok)
      if (!mailed) console.error('[api/register] welcome mail failed', wRes && wRes.status)
      // Lead notification (to the owner). No raw IP: a hash is enough to see
      // that several sign-ups came from one place.
      await send({
        from,
        to: [owner],
        reply_to: email,
        subject: `【会員登録】${name} 様が登録しました`,
        text: `新規会員登録がありました。\n\nお名前: ${name}\n会社名: ${company || '（未入力）'}\nメール: ${email}\n` +
          `メール配信への同意: あり（${new Date().toISOString()}・${source || '/register.html'}）\n送信元の識別子: ${ipHash}`,
      })
    }
  } else {
    console.error('[api/register] RESEND_API_KEY not set — skipped code email')
  }

  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  const base = `Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`
  headers.append('Set-Cookie', `lum_session=${token}; ${base}; HttpOnly`)
  headers.append('Set-Cookie', `lum_member=1; ${base}`)
  // The code is shown on screen to the person who just consented and
  // registered on this page — email is a best-effort second channel.
  return new Response(JSON.stringify({ ok: true, mailed, code: memberCode }), { status: 200, headers })
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
