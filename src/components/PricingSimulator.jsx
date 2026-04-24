import { useState, useMemo } from 'react'
import { events } from '../lib/analytics'

// Rough price ranges (minimum baseline). User can toggle to get a ballpark total.
const OPTIONS = [
  {
    key: 'video',
    label: '動画制作',
    sub: 'PR・SNS・企業紹介など',
    min: 30000,
    max: 300000,
    icon: '🎬',
  },
  {
    key: 'ai',
    label: 'AI導入・研修',
    sub: '講師1回+教材ベース',
    min: 100000,
    max: 300000,
    icon: '🤖',
  },
  {
    key: 'sns',
    label: 'SNS・LINE構築',
    sub: '初期+月額想定',
    min: 200000,
    max: 500000,
    icon: '💬',
  },
  {
    key: 'web',
    label: 'Web / LP 制作',
    sub: 'HP・LP・Webアプリ',
    min: 300000,
    max: 2000000,
    icon: '💻',
  },
  {
    key: 'cast',
    label: 'キャスト手配',
    sub: 'モデル・MC・イベント',
    min: 5000,
    max: 100000,
    icon: '🎭',
  },
  {
    key: 'creative',
    label: 'クリエイティブ',
    sub: 'ロゴ・バナー・ポスター他',
    min: 30000,
    max: 500000,
    icon: '🎨',
  },
]

function formatYen(n) {
  return '¥' + n.toLocaleString('ja-JP')
}

export default function PricingSimulator() {
  const [selected, setSelected] = useState({})

  const toggle = (key) => {
    setSelected((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      events.ctaClick('pricing-sim', key + (next[key] ? '-on' : '-off'))
      return next
    })
  }

  const { minTotal, maxTotal, count } = useMemo(() => {
    let min = 0, max = 0, c = 0
    OPTIONS.forEach((o) => {
      if (selected[o.key]) { min += o.min; max += o.max; c++ }
    })
    return { minTotal: min, maxTotal: max, count: c }
  }, [selected])

  return (
    <section className="section section--gray" id="pricing">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">PRICING SIMULATOR</p>
          <h2 className="section-title">見積もりの目安を<br />その場でシミュレーション。</h2>
          <p className="section-desc">
            必要なサービスを選ぶと概算レンジが表示されます。<br />
            ※ 実際のお見積りは無料。内容を伺った上で正確にご提案します。
          </p>
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

          <div className={`pricing-sim-result ${count > 0 ? 'is-active' : ''}`} aria-live="polite">
            <div className="pricing-sim-result-head">
              <span className="pricing-sim-result-label">{count === 0 ? 'サービスを選択してください' : `${count}件 選択中 — 概算レンジ`}</span>
            </div>
            {count > 0 ? (
              <div className="pricing-sim-result-body">
                <span className="pricing-sim-total">
                  <span className="pricing-sim-total-from">{formatYen(minTotal)}</span>
                  <span className="pricing-sim-total-dash">〜</span>
                  <span className="pricing-sim-total-to">{formatYen(maxTotal)}</span>
                </span>
                <a href="#contact-form" className="btn btn-accent" data-cta="pricing-sim-consult">
                  この内容で相談する
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              </div>
            ) : (
              <div className="pricing-sim-hint">上のリストから気になるサービスをタップ</div>
            )}
            <p className="pricing-sim-note">※ 案件規模・要件により変動します。詳細はご相談時に確定します。</p>
          </div>
        </div>
      </div>
    </section>
  )
}
