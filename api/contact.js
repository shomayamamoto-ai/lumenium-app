export const config = { runtime: 'edge' }

import { storeConfig, pipeline, jstDate, K } from './_analytics-store.js'

/** Record that an enquiry went through, or why it did not.
 *
 *  Until now a failure only reached console.error. If the Resend key expired
 *  the form would keep refusing enquiries and nothing the owner ever looks at
 *  would say so — on a site whose revenue arrives through this endpoint, that
 *  is the worst way for it to break. Only the reason is stored, never the
 *  enquiry itself. */
async function record(ok, reason) {
  const cfg = storeConfig()
  if (!cfg) return
  const d = jstDate()
  try {
    const cmds = [
      ['HINCRBY', K.dayContact(d), ok ? 'ok' : 'fail', 1],
      ['EXPIRE', K.dayContact(d), K.expire],
    ]
    if (!ok) {
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

  const name = String(payload?.name ?? '').trim()
  const email = String(payload?.email ?? '').trim()
  const message = String(payload?.message ?? '').trim()

  if (!name || name.length > LIMITS.name) return json({ error: 'invalid_name' }, 400)
  if (!email || !EMAIL_RE.test(email) || email.length > LIMITS.email) return json({ error: 'invalid_email' }, 400)
  if (message.length < 10 || message.length > LIMITS.message) return json({ error: 'invalid_message' }, 400)

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[api/contact] RESEND_API_KEY is not set')
    await record(false, 'RESEND_API_KEY が未設定')
    return json({ error: 'server_misconfigured' }, 503)
  }

  const from = process.env.CONTACT_FROM_EMAIL || 'Lumenium <onboarding@resend.dev>'
  const to = process.env.CONTACT_TO_EMAIL || 'shoma.yamamoto@lumenium.net'
  const subject = `【お問い合わせ】${name}様より`
  const text = `お名前: ${name}\nメール: ${email}\n\n${message}`

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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
