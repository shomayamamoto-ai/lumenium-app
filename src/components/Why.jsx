import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
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
          <p className="section-label">{SECTION.pain.label}</p>
          <h2 className="section-title">{rich(SECTION.pain.title)}</h2>
          <p className="section-desc">{rich(SECTION.pain.desc)}</p>
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
