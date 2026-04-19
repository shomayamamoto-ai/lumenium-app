// Editorial-style brand narrative.
// Designed as a 3-chapter reading experience — not a sales block.
const CHAPTERS = [
  {
    no: '01',
    eyebrow: 'NAME',
    title: '社名について',
    body: [
      'Lumenium は、ラテン語で「光」を意味する Lumen から取りました。',
      'お客様の中でまだ輪郭のない目的に、光を当てて形にしていく。',
      'それが、私たちの役割だと考えています。',
    ],
  },
  {
    no: '02',
    eyebrow: 'APPROACH',
    title: '対応領域',
    body: [
      '動画・AI・Web・SNS・キャスト手配・クリエイティブの6領域を扱っています。',
      '実際のプロジェクトでは、これらは一つの目的のもとで絡み合うことがほとんどです。',
      '複数社をまたぐ調整をお客様側で抱え込まずに済むよう、窓口を一本化しています。',
    ],
  },
  {
    no: '03',
    eyebrow: 'STANCE',
    title: '制作後の伴走',
    body: [
      '動画もサイトも LINE も、公開した時点では成果が出揃いません。',
      '数字が動き始めるまでには、運用とチューニングに時間がかかります。',
      '制作だけで終わらせず、運用フェーズまでご一緒できる体制を前提にしています。',
    ],
  },
]

export default function BrandStory() {
  return (
    <section className="section section--gray" id="story">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">ABOUT</p>
          <h2 className="section-title">Lumenium について</h2>
          <p className="section-desc">社名の由来、事業の考え方、取り組み方をご紹介します。</p>
        </div>

        <div className="story">
          {CHAPTERS.map((c, i) => (
            <article key={c.no} className="story-chapter" data-animate data-delay={i + 1}>
              <header className="story-chapter-head">
                <span className="story-chapter-no" aria-hidden="true">{c.no}</span>
                <span className="story-chapter-eyebrow">{c.eyebrow}</span>
              </header>
              <h3 className="story-chapter-title">{c.title}</h3>
              <div className="story-chapter-body">
                {c.body.map((p, idx) => <p key={idx}>{p}</p>)}
              </div>
            </article>
          ))}
        </div>

        <footer className="story-footer" data-animate data-delay="4">
          <div className="story-signature">
            <span className="story-signature-label">LUMENIUM FOUNDER</span>
            <span className="story-signature-name">山本 捷真</span>
            <span className="story-signature-en">Shoma Yamamoto</span>
          </div>
          <a href="#contact-form" className="btn btn-accent" data-cta="story-consult">
            一度話してみる
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </footer>
      </div>
    </section>
  )
}
