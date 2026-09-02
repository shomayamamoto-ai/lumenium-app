import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
// Editorial-style split intro block.
// Sits just before the Services grid — provides visual difference
// between Why (card grid) and Services (card grid) with a break.

export default function ServicesIntro() {
  return (
    <section className="services-intro" aria-hidden="true">
      <div className="container services-intro-inner" data-animate>
        <div className="services-intro-copy">
          <p className="services-intro-label">{SECTION.servicesIntro.label}</p>
          <h2 className="services-intro-title">{rich(SECTION.servicesIntro.title)}</h2>
          <p className="services-intro-lead">{rich(SECTION.servicesIntro.lead)}</p>
        </div>

        <div className="services-intro-meta">
          <dl className="services-intro-dl">
            <div><dt>{SECTION.servicesIntro.metaKey1}</dt><dd>{SECTION.servicesIntro.metaVal1}</dd></div>
            <div><dt>{SECTION.servicesIntro.metaKey2}</dt><dd>{SECTION.servicesIntro.metaVal2}</dd></div>
            <div><dt>{SECTION.servicesIntro.metaKey3}</dt><dd>{SECTION.servicesIntro.metaVal3}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  )
}
