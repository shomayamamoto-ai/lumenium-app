import { SECTION } from '../data/text'
import { rich } from '../lib/rich'

/**
 * 実績を見たあとに置く、相談の案内。
 * 実績は「ここに頼んでもよさそうだ」と思ってもらえる場所なので、その
 * 気持ちのまま相談へ進めるよう、ページの途中にも入口を1つ置きます。
 * 文言は管理画面の「相談の案内（cta）」で直せます。
 */
export default function InlineCTA() {
  return (
    <section className="inline-cta" id="contact" aria-label="ご相談の案内">
      <div className="container inline-cta-inner">
        <div className="inline-cta-copy">
          <p className="inline-cta-label">{SECTION.cta.label}</p>
          <p className="inline-cta-title">{rich(SECTION.cta.title)}</p>
          <p className="inline-cta-sub">{rich(SECTION.cta.desc)}</p>
          <ul className="inline-cta-assure">
            <li>{SECTION.cta.reassure1}</li>
            <li>{SECTION.cta.reassure2}</li>
            <li>{SECTION.cta.reassure3}</li>
          </ul>
        </div>
        <a href="#contact-form" className="btn btn-accent" data-cta="inline-consult">{SECTION.cta.button}</a>
      </div>
    </section>
  )
}
