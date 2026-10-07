import { Fragment } from 'react'
import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { SERVICES } from '../data/services'
import { CASE_STUDIES, ACHIEVEMENTS, FLOW_STEPS, SYSTEMS } from '../data/site'
import { landingFaq } from '../data/faq'
import LineIcon from './LineIcon'
import ContactForm from './ContactForm'
import QuickBook from './QuickBook'
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

export default function Landing({ onPrivacy }) {
  // 中心の2つ（システム開発・ホームページ制作、AI研修）は内容まで見せ、ほかは一覧で。
  const MAIN = ['web', 'ai']
  const main = SERVICES.filter((s) => MAIN.includes(s.id))
  const other = SERVICES.filter((s) => !MAIN.includes(s.id))
  const faqs = practicalFaq()

  return (
    <div className="lp">
      {/* 1. 最初の画面 */}
      <section className="lp-hero" id="top">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <h1 className="lp-h1">{heroTitle(SECTION.lp.title)}</h1>
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
        </div>
      </section>

      {/* 2. できること（サービスと料金を1つの表に） */}
      <section className="lp-sec" id="services" aria-labelledby="lp-services-h">
        <div className="lp-wrap">
          <header className="lp-sec-head">
            <h2 id="lp-services-h" className="lp-h2">{SECTION.lp.servicesTitle}</h2>
            <p className="lp-sec-lead">{rich(SECTION.lp.servicesLead)}</p>
          </header>
          <div className="lp-main">
            {main.map((s) => (
              <article key={s.id} className="lp-main-card">
                <div className="lp-main-head">
                  <span className="lp-svc-icon" aria-hidden="true"><LineIcon name={s.id} size={22} /></span>
                  <h3 className="lp-main-name">{s.title}</h3>
                </div>
                <p className="lp-main-desc">{rich(s.desc)}</p>
                <div className="lp-main-cols">
                  <div>
                    <p className="lp-main-label">{SECTION.lp.servicesFor}</p>
                    <ul>{s.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
                  </div>
                  <div>
                    <p className="lp-main-label">{SECTION.lp.servicesDone}</p>
                    <ul>{s.examples.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                </div>
                <div className="lp-main-foot">
                  <p className="lp-main-price">{priceHead(s.price)}</p>
                  <a href={`/services/${s.id}.html`} className="lp-btn lp-btn--ghost lp-main-go">{SECTION.lp.mainMore.replace('{name}', s.title.split('・')[0])} →</a>
                </div>
              </article>
            ))}
          </div>

          {/* トップだけで帰る人が7割。サービスを読んだところで、次の行き先を
              3つ並べます。 */}
          <nav className="lp-next" aria-label="次に見る">
            <span className="lp-next-h">{SECTION.lp.nextTitle}</span>
            <a href="/works.html">{SECTION.lp.nextWorks} →</a>
            <a href="/pricing.html">{SECTION.lp.nextPricing} →</a>
            <a href="#contact">{SECTION.lp.nextBook} →</a>
          </nav>

          <h3 className="lp-h3">{SECTION.lp.servicesOther}</h3>
          <ul className="lp-svc">
            {other.map((s) => (
              <li key={s.id} className="lp-svc-row">
                <span className="lp-svc-icon" aria-hidden="true"><LineIcon name={s.id} size={20} /></span>
                <div className="lp-svc-main">
                  <p className="lp-svc-name">{s.title}</p>
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

      {/* 作ってきたシステム。「なんでも作れる」だけでは何を頼めるか伝わらないので、
          実際に作ったものを「誰が・何に困って・何を入れたか」で並べます。
          相談ボタンは、下のフォームにそのシステム名を入れて移動します。 */}
      <section className="lp-sec lp-sec--alt" id="systems" aria-labelledby="lp-systems-h">
        <div className="lp-wrap">
          <header className="lp-sec-head">
            <h2 id="lp-systems-h" className="lp-h2">{SECTION.lp.systemsTitle}</h2>
            <p className="lp-sec-lead">{rich(SECTION.lp.systemsLead)}</p>
          </header>
          <div className="lp-sys">
            {SYSTEMS.map((sys) => (
              <article key={sys.id} className="lp-sys-card">
                <p className="lp-sys-tag">{sys.tag}</p>
                <h3 className="lp-sys-name">{sys.name}</h3>
                <p className="lp-sys-who"><span>{SECTION.lp.systemsWho}</span>{sys.who}</p>
                <p className="lp-sys-desc">{rich(sys.short)}</p>
                <div className="lp-sys-acts">
                  <a href={`/systems.html#${sys.id}`} className="lp-sys-more">{SECTION.lp.systemsMore} →</a>
                  <a
                    href="#contact"
                    className="lp-sys-ask"
                    data-cta={`system-${sys.id}`}
                    onClick={() => askAbout(sys.id)}
                  >{SECTION.lp.systemsAsk}</a>
                </div>
              </article>
            ))}
          </div>
          <p className="lp-sys-note">{SECTION.lp.systemsNote}</p>
          <a href="/systems.html" className="lp-link">{SECTION.lp.systemsAll.replace('{n}', String(SYSTEMS.length))} →</a>
        </div>
      </section>

      {/* Webの強み: このサイトと同じような管理画面 */}
      <section className="lp-admin" id="admin" aria-labelledby="lp-admin-h">
        <div className="lp-wrap lp-admin-grid">
          <div className="lp-admin-copy">
            <h2 id="lp-admin-h" className="lp-h2">{rich(SECTION.lp.adminTitle)}</h2>
            <p className="lp-admin-lead">{rich(SECTION.lp.adminLead)}</p>
            <p className="lp-admin-note">{rich(SECTION.lp.adminNote)}</p>
            <p className="lp-admin-pitch">{rich(SECTION.lp.adminPitch)}</p>
            <a href="#contact" className="lp-btn lp-btn--light" data-cta="admin-consult">{SECTION.lp.adminCta}</a>
          </div>
          <ul className="lp-admin-list">
            {[
              ['creative', SECTION.lp.adminF1Title, SECTION.lp.adminF1Desc],
              ['megaphone', SECTION.lp.adminF2Title, SECTION.lp.adminF2Desc],
              ['chart', SECTION.lp.adminF3Title, SECTION.lp.adminF3Desc],
              ['search', SECTION.lp.adminF4Title, SECTION.lp.adminF4Desc],
              ['users', SECTION.lp.adminF5Title, SECTION.lp.adminF5Desc],
              ['sns', SECTION.lp.adminF6Title, SECTION.lp.adminF6Desc],
            ].map(([icon, t, d]) => (
              <li key={t}>
                <span className="lp-admin-icon" aria-hidden="true"><LineIcon name={icon} size={20} /></span>
                <div>
                  <p className="lp-admin-t">{t}</p>
                  <p className="lp-admin-d">{d}</p>
                </div>
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
            {ACHIEVEMENTS.slice(0, 5).map((a) => <li key={a}>{a}</li>)}
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

      {/* 5. 相談: まず日時を選ぶだけの予約、決めきれない人はフォーム */}
      <div id="contact">
        <QuickBook />
        <div className="lp-contact">
          <ContactForm />
        </div>
      </div>

      <Footer onPrivacy={onPrivacy} />
    </div>
  )
}
