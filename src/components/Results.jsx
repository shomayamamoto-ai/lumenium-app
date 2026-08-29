import { CASE_STUDIES as caseStudies, ACHIEVEMENTS as achievements } from '../data/site'

export default function Results() {
  return (
    <section className="section section--gray" id="results">
      <div className="container">
        <div className="section-header" data-animate data-stroke="RESULTS">
          <p className="section-label">RESULTS</p>
          <h2 className="section-title">このような案件に対応してきました</h2>
          <p className="section-desc">規模やジャンルを問わず、最適なチーム体制で対応します。</p>
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
          <h3 className="achievements-heading">その他の実績</h3>
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
