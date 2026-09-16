export const config = { runtime: 'edge' }

import { storeConfig, pipeline, jstDate, K } from './_analytics-store.js'
import { setting } from './_settings.js'
import { hit, seenBefore, digest } from './_ratelimit.js'

// Per IP. Three enquiries in ten minutes is well past what a real person
// sends; the daily cap stops a slow drip from adding up to a flooded inbox
// and an exhausted Resend quota.
const BURST = { max: 3, windowS: 10 * 60 }
const DAILY = { max: 12, windowS: 24 * 60 * 60 }

/** Record that an enquiry went through, or why it did not.
 *
 *  Until now a failure only reached console.error. If the Resend key expired
 *  the form would keep refusing enquiries and nothing the owner ever looks at
 *  would say so — on a site whose revenue arrives through this endpoint, that
 *  is the worst way for it to break. Only the reason is stored, never the
 *  enquiry itself. */
async function record(ok, reason, field) {
  const cfg = storeConfig()
  if (!cfg) return
  const d = jstDate()
  try {
    const cmds = [
      ['HINCRBY', K.dayContact(d), field || (ok ? 'ok' : 'fail'), 1],
      ['EXPIRE', K.dayContact(d), K.expire],
    ]
    if (!ok && !field) {
      cmds.push(['SET', K.contactLastError,
        JSON.stringify({ at: new Date().toISOString(), reason: String(reason).slice(0, 200) }),
        'EX', 90 * 24 * 3600])
    }
    await pipeline(cfg, cmds)
  } catch (_) { /* never fail an enquiry because the counter is down */ }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LIMITS = { name: 50, email: 100, message: 1000 }

export async function POST(req) {
  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  // A field no visitor can see and no visitor fills. Answer 200 so a bot
  // cannot tell it was caught and start probing for the reason.
  if (String(payload?.company ?? '').trim()) return json({ ok: true })

  const name = String(payload?.name ?? '').trim()
  const email = String(payload?.email ?? '').trim()
  const message = String(payload?.message ?? '').trim()

  if (!name || name.length > LIMITS.name) return json({ error: 'invalid_name' }, 400)
  if (!email || !EMAIL_RE.test(email) || email.length > LIMITS.email) return json({ error: 'invalid_email' }, 400)
  if (message.length < 10 || message.length > LIMITS.message) return json({ error: 'invalid_message' }, 400)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // De-duplicate before counting, so a double-tap on the button — or a retry
  // after a slow response — costs the sender nothing from their allowance.
  const fp = await digest(email, message)
  if (await seenBefore(`lum:ct:dup:${fp}`, 10 * 60)) {
    return json({ ok: true, duplicate: true })
  }

  const burst = await hit(`lum:ct:rl:${ip}`, BURST.max, BURST.windowS)
  const daily = await hit(`lum:ct:rl:d:${ip}`, DAILY.max, DAILY.windowS)
  if (burst.limited || daily.limited) {
    // Counted apart from failures. A block is the system working; filing it
    // as a failure would make the health page raise an alarm about itself.
    await record(null, null, 'blocked')
    return json({
      error: 'rate_limited',
      message: '送信が続いています。しばらく時間をおいてからお試しください。',
    }, 429, { 'retry-after': String(burst.limited ? burst.retryAfter : daily.retryAfter) })
  }

  const apiKey = await setting('RESEND_API_KEY')
  if (!apiKey) {
    console.error('[api/contact] RESEND_API_KEY is not set')
    await record(false, 'RESEND_API_KEY が未設定')
    return json({ error: 'server_misconfigured' }, 503)
  }

  const from = process.env.CONTACT_FROM_EMAIL || 'Lumenium <onboarding@resend.dev>'
  const to = await setting('CONTACT_TO_EMAIL', 'shoma.yamamoto@lumenium.net')
  const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16)
  const from_page = String(payload?.page ?? '').slice(0, 120)
  const withEstimate = /概算見積り|概算:/.test(message)

  const subject = `【お問い合わせ】${name}様より${withEstimate ? '（見積り付き）' : ''}`
  const text = [
    `お名前: ${name}`,
    `メール: ${email}`,
    `受信: ${jst} (JST)`,
    from_page ? `流入ページ: ${from_page}` : null,
    withEstimate ? '見積りシミュレーターの内容が含まれています。' : null,
    '',
    message,
  ].filter((l) => l !== null).join('\n')

  let res
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject,
        text,
      }),
    })
  } catch (err) {
    console.error('[api/contact] network error', err)
    await record(false, 'メール送信先への通信エラー')
    return json({ error: 'network' }, 502)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[api/contact] resend failed', res.status, detail)
    await record(false, `Resend が ${res.status} を返しました`)
    return json({ error: 'send_failed' }, 502)
  }

  await record(true)
  return json({ ok: true })
}

function json(payload, status = 200, extra) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extra || {}) },
  })
}
