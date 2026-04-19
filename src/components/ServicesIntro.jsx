// Editorial-style split intro block.
// Sits just before the Services grid — provides visual difference
// between Why (card grid) and Services (card grid) with a break.

export default function ServicesIntro() {
  return (
    <section className="services-intro" aria-hidden="true">
      <div className="container services-intro-inner" data-animate>
        <div className="services-intro-copy">
          <p className="services-intro-label">NEXT · SERVICES</p>
          <h2 className="services-intro-title">
            Lumenium が<br />お手伝いできる領域。
          </h2>
          <p className="services-intro-lead">
            動画制作からAI導入、Web開発まで。一つひとつの領域に、専門チームが伴走します。
          </p>
        </div>

        <div className="services-intro-meta">
          <dl className="services-intro-dl">
            <div><dt>領域数</dt><dd>6</dd></div>
            <div><dt>対応業界</dt><dd>12+</dd></div>
            <div><dt>ご提案まで</dt><dd>48h 以内</dd></div>
          </dl>
        </div>
      </div>
    </section>
  )
}
