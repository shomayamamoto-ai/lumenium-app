import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="#" className="nav-logo">
              <Logo size={28} id="logoGrad2" />
              <span>Lumenium</span>
            </a>
            <p className="footer-tagline">「困った」を丸ごと任せられる相棒。</p>
          </div>
          <div className="footer-links">
            <h4>サービス</h4>
            <a href="#services">動画制作・映像編集</a>
            <a href="#services">AI導入・研修</a>
            <a href="#services">SNS運用・LINE構築</a>
            <a href="#services">キャスト手配・イベント</a>
          </div>
          <div className="footer-links">
            <h4>情報</h4>
            <a href="#results">実績</a>
            <a href="#flow">ご依頼の流れ</a>
            <a href="#pain">お困りごと</a>
          </div>
          <div className="footer-links">
            <h4>お問い合わせ</h4>
            <a href="mailto:shoma.yamamoto@lumenium.net">shoma.yamamoto@lumenium.net</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Lumenium. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
