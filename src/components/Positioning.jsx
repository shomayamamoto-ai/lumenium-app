// Competitive positioning map — high quality × high cost-performance.
// Editorial 2x2 quadrant chart, modelled on the BIZ BUZZ-style reference.

export default function Positioning() {
  return (
    <section className="section" id="positioning">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">POSITIONING</p>
          <h2 className="section-title">Lumeniumってどんな会社？</h2>
          <p className="section-desc">
            大手制作会社・クラウドソーシング——どれとも違う、Lumeniumの立ち位置です。
          </p>
        </div>

        <div className="positioning" data-animate data-delay="1">
          <div className="positioning-frame" role="img" aria-label="Lumeniumのポジショニング: 高クオリティ・高コストパフォーマンスの領域に位置する">
            {/* Axes — CSS lines + fixed-size triangle arrowheads. (The old
                stretched-SVG polygons distorted and clipped at the edges.) */}
            <div className="positioning-axes" aria-hidden="true">
              <span className="paxis-line paxis-line--h" />
              <span className="paxis-line paxis-line--v" />
              <span className="paxis-arrow paxis-arrow--left" />
              <span className="paxis-arrow paxis-arrow--right" />
              <span className="paxis-arrow paxis-arrow--up" />
              <span className="paxis-arrow paxis-arrow--down" />
            </div>

            {/* Quadrant: top-left — big agency / production house */}
            <div className="pq pq--tl">
              <span className="pq-label">大手制作会社・<br />広告代理店</span>
            </div>

            {/* Quadrant: top-right — Lumenium (winning corner) */}
            <div className="pq pq--tr pq--brand">
              <img src="/favicon.svg" alt="" width="28" height="28" className="pq-brand-mark" loading="lazy" decoding="async" />
              <span className="pq-brand-name">Lumenium</span>
            </div>

            {/* Quadrant: bottom-right — crowdsourcing / freelancers */}
            <div className="pq pq--br">
              <span className="pq-label">クラウドソーシング・<br />フリーランス</span>
            </div>

            {/* Axis tick chips (placed on the axis lines) */}
            <span className="paxis-chip paxis-chip--top">高い</span>
            <span className="paxis-chip paxis-chip--bottom">低い</span>
            <span className="paxis-chip paxis-chip--left">低い</span>
            <span className="paxis-chip paxis-chip--right">高い</span>

            {/* Axis names (placed just outside the axes) */}
            <span className="paxis-name paxis-name--x">コストパフォーマンス</span>
            <span className="paxis-name paxis-name--y">クオリティ・対応力</span>
          </div>

          {/* Supporting copy — explains the chart in words for accessibility & SEO */}
          <ul className="positioning-notes">
            <li>
              <span className="positioning-notes-k">大手</span>
              品質は高いが固定費が重く、最低発注額・最低契約期間のハードルが大きい。
            </li>
            <li>
              <span className="positioning-notes-k">クラウドソーシング</span>
              安価で着手できるが、品質・進行・運用責任が分散しやすい。
            </li>
            <li>
              <span className="positioning-notes-k positioning-notes-k--brand">Lumenium</span>
              企画〜運用までワンストップ。大手品質のアウトプットを、必要な規模だけで提供します。
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
