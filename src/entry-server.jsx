// The top page, rendered to HTML at build time (scripts/prerender.mjs).
//
// index.html used to ship an empty #root: everything a visitor reads was
// drawn by JavaScript. Google runs the script, but the AI crawlers (GPTBot,
// ClaudeBot, PerplexityBot…) and most link previews do not, so to them the
// top page was a splash screen and a block of markup — the page that says
// what we do, for whom and for how much was the one page they could not read.
//
// This renders the same <App /> the browser does, with the same copy
// overrides from content.json applied the same way (applyOverrides on the
// shared data modules), so the HTML in the file is the page people see.
import { renderToString } from 'react-dom/server'
import App from './App'
import { applyOverrides } from './lib/content-registry'
import { landingFaq, consultFaq } from './data/faq'

export function render(overrides) {
  const applied = applyOverrides(overrides)
  return {
    html: renderToString(<App />),
    applied,
    // The questions the page shows, after the overrides, for its FAQPage data.
    // トップに出ている質問すべて（よくある質問＋ご相談の多い内容）。
    faq: landingFaq().concat(consultFaq()).map((f) => ({ q: f.q, a: f.a })),
  }
}
