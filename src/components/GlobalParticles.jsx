import { useEffect, useRef } from 'react'

export default function GlobalParticles({ show }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!show) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w, h, raf
    let running = false
    const mouse = { x: 0, y: 0, active: false }

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()

    const count = Math.min(80, Math.floor(w / 18))
    const pts = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1.5 + Math.random() * 2.5,
      vy: -0.1 - Math.random() * 0.2,
      vx: (Math.random() - 0.5) * 0.2,
      ovx: 0, ovy: 0,
      opacity: 0.15 + Math.random() * 0.2,
      hue: 230 + Math.random() * 30,
    }))
    pts.forEach(p => { p.ovx = p.vx; p.ovy = p.vy })

    const onMouse = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.active = true
    }
    const onMouseLeave = () => { mouse.active = false }

    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouse, { passive: true })
    window.addEventListener('mouseleave', onMouseLeave)

    const start = () => {
      if (running) return
      running = true
      raf = requestAnimationFrame(draw)
    }
    const stop = () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const draw = () => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)

      pts.forEach(p => {
        // Mouse attraction
        if (mouse.active) {
          const dx = mouse.x - p.x
          const dy = mouse.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 200) {
            const force = (1 - dist / 200) * 0.02
            p.vx += dx * force
            p.vy += dy * force
          }
        }

        // Damping back to original drift
        p.vx = p.vx * 0.97 + p.ovx * 0.03
        p.vy = p.vy * 0.97 + p.ovy * 0.03

        p.x += p.vx
        p.y += p.vy

        if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w }
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10

        // Glow
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        g.addColorStop(0, `hsla(${p.hue}, 70%, 70%, ${p.opacity * 1.5})`)
        g.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()

        // Core
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 80%, 80%, ${p.opacity * 2})`
        ctx.fill()
      })

      // Connections
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const dist = dx * dx + dy * dy
          if (dist < 10000) {
            ctx.beginPath()
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.strokeStyle = `rgba(79, 70, 229, ${0.03 * (1 - dist / 10000)})`
            ctx.lineWidth = 0.4
            ctx.stroke()
          }
        }
      }

      raf = requestAnimationFrame(draw)
    }
    start()

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [show])

  if (!show) return null

  return <canvas ref={canvasRef} className="global-particles" />
}
