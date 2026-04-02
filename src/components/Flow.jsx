const steps = [
  {
    icon: '✉️',
    title: 'メールでご相談',
    desc: '抽象的な内容でもOK。まずはお気軽にお問い合わせください。',
  },
  {
    icon: '🎧',
    title: 'ヒアリング',
    desc: '課題や要望を詳しくお聞きし、最適なプランをご提案します。',
  },
  {
    icon: '📋',
    title: '企画・お見積り',
    desc: '予算に合わせた企画構成と概算見積を提示。納得いくまでご相談OK。',
  },
  {
    icon: '🚀',
    title: '制作・実行',
    desc: 'プロのチームが制作・運用を遂行。進捗は随時共有します。',
  },
  {
    icon: '🤝',
    title: '納品・継続サポート',
    desc: '納品後もフォローアップ。継続的な運用・改善もお任せください。',
  },
]

export default function Flow() {
  return (
    <section className="flow" id="flow">
      <div className="container">
        <div className="section-header" data-animate>
          <span className="section-tag">FLOW</span>
          <h2 className="section-title">ご依頼の流れ</h2>
          <p className="section-description">まずはメール1通から。お気軽にどうぞ。</p>
        </div>
        <div className="flow-timeline">
          {steps.map((step, i) => (
            <div key={i} data-animate data-delay={i}>
              <div className="flow-step">
                <div className="step-number">
                  <span className="step-emoji">{step.icon}</span>
                  <span className="step-num">{i + 1}</span>
                </div>
                <div className="step-content">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </div>
              {i < steps.length - 1 && <div className="flow-connector" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
