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

const steps = [
  {
    title: 'ご相談・お問い合わせ',
    desc: 'まずはメールやフォームから、困っていることを教えてください。抽象的な内容でも大丈夫です。',
    icon: <StepIcon1 />,
    meta: { time: '即時', prep: '連絡手段のみ' },
    checks: [
      'お名前・ご連絡先だけでOK',
      '相談内容が決まっていなくても歓迎',
      '48時間以内にご返信',
    ],
  },
  {
    title: 'ヒアリング・お見積り',
    desc: 'オンライン or 対面で現状と目標をお伺いし、最適なプランと概算をご提案します。',
    icon: <StepIcon2 />,
    meta: { time: '30〜60分', prep: '現状の課題メモ' },
    checks: [
      '参考資料があれば共有ください',
      'ご予算・希望スケジュールを確認',
      '24h以内に概算レンジをお伝え',
    ],
  },
  {
    title: 'ご契約・キックオフ',
    desc: '内容にご納得いただけたら契約へ。必要に応じてNDAを交わし、制作スケジュールを確定します。',
    icon: <StepIcon5 />,
    meta: { time: '1〜3営業日', prep: 'NDA要否' },
    checks: [
      '仕様書と工程表を共有',
      '担当窓口を一本化',
      '着手金のご相談も対応',
    ],
  },
  {
    title: '制作・実行',
    desc: '企画→制作→レビューをサイクルで進行。中間共有で認識ズレを最小化します。',
    icon: <StepIcon3 />,
    meta: { time: '2週間〜2ヶ月', prep: '定例1本分の時間' },
    checks: [
      'Slack / Chatwork / メールどれでも',
      '週1の進捗共有 + 随時レビュー',
      '修正回数は案件ごとに合意',
    ],
  },
  {
    title: '納品・運用サポート',
    desc: '納品後も、必要に応じて改善・運用代行・追加制作まで伴走します。',
    icon: <StepIcon4 />,
    meta: { time: '継続可', prep: '—' },
    checks: [
      '納品データ一式をお渡し',
      '運用KPIのレビュー会も可',
      '追加のご相談はいつでも',
    ],
  },
]

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
