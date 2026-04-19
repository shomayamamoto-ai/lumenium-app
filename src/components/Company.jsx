const info = [
  { label: '会社名', value: 'Lumenium' },
  { label: '代表者', value: '山本 捷真' },
  { label: '設立', value: '2026年' },
  { label: '事業内容', value: '動画制作 / AI研修 / SNS運用 / LINE Bot / Web開発 / キャスト手配 他' },
  { label: '拠点', value: '東京・オンライン' },
  { label: 'パートナー', value: '合同会社 AdvoVisions', link: 'https://advovisions.com/bcd31-home/' },
  { label: 'お問い合わせ', value: 'お問い合わせフォームよりご連絡ください', link: '#contact-form' },
]

export default function Company() {
  return (
    <section className="section section--gray" id="company">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">COMPANY</p>
          <h2 className="section-title">会社概要</h2>
        </div>

        <div className="company-card" data-animate data-delay="1">
          {/* Letterhead */}
          <header className="company-card-head">
            <img src="/favicon.svg" alt="Lumenium" className="company-card-logo" width="48" height="48" loading="lazy" />
            <div className="company-card-head-text">
              <p className="company-card-eyebrow">LUMENIUM · TOKYO</p>
              <p className="company-card-tagline">散文化した目的に、焦点を当てる。</p>
            </div>
          </header>

          {/* Body — key / value grid */}
          <dl className="company-card-body">
            {info.map((item) => (
              <div key={item.label} className="company-card-row">
                <dt>{item.label}</dt>
                <dd>
                  {item.link ? (
                    <a href={item.link} target={item.link.startsWith('mailto') ? undefined : '_blank'} rel="noopener noreferrer">
                      {item.value}
                      {!item.link.startsWith('mailto') && (
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M7 4h9v9M16 4L4 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </a>
                  ) : item.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Foil / signature */}
          <footer className="company-card-foot">
            <span className="company-card-foil" aria-hidden="true" />
            <span className="company-card-signature">Lumenium, 2026</span>
          </footer>
        </div>
      </div>
    </section>
  )
}
