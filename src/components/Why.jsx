const painPoints = [
  {
    num: '01',
    emoji: '📱',
    title: 'SNSに弱い…',
    pain: 'SNSで集客したいけど、何から始めればいいかわからない',
    solution: '企画構成から運用まで全てサポート。予算に合わせた最適なSNS戦略をご提案します。',
  },
  {
    num: '02',
    featured: true,
    emoji: '🎬',
    title: '動画を作る時間がない…',
    pain: '動画を作りたいけど、企画・構成・編集に時間を割くのが難しい',
    solution: 'プロのクリエイターが企画から編集、納品まで一貫対応。あなたは確認するだけ。',
  },
  {
    num: '03',
    emoji: '💬',
    title: 'LINEで発信したい…',
    pain: '公式LINEを作って情報発信やリード獲得に繋げたい',
    solution: 'LINE Bot制作から配信設計まで、反応率の高い仕組みを構築します。',
  },
]

export default function Why() {
  return (
    <section className="why" id="pain">
      <div className="container">
        <div className="section-header">
          <span className="section-tag">YOUR PAIN POINTS</span>
          <h2 className="section-title">こんな<span className="gradient-text">お困りごと</span><br />ありませんか？</h2>
          <p className="section-description">上記以外の内容や抽象的な内容でも、ぜひご相談ください。</p>
        </div>
        <div className="promises-grid">
          {painPoints.map((p) => (
            <div key={p.num} className={`promise-card ${p.featured ? 'featured' : ''}`} data-animate>
              <div className="promise-number">{p.num}</div>
              <div className="promise-icon" style={{ fontSize: '32px', background: 'none' }}>
                {p.emoji}
              </div>
              <h3>{p.title}</h3>
              <p className="pain-text">{p.pain}</p>
              <div className="solution-divider" />
              <p className="solution-text">{p.solution}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
