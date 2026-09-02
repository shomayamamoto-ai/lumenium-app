import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { CASE_STUDIES as caseStudies, ACHIEVEMENTS as achievements } from '../data/site'

export default function Results() {
  return (
    <section className="section section--gray" id="results">
      <div className="container">
        <div className="section-header" data-animate data-stroke="RESULTS">
          <p className="section-label">{SECTION.results.label}</p>
          <h2 className="section-title">{rich(SECTION.results.title)}</h2>
          <p className="section-desc">{rich(SECTION.results.desc)}</p>
        </div>

        <div className="case-grid">
          {caseStudies.map((c, i) => (
            <div key={c.title} className="card card--case" data-animate data-delay={i}>
              <span className="tag tag--filled">{c.tag}</span>
              <h3 className="card-title-lg">{c.title}</h3>
              <p className="card-text">{c.desc}</p>
              {c.metric && (
                <div className="case-metric">
                  <span className="case-metric-value" data-count={c.metric}>0</span>
                  <span className="case-metric-label">{c.metricLabel}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="achievements" data-animate data-delay="2">
          <h3 className="achievements-heading">{SECTION.results.achievementsHeading}</h3>
          <div className="achievements-list">
            {achievements.map((a) => (
              <span key={a} className="achievement-chip">{a}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
