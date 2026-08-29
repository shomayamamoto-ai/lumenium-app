import { FLOW_STEPS } from '../data/site'

const FlowGrad = ({ id }) => (
  <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
    <stop offset="0" stopColor="#4f46e5" />
    <stop offset="0.55" stopColor="#3b82f6" />
    <stop offset="1" stopColor="#06b6d4" />
  </linearGradient>
)

const STROKE = 1.75

const StepIcon1 = () => (
  <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
    <defs><FlowGrad id="fi1" /></defs>
    <path d="M10 8H34C36.2 8 38 9.8 38 12V28C38 30.2 36.2 32 34 32H20L12 40V12C12 9.8 13.8 8 16 8Z" stroke="url(#fi1)" strokeWidth={STROKE} strokeLinejoin="round"/>
    <circle cx="19" cy="20" r="1.3" fill="url(#fi1)"/>
    <circle cx="25" cy="20" r="1.3" fill="url(#fi1)"/>
    <circle cx="31" cy="20" r="1.3" fill="url(#fi1)"/>
  </svg>
)

const StepIcon2 = () => (
  <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
    <defs><FlowGrad id="fi2" /></defs>
    <circle cx="24" cy="24" r="16" stroke="url(#fi2)" strokeWidth={STROKE}/>
    <path d="M24 14V24L31 28" stroke="url(#fi2)" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const StepIcon3 = () => (
  <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
    <defs><FlowGrad id="fi3" /></defs>
    <path d="M12 34L20 42L38 10" stroke="url(#fi3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="34" r="2.2" stroke="url(#fi3)" strokeWidth={STROKE}/>
    <circle cx="20" cy="42" r="2.2" stroke="url(#fi3)" strokeWidth={STROKE}/>
    <circle cx="38" cy="10" r="2.2" stroke="url(#fi3)" strokeWidth={STROKE}/>
  </svg>
)

const StepIcon4 = () => (
  <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
    <defs><FlowGrad id="fi4" /></defs>
    <path d="M6 20L24 8L42 20V40C42 41.1 41.1 42 40 42H8C6.9 42 6 41.1 6 40V20Z" stroke="url(#fi4)" strokeWidth={STROKE} strokeLinejoin="round"/>
    <path d="M18 42V30C18 28.9 18.9 28 20 28H28C29.1 28 30 28.9 30 30V42" stroke="url(#fi4)" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const StepIcon5 = () => (
  <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
    <defs><FlowGrad id="fi5" /></defs>
    <path d="M14 6H30L38 14V40C38 41.1 37.1 42 36 42H12C10.9 42 10 41.1 10 40V10C10 7.8 11.8 6 14 6Z" stroke="url(#fi5)" strokeWidth={STROKE} strokeLinejoin="round"/>
    <path d="M30 6V14H38" stroke="url(#fi5)" strokeWidth={STROKE} strokeLinejoin="round"/>
    <path d="M17 22L22 27L31 18" stroke="url(#fi5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 33H32M16 37H28" stroke="url(#fi5)" strokeWidth={STROKE} strokeLinecap="round" opacity="0.6"/>
  </svg>
)

const STEP_ICONS = [<StepIcon1 />, <StepIcon2 />, <StepIcon5 />, <StepIcon3 />, <StepIcon4 />]
const steps = FLOW_STEPS.map((s, i) => ({ ...s, icon: STEP_ICONS[i] }))

export default function Flow() {
  return (
    <section className="section section--gray" id="flow">
      <div className="container">
        <div className="section-header" data-animate data-stroke="FLOW">
          <p className="section-label">FLOW</p>
          <h2 className="section-title">ご依頼の流れ</h2>
          <p className="section-desc">お問い合わせから納品後の伴走まで、5つのステップでご案内します。</p>
        </div>
        <div className="flow-steps">
          {steps.map((s, i) => (
            <div key={s.title}>
              <div className="flow-step" data-animate data-delay={i}>
                <div className="flow-num">{s.icon}</div>
                <div className="flow-body">
                  <span className="flow-step-num">STEP {i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <dl className="flow-meta" aria-label={`STEP ${i + 1} の目安`}>
                    <div>
                      <dt>所要時間</dt>
                      <dd>{s.meta.time}</dd>
                    </div>
                    <div>
                      <dt>ご準備</dt>
                      <dd>{s.meta.prep}</dd>
                    </div>
                  </dl>
                  {s.checks?.length > 0 && (
                    <ul className="flow-checks">
                      {s.checks.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {i < steps.length - 1 && <div className="flow-connector" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
