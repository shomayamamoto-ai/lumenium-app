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
  loadContent().finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <App />
    )
    settlePageviews()
  })
}
