import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../lib/focusTrap'
import { SECTION } from '../data/text'
import { events } from '../lib/analytics'

// Pressing the trigger opens a dial: two hairline orbits with the twelve
// destinations set on them like an astrolabe.
//
// The first version of this was a firework — glowing pills flying out of a
// glowing core. Everything emitted light, so nothing meant anything. This one
// spends colour almost nowhere: the structure is drawn in 1px strokes, the
// content is type, and the only bright mark on screen belongs to whichever
// entry you are on. Each entry owns an arc of its ring; touching it thickens
// that arc like a detent on a physical dial, draws a spoke back to the hub,
// and dims the other eleven.

const NODES = [
  // Inner orbit — 事業内容. These open that service's detail panel.
  { a: 0, ring: 1, label: '動画制作', service: 'video' },
  { a: 60, ring: 1, label: 'AI導入・研修', service: 'ai' },
  { a: 120, ring: 1, label: 'Web制作', service: 'web' },
  { a: 180, ring: 1, label: 'クリエイティブ', service: 'creative' },
  { a: 240, ring: 1, label: 'キャスト手配', service: 'cast' },
  { a: 300, ring: 1, label: 'SNS・LINE', service: 'sns' },
  // Outer orbit — 検討するための情報. Offset 30° so the two orbits interleave.
  { a: 30, ring: 2, label: '料金', hash: '#/info/pricing' },
  { a: 90, ring: 2, label: '実績', hash: '#/info/results' },
  { a: 150, ring: 2, label: 'ご依頼の流れ', hash: '#/info/flow' },
  { a: 210, ring: 2, label: 'よくある質問', hash: '#/info/faq' },
  { a: 270, ring: 2, label: 'お客様の声', hash: '#/info/testimonials' },
  { a: 330, ring: 2, label: 'お問い合わせ', hash: '#/info/contact-form' },
]

const TICK = 9        // length of the mark that steps off the orbit
const SPAN = 20       // degrees of arc each entry owns
const clamp = (lo, v, hi) => Math.min(Math.max(v, lo), hi)
const rad = (deg) => (deg * Math.PI) / 180

/** Orbits are ellipses, not circles. A phone is narrow and tall; a circle
 *  sized to its width leaves the two orbits too close for the labels between
 *  them. Taking each radius from its own axis uses the screen that is there,
 *  and on a desktop the two come out near enough equal to read as circles. */
function measure() {
  const w = window.innerWidth
  const h = window.innerHeight
  // The labels at 90° and 270° are pushed out by their whole width, so on a
  // narrow screen the horizontal radius has to give way before they do.
  const narrow = w < 700
  return {
    rx: clamp(92, w * (narrow ? 0.24 : 0.30), 320),
    ry: clamp(132, h * 0.32, 296),
    // The inner orbit scales per axis. Squeezing x as hard as y would run it
    // straight through the hub on a phone, so it is kept wide there instead.
    k1x: narrow ? 0.74 : 0.52,
    k1y: narrow ? 0.48 : 0.52,
    cx: w / 2,
    cy: h / 2,
  }
}

// Ramanujan's approximation — close enough to hand stroke-dasharray a length
// it can draw the orbit in with.
const ellipsePerimeter = (a, b) =>
  Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))

export default function RadialMenu() {
  const [open, setOpen] = useState(false)
  const [lit, setLit] = useState(false)
  const [hot, setHot] = useState(null)
  const [geo, setGeo] = useState(() => ({ rx: 300, ry: 270, k1x: 0.52, k1y: 0.52, cx: 640, cy: 420 }))
  const triggerRef = useRef(null)
  const sheetRef = useRef(null)

  useFocusTrap(sheetRef, open && lit)

  const close = useCallback(() => {
    setLit(false)
    setOpen(false)
    setHot(null)
    triggerRef.current?.focus()
  }, [])

  const openDial = () => {
    setGeo(measure())
    events.ctaClick('home-radial', 'open')
    setOpen(true)
  }

  // Paint once closed, then flip — without a "before" frame the browser has
  // nothing to animate from and the dial appears already settled.
  useEffect(() => {
    if (!open) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setLit(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    const onResize = () => setGeo(measure())
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Tells the hero's starfield to stop chasing the cursor while we are over it.
    document.body.dataset.dialOpen = '1'
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = prev
      delete document.body.dataset.dialOpen
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  const go = (node) => {
    events.ctaClick('home-radial', node.label)
    close()
    if (node.service) {
      try { sessionStorage.setItem('lum_open_service', node.service) } catch (_) {}
      if (window.location.hash === '#/info/services') {
        window.dispatchEvent(new CustomEvent('lumenium:open-service', { detail: node.service }))
      } else {
        window.location.hash = '#/info/services'
      }
      return
    }
    window.location.hash = node.hash
  }

  const { cx, cy, rx, ry, k1x, k1y } = geo
  const r1 = { x: rx * k1x, y: ry * k1y }
  const r2 = { x: rx, y: ry }
  const onEllipse = (r, deg) => ({ x: cx + r.x * Math.sin(rad(deg)), y: cy - r.y * Math.cos(rad(deg)) })

  const placed = NODES.map((n, i) => {
    const r = n.ring === 1 ? r1 : r2
    const p = onEllipse(r, n.a)
    // Radial direction, normalised — the labels push out along it and the
    // ticks step off along it.
    const dx = Math.sin(rad(n.a))
    const dy = -Math.cos(rad(n.a))
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const from = onEllipse(r, n.a - SPAN / 2)
    const to = onEllipse(r, n.a + SPAN / 2)
    return {
      ...n,
      i,
      p,
      ux,
      uy,
      tick: { x: p.x + ux * TICK, y: p.y + uy * TICK },
      arc: `M ${from.x} ${from.y} A ${r.x} ${r.y} 0 0 1 ${to.x} ${to.y}`,
      side: ux > 0.26 ? 'right' : ux < -0.26 ? 'left' : 'mid',
      no: String(i + 1).padStart(2, '0'),
      // Inner orbit reveals first, so the dial reads as opening outward.
      delay: (n.ring === 1 ? 120 : 300) + (i % 6) * 55,
    }
  })

  const per1 = ellipsePerimeter(r1.x, r1.y)
  const per2 = ellipsePerimeter(r2.x, r2.y)
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`rcore ${open ? 'is-open' : ''}`}
        onClick={openDial}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="rcore-dial" aria-hidden="true" />
        <span className="rcore-label">{SECTION.home.exploreButton}</span>
      </button>
      <p className="rcore-hint">{SECTION.home.exploreHint}</p>

      {open && createPortal(
        <div
          className={`rdial ${lit ? 'is-lit' : ''} ${hot !== null ? 'has-focus' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="サービスとページの一覧"
          ref={sheetRef}
        >
          <button type="button" className="rdial-scrim" onClick={close} tabIndex={-1} aria-hidden="true" />

          <svg
            className="rdial-plate"
            viewBox={`0 0 ${vw} ${vh}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <g className="rdial-rot" style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <ellipse
                className="rdial-ring rdial-ring--1"
                cx={cx} cy={cy} rx={r1.x} ry={r1.y}
                strokeDasharray={per1}
                strokeDashoffset={lit ? 0 : per1}
              />
              <ellipse
                className="rdial-ring rdial-ring--2"
                cx={cx} cy={cy} rx={r2.x} ry={r2.y}
                strokeDasharray={per2}
                strokeDashoffset={lit ? 0 : per2}
              />
              {placed.map((n) => (
                <g key={n.label}>
                  <line
                    className={`rdial-spoke ${hot === n.i ? 'is-on' : ''}`}
                    x1={cx + n.ux * 58} y1={cy + n.uy * 58}
                    x2={n.p.x} y2={n.p.y}
                  />
                  <path className={`rdial-arc ${hot === n.i ? 'is-on' : ''}`} d={n.arc} />
                  <line
                    className={`rdial-tick ${hot === n.i ? 'is-on' : ''}`}
                    x1={n.p.x} y1={n.p.y}
                    x2={n.tick.x} y2={n.tick.y}
                    strokeDasharray={TICK}
                    strokeDashoffset={lit ? 0 : TICK}
                    style={{ transitionDelay: `${n.delay}ms` }}
                  />
                </g>
              ))}
            </g>
          </svg>

          {placed.map((n) => (
            <a
              key={n.label}
              href={n.service ? '#/info/services' : n.hash}
              className={`ritem ritem--${n.side} ${hot === n.i ? 'is-on' : ''}`}
              style={{
                left: n.tick.x,
                top: n.tick.y,
                '--dx': n.ux,
                '--dy': n.uy,
                transitionDelay: `${n.delay}ms`,
              }}
              onMouseEnter={() => setHot(n.i)}
              onMouseLeave={() => setHot((h) => (h === n.i ? null : h))}
              onFocus={() => setHot(n.i)}
              onBlur={() => setHot((h) => (h === n.i ? null : h))}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
                e.preventDefault()
                go(n)
              }}
            >
              <span className="ritem-no" aria-hidden="true">{n.no}</span>
              <span className="ritem-mask">
                <span className="ritem-text" style={{ transitionDelay: `${n.delay}ms` }}>{n.label}</span>
              </span>
              <span className="ritem-rule" aria-hidden="true" />
            </a>
          ))}

          <button
            type="button"
            className="rdial-hub"
            style={{ left: cx, top: cy }}
            onClick={close}
            aria-label="閉じる"
          >
            <img src="/favicon.svg?v=3" alt="" width="34" height="34" />
            <span className="rdial-hub-label" aria-hidden="true">CLOSE</span>
          </button>

          <p className="rdial-meta rdial-meta--tl">LUMENIUM — 対応領域</p>
          <p className="rdial-meta rdial-meta--tr">ESC で閉じる</p>
        </div>,
        document.body
      )}
    </>
  )
}
