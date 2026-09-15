import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { useState, useMemo, useEffect, useRef } from 'react'
import { events, funnel } from '../lib/analytics'
import { PRICE_OPTIONS as OPTIONS } from '../data/site'
import { BY_ID, calculate, summarise, yen } from '../data/estimate'

// Picking the services gives a range like ¥300,000〜¥2,000,000 — a factor of
// nearly seven, which is not a number anyone can decide on. So when exactly
// one service is chosen, three more questions narrow it to something usable.
//
// And whichever way the range was reached, the enquiry now carries it. The
// "この内容で相談する" button used to reach the form correctly but hand it
// nothing: the visitor retyped their whole specification, and the enquiry
// arrived with no indication of scale or budget to prioritise by.

function formatYen(n) {
  return '¥' + n.toLocaleString('ja-JP')
}

export default function PricingSimulator() {
  const [selected, setSelected] = useState({})
  const [picks, setPicks] = useState({})

  useEffect(() => { funnel.estimateStart() }, [])

  const toggle = (key) => {
    setSelected((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      events.ctaClick('pricing-sim', key + (next[key] ? '-on' : '-off'))
      return next
    })
    setPicks({})
  }

  const { minTotal, maxTotal, count, chosen } = useMemo(() => {
    let min = 0, max = 0, c = 0
    const ids = []
    OPTIONS.forEach((o) => {
      if (selected[o.key]) { min += o.min; max += o.max; c++; ids.push(o.key) }
    })
    return { minTotal: min, maxTotal: max, count: c, chosen: ids }
  }, [selected])

  // The refinement only makes sense for a single service; summing several
  // narrowed ranges would imply a precision that is not there.
  const solo = count === 1 ? BY_ID[chosen[0]] : null
  const refined = solo ? calculate(solo.id, picks) : null
  const answered = solo ? solo.steps.filter((st) => picks[st.key]).length : 0

  // Once per visit, not once per transition: toggling services on and off
  // re-completed the estimate and counted it again each time.
  const doneRef = useRef(false)
  useEffect(() => {
    if (refined && !doneRef.current) { doneRef.current = true; funnel.estimateDone() }
  }, [!!refined])

  const low = refined ? refined.low : minTotal
  const high = refined ? refined.high : maxTotal

  /** Carry the specification into the enquiry so it arrives qualified. */
  const carry = () => {
    const spec = refined
      ? summarise(solo.id, picks, refined)
      : [
          '【概算見積り】',
          ...OPTIONS.filter((o) => selected[o.key]).map((o) => `・${o.label}`),
          `概算: ${yen(minTotal)}〜${yen(maxTotal)}`,
        ].join('\n')
    try {
      sessionStorage.setItem('lum_estimate', spec)
      if (solo) sessionStorage.setItem('lum_estimate_service', solo.id)
    } catch (_) { /* private mode: the form simply starts empty */ }
    events.ctaClick('pricing-sim', 'consult')
  }

  return (
    <section className="section section--gray" id="pricing">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">{SECTION.pricing.label}</p>
          <h2 className="section-title">{rich(SECTION.pricing.title)}</h2>
          <p className="section-desc">{rich(SECTION.pricing.desc)}</p>
        </div>

        <div className="pricing-sim" data-animate data-delay="1">
          <div className="pricing-sim-grid" role="group" aria-label="サービス選択">
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`pricing-sim-item ${selected[o.key] ? 'is-on' : ''}`}
                onClick={() => toggle(o.key)}
                aria-pressed={!!selected[o.key]}
              >
                <span className="pricing-sim-icon" aria-hidden="true">{o.icon}</span>
                <span className="pricing-sim-meta">
                  <span className="pricing-sim-label">{o.label}</span>
                  <span className="pricing-sim-sub">{o.sub}</span>
                </span>
                <span className="pricing-sim-range">{formatYen(o.min)} 〜</span>
                <span className="pricing-sim-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </span>
              </button>
            ))}
          </div>

          {solo && (
            <div className="pricing-refine">
              <p className="pricing-refine-lead">
                あと{solo.steps.length}つ選ぶと、金額の幅がぐっと狭まります。
              </p>
              {solo.steps.map((step, i) => (
                <fieldset className="pricing-refine-step" key={step.key}>
                  <legend><span className="pricing-refine-no">{i + 1}</span>{step.label}</legend>
                  <div className="pricing-refine-opts">
                    {step.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`pricing-refine-opt ${picks[step.key] === o.id ? 'is-on' : ''}`}
                        onClick={() => setPicks((prev) => ({ ...prev, [step.key]: o.id }))}
                        aria-pressed={picks[step.key] === o.id}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          <div className={`pricing-sim-result ${count > 0 ? 'is-active' : ''}`} aria-live="polite">
            <div className="pricing-sim-result-head">
              <span className="pricing-sim-result-label">
                {count === 0
                  ? 'サービスを選択してください'
                  : refined
                    ? `${solo.title} — 概算（${solo.unitNote}）`
                    : solo
                      ? `あと ${solo.steps.length - answered} つ選ぶと精度が上がります`
                      : `${count}件 選択中 — 概算レンジ`}
              </span>
            </div>
            {count > 0 ? (
              <div className="pricing-sim-result-body">
                <span className="pricing-sim-total">
                  <span className="pricing-sim-total-from">{formatYen(low)}</span>
                  <span className="pricing-sim-total-dash">〜</span>
                  <span className="pricing-sim-total-to">{formatYen(high)}</span>
                  {refined && refined.monthly && (
                    <span className="pricing-sim-monthly">＋ 月額 {formatYen(refined.monthly)}〜</span>
                  )}
                </span>
                <a href="#contact-form" className="btn btn-accent" data-cta="pricing-sim-consult" onClick={carry}>
                  この内容で相談する
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              </div>
            ) : (
              <div className="pricing-sim-hint">上のリストから気になるサービスをタップ</div>
            )}
            <p className="pricing-sim-note">
              ※ 案件規模・要件により変動します。詳細はご相談時に確定します。
              {count > 0 && ' 選んだ内容はお問い合わせ欄に自動で入ります。'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
