export const config = { runtime: 'edge' }

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
    return json({ error: 'network' }, 502)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[api/contact] resend failed', res.status, detail)
    return json({ error: 'send_failed' }, 502)
  }

  return json({ ok: true })
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
