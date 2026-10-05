import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadContent } from './lib/content'
import { startPageviews, settlePageviews, tagExperiment } from './lib/pageview'
import { fetchExperiments, applyExperiments } from './lib/experiments'
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
  //
  // 文章の実験（src/lib/experiments.js）も同じ時に当てます。読むのは
  // トップページだけで、content.json と並べて読むので待ち時間は増えません
  // （遅いときは元の文章のまま出します）。文章の差し替えは content.json の
  // あと——実験の案が、保存済みの文章より優先されるように。
  const exps = first.path === '/' ? fetchExperiments() : Promise.resolve(null)
  Promise.all([loadContent(), exps]).then(([, cfg]) => {
    const tag = applyExperiments(cfg)
    if (tag) tagExperiment(tag.tag, tag.first)
  }).catch(() => {}).finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <App />
    )
    settlePageviews()
  })
}
