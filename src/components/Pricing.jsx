const caseStudies = [
  {
    tag: '教材制作',
    title: '1ヶ月で塾教材4万ページ制作',
    desc: '各教科の教師を含めた20人規模の人員を確保し、期限内に遂行。',
    metric: '40,000',
    metricLabel: 'ページ / 1ヶ月',
  },
  {
    tag: 'SNS運用',
    title: 'SNS成長支援',
    desc: '予算等を相談しながら、企画構成から運用まで全てをサポート。',
    metric: '数十万人',
    metricLabel: '登録者CHの動画制作',
  },
]

const achievements = [
  '登録者数十万人規模のチャンネルの動画制作',
  '企業向けAI活用メルマガ制作',
  'AI教材制作',
  '企業ロゴ・バナー・ポスター制作',
  '企業公式LINE構築',
  'AI企業PR動画制作',
  'アプリ開発',
  '企業ホームページ制作',
  '有名飲食店での企画・映像制作',
  '配信者のプロデュース',
  'アイドルイベント主催・作詞作曲',
]

export default function Pricing() {
  return (
    <section className="pricing" id="results">
      <div className="container">
        <div className="section-header">
          <span className="section-tag">CASE STUDIES</span>
          <h2 className="section-title">こんな<span className="gradient-text">無茶ぶり</span>にも<br />対応しました</h2>
          <p className="section-description">規模の大小を問わず、チームで柔軟に対応します。</p>
        </div>
        <div className="case-grid">
          {caseStudies.map((c) => (
            <div key={c.title} className="case-card" data-animate>
              <div className="case-tag">{c.tag}</div>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
              <div className="case-metric">
                <span className="case-metric-value">{c.metric}</span>
                <span className="case-metric-label">{c.metricLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="achievements-section" data-animate>
          <h3 className="achievements-title">その他の実績</h3>
          <div className="achievements-grid">
            {achievements.map((a) => (
              <div key={a} className="achievement-item">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8l3 3 5-5" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
