import { IconSNSPain, IconVideoPain, IconLINEPain } from './Icons'

const painPoints = [
  {
    num: '01',
    icon: <IconSNSPain />,
    title: 'SNSに弱い…',
    pain: 'SNSで集客したいけど何から始めればいいかわからない。',
    solution: '企画〜運用まで全てお任せ。',
    accent: '#2563eb',
  },
  {
    num: '02',
    icon: <IconVideoPain />,
    title: '動画を作る時間がない…',
    pain: '動画を作りたいけど時間を割けない。',
    solution: '企画から納品まで一貫対応します。',
    accent: '#7c3aed',
  },
  {
    num: '03',
    icon: <IconLINEPain />,
    title: 'LINEで発信したい…',
    pain: '公式LINEで発信したいがやり方がわからない。',
    solution: 'Bot制作から配信設計まで対応します。',
    accent: '#0891b2',
  },
]

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
