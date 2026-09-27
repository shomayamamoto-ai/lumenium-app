import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { PRICE_OPTIONS } from '../data/site'
import LineIcon from './LineIcon'

/**
 * ファーストビュー。
 *
 * 初めて来た人が数秒で知りたいのは「何をしている会社か」「自分に関係
 * あるか」「いくらくらいか」「どう相談すればいいか」の4つです。以前は
 * 3Dの結晶・背景動画・粒子・文字が打たれる演出が並び、その答えは画面の
 * 下のほうにありました。ここでは演出をやめて、左に一言と相談ボタン、
 * 右に6つの領域と目安の料金を置き、スクロールしなくても答えがそろう
 * ようにしています。動くものは置きません。
 *
 * 右の一覧は料金シミュレーターと同じデータ（PRICE_OPTIONS）から作るので、
 * 管理画面で料金を直せば、ここも一緒に変わります。
 */
const yen = (n) => `¥${n.toLocaleString('ja-JP')}〜`

export default function Hero() {
  return (
    <section className="hero hero--plain" id="top">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="hero-eyebrow">{SECTION.hero.lead}</p>
          <h1 className="hero-title">
            {SECTION.hero.titleLine1}
            <br />
            <span className="text-accent">{SECTION.hero.titleLine2}</span>
          </h1>
          <p className="hero-desc">{rich(SECTION.hero.desc)}</p>
          <div className="hero-actions">
            <a href="#contact-form" className="btn btn-accent" data-cta="hero-consult">
              無料で相談する
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <a href="#pricing" className="btn btn-ghost-w" data-cta="hero-pricing">料金の目安を見る</a>
          </div>
          <ul className="hero-assure" aria-label="ご相談について">
            <li>相談・見積りは無料</li>
            <li>48時間以内にご返信</li>
            <li>動画1本・LP1枚から</li>
          </ul>
        </div>

        <div className="hero-offer">
          <p className="hero-offer-title">{SECTION.hero.typingLabel}</p>
          <ul className="hero-offer-list">
            {PRICE_OPTIONS.map((o) => (
              <li key={o.key}>
                <a href="#services" className="hero-offer-item" data-cta={`hero-offer-${o.key}`}>
                  <span className="hero-offer-icon" aria-hidden="true"><LineIcon name={o.key} size={20} /></span>
                  <span className="hero-offer-text">
                    <span className="hero-offer-name">{o.label}</span>
                    <span className="hero-offer-sub">{o.sub}</span>
                  </span>
                  <span className="hero-offer-price">{yen(o.min)}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="hero-offer-note">料金は目安です。内容を伺ってから正確にお見積りします。</p>
        </div>
      </div>
      <div className="container">
        <p className="hero-define">
          {rich(SECTION.home.definition)}
          <a href="/about.html">{SECTION.home.definitionLink}</a>
        </p>
      </div>
    </section>
  )
}
