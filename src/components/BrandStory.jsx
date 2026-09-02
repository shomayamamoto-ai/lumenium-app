import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
// Editorial-style brand narrative.
// Designed as a 3-chapter reading experience — not a sales block.
import { BRAND_CHAPTERS as CHAPTERS } from '../data/site'

export default function BrandStory() {
  return (
    <section className="section section--gray" id="story">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">{SECTION.story.label}</p>
          <h2 className="section-title">{rich(SECTION.story.title)}</h2>
          <p className="section-desc">{rich(SECTION.story.desc)}</p>
        </div>

        <div className="story">
          {CHAPTERS.map((c, i) => (
            <article key={c.no} className="story-chapter" data-animate data-delay={i + 1}>
              <header className="story-chapter-head">
                <span className="story-chapter-no" aria-hidden="true">{c.no}</span>
                <span className="story-chapter-eyebrow">{c.eyebrow}</span>
              </header>
              <h3 className="story-chapter-title">{c.title}</h3>
              <div className="story-chapter-body">
                {c.body.map((p, idx) => <p key={idx}>{p}</p>)}
              </div>
            </article>
          ))}
        </div>

        <footer className="story-footer" data-animate data-delay="4">
          <div className="story-signature">
            <span className="story-signature-label">LUMENIUM FOUNDER</span>
            <span className="story-signature-name">山本 捷真</span>
            <span className="story-signature-en">Shoma Yamamoto</span>
          </div>
          <a href="#contact-form" className="btn btn-accent" data-cta="story-consult">
            一度話してみる
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </footer>
      </div>
    </section>
  )
}
