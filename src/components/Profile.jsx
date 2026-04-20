export default function Profile() {
  const career = [
    { year: '2019.4', detail: '慶應義塾大学 文学部 入学', sub: '経済新人会マーケ研 / 早稲田AI研究会' },
    { year: '在学中', detail: 'ADKビジコン・Microsoftビジコン入賞多数', sub: '' },
    { year: '2020.3〜', detail: '個人事業主として活動開始', sub: '動画 / SNS / AI開発' },
    { year: '2024.1', detail: '株式会社Link AI（業務委託）', sub: 'AIメディア事業部 PM / メルマガライター' },
    { year: '2026.3', detail: '慶應義塾大学 文学部 卒業', sub: '' },
    { year: '現在', detail: 'Lumenium 設立', sub: '動画制作・DX支援・AI研修を軸に事業展開' },
  ]

  return (
    <section className="section" id="about">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">ABOUT</p>
          <h2 className="section-title">代表紹介</h2>
        </div>
        <div className="profile" data-animate data-delay="1">
          <div className="profile-photo">
            <img src="/profile.jpg?v=2" alt="山本 捷真" loading="lazy" decoding="async" width="426" height="520" />
          </div>
          <div className="profile-body">
            <h3 className="profile-name">山本 捷真<span>Shoma Yamamoto</span></h3>
            <p className="profile-role">Lumenium 代表</p>

            <div className="profile-desc">
              <p>慶應義塾大学 文学部 卒業。在学中から個人事業主として活動開始。</p>
              <p>動画、AI、Web、SNSなど幅広く活動。</p>
              <p>企業向けAI研修の講師も歴任。</p>
              <p>企画から納品まで一括でサポートします。</p>
            </div>

            <div className="profile-skills">
              <span>AI研修・講師</span>
              <span>動画制作</span>
              <span>LINE Bot</span>
              <span>Web・アプリ開発</span>
              <span>キャスト手配</span>
              <span>作詞作曲</span>
            </div>
            <a href="https://advovisions.com/bcd31-home/" target="_blank" rel="noopener noreferrer" className="partner-badge">
              <img src="/advovisions-logo.png" alt="AdvoVisions" className="partner-logo" loading="lazy" decoding="async" /> パートナー: 合同会社 AdvoVisions
            </a>
          </div>
        </div>

        <div className="profile-bricks" data-animate data-delay="2" aria-label="活動領域">
          <article className="profile-brick">
            <span className="profile-brick-label">EXPERTISE</span>
            <h4 className="profile-brick-title">得意領域</h4>
            <p className="profile-brick-text">AI活用の設計と現場実装、動画の企画・演出、業務自動化のためのLINE / Web開発。「目的→手段」の翻訳に強みがあります。</p>
            <ul className="profile-brick-list">
              <li>AI研修 (企業向け・エンジニア向け)</li>
              <li>動画企画・編集・配信設計</li>
              <li>LINE Bot / Webアプリ開発</li>
            </ul>
          </article>
          <article className="profile-brick">
            <span className="profile-brick-label">BACKGROUND</span>
            <h4 className="profile-brick-title">バックグラウンド</h4>
            <p className="profile-brick-text">在学中から個人事業主として活動開始。マーケ・映像・AI開発を横断し、企業のAI導入コンサル、メディア運営 PM、ライター業を経て Lumenium を設立。</p>
            <ul className="profile-brick-list">
              <li>慶應義塾大学 文学部 卒業</li>
              <li>ビジネスコンテスト入賞多数</li>
              <li>株式会社Link AI にて AI メディア PM</li>
            </ul>
          </article>
          <article className="profile-brick">
            <span className="profile-brick-label">PHILOSOPHY</span>
            <h4 className="profile-brick-title">仕事観</h4>
            <p className="profile-brick-text">制作物は「成果への通り道」だと考えています。お客様の事業が前に進むことを最優先に、工程・関係・情報をなるべく透明にして伴走します。</p>
            <ul className="profile-brick-list">
              <li>まず「目的」を一緒に言語化する</li>
              <li>作って終わりではなく運用まで</li>
              <li>不透明な費用・工程を作らない</li>
            </ul>
          </article>
        </div>

        <div className="career-timeline" data-animate data-delay="2">
          <h4 className="career-heading">経歴</h4>
          <div className="career-list">
            {career.map((c, i) => (
              <div key={i} className="career-item">
                <span className="career-year">{c.year}</span>
                <div className="career-dot" />
                <div className="career-content">
                  <p className="career-detail">{c.detail}</p>
                  {c.sub && <p className="career-sub">{c.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
