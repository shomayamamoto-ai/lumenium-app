// Thin Upstash Redis REST client for the pageview counters.
//
// Redis rather than the GitHub-file trick used for news and copy: those are
// edited a few times a month, whereas this takes a write on every pageview,
// which a commit-per-write store cannot do. Upstash speaks plain HTTPS, so it
// works from the edge runtime with no driver and no connection pool.
//
// Requires env: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.

export const KEEP_DAYS = 400
const TTL = KEEP_DAYS * 24 * 60 * 60

export function storeConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '')
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  return url && token ? { url, token } : null
}

/** The same, but also accepting the pair the admin pasted into their own
 *  browser. Every other key has a box on the settings screen; these two had
 *  none at all, because the place saved keys live is this very store — there
 *  is nowhere to put the store's own address except the environment or the
 *  browser holding it.
 *
 *  What this does and does not turn on: admin screens make their own requests
 *  and carry the admin's cookie, so history, saved settings and the AIO
 *  reports can all use a pair held here. Pageview recording cannot — it runs
 *  on visitors' requests, which carry nothing of the admin's — so counting
 *  visits still needs the two environment variables. The settings row says so
 *  rather than letting the admin discover it from an empty chart. */
export async function storeFor(req) {
  const env = storeConfig()
  if (env || !req) return env
  const { bag } = await import('./_keybag.js')
  const mine = await bag(req)
  const url = String(mine.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '')
  const token = String(mine.UPSTASH_REDIS_REST_TOKEN || '').trim()
  return url && token ? { url, token } : null
}

/** Is this pair usable? Asked before it is trusted, so the settings screen can
 *  answer 「つながりました」 rather than leaving it to be discovered later. */
export async function storePing(cfg) {
  if (!cfg) return { ok: false, message: '値が足りません。' }
  try {
    const out = await pipeline(cfg, [['SET', 'lum:ping', String(Date.now()), 'EX', 60], ['GET', 'lum:ping']])
    return out && out.length === 2 && out[1] ? { ok: true } : { ok: false, message: '応答が想定と違います。' }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e).slice(0, 120) }
  }
}

/** Run several Redis commands in one HTTPS round trip. */
export async function pipeline(cfg, commands) {
  if (!commands.length) return []
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!res.ok) throw new Error(`upstash ${res.status}`)
  const out = await res.json()
  // Upstash answers [{result}|{error}, ...] in command order.
  return out.map((r) => (r && Object.prototype.hasOwnProperty.call(r, 'result') ? r.result : null))
}

/** Dates are bucketed in JST — the audience and the operator are both there. */
export function jstDate(offsetDays = 0) {
  const t = Date.now() + 9 * 3600 * 1000 - offsetDays * 86400 * 1000
  return new Date(t).toISOString().slice(0, 10)
}

export function lastDays(n) {
  return Array.from({ length: n }, (_, i) => jstDate(n - 1 - i))
}

export const K = {
  totalViews: 'lum:pv:total',
  dayViews: (d) => `lum:pv:d:${d}`,
  dayVisitors: (d) => `lum:uv:d:${d}`,   // HyperLogLog — counts uniques, stores no ids
  dayPaths: (d) => `lum:pv:p:${d}`,
  dayRefs: (d) => `lum:pv:r:${d}`,
  dayDevices: (d) => `lum:pv:dev:${d}`,
  // Conversion steps. Kept in the same daily hash shape as the rest so the
  // report reads them the same way.
  dayEvents: (d) => `lum:ev:d:${d}`,
  // …and the same steps counted in people rather than in times. A funnel
  // measured in event counts cannot be read as a conversion rate: one visitor
  // opening three services is three service_view against one arrival. Same
  // HyperLogLog as the visitor count, so the unit on both sides matches and
  // nothing identifying is kept.
  dayEventUsers: (d, e) => `lum:evu:d:${d}:${e}`,
  // Enquiry outcomes, so a form that has stopped working is visible.
  dayContact: (d) => `lum:ct:d:${d}`,
  contactLastError: 'lum:ct:lasterr',
  expire: TTL,
}
