export default function CTA() {
  return (
    <section className="cta" id="contact">
      <div className="cta-bg">
        <div className="cta-glow cta-glow-1" />
        <div className="cta-glow cta-glow-2" />
      </div>
      <div className="container">
        <div className="cta-content">
          <h2 className="cta-title">
            「こんなこと頼めるかな？」<br />
            <span className="gradient-text">まずは聞いてください。</span>
          </h2>
          <p className="cta-description">
            抽象的な相談でも大丈夫です。<br />
            お困りごとをお聞かせいただければ、最適な解決策をご提案します。
          </p>
          <div className="cta-actions">
            <a href="mailto:shoma.yamamoto@lumenium.net" className="btn btn-primary btn-large">
              メールで無料相談する
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
          <p className="cta-note">shoma.yamamoto@lumenium.net</p>
        </div>
      </div>
    </section>
  )
}
