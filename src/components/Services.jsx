import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { useState, useEffect } from 'react'
import { IconVideo, IconAI, IconSNS, IconWeb, IconCast, IconCreative } from './Icons'
import ServiceDetail from './ServiceDetail'
import { events } from '../lib/analytics'
import { SERVICES } from '../data/services'

const ICONS = {
  video: <IconVideo />, ai: <IconAI />, sns: <IconSNS />,
  web: <IconWeb />, cast: <IconCast />, creative: <IconCreative />,
}
const services = SERVICES.map((s) => ({ ...s, icon: ICONS[s.id] }))

export default function Services() {
  const [active, setActive] = useState(null)

  const openDetail = (s) => {
    events.ctaClick('service-card', s.title)
    setActive(s)
  }

  // The home search box and the drawer's 事業内容 group both deep-link into a
  // specific service's detail panel: they store the service id, navigate to
  // #/info/services, and this consumes the handoff on mount. When we are
  // already on this page there is no mount, so they fire an event instead.
  useEffect(() => {
    const open = (id) => {
      const s = services.find((x) => x.id === id)
      if (s) setActive(s)
    }
    const pending = sessionStorage.getItem('lum_open_service')
    if (pending) {
      sessionStorage.removeItem('lum_open_service')
      open(pending)
    }
    const onOpen = (e) => {
      sessionStorage.removeItem('lum_open_service')
      open(e.detail)
    }
    window.addEventListener('lumenium:open-service', onOpen)
    return () => window.removeEventListener('lumenium:open-service', onOpen)
  }, [])

  return (
    <section className="section" id="services">
      <div className="container">
        <div className="section-header" data-animate data-stroke="SERVICES">
          <p className="section-label">{SECTION.services.label}</p>
          <h2 className="section-title">{rich(SECTION.services.title)}</h2>
          <p className="section-desc">{rich(SECTION.services.desc)}</p>
        </div>
        <div className="services-grid">
          {services.map((s, i) => (
            <button
              key={s.title}
              className="card card--service"
              data-animate
              data-delay={i}
              onClick={() => openDetail(s)}
              type="button"
              aria-label={`${s.title}の詳細を見る`}
            >
              {s.partner && (
                <span className="partner-badge partner-badge--corner" aria-hidden="true">
                  <img src="/advovisions-logo.png" alt="" className="partner-logo" loading="lazy" decoding="async" /> {s.partner}
                </span>
              )}
              <div className="card-icon-lg">{s.icon}</div>
              <h3 className="card-title">{s.title}</h3>
              <p className="card-text">{s.desc}</p>
              <div className="card-bottom">
                <div className="card-tags">
                  {s.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
                {s.examples?.length > 0 && (
                  <div className="card-examples" aria-hidden="true">
                    <span className="card-examples-label">▸ 実績</span>
                    <ul>
                      {s.examples.slice(0, 3).map((e) => <li key={e}>{e}</li>)}
                    </ul>
                  </div>
                )}
                <span className="card-more">詳細を見る →</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {active && <ServiceDetail service={active} onClose={() => setActive(null)} />}
    </section>
  )
}
