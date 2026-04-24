import { useEffect, useRef } from 'react'

/**
 * Lumen Cursor — Lumenium brand cursor.
 *
 *  Layered, hardware-accelerated desktop cursor:
 *   - Trailing aura (.lumen-glow)
 *   - Rotating hexagonal aperture (.lumen-ring)
 *   - Pulsing glowing core (.lumen-dot)
 *   - Click burst: expanding ring + four-point sparkle
 *
 * Disabled only on true touch devices or prefers-reduced-motion. Runs on
 * any pointer-capable viewport, including narrow desktop windows.
 */
export default function LumenCursor() {
  const glowRef = useRef(null)
  const ringRef = useRef(null)
  const dotRef = useRef(null)
  const rippleHost = useRef(null)
  const frameRef = useRef(null)
  const posRef = useRef({ x: -300, y: -300, tx: -300, ty: -300 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    // Touch devices only are skipped. Reduced-motion users still get the
    // cursor — the CSS disables the spin/pulse animations for them.
    if (isTouch) return

    const glow = glowRef.current
    const ring = ringRef.current
    const dot = dotRef.current
    const host = rippleHost.current
    if (!glow || !ring || !dot || !host) return

    // Hide the OS cursor while this one is mounted.
    document.body.classList.add('lumen-cursor-active')

    const onMove = (e) => {
      posRef.current.tx = e.clientX
      posRef.current.ty = e.clientY
    }

    const setHover = (on) => {
      ring.classList.toggle('is-hover', on)
      dot.classList.toggle('is-hover', on)
    }
    const onOver = (e) => {
      const t = e.target
      const interactive =
        t && t.closest && t.closest('a, button, [role="button"], input, textarea, select, label, summary, .card, [data-cta]')
      setHover(!!interactive)
    }

    const onClick = (e) => {
      const ringEl = document.createElement('span')
      ringEl.className = 'lumen-burst lumen-burst--ring'
      ringEl.style.left = e.clientX + 'px'
      ringEl.style.top = e.clientY + 'px'
      host.appendChild(ringEl)
      const sparkEl = document.createElement('span')
      sparkEl.className = 'lumen-burst lumen-burst--spark'
      sparkEl.style.left = e.clientX + 'px'
      sparkEl.style.top = e.clientY + 'px'
      host.appendChild(sparkEl)
      setTimeout(() => { ringEl.remove(); sparkEl.remove() }, 720)
    }

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('click', onClick)

    const tick = () => {
      const p = posRef.current
      // Aura lags; ring & dot track tightly.
      p.x += (p.tx - p.x) * 0.18
      p.y += (p.ty - p.y) * 0.18
      glow.style.transform = `translate3d(${p.x - 160}px, ${p.y - 160}px, 0)`
      ring.style.transform = `translate3d(${p.tx - 22}px, ${p.ty - 22}px, 0)`
      dot.style.transform  = `translate3d(${p.tx - 5}px,  ${p.ty - 5}px,  0)`
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      document.body.classList.remove('lumen-cursor-active')
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('click', onClick)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <>
      <div ref={glowRef} className="lumen-glow" aria-hidden="true" />
      <div ref={ringRef} className="lumen-ring" aria-hidden="true">
        <svg viewBox="0 0 44 44" fill="none" aria-hidden="true">
          {/* Outer hexagonal aperture */}
          <polygon
            points="22,3 39,12 39,32 22,41 5,32 5,12"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Cross-hair tick marks at the hexagon's axes */}
          <path
            d="M22 3 L22 10 M22 34 L22 41 M5 22 L12 22 M32 22 L39 22"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.6"
          />
          {/* Inner second ring for depth */}
          <polygon
            points="22,11 31,16 31,28 22,33 13,28 13,16"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.35"
            fill="none"
          />
        </svg>
      </div>
      <div ref={dotRef} className="lumen-dot" aria-hidden="true" />
      <div ref={rippleHost} className="lumen-bursts" aria-hidden="true" />
    </>
  )
}
