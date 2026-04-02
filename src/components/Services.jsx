const services = [
  {
    emoji: '🎬',
    title: '動画制作・映像編集',
    desc: 'PR動画、SNS動画、企業紹介映像。AIを活用した動画制作からリアル撮影まで幅広く対応。',
    tags: ['PR動画', 'SNS動画', 'AI動画', '映像編集'],
  },
  {
    emoji: '🤖',
    featured: true,
    badge: '人気',
    title: 'AI導入・研修',
    desc: '企業向けAI研修、AI教材制作、toC向けIT講師。ChatGPTやAIツールの活用法を現場目線で指導。',
    tags: ['AI研修', 'IT講師', '教材制作', 'メルマガ'],
  },
  {
    emoji: '📱',
    title: 'SNS運用・LINE構築',
    desc: 'SNSの企画・運用代行、公式LINE構築、LINE Bot制作。フォロワー獲得から売上導線まで。',
    tags: ['SNS運用', 'LINE Bot', '公式LINE', '配信設計'],
  },
  {
    emoji: '🌐',
    title: 'Web制作・アプリ開発',
    desc: 'コーポレートサイト、LP、ECサイト、Webアプリ。ビジネスの顔となるサイトを制作。',
    tags: ['HP制作', 'LP', 'アプリ開発', 'EC'],
  },
  {
    emoji: '🎭',
    title: 'キャスト手配・イベント',
    desc: '在籍150名のモデル・アクター手配。芸能人のMC・コンパニオン手配も対応。イベント企画から運営まで。',
    tags: ['モデル手配', '芸能人手配', 'イベント企画', 'MC'],
  },
  {
    emoji: '✏️',
    title: 'クリエイティブ制作',
    desc: 'ライター業務、教材・書籍制作、イラスト、ロゴ、バナー、ポスター、作詞作曲まで。',
    tags: ['ライター', '教材制作', 'イラスト', 'ロゴ'],
  },
]

export default function Services() {
  return (
    <section className="services" id="services">
      <div className="container">
        <div className="section-header">
          <span className="section-tag">SERVICES</span>
          <h2 className="section-title">何でもやります。<br /><span className="gradient-text">全部、任せてください。</span></h2>
          <p className="section-description">「こんなことも頼めるの？」——はい、できます。</p>
        </div>
        <div className="services-grid">
          {services.map((s) => (
            <div key={s.title} className={`service-card ${s.featured ? 'featured' : ''}`} data-animate>
              {s.badge && <div className="service-badge">{s.badge}</div>}
              <div className="service-icon-wrapper">
                <div className="service-icon" style={{ fontSize: '28px', background: 'rgba(99, 102, 241, 0.1)' }}>
                  {s.emoji}
                </div>
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <div className="service-tags">
                {s.tags.map((t) => <span key={t}>{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
