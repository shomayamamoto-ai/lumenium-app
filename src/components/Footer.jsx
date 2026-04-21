import { Link } from 'react-router-dom'

export default function Footer({ onPrivacy }) {
  return (
    <footer className="footer">
      <div className="footer-cta-bar">
        <div className="container footer-cta-inner">
          <div className="footer-cta-copy">
            <p className="footer-cta-label">LET'S TALK</p>
            <p className="footer-cta-title">はじめの一歩は、30分のご相談から。</p>
          </div>
          <a href="/#contact-form" className="btn btn-white" data-cta="footer-consult">
            無料で相談する
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      </div>

      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              <img src="/lumenium-logo.svg?v=4" alt="Lumenium" className="nav-logo-img" loading="lazy" decoding="async" width="40" height="40" />
              <span>Lumenium</span>
            </Link>
            <p className="footer-tagline">散文化した目的に、焦点を当てる。</p>
            <p className="footer-sub">動画・AI・Webを中心に、企画から運用までを一緒に走りながら、お客様の想いをかたちにしています。</p>
            <ul className="footer-contact">
              <li>
                <span>CONTACT</span>
                <a href="/#contact-form">お問い合わせフォーム →</a>
              </li>
              <li>
                <span>BASE</span>
                <span className="footer-contact-text">東京 / オンライン全国対応</span>
              </li>
            </ul>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <h4>サービス</h4>
              <a href="/#services">動画制作・映像編集</a>
              <a href="/#services">AI導入・研修</a>
              <a href="/#services">SNS運用・LINE構築</a>
              <a href="/#services">Web制作・アプリ開発</a>
              <a href="/#services">キャスト手配・イベント</a>
              <a href="/#services">クリエイティブ制作</a>
            </div>
            <div className="footer-col">
              <h4>情報</h4>
              <a href="/#pricing">料金</a>
              <a href="/#results">実績</a>
              <a href="/#testimonials">お客様の声</a>
              <a href="/#flow">ご依頼の流れ</a>
              <a href="/#faq">よくある質問</a>
              <Link to="/blog">ブログ</Link>
              <a href="/#about">代表紹介</a>
              <a href="/#company">会社概要</a>
            </div>
            <div className="footer-col">
              <h4>その他</h4>
              <a href="/#contact-form">お問い合わせ</a>
              <a href="https://advovisions.com/bcd31-home/" target="_blank" rel="noopener noreferrer">
                AdvoVisions<span aria-hidden="true"> ↗</span>
              </a>
              <a href="/game.html">ミニゲーム</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">
            <span aria-hidden="true">©</span> 2026 Lumenium. All rights reserved.
          </p>
          <div className="footer-legal">
            {onPrivacy ? (
              <button type="button" className="footer-privacy" onClick={onPrivacy}>プライバシーポリシー</button>
            ) : (
              <a href="/#privacy" className="footer-legal-link">プライバシーポリシー</a>
            )}
            <a href="/specified-commerce.html" className="footer-legal-link">特定商取引法に基づく表記</a>
            <a href="/#contact-form" className="footer-legal-link">お問い合わせ</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
