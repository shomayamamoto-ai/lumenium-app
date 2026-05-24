// Trust strip — the industries we've worked with.
// Sits right after the hero to establish credibility early.

const INDUSTRIES = [
  { name: 'AI関連企業', icon: '🤖' },
  { name: '飲食店・レストラン', icon: '🍽️' },
  { name: '教育・学習塾', icon: '📚' },
]

export default function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="取引実績のある業種">
      <div className="container trust-strip-head">
        <p className="trust-strip-label">INDUSTRIES WE'VE WORKED WITH</p>
        <h3 className="trust-strip-title">
          幅広い業界のお客様と、一緒に仕事をしてきました。
        </h3>
      </div>

      <div className="trust-strip-static">
        {INDUSTRIES.map((item) => (
          <div key={item.name} className="trust-chip">
            <span className="trust-chip-icon" aria-hidden="true">{item.icon}</span>
            <span className="trust-chip-name">{item.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
