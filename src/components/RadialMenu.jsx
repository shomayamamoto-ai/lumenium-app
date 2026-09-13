import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../lib/focusTrap'
import { SECTION } from '../data/text'
import { events } from '../lib/analytics'

// Pressing the trigger opens a dial: two hairline orbits with the twelve
// destinations set on them like an astrolabe.
//
// The structure is 1px strokes and the content is type — the only bright mark
// belongs to whichever entry you are on. What makes it feel made rather than
// generated is the timing. Nothing arrives at once: the overlay is wiped open
// as a circle growing out of the button, the orbits are drawn clockwise from
// twelve o'clock, and the entries are revealed in a single sweep around the
// dial, letter by letter, while the whole constellation untwists into true.
// Two satellites keep drifting along the orbits afterwards, so the thing is
// alive while you read it, and closing plays the whole sequence backwards
// rather than cutting to black.

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
const EXIT_MS = 700   // how long the reverse sequence is given before unmount
const TRANSIT_MS = 660 // how long the dive into a destination runs before it lands
const DIVE = 2.1      // how far past the chosen entry the view travels
const clamp = (lo, v, hi) => Math.min(Math.max(v, lo), hi)
const rad = (deg) => (deg * Math.PI) / 180
const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
    // Where the spokes start — clear of the centre mark, which is 54px across
    // on a phone and 78px on anything wider.
    hubR: narrow ? 36 : 52,
    cx: w / 2,
    cy: h / 2,
  }
}

/** An ellipse written as two arcs starting at twelve o'clock, so that drawing
 *  it with stroke-dashoffset sweeps clockwise from the top like a compass
 *  being swung. An <ellipse> would start at three o'clock instead, and it
 *  cannot be rotated into place without distorting. */
const orbitPath = (cx, cy, rx, ry) =>
  `M ${cx} ${cy - ry} A ${rx} ${ry} 0 0 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 0 1 ${cx} ${cy - ry}`

export default function RadialMenu() {
  const [open, setOpen] = useState(false)
  const [lit, setLit] = useState(false)
  const [closing, setClosing] = useState(false)
  const [settled, setSettled] = useState(false)
  const [going, setGoing] = useState(null)
  const [hot, setHot] = useState(null)
  const [geo, setGeo] = useState(() => ({ rx: 300, ry: 270, k1x: 0.52, k1y: 0.52, hubR: 52, cx: 640, cy: 420 }))
  const [wipe, setWipe] = useState({ x: 0, y: 0, r: 1200 })
  const triggerRef = useRef(null)
  const sheetRef = useRef(null)
  const stageRef = useRef(null)
  const satsRef = useRef([])
  const exitTimer = useRef(0)

  useFocusTrap(sheetRef, open && lit)

  const close = useCallback(() => {
    if (exitTimer.current) return
    setLit(false)
    setSettled(false)
    setClosing(true)
    setHot(null)
    setGoing(null)
    // Let the reverse sequence play before the overlay leaves the document.
    exitTimer.current = setTimeout(() => {
      exitTimer.current = 0
      setClosing(false)
      setOpen(false)
      triggerRef.current?.focus()
    }, reduced() ? 0 : EXIT_MS)
  }, [])

  const openDial = () => {
    setGeo(measure())
    // The overlay is wiped open as a circle growing out of the button, so the
    // dial reads as coming out of the thing that was pressed.
    const r = triggerRef.current?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2
    const y = r ? r.top + r.height / 2 : window.innerHeight / 2
    const far = Math.max(
      Math.hypot(x, y),
      Math.hypot(window.innerWidth - x, y),
      Math.hypot(x, window.innerHeight - y),
      Math.hypot(window.innerWidth - x, window.innerHeight - y)
    )
    setWipe({ x, y, r: Math.ceil(far) + 8 })
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

  // Once the opening sequence has played out, drop the per-entry delays: they
  // are choreography for the entrance, and leaving them in place made hover
  // take up to a second to dim the other entries.
  useEffect(() => {
    if (!lit) return
    const id = setTimeout(() => setSettled(true), reduced() ? 0 : 1500)
    return () => clearTimeout(id)
  }, [lit])

  useEffect(() => () => { if (exitTimer.current) clearTimeout(exitTimer.current) }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    const onResize = () => setGeo(measure())
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  // The hero is pushed out of the way while the dial is up. Dropping the flag
  // at the start of the reverse rather than at unmount means the hero fades
  // back in *through* the collapsing aperture, instead of appearing whole the
  // instant the overlay leaves. It also stops the starfield chasing the
  // cursor for as long as we are over it.
  useEffect(() => {
    // Not on a dive: that ends on a different page, so bringing the hero back
    // underneath it would flash a screen we are in the middle of leaving.
    if (!open || closing) return
    document.body.dataset.dialOpen = '1'
    return () => { delete document.body.dataset.dialOpen }
  }, [open, closing])

  const navigate = (node) => {
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

  const clear = () => {
    setGoing(null)
    setHot(null)
    setSettled(false)
    setLit(false)
    setClosing(false)
    setOpen(false)
  }

  /** Choosing an entry is not the same act as dismissing the dial, so it does
   *  not get the same animation. The view dives: everything but the chosen
   *  entry drops away, and the constellation rushes toward that entry and
   *  past it, until the aperture closes on the spot where it was. The page
   *  underneath is only swapped once that has played. */
  const go = (node) => {
    if (exitTimer.current) return
    events.ctaClick('home-radial', node.label)
    if (reduced()) {
      navigate(node)
      clear()
      return
    }
    setHot(node.i)
    setGoing(node.i)
    setWipe((w) => ({ ...w, x: node.tick.x, y: node.tick.y }))
    exitTimer.current = setTimeout(() => {
      exitTimer.current = 0
      navigate(node)
      clear()
    }, TRANSIT_MS)
  }

  const { cx, cy, rx, ry, k1x, k1y, hubR } = geo
  const r1 = { x: rx * k1x, y: ry * k1y }
  const r2 = { x: rx, y: ry }

  // Two satellites drift along the orbits for as long as the dial is up. The
  // positions are written straight onto the nodes each frame — putting an
  // orbit through React state would re-render the whole dial sixty times a
  // second to move two dots four pixels.
  useEffect(() => {
    if (!lit || reduced()) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now) => {
      const t = (now - t0) / 1000
      const set = (el, r, speed, phase) => {
        if (!el) return
        const a = phase + t * speed
        el.setAttribute('cx', cx + r.x * Math.sin(a))
        el.setAttribute('cy', cy - r.y * Math.cos(a))
      }
      set(satsRef.current[0], r1, 0.155, 0.6)
      set(satsRef.current[1], r2, -0.092, 3.1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lit, cx, cy, r1.x, r1.y, r2.x, r2.y])

  // A few pixels of pointer parallax gives the plate somewhere to sit. Written
  // to the node directly and eased by CSS, so a mouse move costs no render.
  const onStageMove = (e) => {
    const el = stageRef.current
    if (!el || reduced()) return
    const nx = (e.clientX / window.innerWidth - 0.5) * 2
    const ny = (e.clientY / window.innerHeight - 0.5) * 2
    el.style.transform = `translate3d(${(nx * 11).toFixed(2)}px, ${(ny * 9).toFixed(2)}px, 0)`
  }

  const onEllipse = (r, deg) => ({ x: cx + r.x * Math.sin(rad(deg)), y: cy - r.y * Math.cos(rad(deg)) })

  const placed = NODES.map((n, i) => {
    const r = n.ring === 1 ? r1 : r2
    const p = onEllipse(r, n.a)
    // Radial direction, normalised — the labels push out along it and the
    // ticks step off along it.
    const ux = Math.sin(rad(n.a))
    const uy = -Math.cos(rad(n.a))
    const from = onEllipse(r, n.a - SPAN / 2)
    const to = onEllipse(r, n.a + SPAN / 2)
    // The reveal sweeps once around the dial clockwise from twelve, the same
    // way the orbits are drawn — alternating rings as it goes, rather than
    // doing all of one ring and then all of the other. Closing runs the same
    // sweep backwards and faster: last in, first out.
    const rank = Math.round(n.a / 30)
    const base = 420 + rank * 52
    const back = (11 - rank) * 18
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
      d: { mark: base, num: base + 95, text: base + 150 },
      x: { mark: back, num: back, text: back },
    }
  })

  // Translating by the chosen entry's offset scaled by the same factor lands
  // that entry exactly on the centre as the view enlarges — the dive goes
  // through it rather than merely near it.
  const dive = going === null ? null : placed[going]
  const diveStyle = dive
    ? {
        transform: `translate(${(-(dive.tick.x - cx) * DIVE).toFixed(1)}px, ${(-(dive.tick.y - cy) * DIVE).toFixed(1)}px) scale(${DIVE})`,
        opacity: 0,
      }
    : null

  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight

  return (
    <>
      <span className={`rcore-wrap ${open && !closing ? 'is-open' : ''}`}>
        {/* A slow hairline ping so the eye finds the one thing to press. */}
        <span className="rcore-ping" aria-hidden="true" />
        <button
          ref={triggerRef}
          type="button"
          className={`rcore ${open && !closing ? 'is-open' : ''}`}
          onClick={openDial}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <span className="rcore-dial" aria-hidden="true" />
          <span className="rcore-label">{SECTION.home.exploreButton}</span>
        </button>
      </span>
      <p className="rcore-hint">{SECTION.home.exploreHint}</p>

      {open && createPortal(
        <div
          className={`rdial ${lit ? 'is-lit' : ''} ${closing ? 'is-closing' : ''} ${going !== null ? 'is-going' : ''} ${settled ? 'is-settled' : ''} ${hot !== null ? 'has-focus' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="サービスとページの一覧"
          ref={sheetRef}
          onMouseMove={onStageMove}
          style={{ '--ox': `${wipe.x}px`, '--oy': `${wipe.y}px`, '--wipe': `${wipe.r}px` }}
        >
          <button type="button" className="rdial-scrim" onClick={close} tabIndex={-1} aria-hidden="true" />

          <div className="rdial-stage" ref={stageRef}>
            <div className="rdial-spin" style={{ transformOrigin: `${cx}px ${cy}px`, ...diveStyle }}>
              <svg
                className="rdial-plate"
                viewBox={`0 0 ${vw} ${vh}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  className="rdial-ring rdial-ring--1"
                  d={orbitPath(cx, cy, r1.x, r1.y)}
                  pathLength="1"
                  strokeDasharray="1"
                  strokeDashoffset={lit ? 0 : 1}
                />
                <path
                  className="rdial-ring rdial-ring--2"
                  d={orbitPath(cx, cy, r2.x, r2.y)}
                  pathLength="1"
                  strokeDasharray="1"
                  strokeDashoffset={lit ? 0 : 1}
                />

                {placed.map((n) => (
                  <g key={n.label}>
                    <line
                      className={`rdial-spoke ${hot === n.i ? 'is-on' : ''}`}
                      x1={cx + n.ux * hubR} y1={cy + n.uy * hubR}
                      x2={n.p.x} y2={n.p.y}
                    />
                    <path
                      className={`rdial-arc ${hot === n.i ? 'is-on' : ''}`}
                      d={n.arc}
                      pathLength="1"
                      strokeDasharray="1"
                      strokeDashoffset={hot === n.i ? 0 : 1}
                    />
                    {hot === n.i && (
                      <circle className="rdial-pulse" cx={n.p.x} cy={n.p.y} r="4" />
                    )}
                    <line
                      className={`rdial-tick ${hot === n.i ? 'is-on' : ''}`}
                      x1={n.p.x} y1={n.p.y}
                      x2={n.tick.x} y2={n.tick.y}
                      strokeDasharray={TICK}
                      strokeDashoffset={lit ? 0 : TICK}
                      style={{ transitionDelay: `${closing ? n.x.mark : n.d.mark}ms` }}
                    />
                  </g>
                ))}

                {/* The orbits are never quite still. */}
                <circle className="rdial-sat" r="2.4" ref={(el) => { satsRef.current[0] = el }} cx={cx} cy={cy - r1.y} />
                <circle className="rdial-sat rdial-sat--2" r="1.9" ref={(el) => { satsRef.current[1] = el }} cx={cx} cy={cy - r2.y} />
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
                    transitionDelay: `${closing ? n.x.mark : n.d.mark}ms`,
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
                  <span className="ritem-no" aria-hidden="true" style={{ transitionDelay: `${closing ? n.x.num : n.d.num}ms` }}>
                    {n.no}
                  </span>
                  {/* Split for the reveal; the unsplit label is what is read out. */}
                  <span className="ritem-mask" aria-hidden="true">
                    {[...n.label].map((ch, ci, all) => (
                      <span
                        key={`${n.label}-${ci}`}
                        className="ritem-ch"
                        style={{
                          transitionDelay: closing
                            ? `${n.x.text + (all.length - 1 - ci) * 12}ms`
                            : `${n.d.text + ci * 30}ms`,
                        }}
                      >
                        {ch}
                      </span>
                    ))}
                  </span>
                  <span className="sr-only">{n.label}</span>
                  <span className="ritem-rule" aria-hidden="true" />
                </a>
              ))}

              <img
                className="rdial-mark"
                src="/favicon.svg?v=3"
                alt=""
                aria-hidden="true"
                width="78"
                height="78"
                style={{ left: cx, top: cy }}
              />
            </div>
          </div>

          <p className="rdial-meta rdial-meta--tl">LUMENIUM — 対応領域</p>
          <button type="button" className="rdial-x" onClick={close} aria-label="閉じる">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6 L18 18" />
              <path d="M18 6 L6 18" />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
