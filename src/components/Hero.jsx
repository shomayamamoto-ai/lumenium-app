import { useEffect, useState, useRef } from 'react'
import VideoModal from './VideoModal'
import { events } from '../lib/analytics'

const typingWords = ['SNS集客', '動画制作', 'AI導入', 'LINE構築', 'Web制作', 'アプリ開発']

function useTypingEffect(words, pauseTime = 2200) {
  const [text, setText] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  useEffect(() => {
    const currentWord = words[wordIndex]
    let timeout
    if (!isDeleting && text === currentWord) {
      timeout = setTimeout(() => setIsDeleting(true), pauseTime)
    } else if (isDeleting && text === '') {
      setIsDeleting(false)
      setWordIndex((prev) => (prev + 1) % words.length)
    } else {
      // Realistic speed: fast in middle, slow at start/end
      const progress = text.length / currentWord.length
      let speed
      if (isDeleting) {
        speed = 30 + Math.random() * 20
      } else {
        speed = progress < 0.3 ? 120 - Math.random() * 30
             : progress < 0.7 ? 60 + Math.random() * 20
             : 100 + Math.random() * 40
      }
      timeout = setTimeout(() => {
        setText(currentWord.substring(0, text.length + (isDeleting ? -1 : 1)))
      }, speed)
    }
    return () => clearTimeout(timeout)
  }, [text, isDeleting, wordIndex, words, pauseTime])
  return text
}

function HeroParticles() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = canvas.width = canvas.parentElement.offsetWidth
    let h = canvas.height = canvas.parentElement.offsetHeight
    const mouse = { x: w / 2, y: h / 2, active: false }

    const pts = Array.from({ length: 50 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      ox: 0, oy: 0, // original velocity
      r: 1 + Math.random() * 2,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      opacity: 0.08 + Math.random() * 0.18,
      hue: 230 + Math.random() * 30,
    }))
    pts.forEach(p => { p.ox = p.vx; p.oy = p.vy })

    const onResize = () => {
      w = canvas.width = canvas.parentElement.offsetWidth
      h = canvas.height = canvas.parentElement.offsetHeight
    }
    const onMouse = (e) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
      mouse.active = true
    }
    const onMouseLeave = () => { mouse.active = false }

    window.addEventListener('resize', onResize)
    canvas.addEventListener('mousemove', onMouse)
    canvas.addEventListener('mouseleave', onMouseLeave)

    let raf
    let running = false
    let inView = true
    const start = () => {
      if (running || !inView || document.visibilityState === 'hidden') return
      running = true
      raf = requestAnimationFrame(draw)
    }
    const stop = () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      if (inView) start(); else stop()
    }, { threshold: 0 })
    io.observe(canvas)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const draw = () => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)

      pts.forEach(p => {
        if (mouse.active) {
          // Attract toward mouse
          const dx = mouse.x - p.x
          const dy = mouse.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const maxDist = 250
          if (dist < maxDist) {
            const force = (1 - dist / maxDist) * 0.03
            p.vx += dx * force
            p.vy += dy * force
          }
        }

        // Damping — slowly return to natural drift
        p.vx = p.vx * 0.97 + p.ox * 0.03
        p.vy = p.vy * 0.97 + p.oy * 0.03

        p.x += p.vx
        p.y += p.vy

        // Wrap around
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10

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
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 80%, 80%, ${p.opacity})`
        ctx.fill()
      })

      // Draw connections between nearby particles
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const dist = dx * dx + dy * dy
          if (dist < 8000) {
            ctx.beginPath()
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.strokeStyle = `rgba(79, 70, 229, ${0.04 * (1 - dist / 8000)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      raf = requestAnimationFrame(draw)
    }
    start()

    return () => {
      stop()
      io.disconnect()
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('mousemove', onMouse)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return <canvas ref={canvasRef} className="hero-particles" />
}

function useLiveStatus() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const h = now.getHours()
  let greeting = 'こんにちは'
  let status = '返信受付中'
  let statusColor = '#10b981' // green
  if (h >= 5 && h < 11) { greeting = 'おはようございます' }
  else if (h >= 11 && h < 17) { greeting = 'こんにちは' }
  else if (h >= 17 && h < 22) { greeting = 'こんばんは' }
  else { greeting = 'お疲れさまです' }
  // Offline hours: show softer status
  if (h >= 22 || h < 9) { status = '48時間以内に返信'; statusColor = '#eab308' }
  return { greeting, status, statusColor }
}

function openChatWidget() {
  // ChatWidget button exists in DOM. Click it to open.
  const btn = document.querySelector('.chat-widget-btn')
  if (btn) btn.click()
}

export default function Hero() {
  const typingText = useTypingEffect(typingWords)
  const [videoOpen, setVideoOpen] = useState(false)
  const { greeting, status, statusColor } = useLiveStatus()

  const openVideo = () => {
    events.ctaClick('hero-video', 'PR動画を見る')
    setVideoOpen(true)
  }

  const onChatNudge = () => {
    events.ctaClick('hero-chat', 'AIチャット')
    openChatWidget()
  }

  return (
    <section className="hero" id="top">
      <div className="hero-bg" />
      {typeof window !== 'undefined' && window.innerWidth > 768 && (
        <video
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster="/intro-poster.jpg"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/intro.mp4" type="video/mp4" />
        </video>
      )}
      <HeroParticles />
      <div className="hero-content">
        <p className="hero-lead animate-fade-up">
          <span className="hero-lead-dot" aria-hidden="true" />
          DIGITAL CREATIVE STUDIO · TOKYO
        </p>
        <h1 className="hero-title animate-fade-up delay-1">
          {'散文化した目的に、'.split('').map((ch, i) => (
            <span key={i} className="char-reveal" style={{ animationDelay: `${0.3 + i * 0.04}s` }}>{ch}</span>
          ))}
          <br />
          <span className="text-accent">
            {'焦点を当てる。'.split('').map((ch, i) => (
              <span key={i} className="char-reveal" style={{ animationDelay: `${0.7 + i * 0.04}s` }}>{ch}</span>
            ))}
          </span>
        </h1>
        <p className="hero-desc animate-fade-up delay-2">
          ぼんやりした"やりたい"を、<strong>動画・AI・Web</strong>で最短ルートの成果に。<br />
          企画から納品・運用まで <strong>ワンストップ</strong> で、あなたの事業に光を当てます。
        </p>
        <div className="hero-typing animate-fade-up delay-2">
          <span className="typing-label">対応領域</span>
          <span className="typing-arrow">→</span>
          <span className="typing-text">{typingText}</span>
          <span className="typing-cursor" />
        </div>
        <div className="hero-actions animate-fade-up delay-3">
          <a href="#contact-form" className="btn btn-accent" data-cta="hero-consult">
            無料でご相談する
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <a href="#services" className="btn btn-ghost-w" data-cta="hero-services">サービスを見る</a>
          <button type="button" className="hero-chat-nudge" onClick={onChatNudge} aria-label="AIチャットで質問する">
            <span className="hero-chat-nudge-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1C4.13 1 1 3.91 1 7.5c0 1.4.48 2.7 1.3 3.76L1.3 14.5a.5.5 0 00.6.62l3.6-1.1c.76.31 1.61.48 2.5.48 3.87 0 7-2.91 7-6.5S11.87 1 8 1z"/></svg>
            </span>
            <span>AI に聞いてみる</span>
          </button>
          <button
            type="button"
            className="hero-video-card"
            onClick={openVideo}
            aria-label="PR動画を再生する"
            data-cta="hero-video"
          >
            <span className="hero-video-card-thumb" aria-hidden="true">
              {/* Mobile: static poster (no video preload). Desktop: autoplay preview */}
              <img className="hero-video-card-poster" src="/intro-poster.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
              {typeof window !== 'undefined' && window.innerWidth > 768 && (
                <video
                  className="hero-video-card-preview"
                  src="/intro.mp4"
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="none"
                  poster="/intro-poster.jpg"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              )}
              <span className="hero-video-card-play">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M5 3.5v9l7-4.5z" />
                </svg>
              </span>
            </span>
            <span className="hero-video-card-body">
              <span className="hero-video-card-label">LUMENIUM · PR MOVIE</span>
              <span className="hero-video-card-title">
                10秒で知る、Lumeniumの世界観
                <svg className="hero-video-card-arrow" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="hero-video-card-meta">
                <span className="hero-video-card-dot" aria-hidden="true" /> AI生成 · 約10秒
              </span>
            </span>
          </button>
        </div>
        <div className="hero-badges animate-fade-up delay-4">
          <span>✓ 初回相談無料</span>
          <span>✓ 見積り無料</span>
          <span>✓ 秘密厳守</span>
        </div>
      </div>
      <div className="hero-scroll animate-fade-up delay-4">
        <span>SCROLL</span>
        <div className="hero-scroll-line" />
      </div>
      {videoOpen && <VideoModal onClose={() => setVideoOpen(false)} />}
    </section>
  )
}
