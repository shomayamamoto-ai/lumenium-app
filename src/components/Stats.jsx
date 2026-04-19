// Scroll-triggered animated counters — shows scale of service in hard numbers.
// Uses the existing global data-count IntersectionObserver hook in App.jsx.

const STATS = [
  {
    value: 6,
    suffix: '領域',
    label: 'ワンストップ対応',
    desc: '動画 / AI / Web / SNS / キャスト / クリエイティブ',
  },
  {
    value: 12,
    suffix: '業界+',
    label: '対応業界',
    desc: '飲食・IT・美容・教育・士業など',
  },
  {
    value: 48,
    suffix: 'h 以内',
    label: 'お問い合わせ対応',
    desc: 'ご提案まで最短',
  },
  {
    value: 150,
    suffix: '名+',
    label: '登録キャスト',
    desc: 'モデル・MC・アクター',
  },
]

export default function Stats() {
  return (
    <section className="stats-section" aria-label="Lumeniumの数字">
      <div className="container">
        <div className="stats-grid">
          {STATS.map((s, i) => (
            <div key={s.label} className="stat" data-animate data-delay={i}>
              <span className="stat-value">
                <span data-count={s.value}>0</span>
                <span className="stat-suffix">{s.suffix}</span>
              </span>
              <span className="stat-label">{s.label}</span>
              <span className="stat-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
