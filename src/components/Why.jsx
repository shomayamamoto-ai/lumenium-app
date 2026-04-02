const painPoints = [
  {
    num: '01',
    icon: '📱',
    title: 'SNSに弱い…',
    pain: 'SNSで集客したいけど、何から始めればいいかわからない。投稿する時間もない。',
    solution: '企画構成から運用まで全てサポート。予算に合わせた最適なSNS戦略をご提案します。',
    color: '#6366f1',
  },
  {
    num: '02',
    icon: '🎬',
    title: '動画を作る時間がない…',
    pain: '動画を作りたいけど、企画・構成・編集に時間を割くのが難しい。',
    solution: 'プロのクリエイターが企画から編集・納品まで一貫対応。あなたは確認するだけ。',
    color: '#a855f7',
    featured: true,
  },
  {
    num: '03',
    icon: '💬',
    title: 'LINEで発信したい…',
    pain: '公式LINEを作って情報発信やリード獲得に繋げたいが、やり方がわからない。',
    solution: 'LINE Bot制作から配信設計まで、反応率の高い仕組みを構築します。',
    color: '#06b6d4',
  },
]

export default function Why() {
  return (
    <section className="why" id="pain">
      <div className="container">
        <div className="section-header" data-animate>
          <span className="section-tag">YOUR PAIN POINTS</span>
          <h2 className="section-title">
            こんな<span className="gradient-text">お困りごと</span>、<br />ありませんか？
          </h2>
          <p className="section-description">上記以外の内容や抽象的な内容でも、ぜひご相談ください。</p>
        </div>
        <div className="pain-grid">
          {painPoints.map((p, i) => (
            <div key={p.num} className={`pain-card glow-card ${p.featured ? 'featured' : ''}`} data-animate data-delay={i}>
              <div className="pain-number" style={{ color: p.color + '25' }}>{p.num}</div>
              <div className="pain-icon">{p.icon}</div>
              <h3>{p.title}</h3>
              <p className="pain-text">{p.pain}</p>
              <div className="pain-divider">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4v12M10 16l-3-3M10 16l3-3" stroke={p.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="solution-text">
                <strong style={{ color: p.color }}>解決 →</strong> {p.solution}
              </p>
            </div>
          ))}
        </div>
        <div className="pain-extra" data-animate data-delay="3">
          <p>「こんなこと頼めるかな？」と思ったら、まずはお気軽にご連絡ください。</p>
          <a href="mailto:shoma.yamamoto@lumenium.net" className="btn btn-secondary">無料で相談する →</a>
        </div>
      </div>
    </section>
  )
}
