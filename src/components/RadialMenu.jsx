import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { IconVideo, IconAI, IconSNS, IconWeb, IconCast, IconCreative } from './Icons'
import { useFocusTrap } from '../lib/focusTrap'
import { SECTION } from '../data/text'
import { events } from '../lib/analytics'

// One button in the hero. Pressing it detonates: a shockwave leaves the core
// and the twelve destinations fly outward along their own angles, across the
// whole viewport rather than inside a boxed diagram.
//
// The burst starts from wherever the button actually is, so the motion reads
// as coming out of the thing you pressed.

const NODES = [
  // Inner ring — 事業内容. These open that service's detail panel.
  { a: 0, ring: 1, label: '動画制作', service: 'video', Icon: IconVideo },
  { a: 60, ring: 1, label: 'AI導入・研修', service: 'ai', Icon: IconAI },
  { a: 120, ring: 1, label: 'Web制作', service: 'web', Icon: IconWeb },
  { a: 180, ring: 1, label: 'クリエイティブ', service: 'creative', Icon: IconCreative },
  { a: 240, ring: 1, label: 'キャスト手配', service: 'cast', Icon: IconCast },
  { a: 300, ring: 1, label: 'SNS・LINE', service: 'sns', Icon: IconSNS },
  // Outer ring — 検討するための情報.
  { a: 30, ring: 2, label: '料金', hash: '#/info/pricing' },
  { a: 90, ring: 2, label: '実績', hash: '#/info/results' },
  { a: 150, ring: 2, label: 'ご依頼の流れ', hash: '#/info/flow' },
  { a: 210, ring: 2, label: 'よくある質問', hash: '#/info/faq' },
  { a: 270, ring: 2, label: 'お客様の声', hash: '#/info/testimonials' },
  { a: 330, ring: 2, label: 'お問い合わせ', hash: '#/info/contact-form' },
]

// Inner ring first, then outer — the wave reads as travelling outward.
const delayOf = (n, i) => (n.ring === 1 ? 90 + i * 45 : 330 + (i - 6) * 45)

const clamp = (lo, v, hi) => Math.min(Math.max(v, lo), hi)

/** Geometry is resolved in JS: SVG line endpoints are numbers, not CSS vars,
 *  which browsers only accept as geometry properties inconsistently.
 *
 *  The burst is an ellipse, not a circle. A phone is narrow and tall, and a
 *  circle sized to its width packs the two rings close enough that the nodes
 *  collide; spreading further vertically than horizontally uses the screen
 *  that is actually there. On a desktop the two radii come out near enough
 *  to equal that it still reads as a circle. */
function measure() {
  const w = window.innerWidth
  const h = window.innerHeight
  const rx = clamp(108, w * 0.34, 340)
  const ry = clamp(148, h * 0.30, 300)
  return { rx, ry, k1: 0.62 }   // k1 = inner ring, as a fraction of the outer
}

export default function RadialMenu() {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const [geo, setGeo] = useState({ rx: 240, ry: 220, k1: 0.62 })
  const [lit, setLit] = useState(false)
  const triggerRef = useRef(null)
  const sheetRef = useRef(null)

  useFocusTrap(sheetRef, open && lit)

  const close = useCallback(() => {
    setLit(false)
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  const placeOrigin = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2
    const raw = r ? r.top + r.height / 2 : window.innerHeight / 2
    // Keep the origin in a band that leaves room for both rings, top and bottom.
    const y = clamp(window.innerHeight * 0.42, raw, window.innerHeight * 0.58)
    setOrigin({ x, y })
    setGeo(measure())
  }, [])

  const explode = () => {
    placeOrigin()
    events.ctaClick('home-radial', 'open')
    setOpen(true)
  }

  // Paint once collapsed, then flip — without a "before" frame the browser has
  // nothing to animate from and everything appears already open.
  useEffect(() => {
    if (!open) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setLit(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    const onResize = () => placeOrigin()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close, placeOrigin])

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

  const placed = NODES.map((n, i) => {
    const k = n.ring === 1 ? geo.k1 : 1
    const tx = geo.rx * k * Math.sin((n.a * Math.PI) / 180)
    const ty = -geo.ry * k * Math.cos((n.a * Math.PI) / 180)
    return { ...n, tx, ty, len: Math.hypot(tx, ty), delay: delayOf(n, i) }
  })

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`rcore ${open ? 'is-open' : ''}`}
        onClick={explode}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="rcore-halo" aria-hidden="true" />
        <span className="rcore-face">
          <img src="/favicon.svg?v=3" alt="" width="72" height="72" />
          <span className="rcore-label">{SECTION.home.exploreButton}</span>
        </span>
      </button>
      <p className="rcore-hint">{SECTION.home.exploreHint}</p>

      {open && createPortal(
        <div
          className={`rburst ${lit ? 'is-lit' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="サービスとページの一覧"
          ref={sheetRef}
        >
          <button type="button" className="rburst-backdrop" onClick={close} tabIndex={-1} aria-hidden="true" />

          {/* Shockwaves — one-shot, decorative. */}
          {[1, 2, 3].map((k) => (
            <span
              key={k}
              className={`rburst-wave rburst-wave--${k}`}
              style={{ left: origin.x, top: origin.y }}
              aria-hidden="true"
            />
          ))}

          <svg className="rburst-rays" aria-hidden="true" focusable="false">
            {placed.map((n) => (
              <line
                key={n.label}
                className="rburst-ray"
                x1={origin.x} y1={origin.y}
                x2={origin.x + n.tx} y2={origin.y + n.ty}
                strokeDasharray={n.len}
                strokeDashoffset={lit ? 0 : n.len}
                style={{ transitionDelay: `${n.delay}ms` }}
              />
            ))}
          </svg>

          {placed.map((n) => (
            <a
              key={n.label}
              href={n.service ? '#/info/services' : n.hash}
              className={`rnode rnode--r${n.ring}`}
              style={{
                left: origin.x,
                top: origin.y,
                '--tx': `${n.tx}px`,
                '--ty': `${n.ty}px`,
                transitionDelay: `${n.delay}ms`,
              }}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
                e.preventDefault()
                go(n)
              }}
            >
              <span className="rnode-dot">
                {n.Icon ? <n.Icon /> : <span className="rnode-pip" aria-hidden="true" />}
              </span>
              <span className="rnode-label">{n.label}</span>
            </a>
          ))}

          {/* The core stays where it was pressed and becomes the way back. */}
          <button
            type="button"
            className="rburst-core"
            style={{ left: origin.x, top: origin.y }}
            onClick={close}
            aria-label="閉じる"
          >
            <img src="/favicon.svg?v=3" alt="" width="72" height="72" />
            <span className="rburst-core-label" aria-hidden="true">CLOSE</span>
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
