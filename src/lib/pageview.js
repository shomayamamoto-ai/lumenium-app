// Pageview beacon. Fires once per view and once per in-app route change.
// The endpoint stores no cookie and no IP, so there is nothing to consent to
// and nothing to clean up on this side.

let last = null

function currentPath() {
  const { pathname, hash } = window.location
  // Hash routes are the app's real pages, so "/" and "/#/info/pricing" have
  // to be counted separately or the report is one giant home-page row.
  const h = hash && hash.startsWith('#/') ? hash.slice(1) : ''
  return (pathname.replace(/\/$/, '') || '') + h || '/'
}

/** Report a funnel step. Same endpoint, same privacy properties — no cookie,
 *  no IP, just a counter per day. Exported so analytics.js can reach it. */
export function sendEvent(name) {
  post(JSON.stringify({ p: currentPath(), e: name }))
}

function post(body) {
  try {
    // keepalive so the request survives the navigation that triggered it.
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch (_) { /* never let counting break a page */ }
}

function send(path) {
  if (path === last) return
  last = path
  post(JSON.stringify({ p: path, r: document.referrer || '' }))
}

export function startPageviews() {
  if (typeof window === 'undefined') return
  // Don't count the operator's own visits to the admin screens.
  if (/^\/(admin-members|login|register|fix)/.test(window.location.pathname)) return
  const fire = () => send(currentPath())
  fire()
  window.addEventListener('hashchange', fire)
  window.addEventListener('popstate', fire)
}
