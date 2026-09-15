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

/** The funnel steps we count ourselves. Names match api/track.js. */
export const funnel = {
  menuOpen: () => sendEvent('menu_open'),
  serviceView: () => sendEvent('service_view'),
  estimateStart: () => sendEvent('estimate_start'),
  estimateDone: () => sendEvent('estimate_done'),
  contactView: () => sendEvent('contact_view'),
  contactStart: () => sendEvent('contact_start'),
  contactSubmit: () => sendEvent('contact_submit'),
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
