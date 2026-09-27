import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { TESTIMONIALS as testimonials } from '../data/site'

// お客様の声。以前は3件ずつのスライドで、残りは矢印を押さないと見えず、
// 押すたびに横へ流れていました。5件なら全部並べたほうが一度に読めます。
export default function Testimonials() {
  return (
    <section className="section section--gray" id="testimonials">
      <div className="container">
        <div className="section-header" data-animate data-stroke="VOICE">
          <p className="section-label">{SECTION.testimonials.label}</p>
          <h2 className="section-title">{rich(SECTION.testimonials.title)}</h2>
          <p className="section-desc">{rich(SECTION.testimonials.desc)}</p>
        </div>

        <ul className="testimonial-grid">
          {testimonials.map((t, i) => (
            <li key={i} className="testimonial-card">
              <div className="testimonial-head">
                <div className="testimonial-avatar" aria-hidden="true">{t.initial}</div>
              </div>
              {/* Through rich(), so a line ends at 。or 、 rather than
                  wherever the card runs out (Safari has no auto-phrase). */}
              <p className="testimonial-text">{rich(t.text)}</p>
              <div className="testimonial-author">
                <span className="testimonial-name">{t.name}</span>
                <span className="testimonial-detail">{t.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
