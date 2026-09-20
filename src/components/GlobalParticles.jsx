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

    // Each mote is drawn once, into its own little canvas, and from then on it
    // is stamped. It used to be built from scratch on every frame: a new
    // radial gradient object, two colour stops, an arc and a fill, per mote,
    // sixty times a second — which is why createRadialGradient and addColorStop
    // showed up in a profile of *tapping a button*. This runs on every page, so
    // whatever it costs is subtracted from everything else the page does.
    const sprite = (p) => {
      const R = Math.ceil(p.r * 4)
      const c = document.createElement('canvas')
      c.width = c.height = R * 2
      const g2 = c.getContext('2d')
      const grad = g2.createRadialGradient(R, R, 0, R, R, R)
      grad.addColorStop(0, `hsla(${p.hue}, 70%, 70%, ${p.opacity * 1.5})`)
      grad.addColorStop(1, 'transparent')
      g2.beginPath()
      g2.arc(R, R, R, 0, Math.PI * 2)
      g2.fillStyle = grad
      g2.fill()
      g2.beginPath()
      g2.arc(R, R, p.r * 0.6, 0, Math.PI * 2)
      g2.fillStyle = `hsla(${p.hue}, 80%, 80%, ${p.opacity * 2})`
      g2.fill()
      return { c, R }
    }
    pts.forEach((p) => { p.img = sprite(p) })

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

    // Thirty frames a second. These motes drift a fifth of a pixel per frame;
    // drawing them sixty times a second says exactly as much as thirty, and
    // leaves half the budget to whatever the page is actually for.
    const FRAME = 1000 / 30
    let lastAt = 0
    // Reused every frame: four buckets of line ends, emptied rather than
    // rebuilt, so the loop allocates nothing.
    const bands = [[], [], [], []]

    const draw = (now) => {
      if (!running) return
      if (now - lastAt < FRAME) { raf = requestAnimationFrame(draw); return }
      lastAt = now
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

        // Glow and core, stamped in one go.
        ctx.drawImage(p.img.c, p.x - p.img.R, p.y - p.img.R)
      })

      // Connections. The fade with distance is kept, but in four steps rather
      // than continuously, so the whole web is four paths instead of a
      // beginPath and a stroke for every pair — at eighty motes that was up to
      // three thousand stroke calls in a frame.
      bands.forEach((b) => { b.length = 0 })
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const dist = dx * dx + dy * dy
          if (dist >= 10000) continue
          const b = bands[Math.min(3, (((1 - dist / 10000) * 4) | 0))]
          b.push(pts[i].x, pts[i].y, pts[j].x, pts[j].y)
        }
      }
      ctx.lineWidth = 0.4
      for (let band = 0; band < 4; band++) {
        const seg = bands[band]
        if (!seg.length) continue
        ctx.strokeStyle = `rgba(79, 70, 229, ${((0.03 * (band + 0.5)) / 4).toFixed(4)})`
        ctx.beginPath()
        for (let k = 0; k < seg.length; k += 4) { ctx.moveTo(seg[k], seg[k + 1]); ctx.lineTo(seg[k + 2], seg[k + 3]) }
        ctx.stroke()
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
