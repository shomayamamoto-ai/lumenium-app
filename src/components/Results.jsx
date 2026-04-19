const caseStudies = [
  {
    tag: '教材制作',
    title: '1ヶ月で塾教材4万ページ制作',
    desc: '各教科の教師を含めた20人規模の人員を確保し、期限内に遂行しました。',
    metric: 40000,
    metricLabel: 'ページ / 1ヶ月',
  },
  {
    tag: 'AI講師',
    title: '研修・就業支援動画制作',
    desc: 'オンライン・オフライン・オンデマンドに対応。企業研修や就業支援向けの動画制作・講師を担当しました。',
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
  'アイドルイベント主催',
  '作詞作曲',
]

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
