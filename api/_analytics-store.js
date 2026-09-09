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
  expire: TTL,
}
