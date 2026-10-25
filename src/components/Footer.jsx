import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import Wordmark from './Wordmark'

// 左に会社のカード（ロゴ・社名・拠点・著作権）、右に4列のリンク、右下に連絡の帯
// （電話か無料相談・お問い合わせ・公式LINE）。電話番号と LINE の URL は
// 文章編集（text.footer）で入れたものだけ出します。
const telHref = (t) => 'tel:' + String(t).replace(/[^\d+]/g, '')

export default function Footer({ onPrivacy }) {
  return (
    <footer className="footer ft">
      <div className="container ft-grid">
        <div className="ft-card">
          <a href="#top" className="footer-logo ft-logo">
            <img src="/lumenium-logo.svg?v=3" alt="Lumenium（ルメニウム）" className="nav-logo-img" loading="lazy" decoding="async" width="40" height="40" />
            <span className="footer-logo-stack"><Wordmark className="footer-wm" /><small className="footer-logo-yomi">{SECTION.home.yomi}</small></span>
          </a>
          <p className="ft-tagline">{rich(SECTION.footer.tagline)}</p>
          <p className="ft-sub">{rich(SECTION.footer.sub)}</p>
          <dl className="ft-info">
            <div><dt>拠点</dt><dd>{SECTION.footer.base}</dd></div>
            <div><dt>ご相談</dt><dd><a href="#contact-form">お問い合わせフォーム →</a></dd></div>
          </dl>
          <p className="ft-copy"><span aria-hidden="true">©</span> 2026 Lumenium（ルメニウム）. <span className="ft-nw">All rights reserved.</span></p>
        </div>

        <div className="ft-main">
          <nav className="ft-links" aria-label="サイト内のリンク">
            <div className="ft-col">
              <h4>サービス</h4>
              <a href="/services/web.html">システム開発・HP制作</a>
              <a href="/services/ai.html">AI研修・AI導入支援</a>
              <a href="/services/video.html">動画制作・映像編集</a>
              <a href="/services/sns.html">SNS運用・LINE構築</a>
              <a href="/services/cast.html">キャスト手配・イベント</a>
              <a href="/services/creative.html">クリエイティブ制作</a>
            </div>
            <div className="ft-col">
              <h4>ご依頼</h4>
              <a href="/pricing.html">料金</a>
              <a href="/works.html">実績</a>
              <a href="/voice.html">お客様の声</a>
              <a href="/flow.html">ご依頼の流れ</a>
              <a href="/faq.html">よくある質問</a>
            </div>
            <div className="ft-col">
              <h4>会社</h4>
              <a href="/about.html">会社概要（Lumeniumとは）</a>
              <a href="/profile.html">代表紹介</a>
              <a href="/blog/index.html">ブログ</a>
              <a href="https://advovisions.com/bcd31-home/" target="_blank" rel="noopener noreferrer">
                AdvoVisions<span aria-hidden="true"> ↗</span>
              </a>
            </div>
            <div className="ft-col">
              <h4>その他</h4>
              <a href="#contact-form">お問い合わせ</a>
              <button type="button" className="ft-linkbtn" onClick={onPrivacy}>プライバシーポリシー</button>
              <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
              <a href="/sitemap.html">サイトマップ</a>
              <a href="/game.html">ミニゲーム</a>
            </div>
          </nav>

          <div className="ft-bar">
            {SECTION.footer.tel ? (
              <a className="ft-call" href={telHref(SECTION.footer.tel)} data-cta="footer-tel">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4-2 1.6a12 12 0 0 0 6.3 6.3l1.6-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" /></svg>
                <span><b>{SECTION.footer.tel}</b>{SECTION.footer.telHours ? <small>{SECTION.footer.telHours}</small> : null}</span>
              </a>
            ) : (
              <a className="ft-call" href="#contact" data-cta="footer-consult">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-4.5 3.5v-3.5H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" /></svg>
                <span><b className="ft-call-text">{SECTION.footer.consult}</b>{SECTION.footer.consultNote ? <small>{SECTION.footer.consultNote}</small> : null}</span>
              </a>
            )}
            <a className="ft-btn" href="#contact-form" data-cta="footer-contact">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6h17v12h-17z M4 6.5l8 6 8-6" /></svg>
              お問い合わせ
            </a>
            {SECTION.footer.line ? (
              <a className="ft-btn ft-btn--line" href={SECTION.footer.line} target="_blank" rel="noopener noreferrer" data-cta="footer-line">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4C7 4 3 7.2 3 11.2c0 3.6 3.2 6.6 7.5 7.1.3.1.7.2.8.5l-.2 1.7c0 .3.2.6.6.4 2.7-1.4 7.3-4.7 7.3-9.7C21 7.2 17 4 12 4Z" /></svg>
                公式LINE
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  )
}
