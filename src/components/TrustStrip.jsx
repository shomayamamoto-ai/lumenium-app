// Trust strip — marquee of industries we've worked with.
// Sits right after the hero to establish credibility early.

const INDUSTRIES = [
  { name: 'AI関連企業', icon: '🤖' },
  { name: '飲食店・レストラン', icon: '🍽️' },
  { name: '教育・学習塾', icon: '📚' },
]

export default function TrustStrip() {
  // Only 3 industry types are shown. Repeat them to keep the strip full,
  // then duplicate the whole run so the marquee loops seamlessly (-50%).
  const base = Array.from({ length: 4 }, () => INDUSTRIES).flat()
  const doubled = [...base, ...base]

  return (
    <section className="trust-strip" aria-label="取引実績のある業種">
      <div className="container trust-strip-head">
        <p className="trust-strip-label">INDUSTRIES WE'VE WORKED WITH</p>
        <h3 className="trust-strip-title">
          幅広い業界のお客様と、一緒に仕事をしてきました。
        </h3>
      </div>

      <div className="trust-strip-track">
        <div className="trust-strip-content">
          {doubled.map((item, i) => (
            <div key={i} className="trust-chip" aria-hidden={i >= INDUSTRIES.length ? 'true' : undefined}>
              <span className="trust-chip-icon" aria-hidden="true">{item.icon}</span>
              <span className="trust-chip-name">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
