import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { SERVICES } from '../data/services'
import { CASE_STUDIES, ACHIEVEMENTS, FLOW_STEPS } from '../data/site'
import { FAQ_GROUPS } from '../data/faq'
import LineIcon from './LineIcon'
import ContactForm from './ContactForm'
import Footer from './Footer'

/**
 * トップページ。
 *
 * 1ページで「何をしている会社か → いくらか → 本当にできるのか → どう
 * 進むか → 相談」まで、5画面ほどで読み終わる長さにしています。お知らせ・
 * 社名の由来・代表の経歴・お客様の声・ブログは、それぞれの詳しいページ
 * （/about.html など）に任せ、ここには置きません。
 *
 * 見た目の方針（「AIが作ったサイトっぽさ」を消すため）:
 *   ・紺と紫の光るグラデーションをやめ、紙のような明るい地に黒い文字。
 *     色は相談ボタンの藍色1色だけ。
 *   ・見出しの上の英語ラベル（YOUR PAIN POINTS など）をやめ、日本語で。
 *   ・「中央揃えの見出し＋アイコン付きカード3枚」の繰り返しをやめ、
 *     左揃えの表と一覧で読ませる。
 *   ・動く演出はなし。本物の顔（代表の写真）と、本物の仕事を先に見せる。
 *
 * 文章はすべて管理画面から直せるデータ（text.js の lp、services.js、
 * site.js、faq.js）から読みます。
 */

// 料金の表記「3万円〜(案件規模に応じてご提案)」から、表に載せる部分だけ
const priceHead = (p = '') => p.split(/[（(]/)[0].trim()

// 相談を迷っている人が気にすること（料金・納期・進め方）の質問だけを、
// トップに少し出します。社名の読み方などは /faq.html に。
const practicalFaq = () => FAQ_GROUPS.slice(1).flatMap((g) => g.items).slice(0, 5)

export default function Landing({ onPrivacy }) {
  const services = SERVICES
  const faqs = practicalFaq()

  return (
    <div className="lp">
      {/* 1. 最初の画面 */}
      <section className="lp-hero" id="top">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">{SECTION.lp.eyebrow}</p>
            <h1 className="lp-h1">{rich(SECTION.lp.title)}</h1>
            <p className="lp-lead">{rich(SECTION.lp.lead)}</p>
            <div className="lp-actions">
              <a href="#contact" className="lp-btn lp-btn--primary" data-cta="hero-consult">{SECTION.lp.ctaPrimary}</a>
              <a href="#services" className="lp-btn lp-btn--ghost" data-cta="hero-services">{SECTION.lp.ctaSecondary}</a>
            </div>
            <ul className="lp-assure">
              <li>{SECTION.lp.assure1}</li>
              <li>{SECTION.lp.assure2}</li>
              <li>{SECTION.lp.assure3}</li>
            </ul>
          </div>
          <figure className="lp-person">
            <img src="/profile.jpg?v=2" alt={SECTION.lp.personName} width="426" height="520" decoding="async" fetchpriority="high" />
            <figcaption>
              <span className="lp-person-name">{SECTION.lp.personName}</span>
              <span className="lp-person-note">{SECTION.lp.personNote}</span>
              <a href="/profile.html" className="lp-link">{SECTION.lp.personLink}</a>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 2. できること（サービスと料金を1つの表に） */}
      <section className="lp-sec" id="services" aria-labelledby="lp-services-h">
        <div className="lp-wrap">
          <header className="lp-sec-head">
            <h2 id="lp-services-h" className="lp-h2">{SECTION.lp.servicesTitle}</h2>
            <p className="lp-sec-lead">{rich(SECTION.lp.servicesLead)}</p>
          </header>
          <ul className="lp-svc">
            {services.map((s) => (
              <li key={s.id} className="lp-svc-row">
                <span className="lp-svc-icon" aria-hidden="true"><LineIcon name={s.id} size={20} /></span>
                <div className="lp-svc-main">
                  <h3 className="lp-svc-name">{s.title}</h3>
                  <p className="lp-svc-desc">{rich(s.desc)}</p>
                  {s.partner && (
                    <p className="lp-svc-partner">
                      制作パートナー：<a href={s.partnerUrl} target="_blank" rel="noopener noreferrer">{s.partner}</a>
                    </p>
                  )}
                </div>
                <p className="lp-svc-price">{priceHead(s.price)}</p>
                <a href={`/services/${s.id}.html`} className="lp-svc-more" aria-label={`${s.title}を詳しく見る`}>{SECTION.lp.servicesMore} →</a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. これまでの仕事 */}
      <section className="lp-sec lp-sec--alt" id="works" aria-labelledby="lp-works-h">
        <div className="lp-wrap">
          <header className="lp-sec-head">
            <h2 id="lp-works-h" className="lp-h2">{SECTION.lp.worksTitle}</h2>
          </header>
          <div className="lp-cases">
            {CASE_STUDIES.map((c) => (
              <article key={c.title} className="lp-case">
                <p className="lp-case-tag">{c.tag}</p>
                <h3 className="lp-case-title">{c.title}</h3>
                <p className="lp-case-desc">{rich(c.desc)}</p>
                {c.metric ? (
                  <p className="lp-case-metric">
                    <span>{Number(c.metric).toLocaleString('ja-JP')}</span> {c.metricLabel}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
          <h3 className="lp-h3">{SECTION.lp.worksOther}</h3>
          <ul className="lp-achieve">
            {ACHIEVEMENTS.map((a) => <li key={a}>{a}</li>)}
          </ul>
          <a href="/works.html" className="lp-link">{SECTION.lp.worksMore} →</a>
        </div>
      </section>

      {/* 4. 流れとよくある質問を横に並べて、1画面で */}
      <section className="lp-sec" id="flow" aria-label="ご依頼の流れとよくある質問">
        <div className="lp-wrap lp-two">
          <div>
            <h2 className="lp-h2">{SECTION.lp.flowTitle}</h2>
            <ol className="lp-flow">
              {FLOW_STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-flow-no">{i + 1}</span>
                  <div>
                    <p className="lp-flow-title">{s.title}</p>
                    <p className="lp-flow-desc">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div id="faq">
            <h2 className="lp-h2">{SECTION.lp.faqTitle}</h2>
            <div className="lp-faq">
              {faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <a href="/faq.html" className="lp-link">{SECTION.lp.faqMore} →</a>
          </div>
        </div>
      </section>

      {/* 5. 相談 */}
      <div className="lp-contact" id="contact">
        <ContactForm />
      </div>

      <Footer onPrivacy={onPrivacy} />
    </div>
  )
}
