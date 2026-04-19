import { Component } from 'react'

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
