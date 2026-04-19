export default function CTA() {
  return (
    <section className="section section--cta" id="contact">
      <div className="container">
        <div className="cta-inner" data-animate>
          <p className="section-label" style={{ color: '#fff' }}>LET'S TALK</p>
          <h2 className="cta-title">あなたの"やりたい"を、<br />光ある形に。</h2>
          <p className="cta-desc">
            「何から始めればいいかわからない」——まずはそこからで大丈夫です。<br />
            Lumeniumが一緒に整理し、最短ルートの解決策までご提案します。
          </p>
          <a href="#contact-form" className="btn btn-white" data-cta="cta-consult">
            無料でご相談する
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <div className="cta-badges">
            <span>✓ 48時間以内にご提案</span>
            <span>✓ 見積り無料</span>
            <span>✓ 秘密厳守</span>
          </div>
        </div>
      </div>
    </section>
  )
}
