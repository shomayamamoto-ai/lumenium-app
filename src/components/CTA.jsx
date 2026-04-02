export default function CTA() {
  return (
    <section className="cta" id="contact">
      <div className="cta-bg">
        <div className="cta-glow cta-glow-1" />
        <div className="cta-glow cta-glow-2" />
      </div>
      <div className="container">
        <div className="cta-content" data-animate>
          <div className="cta-badge">💡 初回相談は無料です</div>
          <h2 className="cta-title">
            「こんなこと頼めるかな？」<br />
            <span className="gradient-text">まずは聞いてください。</span>
          </h2>
          <p className="cta-description">
            抽象的な相談でも大丈夫です。お困りごとをお聞かせいただければ、<br className="hide-mobile" />
            最適な解決策をご提案します。
          </p>
          <div className="cta-actions">
            <a href="mailto:shoma.yamamoto@lumenium.net" className="btn btn-primary btn-large btn-glow">
              メールで無料相談する
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
          <p className="cta-email">shoma.yamamoto@lumenium.net</p>
          <div className="cta-trust">
            <span>✓ 48時間以内に返信</span>
            <span>✓ 見積り無料</span>
            <span>✓ 秘密厳守</span>
          </div>
        </div>
      </div>
    </section>
  )
}
