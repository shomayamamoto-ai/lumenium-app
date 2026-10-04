import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadContent } from './lib/content'
import { startPageviews, settlePageviews } from './lib/pageview'
import { resolveRoute } from './lib/routes'
import './styles.css'

// Counted first, before anything waits on the network. It used to run after
// loadContent(), which can take a couple of seconds on a slow line — and a
// visitor who gave up in that time was never counted at all.
startPageviews()

const first = resolveRoute()
if (first.redirect) {
  // An old '#/info/<page>' address for content that now has its own page.
  // Leaving before rendering means nothing flashes, and the visit is counted
  // once, on the page it lands on (the beacon skipped this one on purpose).
  window.location.replace(first.redirect)
} else {
  // Copy overrides from the admin page are applied before the first render,
  // so nothing flashes the built-in wording first. loadContent never rejects
  // and gives up after a couple of seconds, so a bad content.json cannot stop
  // the site from mounting.
  //
  // #root already holds the top page, rendered at build time for crawlers
  // that do not run scripts (scripts/prerender.mjs). It is replaced here with
  // createRoot, not adopted with hydrateRoot, on purpose. Hydrating requires
  // the first render in the browser to produce exactly the same markup, and
  // it does not always: the contact form starts from an estimate left in this
  // tab's sessionStorage, content.json may be slow, and an unknown address
  // renders NotFound instead of the landing. Either way React would throw the
  // page away and redraw it after logging an error, so hydrating would buy
  // nothing and cost a console error. The prerendered page sits under the
  // splash, so replacing it is invisible.
  loadContent().finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <App />
    )
    settlePageviews()
  })
}
