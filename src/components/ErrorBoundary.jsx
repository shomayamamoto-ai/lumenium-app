import { Component } from 'react'

// True when the error is a dynamic-import / code-split chunk loading failure.
// Happens when the browser has a cached index.html that points at bundle
// hashes which no longer exist on the server (i.e. after a fresh deploy).
function isChunkLoadError(err) {
  if (!err) return false
  const name = err.name || ''
  const msg = err.message || String(err)
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  )
}

const RELOAD_FLAG = 'lumenium_chunk_reload_at'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Surface to analytics / console only — no PII
    if (typeof window !== 'undefined' && window.gtag) {
      try {
        window.gtag('event', 'exception', {
          description: error?.message || String(error),
          fatal: false,
        })
      } catch {}
    }
    // eslint-disable-next-line no-console
    console.error('[Lumenium] render error:', error, info)

    // Stale index.html after deploy → chunk loading fails. Recover by hard
    // reload (guarded to once per minute to avoid infinite reload loops).
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      try {
        const now = Date.now()
        const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
        if (now - last > 60_000) {
          sessionStorage.setItem(RELOAD_FLAG, String(now))
          // Unregister any stale service worker before reloading so we truly
          // fetch the new shell.
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker
              .getRegistrations()
              .then((regs) => Promise.all(regs.map((r) => r.unregister())))
              .catch(() => {})
              .finally(() => window.location.reload())
            return
          }
          window.location.reload()
        }
      } catch {}
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="error-boundary" role="alert" aria-live="assertive">
        <div className="error-boundary-inner">
          <p className="error-boundary-label">SOMETHING WENT WRONG</p>
          <h1>一時的に表示できませんでした</h1>
          <p className="error-boundary-desc">
            お手数をおかけしますが、ページを再読み込みしてもう一度お試しください。
            <br />問題が続く場合はお問い合わせください。
          </p>
          <div className="error-boundary-actions">
            <button onClick={this.handleReload} className="btn btn-primary" type="button">
              再読み込み
            </button>
            <a href="/#contact-form" className="btn btn-ghost-w">
              お問い合わせ
            </a>
          </div>
        </div>
      </div>
    )
  }
}
