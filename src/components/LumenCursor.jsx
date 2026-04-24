import { useEffect, useRef } from 'react'

/**
 * Lumen Cursor — Lumenium brand cursor.
 *
 * Layered, hardware-accelerated mouse cursor that replaces the OS pointer on
 * desktop browsers:
 *   - Soft trailing aura (`.lumen-glow`) that lags slightly behind the pointer.
 *   - Slowly-rotating hexagonal aperture (`.lumen-ring`) — the brand mark.
 *   - Bright pulsing core (`.lumen-dot`).
 *   - Click burst — expanding ring + 4-point sparkle.
 *
 * Hidden on touch / reduced-motion / small viewports.
 */
export default function LumenCursor() {
  const glowRef = useRef(null)
  const ringRef = useRef(null)
  const dotRef = useRef(null)
  const rippleHost = useRef(null)
  const frameRef = useRef(null)
  const posRef = useRef({ x: -200, y: -200, tx: -200, ty: -200 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = window.innerWidth < 769
    if (isTouch || reduce || small) return

    const glow = glowRef.current
    const ring = ringRef.current
    const dot = dotRef.current
    const host = rippleHost.current
    if (!glow || !ring || !dot || !host) return

    // Hide the OS cursor while the Lumen cursor is mounted.
    document.body.classList.add('lumen-cursor-active')

    const show = () => {
      glow.style.opacity = '1'
      ring.style.opacity = '1'
      dot.style.opacity = '1'
    }
    const hide = () => {
      glow.style.opacity = '0'
      ring.style.opacity = '0'
      dot.style.opacity = '0'
    }
    show()

    const onMove = (e) => {
      posRef.current.tx = e.clientX
      posRef.current.ty = e.clientY
    }

    // Intensify on interactive targets
    const onOver = (e) => {
      const t = e.target
      const interactive =
        t && t.closest && t.closest('a, button, [role="button"], input, textarea, select, label, summary, .card, [data-cta]')
      if (interactive) {
        ring.classList.add('is-hover')
        dot.classList.add('is-hover')
      } else {
        ring.classList.remove('is-hover')
        dot.classList.remove('is-hover')
      }
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

      setTimeout(() => {
        ringEl.remove()
        sparkEl.remove()
      }, 720)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', hide)
    window.addEventListener('mouseenter', show)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('click', onClick)

    const tick = () => {
      const p = posRef.current
      // Aura lags for a trailing feel; ring/dot pin tightly to the pointer.
      p.x += (p.tx - p.x) * 0.18
      p.y += (p.ty - p.y) * 0.18
      glow.style.transform = `translate3d(${p.x - 140}px, ${p.y - 140}px, 0)`
      ring.style.transform = `translate3d(${p.tx - 18}px, ${p.ty - 18}px, 0)`
      dot.style.transform = `translate3d(${p.tx - 4}px, ${p.ty - 4}px, 0)`
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      document.body.classList.remove('lumen-cursor-active')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', hide)
      window.removeEventListener('mouseenter', show)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('click', onClick)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <>
      <div ref={glowRef} className="lumen-glow" aria-hidden="true" />
      <div ref={ringRef} className="lumen-ring" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <polygon
            points="18,2 32,10 32,26 18,34 4,26 4,10"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M18 2 L18 10 M18 26 L18 34 M4 18 L10 18 M26 18 L32 18"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      </div>
      <div ref={dotRef} className="lumen-dot" aria-hidden="true" />
      <div ref={rippleHost} className="lumen-bursts" aria-hidden="true" />
    </>
  )
}
