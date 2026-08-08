import { useState, useRef, useEffect } from 'react'
import VideoModal from './VideoModal'
import { events } from '../lib/analytics'

// Google-style minimal home: a big logo and one search box.
// Known topics route straight to the info page section; anything else is
// handed to the AI chat widget via the `lumenium:ask` custom event.

// Service-specific keywords open that service's detail panel directly
// (checked before the generic topic routes below).
const SERVICE_MAP = [
  { re: /SNS|LINE|ライン|インスタ|Instagram|運用代行|Bot|ボット|集客/i, id: 'sns' },
  { re: /動画|映像|採用動画|PR動画|ムービー|YouTube|ユーチューブ|編集|撮影/i, id: 'video' },
  { re: /AI|研修|ChatGPT|生成AI|講師|教材|DX/i, id: 'ai' },
  { re: /Web|HP|ホームページ|LP|ランディング|サイト制作|アプリ/i, id: 'web' },
  { re: /キャスト|モデル|MC|司会|イベント|アイドル|配信者/i, id: 'cast' },
  { re: /ロゴ|バナー|ポスター|イラスト|デザイン|作詞|作曲|ライター/i, id: 'creative' },
]

const TOPIC_ROUTES = [
  { re: /料金|価格|費用|いくら|見積/i, hash: '#/info/pricing' },
  { re: /実績|事例|ポートフォリオ/i, hash: '#/info/results' },
  { re: /声|評判|レビュー|口コミ/i, hash: '#/info/testimonials' },
  { re: /流れ|依頼|進め方|納期/i, hash: '#/info/flow' },
  { re: /質問|FAQ|よくある/i, hash: '#/info/faq' },
  { re: /会社|概要|運営|代表/i, hash: '#/info/company' },
  { re: /問い合わせ|相談|連絡|コンタクト/i, hash: '#/info/contact-form' },
  { re: /ブログ|記事|コラム/i, hash: '#/info/blog' },
  { re: /サービス|動画|映像|AI|SNS|LINE|Web|HP|LP|アプリ|ロゴ|キャスト|制作|研修/i, hash: '#/info/services' },
]

// Search-assist suggestions (shown when the magnifier is pressed / the box
// is focused). `service` opens that service's detail panel; `hash` jumps to
// a section; `ai` hands the label to the chat.
const SUGGESTIONS = [
  { label: '採用動画・PR動画を作ってみよう', service: 'video' },
  { label: '生成AI研修で社内を強化しよう', service: 'ai' },
  { label: 'SNS・LINEで集客を仕組み化しよう', service: 'sns' },
  { label: 'HP・LPをリニューアルしよう', service: 'web' },
  { label: '料金をシミュレーションしてみよう', hash: '#/info/pricing' },
  { label: '実績を見てみよう', hash: '#/info/results' },
  { label: 'まずは無料で相談してみよう', hash: '#/info/contact-form' },
]

const CHIPS = [
  { label: 'サービス', hash: '#/info/services' },
  { label: '料金', hash: '#/info/pricing' },
  { label: '実績', hash: '#/info/results' },
  { label: 'お客様の声', hash: '#/info/testimonials' },
  { label: 'よくある質問', hash: '#/info/faq' },
  { label: 'お問い合わせ', hash: '#/info/contact-form' },
]

function askAI(query) {
  window.dispatchEvent(new CustomEvent('lumenium:ask', { detail: query }))
}

// Twinkling starfield that follows the cursor: every star parallax-shifts
// toward the pointer (deeper stars move more), and stars near the cursor are
// gently pulled in, springing home when it leaves.
function StarCanvas() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.parentElement.offsetWidth
      h = canvas.parentElement.offsetHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const COUNT = Math.max(60, Math.min(130, Math.floor((w * h) / 9000)))
    const stars = Array.from({ length: COUNT }, () => {
      const depth = 0.25 + Math.random() * 0.75
      const ang = Math.random() * Math.PI * 2
      // Ambient drift: deeper (bigger) stars glide faster — parallax field
      const spd = (0.00002 + Math.random() * 0.00006) * depth
      return {
        nx: Math.random(), ny: Math.random(), // normalized home (survives resize)
        dnx: Math.cos(ang) * spd,             // drift per frame (normalized)
        dny: Math.sin(ang) * spd,
        ox: 0, oy: 0,                         // eased offset toward the cursor
        r: (0.6 + Math.random() * 1.9) * depth,
        depth,
        tw: Math.random() * Math.PI * 2,      // twinkle phase
        ts: 0.02 + Math.random() * 0.035,     // twinkle speed
        flare: Math.random() < 0.14,          // bright star with a cross flare
        hue: 215 + Math.random() * 45,
      }
    })

    // Shooting stars (流れ星) — spawn every few seconds, streak with a trail
    const meteors = []
    let nextMeteorAt = performance.now() + 2500 + Math.random() * 3000
    const spawnMeteor = () => {
      if (meteors.length >= 2) return
      const fromLeft = Math.random() < 0.5
      meteors.push({
        x: fromLeft ? -40 : Math.random() * w * 0.8,
        y: fromLeft ? Math.random() * h * 0.45 : -40,
        vx: 7 + Math.random() * 5,
        vy: 3 + Math.random() * 2.5,
        life: 1,
        decay: 0.008 + Math.random() * 0.006,
        len: 90 + Math.random() * 70,
        hue: 210 + Math.random() * 50,
      })
    }
    const drawMeteors = (now) => {
      if (now >= nextMeteorAt) {
        spawnMeteor()
        nextMeteorAt = now + 3500 + Math.random() * 5000
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.x += m.vx
        m.y += m.vy
        m.life -= m.decay
        if (m.life <= 0 || m.x > w + m.len || m.y > h + m.len) {
          meteors.splice(i, 1)
          continue
        }
        const mag = Math.hypot(m.vx, m.vy)
        const tx = m.x - (m.vx / mag) * m.len
        const ty = m.y - (m.vy / mag) * m.len
        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty)
        grad.addColorStop(0, `hsla(${m.hue}, 90%, 85%, ${0.85 * m.life})`)
        grad.addColorStop(1, 'transparent')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        // bright head
        ctx.fillStyle = `hsla(${m.hue}, 95%, 92%, ${m.life})`
        ctx.beginPath()
        ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const mouse = { x: w / 2, y: h / 2, active: false }
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
      mouse.active = true
    }
    const onLeave = () => { mouse.active = false }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('resize', resize)

    let raf = 0
    let running = false

    const drawStar = (s, now) => {
      // Ambient drift with edge wrap (skipped for the reduced-motion frame)
      if (!prefersReduced) {
        s.nx += s.dnx
        s.ny += s.dny
        if (s.nx < -0.03) s.nx = 1.03
        if (s.nx > 1.03) s.nx = -0.03
        if (s.ny < -0.03) s.ny = 1.03
        if (s.ny > 1.03) s.ny = -0.03
      }
      const hx = s.nx * w
      const hy = s.ny * h

      // Target offset: whole-field parallax toward the cursor + local pull
      let tx = 0
      let ty = 0
      if (mouse.active && !prefersReduced) {
        tx = (mouse.x - w / 2) * 0.06 * s.depth
        ty = (mouse.y - h / 2) * 0.06 * s.depth
        const dx = mouse.x - hx
        const dy = mouse.y - hy
        const dist = Math.hypot(dx, dy)
        const R = 190
        if (dist < R && dist > 0.01) {
          const pull = (1 - dist / R) * 30 * s.depth
          tx += (dx / dist) * pull
          ty += (dy / dist) * pull
        }
      }
      s.ox += (tx - s.ox) * 0.07
      s.oy += (ty - s.oy) * 0.07
      const x = hx + s.ox
      const y = hy + s.oy

      s.tw += s.ts
      const sparkle = 0.5 + 0.5 * Math.sin(s.tw + now * 0)
      const alpha = 0.25 + 0.75 * sparkle

      // Glow
      const glowR = s.r * (s.flare ? 7 : 4.5)
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowR)
      g.addColorStop(0, `hsla(${s.hue}, 85%, 78%, ${alpha * 0.5})`)
      g.addColorStop(1, 'transparent')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, glowR, 0, Math.PI * 2)
      ctx.fill()

      // Core
      ctx.fillStyle = `hsla(${s.hue}, 90%, 88%, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, s.r, 0, Math.PI * 2)
      ctx.fill()

      // Cross flare for the bright ones
      if (s.flare) {
        const len = s.r * (4 + 3 * sparkle)
        ctx.strokeStyle = `hsla(${s.hue}, 90%, 88%, ${alpha * 0.55})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(x - len, y); ctx.lineTo(x + len, y)
        ctx.moveTo(x, y - len); ctx.lineTo(x, y + len)
        ctx.stroke()
      }
    }

    const draw = (now) => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) drawStar(s, now)
      drawMeteors(now)
      raf = requestAnimationFrame(draw)
    }
    const start = () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      raf = requestAnimationFrame(draw)
    }
    const stop = () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVis = () => { document.visibilityState === 'hidden' ? stop() : start() }
    document.addEventListener('visibilitychange', onVis)

    if (prefersReduced) {
      // Static sky: one frame, no animation loop
      running = true
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) drawStar(s, 0)
      running = false
    } else {
      start()
    }

    return () => {
      stop()
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} className="search-home-stars" aria-hidden="true" />
}

export default function SearchHome() {
  const [q, setQ] = useState('')
  const [assistOpen, setAssistOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [videoOpen, setVideoOpen] = useState(false)
  const inputRef = useRef(null)
  const formRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close the assist panel on outside click / Escape
  useEffect(() => {
    if (!assistOpen) return
    const onDown = (e) => {
      if (formRef.current && !formRef.current.contains(e.target)) setAssistOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setAssistOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [assistOpen])

  // Typed text filters the suggestions; an "ask AI" row is appended when
  // there is a query so there is always a way forward.
  const query = q.trim()
  const filtered = query
    ? SUGGESTIONS.filter((s) => s.label.toLowerCase().includes(query.toLowerCase()))
    : SUGGESTIONS
  const rows = query ? [...filtered, { label: `「${query}」をAIに聞く`, ai: true }] : filtered

  const jump = (s) => {
    setAssistOpen(false)
    setActiveIdx(-1)
    events.ctaClick('home-assist', s.label.slice(0, 60))
    if (s.ai) {
      askAI(query || 'Lumeniumについて教えて')
      return
    }
    if (s.service) {
      sessionStorage.setItem('lum_open_service', s.service)
      window.location.hash = '#/info/services'
      return
    }
    if (s.hash) window.location.hash = s.hash
  }

  const onInputKeyDown = (e) => {
    if (!assistOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setAssistOpen(true)
      setActiveIdx(0)
      e.preventDefault()
      return
    }
    if (!assistOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % rows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + rows.length) % rows.length)
    } else if (e.key === 'Enter' && activeIdx >= 0 && rows[activeIdx]) {
      e.preventDefault()
      jump(rows[activeIdx])
    }
  }

  const onSearch = (e) => {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    events.ctaClick('home-search', query.slice(0, 60))
    // 1) Service match → jump to services AND open that service's detail panel
    const service = SERVICE_MAP.find((s) => s.re.test(query))
    if (service) {
      sessionStorage.setItem('lum_open_service', service.id)
      window.location.hash = '#/info/services'
      return
    }
    // 2) Generic topic → jump to the matching section
    const topic = TOPIC_ROUTES.find((t) => t.re.test(query))
    if (topic) {
      window.location.hash = topic.hash
      return
    }
    // 3) Anything else → ask the AI
    askAI(query)
  }

  const onAsk = () => {
    const query = q.trim()
    events.ctaClick('home-ask-ai', query.slice(0, 60) || '(empty)')
    askAI(query || 'Lumeniumについて教えて')
  }

  return (
    <main className="search-home" id="top">
      <StarCanvas />
      <div className="search-home-inner">
        <div className="search-home-brand">
          <img src="/favicon.svg" alt="" width="72" height="72" className="search-home-mark" />
          <h1 className="search-home-logo">Lumenium</h1>
          <p className="search-home-tag">散文化した目的に焦点を当てる</p>
        </div>

        <form className="search-home-form" onSubmit={onSearch} role="search" ref={formRef}>
          <div className="search-home-box">
            <button
              type="button"
              className="search-home-icon-btn"
              onClick={() => { setAssistOpen((v) => !v); setActiveIdx(-1); inputRef.current?.focus() }}
              aria-label="検索アシストを開く"
              aria-expanded={assistOpen}
              aria-controls="search-assist"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M14 14L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setAssistOpen(true); setActiveIdx(-1) }}
              onFocus={() => setAssistOpen(true)}
              onKeyDown={onInputKeyDown}
              placeholder="何をお探しですか？ 例：採用動画・AI研修・LP制作…"
              aria-label="サイト内検索・AIへの質問"
              aria-autocomplete="list"
              maxLength={200}
              enterKeyHint="search"
            />
          </div>
          {assistOpen && rows.length > 0 && (
            <ul className="search-home-assist" id="search-assist" role="listbox" aria-label="検索候補">
              {rows.map((s, i) => (
                <li key={s.label} role="option" aria-selected={i === activeIdx}>
                  <button
                    type="button"
                    className={`search-home-assist-item ${i === activeIdx ? 'is-active' : ''}`}
                    onClick={() => jump(s)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    {s.ai ? (
                      <span className="search-home-assist-ico" aria-hidden="true">💬</span>
                    ) : (
                      <svg className="search-home-assist-ico" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    )}
                    <span>{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="search-home-actions">
            <button type="submit" className="search-home-btn">検索</button>
            <button type="button" className="search-home-btn" onClick={onAsk}>AIに相談する</button>
          </div>
        </form>

        {/* PR movie card — relocated from the old hero so it gets seen */}
        <button
          type="button"
          className="hero-video-card search-home-video"
          onClick={() => { events.ctaClick('home-video', 'PR動画を見る'); setVideoOpen(true) }}
          aria-label="PR動画を再生する"
          data-cta="home-video"
        >
          <span className="hero-video-card-thumb" aria-hidden="true">
            <img className="hero-video-card-poster" src="/intro-poster.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" />
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

        <div className="search-home-chips" aria-label="よく見られるページ">
          {CHIPS.map((c) => (
            <a key={c.label} href={c.hash} className="search-home-chip">{c.label}</a>
          ))}
        </div>
      </div>

      {videoOpen && <VideoModal onClose={() => setVideoOpen(false)} />}

      <footer className="search-home-footer">
        <a href="#/info">サービス案内</a>
        <a href="#/info/company">会社概要</a>
        <a href="#/info/contact-form">お問い合わせ</a>
        <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
      </footer>
    </main>
  )
}
