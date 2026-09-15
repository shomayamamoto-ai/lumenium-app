export const config = { runtime: 'edge' }

// Pageview beacon. Deliberately privacy-preserving:
//   - no cookies, no localStorage, nothing written to the visitor's device
//   - the IP is never stored. It is hashed together with the user agent, the
//     date and a server-side salt, and that hash only ever enters a
//     HyperLogLog, which counts distinct values without keeping them. The
//     date in the hash means the id cannot follow anyone across days.
// So the admin page can answer "how many people, on what pages" and cannot
// answer "who", which is the only question worth refusing to answer.

import { storeConfig, pipeline, jstDate, K } from './_analytics-store.js'

const enc = new TextEncoder()

const BOT = /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|flipboard|tumblr|headless|lighthouse|pagespeed|gtmetrix|monitor|uptime|curl|wget|python-requests|axios|node-fetch|go-http|java\/|okhttp|postman|preview|scrape/i

// Paths that are operational rather than public, so they never enter the stats.
const IGNORED = /^\/(admin-members|login|register|fix|members|api)\b/

function device(ua) {
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return 'mobile'
  return 'desktop'
}

function refHost(ref, selfHost) {
  if (!ref) return 'direct'
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '')
    if (!h || h === selfHost.replace(/^www\./, '')) return 'direct'
    return h.slice(0, 80)
  } catch {
    return 'direct'
  }
}

/** The funnel, in order. Anything not on this list is ignored — the counter
 *  is a Redis hash, and letting callers name their own fields would let one
 *  grow without bound. */
export const EVENTS = new Set([
  'menu_open',       // the hero menu was opened
  'service_view',    // a service detail was opened
  'estimate_start',  // the estimator was opened
  'estimate_done',   // an estimate was produced
  'contact_view',    // the enquiry form was reached
  'contact_start',   // the first field was filled
  'contact_submit',  // an enquiry was sent
])

/** Keep the path list bounded and free of anything identifying. */
function cleanPath(raw) {
  let p = String(raw || '/').split('?')[0]
  // The app's hash routes are its real pages. The client already folds them
  // into a path, but fold here too: dropping the hash instead would quietly
  // merge every section into "/" if anything ever sends the raw location.
  const h = p.indexOf('#')
  if (h >= 0) {
    const frag = p.slice(h + 1)
    p = frag.startsWith('/') ? frag : p.slice(0, h)
  }
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/{2,}/g, '/')
  if (p.length > 1) p = p.replace(/\/$/, '')
  return p.slice(0, 120) || '/'
}

async function visitorId(ip, ua, date, salt) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${ip}|${ua}|${date}|${salt}`))
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req) {
  // A beacon must never make the page look broken, so every failure path
  // still answers 204.
  const ok = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

  const cfg = storeConfig()
  if (!cfg) return ok()

  const ua = req.headers.get('user-agent') || ''
  if (!ua || BOT.test(ua)) return ok()

  let body
  try {
    body = await req.json()
  } catch {
    return ok()
  }

  const path = cleanPath(body?.p)
  if (IGNORED.test(path)) return ok()

  // A funnel step rather than a pageview. Only names this file knows are
  // counted, so a hostile caller cannot invent unbounded hash fields.
  const ev = typeof body?.e === 'string' ? body.e : ''
  if (ev) {
    if (!EVENTS.has(ev)) return ok()
    const d = jstDate()
    try {
      await pipeline(storeConfig(), [
        ['HINCRBY', K.dayEvents(d), ev, 1],
        ['EXPIRE', K.dayEvents(d), K.expire],
      ])
    } catch (_) { /* a beacon must never surface an error */ }
    return ok()
  }

  const date = jstDate()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const salt = (process.env.ADMIN_KEY || 'lumenium') + ':analytics'
  const vid = await visitorId(ip, ua, date, salt)

  const host = new URL(req.url).hostname
  const ref = refHost(body?.r, host)
  const dev = device(ua)

  try {
    await pipeline(cfg, [
      ['INCR', K.totalViews],
      ['INCR', K.dayViews(date)],
      ['EXPIRE', K.dayViews(date), K.expire],
      ['PFADD', K.dayVisitors(date), vid],
      ['EXPIRE', K.dayVisitors(date), K.expire],
      ['HINCRBY', K.dayPaths(date), path, 1],
      ['EXPIRE', K.dayPaths(date), K.expire],
      ['HINCRBY', K.dayRefs(date), ref, 1],
      ['EXPIRE', K.dayRefs(date), K.expire],
      ['HINCRBY', K.dayDevices(date), dev, 1],
      ['EXPIRE', K.dayDevices(date), K.expire],
    ])
  } catch {
    /* counting is best-effort; never surface a store outage to a visitor */
  }
  return ok()
}
