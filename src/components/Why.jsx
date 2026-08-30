import { IconSNSPain, IconVideoPain, IconLINEPain } from './Icons'
import { PAIN_POINTS } from '../data/site'

const PAIN_ICONS = [<IconSNSPain />, <IconVideoPain />, <IconLINEPain />]
const painPoints = PAIN_POINTS.map((p, i) => ({ ...p, icon: PAIN_ICONS[i] }))

import { useEffect, useRef } from 'react'

export default function Why() {
  const gridRef = useRef(null)

  useEffect(() => {
    const align = () => {
      if (!gridRef.current) return
      const painTexts = gridRef.current.querySelectorAll('.card-pain-text')
      const solutionTexts = gridRef.current.querySelectorAll('.card-solution-text')
      // Reset
      painTexts.forEach(el => { el.style.minHeight = '' })
      solutionTexts.forEach(el => { el.style.minHeight = '' })
      // Find max
      let maxPain = 0, maxSolution = 0
      painTexts.forEach(el => { maxPain = Math.max(maxPain, el.offsetHeight) })
      solutionTexts.forEach(el => { maxSolution = Math.max(maxSolution, el.offsetHeight) })
      // Apply
      painTexts.forEach(el => { el.style.minHeight = maxPain + 'px' })
      solutionTexts.forEach(el => { el.style.minHeight = maxSolution + 'px' })
    }
    align()
    window.addEventListener('resize', align)
    return () => window.removeEventListener('resize', align)
  }, [])

  return (
    <section className="section section--gray" id="pain">
      <div className="container">
        <div className="section-header" data-animate data-stroke="PAIN POINTS">
          <p className="section-label">YOUR PAIN POINTS</p>
          <h2 className="section-title">こんなお困りごと、ありませんか？</h2>
          <p className="section-desc">
            「何から手をつければいいか分からない」<br />
            「やりたいことはあるのに、時間も人手も足りない」<br />
            —— 事業の"次の一手"は、<br />
            たいてい<strong>言葉にならないモヤモヤ</strong>から始まります。<br />
            その曖昧な想いを一緒に<strong>言語化</strong>し、<br />
            動画・AI・Webという最適な打ち手に翻訳するのが、<br />
            ルメニウムの仕事です。
          </p>
        </div>
        <div className="pain-grid" ref={gridRef}>
          {painPoints.map((p, i) => (
            <div key={p.num} className="card card--pain" data-animate data-delay={i}>
              <span className="card-num" style={{ color: p.accent + '20' }}>{p.num}</span>
              <div className="card-icon">{p.icon}</div>
              <h3 className="card-title">{p.title}</h3>
              <p className="card-text card-pain-text">{p.pain}</p>
              <div className="card-divider" />
              <div className="card-text card-solution-text">
                <span className="solution-badge" style={{ background: p.accent }}>解決 →</span>
                <span>{p.solution}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="section-cta" data-animate data-delay="3">
          <p>上記以外の内容や抽象的な内容でも、ぜひご相談ください。</p>
          <a href="#contact-form" className="btn btn-outline">無料で相談する →</a>
        </div>
      </div>
    </section>
  )
}
