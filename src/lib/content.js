import { applyOverrides } from './content-registry'

// Loads the admin's copy overrides and applies them to the data modules
// before React renders, so components need no wiring of their own — they
// already import the same objects this mutates.
//
// The overrides also ship into the static pages at build time (the
// generators call applyOverrides directly), so the two never disagree.

const TIMEOUT_MS = 2500

export async function loadContent() {
  if (typeof fetch !== 'function') return 0
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS)
    const res = await fetch('/content.json', {
      cache: 'no-store',
      signal: ctl ? ctl.signal : undefined,
    })
    clearTimeout(timer)
    if (!res.ok) return 0
    const data = await res.json()
    return applyOverrides(data)
  } catch (_) {
    // A missing, slow or malformed content.json must never block the site —
    // the built-in copy is always a complete fallback.
    return 0
  }
}
