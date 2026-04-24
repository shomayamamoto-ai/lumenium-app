import { useEffect, useRef } from 'react'

/**
 * Lumen Cursor — Lumenium brand cursor.
 *
 * Layered, hardware-accelerated mouse cursor that replaces the OS pointer on
 * desktop browsers:
 *   - Outer hexagonal aperture ring (rotates slowly, intensifies on hover)
 *   - Four-point cross-glint (lens flare) that spins
 *   - Bright central core (pulses)
 *   - Soft aura halo (lags slightly for a trailing feel)
 *   - Click burst: expanding ring + 4-point sparkle
 *
 * Hidden on touch / reduced-motion / small viewports.
 */
export default function LumenCursor() {
  const auraRef = useRef(null)
  const ringRef = useRef(null)
  const glintRef = useRef(null)
  const coreRef = useRef(null)
  const burstHost = useRef(null)
  const frameRef = useRef(null)
  const posRef = useRef({ x: -200, y: -200, tx: -200, ty: -200 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = window.innerWidth < 769
    if (isTouch || reduce || small) return

    const aura = auraRef.current
    const ring = ringRef.current
    const glint = glintRef.current
    const core = coreRef.current
    const host = burstHost.current
    if (!aura || !ring || !glint || !core || !host) return

    // Hide OS cursor globally while Lumen cursor is active
    document.body.classList.add('lumen-cursor-active')

    const show = () => {
      aura.style.opacity = '1'
      ring.style.opacity = '1'
      glint.style.opacity = '1'
      core.style.opacity = '1'
    }
    const hide = () => {
      aura.style.opacity = '0'
      ring.style.opacity = '0'
      glint.style.opacity = '0'
      core.style.opacity = '0'
    }
    show()

    const onMove = (e) => {
      posRef.current.tx = e.clientX
      posRef.current.ty = e.clientY
    }

    const setHover = (on) => {
      ring.classList.toggle('is-hover', on)
      core.classList.toggle('is-hover', on)
      glint.classList.toggle('is-hover', on)
    }

    // Intensify on interactive targets
    const onOver = (e) => {
      const t = e.target
      const interactive = t && t.closest && t.closest(
        'a, button, [role="button"], input, textarea, select, label, summary, .card, [data-cta]'
      )
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
      // Aura lags for a trailing feel; ring/glint/core pin tightly.
      p.x += (p.tx - p.x) * 0.18
      p.y += (p.ty - p.y) * 0.18
      aura.style.transform = `translate3d(${p.x - 140}px, ${p.y - 140}px, 0)`
      ring.style.transform = `translate3d(${p.tx - 18}px, ${p.ty - 18}px, 0)`
      glint.style.transform = `translate3d(${p.tx - 20}px, ${p.ty - 20}px, 0)`
      core.style.transform = `translate3d(${p.tx - 4}px, ${p.ty - 4}px, 0)`
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
      <div ref={auraRef} className="lumen-aura" aria-hidden="true" />
      <div ref={ringRef} className="lumen-ring" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <polygon
            points="18,2 32,10 32,26 18,34 4,26 4,10"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <div ref={glintRef} className="lumen-glint" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M20 2 L20 38 M2 20 L38 20"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.65"
          />
        </svg>
      </div>
      <div ref={coreRef} className="lumen-core" aria-hidden="true" />
      <div ref={burstHost} className="lumen-bursts" aria-hidden="true" />
    </>
  )
}
