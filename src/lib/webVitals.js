// Lightweight Web Vitals → GA4 relay using PerformanceObserver.
// No external dependency. Fires once per metric per page load.
// Metrics: LCP, CLS, INP (approximated via Event Timing), FCP, TTFB
import { track } from './analytics'

function send(name, value, extra = {}) {
  track('web_vitals', {
    metric_name: name,
    value: Math.round(value),
    metric_id: `${name}-${Date.now()}`,
    ...extra,
  })
}

function observe(type, cb) {
  try {
    const po = new PerformanceObserver((list) => {
      list.getEntries().forEach(cb)
    })
    po.observe({ type, buffered: true })
    return po
  } catch {
    return null
  }
}

let initialized = false

export function initWebVitals() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  // LCP — largest contentful paint
  let lcpValue = 0
  const lcp = observe('largest-contentful-paint', (entry) => {
    lcpValue = entry.renderTime || entry.loadTime || entry.startTime || 0
  })

  // CLS — cumulative layout shift (session-windowed)
  let clsValue = 0
  let clsSession = []
  observe('layout-shift', (entry) => {
    if (entry.hadRecentInput) return
    const last = clsSession[clsSession.length - 1]
    if (last && entry.startTime - last.startTime < 1000 && entry.startTime - clsSession[0].startTime < 5000) {
      clsSession.push(entry)
    } else {
      clsSession = [entry]
    }
    const windowed = clsSession.reduce((s, e) => s + e.value, 0)
    if (windowed > clsValue) clsValue = windowed
  })

  // INP approximation via Event Timing
  let worstEvent = 0
  observe('event', (entry) => {
    if (entry.duration > worstEvent) worstEvent = entry.duration
  })

  // FCP — first contentful paint
  observe('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') send('FCP', entry.startTime)
  })

  // TTFB — navigation timing
  observe('navigation', (entry) => {
    const ttfb = entry.responseStart - entry.requestStart
    if (ttfb > 0) send('TTFB', ttfb)
  })

  // Flush LCP/CLS/INP once when the page is hidden or unloaded
  const flush = () => {
    if (lcpValue > 0) send('LCP', lcpValue)
    send('CLS', clsValue * 1000, { raw_cls: clsValue }) // GA prefers integers
    if (worstEvent > 0) send('INP', worstEvent)
    if (lcp) lcp.disconnect()
  }

  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  addEventListener('pagehide', flush)
}
