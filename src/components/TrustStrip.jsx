// Trust strip — marquee of industries we've worked with.
// Sits right after the Marquee / hero area to establish credibility early.

const INDUSTRIES = [
  { name: '飲食店・レストラン', icon: '🍽️' },
  { name: 'IT・SaaS企業', icon: '💻' },
  { name: '美容サロン', icon: '💅' },
  { name: '教育・学習塾', icon: '📚' },
  { name: '広告代理店', icon: '📢' },
  { name: 'アイドル事務所', icon: '🎤' },
  { name: 'AI関連企業', icon: '🤖' },
  { name: '映像制作会社', icon: '🎬' },
  { name: '士業 (弁護士・税理士)', icon: '⚖️' },
  { name: 'コンサルティング', icon: '💼' },
  { name: 'スタートアップ', icon: '🚀' },
  { name: 'D2C ブランド', icon: '🛍️' },
]

export default function TrustStrip() {
  const doubled = [...INDUSTRIES, ...INDUSTRIES]

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
