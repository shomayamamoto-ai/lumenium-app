// Thin GA4 event helper. Silently no-ops when gtag is unavailable
// (localhost, ad-blockers, placeholder GA ID).

export function track(eventName, params = {}) {
  if (typeof window === 'undefined') return
  if (typeof window.gtag !== 'function') return
  try {
    window.gtag('event', eventName, params)
  } catch {
    /* swallow */
  }
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
