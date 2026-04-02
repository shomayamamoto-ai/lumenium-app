const caseStudies = [
  {
    tag: '教材制作',
    icon: '📚',
    title: '1ヶ月で塾教材4万ページ制作',
    desc: '各教科の教師を含めた20人規模の人員を確保し、期限内に遂行しました。',
    metric: 40000,
    metricSuffix: '',
    metricPrefix: '',
    metricLabel: 'ページ / 1ヶ月',
    color: '#6366f1',
  },
  {
    tag: 'SNS運用',
    icon: '📈',
    title: 'SNS成長支援',
    desc: '予算等を相談しながら、企画構成から運用まで全てをサポートしました。',
    metric: 150,
    metricSuffix: '名+',
    metricPrefix: '',
    metricLabel: 'キャスト在籍',
    color: '#a855f7',
  },
]

const achievements = [
  { text: '登録者数十万人規模のチャンネルの動画制作', icon: '🎬' },
  { text: '企業向けAI活用メルマガ制作', icon: '📧' },
  { text: 'AI教材制作', icon: '🤖' },
  { text: '企業ロゴ・バナー・ポスター制作', icon: '🎨' },
  { text: '企業公式LINE構築', icon: '💬' },
  { text: 'AI企業PR動画制作', icon: '📹' },
  { text: 'アプリ開発', icon: '📱' },
  { text: '企業ホームページ制作', icon: '🌐' },
  { text: '有名飲食店での企画・映像制作', icon: '🍽️' },
  { text: '配信者のプロデュース', icon: '🎙️' },
  { text: 'アイドルイベント主催', icon: '🎤' },
  { text: 'アイドルグループの作詞作曲', icon: '🎵' },
]

export default function Results() {
  return (
    <section className="results" id="results">
      <div className="container">
        <div className="section-header" data-animate>
          <span className="section-tag">RESULTS</span>
          <h2 className="section-title">
            こんな<span className="gradient-text">無茶ぶり</span>にも<br />対応しました
          </h2>
          <p className="section-description">規模の大小を問わず、チームで柔軟に対応します。</p>
        </div>

        <div className="case-grid">
          {caseStudies.map((c, i) => (
            <div key={c.title} className="case-card glow-card" data-animate data-delay={i}>
              <div className="case-tag" style={{ background: c.color + '15', color: c.color }}>{c.tag}</div>
              <div className="case-icon">{c.icon}</div>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
              <div className="case-metric">
                <span
                  className="case-metric-value"
                  data-count={c.metric}
                  data-suffix={c.metricSuffix}
                  data-prefix={c.metricPrefix}
                  style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                >
                  0
                </span>
                <span className="case-metric-label">{c.metricLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="achievements-section" data-animate data-delay="2">
          <h3 className="achievements-title">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 8l3 3 5-5" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            その他の実績
          </h3>
          <div className="achievements-grid">
            {achievements.map((a) => (
              <div key={a.text} className="achievement-item">
                <span className="achievement-icon">{a.icon}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
