// Event helper. Sends to GA4 when a tag is installed, and — separately — to
// our own endpoint for the handful of steps that make up the enquiry funnel.
//
// GA_ID in index.html is empty, so window.gtag has never existed and every
// call here was a silent no-op: the site has been running with no conversion
// data at all. The first-party half does not depend on it.

import { sendEvent } from './pageview'

export function track(eventName, params = {}) {
  if (typeof window === 'undefined') return
  if (typeof window.gtag !== 'function') return
  try {
    window.gtag('event', eventName, params)
  } catch {
    /* swallow */
  }
}

/* 「見た」は、一度だけ。
   問い合わせ欄はトップページにいつも置いてあるので、描いただけで
   「問い合わせ画面に来た」と送っていた頃は、開いた人全員が来たことに
   なっていました。画面に入ったときに、ページを開いている間に1回だけ送ります。 */
const sent = new Set()
function once(name) {
  if (sent.has(name)) return
  sent.add(name)
  sendEvent(name)
}

/** The funnel steps we count ourselves. Names match api/track.js.
 *  サービスを見た（service_view）は、サービスの詳しいページ
 *  （/services/*.html）を開いたときに beacon-core.js が送ります。
 *  メニュー・見積りの段は、その画面が無くなったので外しました。 */
export const funnel = {
  contactView: () => once('contact_view'),
  contactStart: () => sendEvent('contact_start'),
  // 送れたときにだけ。送る前に数えると、失敗した送信も「問い合わせ」に入ります。
  contactSubmit: () => sendEvent('contact_submit'),
  bookingView: () => once('booking_view'),
  bookingConfirm: () => sendEvent('booking_confirm'),
}

/** Calls `onSeen` once, the first time at least half of `el` — or half of the
 *  screen, for an element taller than two screens — is on screen. Returns a
 *  function that stops watching.
 *
 *  Without IntersectionObserver (old browsers), the first scroll that brings
 *  the element within 200px of the screen counts instead. */
export function whenSeen(el, onSeen) {
  if (!el || typeof window === 'undefined') return () => {}
  let done = false
  const fire = () => { if (!done) { done = true; onSeen() } }
  if (typeof IntersectionObserver === 'function') {
    const steps = []
    for (let i = 0; i <= 20; i++) steps.push(i / 20)
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const vh = (e.rootBounds && e.rootBounds.height) || window.innerHeight
        if (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= vh * 0.5) {
          io.disconnect()
          fire()
          return
        }
      }
    }, { threshold: steps })
    io.observe(el)
    return () => io.disconnect()
  }
  const check = () => {
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight + 200 && r.bottom > -200) {
      window.removeEventListener('scroll', check)
      fire()
    }
  }
  window.addEventListener('scroll', check, { passive: true })
  return () => window.removeEventListener('scroll', check)
}

// Named conversion shortcuts — keep names stable for GA dashboards
export const events = {
  ctaClick: (location, label) => track('cta_click', { location, label }),
  outboundClick: (url) => track('click', { outbound: true, link_url: url }),
  formSubmit: (form) => track('form_submit', { form_name: form }),
  formStart: (form) => track('form_start', { form_name: form }),
  faqOpen: (question) => track('faq_open', { question }),
  themeToggle: (theme) => track('theme_toggle', { theme }),
  newsletterSubscribe: () => track('generate_lead', { method: 'newsletter' }),
  portfolioFilter: (category) => track('portfolio_filter', { category }),
  scrollDepth: (percent) => track('scroll', { percent_scrolled: percent }),
  shareClick: (method) => track('share', { method }),
  privacyOpen: () => track('privacy_open'),
  chatOpen: () => track('chat_open'),
}
