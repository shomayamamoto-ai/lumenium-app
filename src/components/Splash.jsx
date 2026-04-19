import { useState, useEffect, useMemo } from 'react'

/**
 * Opening I (G+H) — Lumen Convergence.
 * Scattered particles + streaks stream toward center,
 * their arrival is measured as luminous flux (lumens),
 * at target they collide into a flash, Lumenium emerges.
 *
 * Combines the lumen-measurement instrumentation of G
 * with the scattered → focused particle convergence of H.
 */

const TARGET_LUMENS = 10000
const CONVERGE_DURATION = 2600

export default function Splash({ onComplete }) {
  const [lumens, setLumens] = useState(0)
  const [phase, setPhase] = useState(0) // 0 converge, 1 impact, 2 reveal, 3 exit

  const particles = useMemo(() => (
    Array.from({ length: 60 }, (_, i) => {
      const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.3
      const distance = 50 + Math.random() * 60
      return {
        id: i,
        tx: Math.cos(angle) * distance,
        ty: Math.sin(angle) * distance,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 0.5,
        hue: 220 + Math.random() * 50,
      }
    })
  ), [])

  const streaks = useMemo(() => (
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      angle: (i / 20) * 360 + Math.random() * 18,
      delay: Math.random() * 0.3,
      length: 40 + Math.random() * 25,
    }))
  ), [])

  // Lumen ramp-up synced with convergence
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const step = (now) => {
      const p = Math.min((now - start) / CONVERGE_DURATION, 1)
      const eased = 1 - Math.pow(1 - p, 2.2)
      setLumens(Math.round(eased * TARGET_LUMENS))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const timers = []
    timers.push(setTimeout(() => setPhase(1), CONVERGE_DURATION))         // impact
    timers.push(setTimeout(() => setPhase(2), CONVERGE_DURATION + 400))   // reveal
    timers.push(setTimeout(() => setPhase(3), CONVERGE_DURATION + 1800))  // exit
    timers.push(setTimeout(() => onComplete?.(), CONVERGE_DURATION + 2400))
    timers.push(setTimeout(() => onComplete?.(), 7000)) // failsafe
    return () => timers.forEach((t) => clearTimeout(t))
  }, [onComplete])

  useEffect(() => {
    const skip = () => onComplete?.()
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onComplete])

  const brightness = lumens / TARGET_LUMENS

  return (
    <div
      className={`lx phase-${phase}`}
      onClick={() => onComplete?.()}
      style={{ '--lm': brightness }}
      role="presentation"
    >
      <button
        type="button"
        className="lx-skip"
        onClick={(e) => { e.stopPropagation(); onComplete?.() }}
        aria-label="スキップ"
      >
        SKIP
      </button>

      <div className="lx-vignette" aria-hidden="true" />

      {/* Light rays rotating (from G) */}
      <div className="lx-rays" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="lx-ray"
            style={{ transform: `translate(-50%, -100%) rotate(${i * 30}deg)` }}
          />
        ))}
      </div>

      {/* Streaks converging (from H) */}
      <div className="lx-streaks" aria-hidden="true">
        {streaks.map((s) => (
          <span
            key={s.id}
            className="lx-streak"
            style={{
              '--angle': `${s.angle}deg`,
              '--length': `${s.length}vmin`,
              '--delay': `${s.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Particles converging (from H) */}
      <div className="lx-particles" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="lx-particle"
            style={{
              '--tx': `${p.tx}vmin`,
              '--ty': `${p.ty}vmin`,
              '--size': `${p.size}px`,
              '--delay': `${p.delay}s`,
              '--hue': p.hue,
            }}
          />
        ))}
      </div>

      {/* Central core light growing with lumens (from G) */}
      <div className="lx-core" aria-hidden="true" />
      <div className="lx-core-ring" aria-hidden="true" />
      <div className="lx-ambient" aria-hidden="true" />

      {/* Impact flash at collision (from H) */}
      <div className="lx-impact" aria-hidden="true">
        <span className="lx-impact-core" />
        <span className="lx-impact-ring" />
        <span className="lx-impact-ring lx-impact-ring--2" />
        <span className="lx-impact-ray lx-impact-ray--1" />
        <span className="lx-impact-ray lx-impact-ray--2" />
        <span className="lx-impact-ray lx-impact-ray--3" />
        <span className="lx-impact-ray lx-impact-ray--4" />
      </div>

      {/* Content */}
      <div className="lx-content">
        <img src="/favicon.svg" alt="Lumenium" className="lx-logo" width="260" height="260" />
        <h1 className="lx-name">LUMENIUM</h1>
        <p className="lx-tag">目的に、焦点を当てる。</p>
      </div>

      {/* Lumen readout (from G) */}
      <div className="lx-readout">
        <div className="lx-readout-num">{lumens.toLocaleString()}</div>
        <div className="lx-readout-unit">lm</div>
      </div>

      {/* Meter bar (from G) */}
      <div className="lx-meter">
        <div className="lx-meter-ticks" aria-hidden="true">
          {['0', '2K', '4K', '6K', '8K', '10K'].map((v) => (
            <span key={v} className="lx-meter-tick">{v}</span>
          ))}
        </div>
        <div className="lx-meter-bar">
          <div className="lx-meter-fill" style={{ transform: `scaleX(${brightness})` }} />
        </div>
        <div className="lx-meter-label">
          <span>LUMINOUS FLUX</span>
          <span className="lx-meter-target">TARGET {TARGET_LUMENS} lm</span>
        </div>
      </div>

      {/* HUD: specs (from G) */}
      <div className="lx-hud lx-hud--topleft">
        <div className="lx-hud-row"><span className="lx-hud-k">SOURCE</span><span>LUMENIUM</span></div>
        <div className="lx-hud-row"><span className="lx-hud-k">λ</span><span>450–650 nm</span></div>
        <div className="lx-hud-row"><span className="lx-hud-k">CRI</span><span>Ra 98</span></div>
      </div>

      <div className="lx-hud lx-hud--topright">
        <div className="lx-hud-row"><span className="lx-hud-k">2026 · TOKYO</span></div>
        <div className="lx-hud-row"><span className="lx-hud-k">REC</span><span className="lx-hud-rec" /></div>
      </div>

      <div className="lx-hud lx-hud--bottomright">
        <span className={`lx-hud-status lx-hud-status--${phase}`}>
          {phase === 0 && 'FOCUSING'}
          {phase === 1 && '● IMPACT'}
          {phase >= 2 && 'FULL ILLUMINATION'}
        </span>
      </div>

      {/* Sine wave at bottom (from G) */}
      <svg className="lx-wave" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0,30 Q50,5 100,30 T200,30 T300,30 T400,30 T500,30 T600,30 T700,30 T800,30 T900,30 T1000,30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
