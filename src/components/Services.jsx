const services = [
  {
    icon: '🎬',
    title: '動画制作・映像編集',
    desc: 'PR動画、SNS動画、企業紹介映像、AI動画。企画から撮影・編集・納品まで一貫対応。',
    tags: ['PR動画', 'SNS動画', 'AI動画', '映像編集', '企業CM'],
    color: '#6366f1',
  },
  {
    icon: '🤖',
    title: 'AI導入・研修',
    desc: '企業向けAI研修、AI教材制作、toC向けIT講師。AIツールの活用法を現場目線で指導します。',
    tags: ['AI研修', 'IT講師', '教材制作', 'メルマガ'],
    color: '#a855f7',
    featured: true,
    badge: '人気',
  },
  {
    icon: '📱',
    title: 'SNS運用・LINE構築',
    desc: 'SNSの企画・運用代行、公式LINE構築、LINE Bot制作。フォロワー獲得から売上導線設計まで。',
    tags: ['SNS運用', 'LINE Bot', '公式LINE', '配信設計'],
    color: '#06b6d4',
  },
  {
    icon: '🌐',
    title: 'Web制作・アプリ開発',
    desc: 'コーポレートサイト、LP、Webアプリ。ビジネスの顔となるサイトを制作します。',
    tags: ['HP制作', 'LP', 'アプリ開発', 'AI開発'],
    color: '#10b981',
  },
  {
    icon: '🎭',
    title: 'キャスト手配・イベント',
    desc: '在籍150名のモデル・アクター手配。芸能人MC・コンパニオンも対応。イベント企画〜運営。',
    tags: ['モデル手配', '芸能人MC', 'イベント企画', 'コンパニオン'],
    color: '#f59e0b',
  },
  {
    icon: '✏️',
    title: 'クリエイティブ制作',
    desc: 'ライター業務、教材・書籍制作、イラスト、ロゴ、バナー、ポスター、作詞作曲まで。',
    tags: ['ライター', '教材', 'イラスト', 'ロゴ', '作詞作曲'],
    color: '#ec4899',
  },
]

export default function Services() {
  return (
    <section className="services" id="services">
      <div className="container">
        <div className="section-header" data-animate>
          <span className="section-tag">SERVICES</span>
          <h2 className="section-title">
            何でもやります。<br />
            <span className="gradient-text">全部、任せてください。</span>
          </h2>
          <p className="section-description">「こんなことも頼めるの？」——はい、できます。</p>
        </div>
        <div className="services-grid">
          {services.map((s, i) => (
            <div key={s.title} className={`service-card glow-card ${s.featured ? 'featured' : ''}`} data-animate data-delay={i}>
              {s.badge && <div className="service-badge">{s.badge}</div>}
              <div className="service-icon" style={{ background: s.color + '15', fontSize: '28px' }}>
                {s.icon}
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <div className="service-tags">
                {s.tags.map((t) => (
                  <span key={t} style={{ background: s.color + '12', color: s.color, borderColor: s.color + '25' }}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
