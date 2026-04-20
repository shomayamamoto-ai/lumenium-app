import { useEffect, useRef } from 'react'
import { useFocusTrap } from '../lib/focusTrap'

export default function ServiceDetail({ service, onClose }) {
  const panelRef = useRef(null)
  useFocusTrap(panelRef, true)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!service) return null

  return (
    <div
      className="service-detail-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-detail-title"
    >
      <aside
        className="service-detail-panel"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="service-detail-close"
          onClick={onClose}
          aria-label="閉じる"
          type="button"
        >
          ✕
        </button>

        <header className="service-detail-head">
          <div className="service-detail-icon">{service.icon}</div>
          <p className="service-detail-label">SERVICE</p>
          <h2 id="service-detail-title" className="service-detail-title">{service.title}</h2>
          <p className="service-detail-lead">{service.desc}</p>
        </header>

        {service.highlights?.length > 0 && (
          <section className="service-detail-section">
            <h3>こんな方におすすめ</h3>
            <ul className="service-detail-list">
              {service.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </section>
        )}

        {service.examples?.length > 0 && (
          <section className="service-detail-section">
            <h3>代表的な実績</h3>
            <ul className="service-detail-list">
              {service.examples.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </section>
        )}

        <section className="service-detail-meta">
          {service.price && (
            <div className="service-detail-meta-row">
              <span className="service-detail-meta-label">料金目安</span>
              <span className="service-detail-meta-value">{service.price}</span>
            </div>
          )}
          {service.partner && (
            <div className="service-detail-meta-row">
              <span className="service-detail-meta-label">パートナー</span>
              <span className="service-detail-meta-value">
                {service.partnerUrl ? (
                  <a href={service.partnerUrl} target="_blank" rel="noopener noreferrer">
                    {service.partner} ↗
                  </a>
                ) : service.partner}
              </span>
            </div>
          )}
        </section>

        <footer className="service-detail-footer">
          <a
            href="#contact-form"
            className="btn btn-accent"
            data-cta={`service-detail-consult-${service.id || service.title}`}
            onClick={onClose}
          >
            このサービスで相談する
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <a href="#contact-form" className="btn btn-ghost-w" onClick={onClose}>
            お問い合わせフォーム
          </a>
        </footer>
      </aside>
    </div>
  )
}
