// Which addresses the app actually answers.
//
// vercel.json sends every unknown URL to index.html, so the app is what a
// mistyped or dead link lands on. Until this existed the app showed the
// landing page for all of them and counted each as an ordinary pageview, so
// the 「見つからなかったURL」 report could never fill. The pageview code and
// App.jsx both ask this one function, so what is counted and what is shown
// cannot disagree.

// Old in-app addresses ('#/info/<section>', still linked from the static
// pages, bookmarks and search results): either a place on the landing page…
export const LEGACY_ANCHORS = {
  '': 'top', 'contact-form': 'contact', services: 'services', pricing: 'services',
  results: 'works', flow: 'flow', faq: 'faq', about: 'top',
}
// …or the standalone page that now holds that content.
export const LEGACY_PAGES = {
  news: '/news.html', blog: '/blog/index.html', testimonials: '/voice.html',
  story: '/story.html', positioning: '/positioning.html', pain: '/pain.html',
  company: '/about.html',
}

/** kind: 'page' (count it, show the landing), 'skip' (about to be replaced by
 *  `redirect`, so count it there instead), or 'not_found'. `path` is what the
 *  report shows. */
export function resolveRoute(loc) {
  const l = loc || (typeof window === 'undefined' ? { pathname: '/', hash: '' } : window.location)
  const pathname = l.pathname || '/'
  const hash = l.hash || ''
  if (!/^\/(index\.html)?$/.test(pathname)) {
    return { kind: 'not_found', path: pathname.replace(/\/$/, '') || '/' }
  }
  const m = hash.match(/^#\/info(?:\/([a-z-]+))?\/?$/)
  if (m) {
    const sec = m[1] || ''
    if (LEGACY_PAGES[sec]) return { kind: 'skip', path: '/', redirect: LEGACY_PAGES[sec] }
    if (Object.prototype.hasOwnProperty.call(LEGACY_ANCHORS, sec)) {
      return { kind: 'page', path: '/', anchor: LEGACY_ANCHORS[sec], legacy: true }
    }
    return { kind: 'not_found', path: '/info/' + sec }
  }
  // Any other '#/…' is a route the app has never had.
  if (hash.startsWith('#/')) return { kind: 'not_found', path: hash.slice(1).slice(0, 100) }
  // A plain '#section' is a place on the page, not a page of its own.
  return { kind: 'page', path: '/', anchor: /^#[a-z][\w-]*$/i.test(hash) ? hash.slice(1) : '' }
}
