// Resend Audiences helper — persistent member/lead storage without a DB.
// Underscore prefix keeps this file from being exposed as an endpoint.

const AUDIENCE_NAME = 'Lumenium Members'
let cachedAudienceId = null // per-isolate cache

async function resend(apiKey, path, init = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

// Resolve the audience id: env override → cache → find by name → create.
export async function ensureAudienceId(apiKey) {
  if (process.env.RESEND_AUDIENCE_ID) return process.env.RESEND_AUDIENCE_ID
  if (cachedAudienceId) return cachedAudienceId

  const list = await resend(apiKey, '/audiences')
  if (list.ok && Array.isArray(list.body?.data)) {
    const found = list.body.data.find((a) => a?.name === AUDIENCE_NAME)
    if (found?.id) {
      cachedAudienceId = found.id
      return cachedAudienceId
    }
  }

  const created = await resend(apiKey, '/audiences', {
    method: 'POST',
    body: JSON.stringify({ name: AUDIENCE_NAME }),
  })
  if (created.ok && created.body?.id) {
    cachedAudienceId = created.body.id
    return cachedAudienceId
  }
  return null
}

export async function addContact(apiKey, { name, email }) {
  const audienceId = await ensureAudienceId(apiKey)
  if (!audienceId) return false
  const res = await resend(apiKey, `/audiences/${audienceId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({ email, first_name: name, unsubscribed: false }),
  })
  return res.ok
}

export async function listContacts(apiKey) {
  const audienceId = await ensureAudienceId(apiKey)
  if (!audienceId) return null
  const res = await resend(apiKey, `/audiences/${audienceId}/contacts`)
  if (!res.ok || !Array.isArray(res.body?.data)) return null
  return res.body.data.map((c) => ({
    name: [c.first_name, c.last_name].filter(Boolean).join(' '),
    email: c.email || '',
    created: c.created_at || '',
    unsubscribed: c.unsubscribed === true,
  }))
}
