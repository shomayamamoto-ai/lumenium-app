import { useState, useEffect, useRef } from 'react'

const testimonials = [
  {
    text: '抽象的な相談から具体的な企画書に。スピード感に驚きです。',
    name: '飲食店経営者',
    detail: 'SNS運用・動画制作をご依頼',
    initial: 'T',
  },
  {
    text: 'AI活用の相談から研修まで。業務効率が目に見えて改善しました。',
    name: 'IT企業 マネージャー',
    detail: 'AI研修をご依頼',
    initial: 'M',
  },
  {
    text: 'LINE構築から配信まで一括対応。反応率が3倍になりました。',
    name: '美容サロン オーナー',
    detail: 'LINE Bot制作をご依頼',
    initial: 'K',
  },
  {
    text: '動画・LP・SNS運用を一社に任せられるのは、それだけで価値がありました。',
    name: '教育系企業 広報担当',
    detail: '採用動画・Web制作をご依頼',
    initial: 'S',
  },
  {
    text: '打ち合わせが穏やかで、話しやすかった。意図を汲んでくれる姿勢に助けられました。',
    name: '士業事務所',
    detail: 'コーポレートサイト制作',
    initial: 'N',
  },
]

export default function Testimonials() {
  const [index, setIndex] = useState(0)
  const [perView, setPerView] = useState(3)
  const trackRef = useRef(null)

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      if (w < 640) setPerView(1)
      else if (w < 980) setPerView(2)
      else setPerView(3)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const maxIndex = Math.max(0, testimonials.length - perView)
  const safeIndex = Math.min(index, maxIndex)
  const step = 100 / perView

  // Reset index when perView changes
  useEffect(() => {
    if (index > maxIndex) setIndex(maxIndex)
  }, [perView, maxIndex, index])

  const go = (dir) => {
    setIndex((prev) => {
      const next = prev + dir
      if (next < 0) return maxIndex
      if (next > maxIndex) return 0
      return next
    })
  }

  const jumpTo = (i) => setIndex(Math.min(Math.max(i, 0), maxIndex))

  return (
    <section className="section section--gray" id="testimonials">
      <div className="container">
        <div className="section-header" data-animate data-stroke="VOICE">
          <p className="section-label">VOICE</p>
          <h2 className="section-title">お客様の声</h2>
          <p className="section-desc">ご依頼いただいた方々からの感想の一部です。</p>
        </div>

        <div className="testimonial-carousel" data-animate data-delay="1">
          <div className="testimonial-viewport">
            <div
              className="testimonial-track"
              ref={trackRef}
              style={{ transform: `translateX(-${safeIndex * step}%)` }}
            >
              {testimonials.map((t, i) => (
                <div key={i} className="testimonial-slide" style={{ flex: `0 0 ${step}%` }}>
                  <div className="testimonial-card">
                    <div className="testimonial-head">
                      <div className="testimonial-avatar" aria-hidden="true">{t.initial}</div>
                    </div>
                    <p className="testimonial-text">{t.text}</p>
                    <div className="testimonial-author">
                      <span className="testimonial-name">{t.name}</span>
                      <span className="testimonial-detail">{t.detail}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="testimonial-controls">
            <button type="button" className="testimonial-arrow" onClick={() => go(-1)} aria-label="前のお客様の声">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M16 10H4M4 10L9 5M4 10L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div className="testimonial-dots" role="tablist" aria-label="お客様の声の切り替え">
              {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === safeIndex}
                  className={`testimonial-dot ${i === safeIndex ? 'is-active' : ''}`}
                  onClick={() => jumpTo(i)}
                  aria-label={`${i + 1}番目に切り替え`}
                />
              ))}
            </div>
            <button type="button" className="testimonial-arrow" onClick={() => go(1)} aria-label="次のお客様の声">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
