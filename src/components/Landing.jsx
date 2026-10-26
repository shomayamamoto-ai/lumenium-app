import { Fragment, useRef, useState } from 'react'
import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { SERVICES } from '../data/services'
import { CASE_STUDIES, ACHIEVEMENTS, FLOW_STEPS, SYSTEMS } from '../data/site'
import { landingFaq, consultFaq } from '../data/faq'
import LineIcon from './LineIcon'
import ContactForm from './ContactForm'
import Footer from './Footer'

/**
 * トップページ。
 *
 * 1ページで「何をしている会社か → いくらか → 本当にできるのか → どう
 * 進むか → 相談」まで読める並びはそのままに、見た目を「明るい地・写真と
 * 白いカードの交互・筆記体の英語見出し＋日本語の小見出し・赤い丸ボタン」に
 * しています（見本にしたサイトの組み方）。
 *
 * 写真の代わりに使っているのは、実際の管理画面の画面（見本の数字）と代表の
 * 写真だけです。作り物の写真は使いません。画面の下には「数字は見本」と添えます。
 *
 * 文章はすべて管理画面から直せるデータ（text.js の lp、services.js、
 * site.js、faq.js）から読みます。英語の見出し（About など）は飾りなので、
 * 読み上げでは飛ばします（aria-hidden）。
 */

// 料金の表記「3万円〜(案件規模に応じてご提案)」から、表に載せる部分だけ
const priceHead = (p = '') => p.split(/[（(]/)[0].trim()

// 相談を迷っている人が気にすること（料金・納期・進め方）の質問だけを、
// トップに少し出します。社名の読み方などは /faq.html に。
const practicalFaq = landingFaq

/* 最初の見出し。「ぼんやり」と「はっきり」を見た目でも対比させます——
   「ぼんやり」は輪郭をにじませた薄い字、「はっきり」は濃い字に藍色の下線。
   動きは付けません（止まった絵で伝えます）。文字そのものは普通の文字の
   ままなので、読み上げや検索には同じ文として届きます。管理画面で見出しを
   書き換えて、この2語が無くなれば、普通の見出しとして出ます。 */
function heroTitle(text) {
  return String(text ?? '').split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(/(ぼんやり|はっきり)/).map((part, pi) => {
        if (part === 'ぼんやり') return <span key={pi} className="lp-h1-blur">{part}</span>
        if (part === 'はっきり') return <span key={pi} className="lp-h1-sharp">{part}</span>
        // 「の」のあとでだけ折り返します（「夢実現の／プロフェッショナルです」）。
        // ほかの位置で切れると、スマホで「です」だけが次の行に落ちました。
        return part ? part.split(/(?<=の)/).map((seg, si) => (
          <span key={pi + '-' + si} className="lp-h1-ph">{seg}</span>
        )) : null
      })}
    </Fragment>
  ))
}

// 「このシステムについて相談する」: フォームはこのページに1つだけ置いてあり、
// すでに表示されています。そこへシステム名を渡す合図を出します（受け取るのは
// ContactForm.jsx）。
function askAbout(id) {
  try { window.dispatchEvent(new CustomEvent('lum:ask', { detail: id })) } catch (_) {}
}

/* 紹介ムービー。AIで作った約8秒の動画（public/intro.mp4）を、最初の画面の
   横に置きます。勝手には動かさず、押したときだけその場で再生します（音声つき）。
   表紙は画像ではなく、文字と再生ボタンだけで描きます——手元の静止画は
   320×180 と小さく、この大きさではぼやけるためです。 */
function HeroMovie() {
  const [on, setOn] = useState(false)
  return (
    <figure className="lp-movie">
      <div className="lp-movie-frame">
        {on ? (
          <video className="lp-movie-player" src="/intro.mp4" controls autoPlay playsInline preload="auto">
            お使いのブラウザは動画の再生に対応していません。
          </video>
        ) : (
          <button type="button" className="lp-movie-cover" onClick={() => setOn(true)} data-cta="hero-movie" aria-label={SECTION.lp.moviePlay}>
            <img className="lp-movie-mark" src="/lumenium-logo.svg?v=3" alt="" width="44" height="44" />
            <span className="lp-movie-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg></span>
            <span className="lp-movie-text">
              <span className="lp-movie-label">{SECTION.lp.movieLabel}</span>
              <span className="lp-movie-title">{SECTION.lp.movieTitle}</span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="lp-movie-note">{SECTION.lp.movieNote}</figcaption>
    </figure>
  )
}

/* 英語の筆記体の見出し（飾り）と、日本語の見出し。 */
function Title({ en, id, children, lead, align = 'center' }) {
  return (
    <div className={`og-title og-title--${align}`}>
      <p className="og-en" aria-hidden="true">{en}</p>
      <h2 id={id} className="og-ja">{children}</h2>
      {lead ? <p className="og-lead">{lead}</p> : null}
    </div>
  )
}

/* 画面の写真。画面例であることと、数字が見本であることを必ず添えます。 */
function Shot({ src, alt, note, className = '', eager = false }) {
  return (
    <figure className={`og-shot ${className}`}>
      <img src={src} alt={alt} width="1440" height="900" loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchpriority: 'high' } : {})} />
      {note ? <figcaption>{note}</figcaption> : null}
    </figure>
  )
}

const SYS_ICON = { 'sys-site': 'web', 'sys-sns': 'sns', 'sys-phone': 'megaphone', 'sys-card': 'users', 'sys-match': 'cast', 'sys-stock': 'chip', 'sys-contract': 'book' }
const SHOT_NOTE = '管理画面の画面例（数字・名前は見本です）'

/* 横に流れる一覧（左右のボタンでも、指で横にずらしても動きます）。 */
function Carousel({ label, children }) {
  const ref = useRef(null)
  const by = (dir) => {
    const el = ref.current
    if (!el) return
    const card = el.querySelector('.og-sys-card')
    el.scrollBy({ left: dir * ((card ? card.getBoundingClientRect().width : 320) + 24), behavior: 'smooth' })
  }
  return (
    <div className="og-carousel">
      <button type="button" className="og-arrow og-arrow--prev" onClick={() => by(-1)} aria-label="前へ">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="og-track" ref={ref} role="list" aria-label={label} tabIndex={0}>{children}</div>
      <button type="button" className="og-arrow og-arrow--next" onClick={() => by(1)} aria-label="次へ">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  )
}

const Arrow = () => <span className="og-btn-arrow" aria-hidden="true">→</span>

export default function Landing({ onPrivacy }) {
  // 中心の2つ（システム開発・HP制作、AI研修）は内容まで見せ、ほかはカードで。
  const MAIN = ['web', 'ai']
  const main = SERVICES.filter((s) => MAIN.includes(s.id))
  const other = SERVICES.filter((s) => !MAIN.includes(s.id))
  const faqs = practicalFaq()
  const pics = {
    web: { src: '/img/home/admin-stats.jpg', alt: 'アクセス解析の画面（管理画面の画面例）', note: SHOT_NOTE, en: 'System' },
    ai: { src: '/profile.jpg', alt: '代表 山本 捷真', note: '研修の講師は代表の山本が務めます', en: 'Training', portrait: true },
  }

  return (
    <div className="lp og">
      {/* 1. 最初の画面：大きな画面の写真の上に、白いカード */}
      <section className="og-hero" id="top">
        <div className="og-hero-bg" aria-hidden="true">
          <img src="/img/home/admin-portal.jpg" alt="" width="1440" height="900" fetchpriority="high" decoding="async" />
        </div>
        <div className="og-wrap og-hero-in">
          <div className="og-hero-card">
            <p className="og-en og-en--hero" aria-hidden="true">Lumenium</p>
            <h1 className="og-h1 lp-h1">{heroTitle(SECTION.lp.title)}</h1>
            <div className="og-actions">
              <a href="#contact" className="og-btn og-btn--red" data-cta="hero-consult">{SECTION.lp.ctaPrimary}<Arrow /></a>
              <a href="#services" className="og-btn og-btn--line" data-cta="hero-services">{SECTION.lp.ctaSecondary}<Arrow /></a>
            </div>
            <ul className="og-assure">
              <li>{SECTION.lp.assure1}</li>
              <li>{SECTION.lp.assure2}</li>
              <li>{SECTION.lp.assure3}</li>
            </ul>
          </div>
          <HeroMovie />
        </div>
        <p className="og-hero-note">背景は管理画面の画面例です（数字・名前は見本）</p>
      </section>

      {/* 2. About */}
      <section className="og-sec og-about" id="about" aria-labelledby="og-about-h">
        <svg className="og-deco og-deco--l" viewBox="0 0 200 200" aria-hidden="true"><path d="M100 10 L112 88 L190 100 L112 112 L100 190 L88 112 L10 100 L88 88 Z M40 40 L160 160 M160 40 L40 160" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        <svg className="og-deco og-deco--r" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" strokeWidth="1" /><circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeWidth="1" /><path d="M100 14v172M14 100h172" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        <div className="og-wrap og-narrow">
          <Title en="About" id="og-about-h">Lumeniumについて</Title>
          <p className="og-about-text">{rich(SECTION.lp.lead)}</p>
          <p className="og-about-facts">{rich(SECTION.lp.aboutFacts)}</p>
        </div>
      </section>

      {/* 3. Service：写真と白いカードを左右交互に */}
      <section className="og-sec og-service" id="services" aria-labelledby="lp-services-h">
        <div className="og-wrap">
          <Title en="Service" id="lp-services-h" lead={rich(SECTION.lp.servicesLead)}>{SECTION.lp.servicesTitle}</Title>
        </div>
        {main.map((s, i) => {
          const pic = pics[s.id] || pics.web
          return (
            <article key={s.id} className={`og-feature ${i % 2 ? 'is-rev' : ''}`}>
              <div className={`og-feature-pic ${pic.portrait ? 'is-portrait' : ''}`}>
                <Shot src={pic.src} alt={pic.alt} note={pic.note} />
              </div>
              <div className="og-feature-card">
                <p className="og-en og-en--card" aria-hidden="true">{pic.en}</p>
                <h3 className="og-feature-name">
                  <span className="og-ic" aria-hidden="true"><LineIcon name={s.id} size={20} /></span>{s.title}
                </h3>
                <p className="og-feature-desc">{rich(s.desc)}</p>
                <div className="og-feature-cols">
                  <div>
                    <p className="og-label">{SECTION.lp.servicesFor}</p>
                    <ul>{s.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
                  </div>
                  <div>
                    <p className="og-label">{SECTION.lp.servicesDone}</p>
                    <ul>{s.examples.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                </div>
                <p className="og-price">
                  {priceHead(s.price).split(' / ').map((p) => <span key={p}>{p}</span>)}
                </p>
                <a href={`/services/${s.id}.html`} className="og-btn og-btn--line">{SECTION.lp.mainMore.replace('{name}', s.title.split('・')[0])}<Arrow /></a>
              </div>
            </article>
          )
        })}
        <nav className="og-wrap og-next" aria-label="次に見る">
          <span className="og-next-h">{SECTION.lp.nextTitle}</span>
          <a href="/works.html">{SECTION.lp.nextWorks}<Arrow /></a>
          <a href="/pricing.html">{SECTION.lp.nextPricing}<Arrow /></a>
          <a href="#contact">{SECTION.lp.nextBook}<Arrow /></a>
        </nav>
      </section>

      {/* 4. ほかのサービス：淡い背景の上に白いカード */}
      <section className="og-sec og-soft og-soft--a" aria-labelledby="og-other-h">
        <div className="og-wrap">
          <Title en="Other" id="og-other-h">{SECTION.lp.servicesOther}</Title>
          <ul className="og-cards og-cards--4">
            {other.map((s) => (
              <li key={s.id} className="og-card">
                <span className="og-card-ic" aria-hidden="true"><LineIcon name={s.id} size={26} /></span>
                <p className="og-card-t">{s.title}</p>
                <p className="og-card-d">{rich(s.desc)}</p>
                {s.partner && (
                  <p className="og-card-partner">制作パートナー：<a href={s.partnerUrl} target="_blank" rel="noopener noreferrer">{s.partner}</a></p>
                )}
                <p className="og-card-price">{priceHead(s.price)}</p>
                <a href={`/services/${s.id}.html`} className="og-more" aria-label={`${s.title}を詳しく見る`}>{SECTION.lp.servicesMore}<Arrow /></a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 5. Works：作ってきたシステムを横に流す */}
      <section className="og-sec og-works" id="systems" aria-labelledby="lp-systems-h">
        <div className="og-wrap">
          <Title en="Works" id="lp-systems-h" lead={rich(SECTION.lp.systemsLead)}>{SECTION.lp.systemsTitle}</Title>
        </div>
        <div className="og-wrap og-wrap--wide">
          <Carousel label={SECTION.lp.systemsTitle}>
            {SYSTEMS.map((sys, i) => (
              <article key={sys.id} className="og-sys-card" role="listitem">
                <div className={`og-sys-art og-tone-${i % 4}`} aria-hidden="true">
                  <LineIcon name={SYS_ICON[sys.id] || 'web'} size={44} />
                  <span>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="og-sys-body">
                  <p className="og-sys-tag">{sys.tag}</p>
                  <h3 className="og-sys-name">{rich(sys.name)}</h3>
                  <p className="og-sys-who"><span>{SECTION.lp.systemsWho}</span>{sys.who}</p>
                  <p className="og-sys-desc">{rich(sys.short)}</p>
                  <div className="og-sys-acts">
                    <a href={`/systems.html#${sys.id}`} className="og-more">{SECTION.lp.systemsMore}<Arrow /></a>
                    <a href="#contact" className="og-btn og-btn--red og-btn--sm" data-cta={`system-${sys.id}`} onClick={() => askAbout(sys.id)}>{SECTION.lp.systemsAsk}</a>
                  </div>
                </div>
              </article>
            ))}
          </Carousel>
        </div>
        <div className="og-wrap og-center">
          <p className="og-note">{SECTION.lp.systemsNote}</p>
          <a href="/systems.html" className="og-btn og-btn--red">{SECTION.lp.systemsAll.replace('{n}', String(SYSTEMS.length))}<Arrow /></a>
        </div>
      </section>

      {/* 6. 管理画面：大きな白いカード（画面の写真と説明） */}
      <section className="og-sec og-soft og-soft--b" id="admin" aria-labelledby="lp-admin-h">
        <div className="og-wrap">
          <Title en="Management" id="lp-admin-h">{rich(SECTION.lp.adminTitle)}</Title>
          <div className="og-panel">
            <div className="og-panel-top">
              <Shot src="/img/home/admin-portal.jpg" alt="管理画面のホーム（画面例）" note={SHOT_NOTE} className="og-panel-shot" />
              <div className="og-panel-copy">
                <p className="og-panel-lead">{rich(SECTION.lp.adminLead)}</p>
                <p className="og-panel-note">{rich(SECTION.lp.adminNote)}</p>
                <p className="og-panel-pitch">{rich(SECTION.lp.adminPitch)}</p>
                <a href="#contact" className="og-btn og-btn--red" data-cta="admin-consult">{SECTION.lp.adminCta}<Arrow /></a>
              </div>
            </div>
            <ul className="og-feats">
              {[
                ['creative', SECTION.lp.adminF1Title, SECTION.lp.adminF1Desc],
                ['megaphone', SECTION.lp.adminF2Title, SECTION.lp.adminF2Desc],
                ['chart', SECTION.lp.adminF3Title, SECTION.lp.adminF3Desc],
                ['search', SECTION.lp.adminF4Title, SECTION.lp.adminF4Desc],
                ['users', SECTION.lp.adminF5Title, SECTION.lp.adminF5Desc],
                ['sns', SECTION.lp.adminF6Title, SECTION.lp.adminF6Desc],
              ].map(([icon, t, d]) => (
                <li key={t}>
                  <span className="og-ic" aria-hidden="true"><LineIcon name={icon} size={20} /></span>
                  <div>
                    <p className="og-feat-t">{t}</p>
                    <p className="og-feat-d">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 帯：管理画面の画面例を3枚 */}
      <div className="og-strip" aria-label="管理画面の画面例">
        <div className="og-strip-row">
          <Shot src="/img/home/admin-quotes.jpg" alt="見積書の画面（画面例）" />
          <Shot src="/img/home/admin-video.jpg" alt="SNS（動画）の画面（画面例）" />
          <Shot src="/img/home/admin-seo.jpg" alt="検索・AIでの見え方の画面（画面例）" />
        </div>
        <p className="og-strip-note">見積書・動画づくり・AIでの見え方の画面（数字・名前は見本です）</p>
      </div>

      {/* 7. これまでの仕事 */}
      <section className="og-sec og-achieve" id="works" aria-labelledby="lp-works-h">
        <div className="og-wrap">
          <Title en="Achievement" id="lp-works-h">{SECTION.lp.worksTitle}</Title>
          <div className="og-cards og-cards--3">
            {CASE_STUDIES.map((c) => (
              <article key={c.title} className="og-card og-card--case">
                <p className="og-card-tag">{c.tag}</p>
                <h3 className="og-card-t">{c.title}</h3>
                <p className="og-card-d">{rich(c.desc)}</p>
                {c.metric ? (
                  <p className="og-card-metric"><span>{Number(c.metric).toLocaleString('ja-JP')}</span> {c.metricLabel}</p>
                ) : null}
              </article>
            ))}
          </div>
          <div className="og-box">
            <h3 className="og-box-h">{SECTION.lp.worksOther}</h3>
            <ul className="og-achieve-list">
              {ACHIEVEMENTS.slice(0, 5).map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
          <div className="og-center"><a href="/works.html" className="og-btn og-btn--line">{SECTION.lp.worksMore}<Arrow /></a></div>
        </div>
      </section>

      {/* 8. ご依頼の流れ */}
      <section className="og-sec og-soft og-soft--c" id="flow" aria-labelledby="og-flow-h">
        <div className="og-wrap">
          <Title en="Flow" id="og-flow-h">{SECTION.lp.flowTitle}</Title>
          <ol className="og-flow">
            {FLOW_STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="og-flow-no">{String(i + 1).padStart(2, '0')}</span>
                <p className="og-flow-t">{s.title}</p>
                <p className="og-flow-d">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 9. よくある質問と、ご相談の多い内容（白いカードの中に一覧） */}
      <section className="og-sec og-qa" aria-label="よくある質問とご相談の多い内容">
        <div className="og-wrap og-narrow">
          <div id="faq">
            <Title en={"Q&A"} id="og-faq-h">{SECTION.lp.faqTitle}</Title>
            <div className="og-list">
              {faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <div className="og-center"><a href="/faq.html" className="og-btn og-btn--line">{SECTION.lp.faqMore}<Arrow /></a></div>
          </div>
          {/* 依頼先を探している人が、AIや検索にそのまま打つ質問と、その答え。
              トップは検索エンジンが最初に読むページなので、答えをここに置きます
              （閉じていても、文章はページの中にあります）。 */}
          <div id="consult" className="og-consult">
            <Title en="Consultation" id="og-consult-h" lead={SECTION.lp.consultLead}>{SECTION.lp.consultTitle}</Title>
            <div className="og-list og-list--2">
              {consultFaq().map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 10. Contact：空色のカードの案内 → 予約 → フォーム */}
      <div id="contact" className="og-contact">
        <div className="og-wrap">
          <div className="og-banner">
            <div className="og-banner-copy">
              <p className="og-en og-en--banner" aria-hidden="true">Contact</p>
              <p className="og-banner-t">{SECTION.lp.assure1}・{SECTION.lp.assure2}</p>
              <div className="og-actions">
                <a href="#contact-form" className="og-btn og-btn--red" data-cta="banner-form">{SECTION.lp.ctaPrimary}<Arrow /></a>
                <a href="/pricing.html" className="og-btn og-btn--white">{SECTION.lp.nextPricing}<Arrow /></a>
              </div>
            </div>
            <img className="og-banner-mark" src="/lumenium-logo.svg?v=3" alt="" width="200" height="200" loading="lazy" decoding="async" />
          </div>
        </div>
        <div className="lp-contact og-form">
          <ContactForm />
        </div>
      </div>

      <Footer onPrivacy={onPrivacy} />
    </div>
  )
}
