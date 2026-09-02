import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
export default function Footer({ onPrivacy }) {
  return (
    <footer className="footer">
      <div className="footer-cta-bar">
        <div className="container footer-cta-inner">
          <div className="footer-cta-copy">
            <p className="footer-cta-label">{SECTION.footer.ctaLabel}</p>
            <p className="footer-cta-title">{rich(SECTION.footer.ctaTitle)}</p>
          </div>
          <a href="#contact-form" className="btn btn-white" data-cta="footer-consult">
            {SECTION.footer.ctaButton}
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      </div>

      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <a href="#top" className="footer-logo">
              <img src="/lumenium-logo.svg?v=2" alt="Lumenium（ルメニウム）" className="nav-logo-img" loading="lazy" decoding="async" width="40" height="40" />
              <span>Lumenium<small className="footer-logo-yomi">{SECTION.home.yomi}</small></span>
            </a>
            <p className="footer-tagline">{rich(SECTION.footer.tagline)}</p>
            <p className="footer-sub">{rich(SECTION.footer.sub)}</p>
            <ul className="footer-contact">
              <li>
                <span>CONTACT</span>
                <a href="#contact-form">お問い合わせフォーム →</a>
              </li>
              <li>
                <span>BASE</span>
                <span className="footer-contact-text">{SECTION.footer.base}</span>
              </li>
            </ul>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <h4>サービス</h4>
              <a href="/services/video.html">動画制作・映像編集</a>
              <a href="/services/ai.html">AI導入・研修</a>
              <a href="/services/sns.html">SNS運用・LINE構築</a>
              <a href="/services/web.html">Web制作・アプリ開発</a>
              <a href="/services/cast.html">キャスト手配・イベント</a>
              <a href="/services/creative.html">クリエイティブ制作</a>
            </div>
            <div className="footer-col">
              <h4>情報</h4>
              <a href="/pricing.html">料金</a>
              <a href="/works.html">実績</a>
              <a href="/voice.html">お客様の声</a>
              <a href="/flow.html">ご依頼の流れ</a>
              <a href="/faq.html">よくある質問</a>
              <a href="/blog/index.html">ブログ</a>
              <a href="#about">代表紹介</a>
              <a href="/about.html">会社概要（Lumeniumとは）</a>
            </div>
            <div className="footer-col">
              <h4>その他</h4>
              <a href="#contact-form">お問い合わせ</a>
              <a href="https://advovisions.com/bcd31-home/" target="_blank" rel="noopener noreferrer">
                AdvoVisions<span aria-hidden="true"> ↗</span>
              </a>
              <a href="/game.html">ミニゲーム</a>
              <a href="/sitemap.html">サイトマップ</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">
            <span aria-hidden="true">©</span> 2026 Lumenium（ルメニウム）. All rights reserved.
          </p>
          <div className="footer-legal">
            <button type="button" className="footer-privacy" onClick={onPrivacy}>プライバシーポリシー</button>
            <a href="/specified-commerce.html" className="footer-legal-link">特定商取引法に基づく表記</a>
            <a href="#contact-form" className="footer-legal-link">お問い合わせ</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
