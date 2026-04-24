import { useEffect, useRef } from 'react'

/**
 * Lumen Cursor — a soft, brand-colored spotlight that trails the mouse.
 * - Desktop only (hidden on touch / small screens)
 * - Hardware accelerated via transform: translate3d
 * - Respects prefers-reduced-motion
 * - Small tap-burst particles on click (adds delight without noise)
 */
export default function LumenCursor() {
  const glowRef = useRef(null)
  const dotRef = useRef(null)
  const frameRef = useRef(null)
  const posRef = useRef({ x: -200, y: -200, tx: -200, ty: -200 })
  const rippleHost = useRef(null)

  useEffect(() => {
    // Disable on touch / reduced-motion / small viewports
    if (typeof window === 'undefined') return
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = window.innerWidth < 769
    if (isTouch || reduce || small) return

    const glow = glowRef.current
    const dot = dotRef.current
    const host = rippleHost.current
    if (!glow || !dot || !host) return

    glow.style.opacity = '1'
    dot.style.opacity = '1'

    const onMove = (e) => {
      posRef.current.tx = e.clientX
      posRef.current.ty = e.clientY
    }
    const onLeave = () => {
      glow.style.opacity = '0'
      dot.style.opacity = '0'
    }
    const onEnter = () => {
      glow.style.opacity = '1'
      dot.style.opacity = '1'
    }

    // Pointer on clickable targets → intensify both ring and dot
    const onOver = (e) => {
      const t = e.target
      const active = !!(t && t.closest && t.closest('a, button, [role="button"], input, textarea, .card'))
      dot.classList.toggle('is-active', active)
      glow.classList.toggle('is-active', active)
    }

    const onClick = (e) => {
      // Tap burst — small ring that expands and fades
      const ring = document.createElement('span')
      ring.className = 'lumen-burst'
      ring.style.left = e.clientX + 'px'
      ring.style.top = e.clientY + 'px'
      host.appendChild(ring)
      setTimeout(() => ring.remove(), 720)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    window.addEventListener('mouseenter', onEnter)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('click', onClick)

    const tick = () => {
      const p = posRef.current
      // Ring eases behind the pointer; dot sticks to it exactly.
      p.x += (p.tx - p.x) * 0.22
      p.y += (p.ty - p.y) * 0.22
      // Centre the ring on the eased position (56px -> -28, 72px when active -> -36)
      const ringActive = glow.classList.contains('is-active')
      const ringHalf = ringActive ? 36 : 28
      glow.style.transform = `translate3d(${p.x - ringHalf}px, ${p.y - ringHalf}px, 0)`
      dot.style.transform = `translate3d(${p.tx - 4}px, ${p.ty - 4}px, 0)`
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('mouseenter', onEnter)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('click', onClick)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <>
      <div ref={glowRef} className="lumen-glow" aria-hidden="true" />
      <div ref={dotRef} className="lumen-dot" aria-hidden="true" />
      <div ref={rippleHost} className="lumen-bursts" aria-hidden="true" />
    </>
  )
}
