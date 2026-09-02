import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
export default function CTA() {
  return (
    <section className="section section--cta" id="contact">
      <div className="container">
        <div className="cta-inner" data-animate>
          <p className="section-label" style={{ color: '#fff' }}>{SECTION.cta.label}</p>
          <h2 className="cta-title">{rich(SECTION.cta.title)}</h2>
          <p className="cta-desc">{rich(SECTION.cta.desc)}</p>
          <div className="cta-reassure" data-animate>
            <span className="cta-reassure-item">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2l6 2.5v4.2c0 3.7-2.5 7.1-6 8.3-3.5-1.2-6-4.6-6-8.3V4.5L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M7.2 10l2 2 3.6-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {SECTION.cta.reassure1}
            </span>
            <span className="cta-reassure-item">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 5v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6"/></svg>
              {SECTION.cta.reassure2}
            </span>
            <span className="cta-reassure-item">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              {SECTION.cta.reassure3}
            </span>
          </div>
          <a href="#contact-form" className="btn btn-white" data-cta="cta-consult">
            無料でご相談する
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <div className="cta-badges">
            <span>✓ 48時間以内にご提案</span>
            <span>✓ 見積り無料</span>
            <span>✓ 秘密厳守</span>
          </div>
        </div>
      </div>
    </section>
  )
}
