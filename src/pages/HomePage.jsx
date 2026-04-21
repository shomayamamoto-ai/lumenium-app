import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import Splash from '../components/Splash'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import Marquee from '../components/Marquee'
import TrustStrip from '../components/TrustStrip'
import Stats from '../components/Stats'
import ServicesIntro from '../components/ServicesIntro'
import IntroVideo from '../components/IntroVideo'
import Why from '../components/Why'
import Banner from '../components/Banner'
import BrandStory from '../components/BrandStory'
import Services from '../components/Services'
import Results from '../components/Results'
import PricingSimulator from '../components/PricingSimulator'
import Testimonials from '../components/Testimonials'
import Flow from '../components/Flow'
import FAQ from '../components/FAQ'
import Profile from '../components/Profile'
import ContactForm from '../components/ContactForm'
import SocialShare from '../components/SocialShare'
import Company from '../components/Company'
import CTA from '../components/CTA'
import Footer from '../components/Footer'
import GlobalParticles from '../components/GlobalParticles'
import LumenCursor from '../components/LumenCursor'
import NetworkStatus from '../components/NetworkStatus'
import BlogTeaser from '../components/BlogTeaser'
import { events } from '../lib/analytics'
import { initWebVitals } from '../lib/webVitals'

// Lazy-loaded: heavy + below-the-fold or on-demand components
const ChatWidget = lazy(() => import('../components/ChatWidget'))
const Privacy = lazy(() => import('../components/Privacy'))

// Module-level flag: splash + intro video plays on full page load; if the user
// navigates away within the SPA (e.g. to /blog) and comes back, we skip it.
// A real page refresh (F5 / ⌘R) resets the module and replays splash + video.
let splashAlreadyPlayed = false

export default function HomePage() {
  const [phase, setPhase] = useState(() => (splashAlreadyPlayed ? 2 : 0))
  const [pageReady, setPageReady] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [chatReady, setChatReady] = useState(false)
  const showSplash = phase === 0

  const handleSplashComplete = useCallback(() => {
    setPhase(1) // Show PR video
    document.body.classList.remove('splash-active')
  }, [])

  const handleVideoEnd = useCallback(() => {
    setPhase(2) // Show main page
    setTimeout(() => setPageReady(true), 50)
    splashAlreadyPlayed = true
  }, [])

  useEffect(() => {
    if (phase === 2) {
      // Returned to home via internal navigation — skip directly to content.
      setPageReady(true)
      splashAlreadyPlayed = true
    } else {
      document.body.classList.add('splash-active')
    }
    initWebVitals()
  }, [])

  // Defer ChatWidget mount until the browser is idle after the main page is ready
  useEffect(() => {
    if (phase !== 2 || chatReady) return
    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500))
    const cic = window.cancelIdleCallback || clearTimeout
    const id = ric(() => setChatReady(true), { timeout: 3000 })
    return () => cic(id)
  }, [phase, chatReady])

  useEffect(() => {
    if (!pageReady) return // Wait until page is ready after splash

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

    const animateElements = document.querySelectorAll('[data-animate]')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = entry.target.dataset.delay || 0
            setTimeout(() => entry.target.classList.add('visible'), delay * 100)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    animateElements.forEach((el) => observer.observe(el))

    const counters = document.querySelectorAll('[data-count]')
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target
            const target = parseInt(el.dataset.count, 10)
            const duration = 2000
            const start = performance.now()
            const animate = (now) => {
              const progress = Math.min((now - start) / duration, 1)
              const eased = 1 - Math.pow(1 - progress, 4)
              el.textContent = Math.floor(target * eased).toLocaleString()
              if (progress < 1) {
                requestAnimationFrame(animate)
              } else {
                el.classList.add('counter-done')
              }
            }
            requestAnimationFrame(animate)
            counterObserver.unobserve(el)
          }
        })
      },
      { threshold: 0.5 }
    )
    counters.forEach((c) => counterObserver.observe(c))

    // --- Button ripple effect ---
    const btns = document.querySelectorAll('.btn-accent, .btn-primary')
    const handleBtnClick = (e) => {
      const btn = e.currentTarget
      const rect = btn.getBoundingClientRect()
      const ripple = document.createElement('span')
      ripple.className = 'btn-ripple'
      const size = Math.max(rect.width, rect.height)
      ripple.style.width = ripple.style.height = size + 'px'
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px'
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px'
      btn.appendChild(ripple)
      ripple.addEventListener('animationend', () => ripple.remove())
    }
    btns.forEach(b => b.addEventListener('click', handleBtnClick))

    // --- Image lazy fade-in ---
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      if (img.complete) { img.classList.add('loaded') }
      else { img.addEventListener('load', () => img.classList.add('loaded'), { once: true }) }
    })

    // --- Smooth scroll (delegated: one listener instead of N per link) ---
    const onAnchorClick = (e) => {
      const link = e.target.closest('a[href^="#"]')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || href === '#') return
      const target = document.querySelector(href)
      if (!target) return
      e.preventDefault()
      const y = target.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
    document.addEventListener('click', onAnchorClick)

    // --- Staggered card entrance for pain cards ---
    const painCards = document.querySelectorAll('.card--pain')
    const painObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const cards = entry.target.parentElement.querySelectorAll('.card--pain')
          cards.forEach((card, i) => {
            setTimeout(() => {
              card.style.opacity = '1'
              card.style.transform = 'translateY(0)'
            }, i * 200)
          })
          painObserver.unobserve(entry.target)
        }
      })
    }, { threshold: 0.2 })
    if (painCards.length) painObserver.observe(painCards[0])

    // --- Scroll to top button ---
    const topBtn = document.createElement('button')
    topBtn.className = 'scroll-top-btn'
    topBtn.setAttribute('aria-label', 'ページ上部へスクロール')
    topBtn.setAttribute('type', 'button')
    topBtn.innerHTML = '↑'
    topBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' })
    document.body.appendChild(topBtn)

    // --- Scroll progress bar ---
    const progressBar = document.createElement('div')
    progressBar.className = 'scroll-progress'
    progressBar.setAttribute('role', 'progressbar')
    progressBar.setAttribute('aria-label', 'ページのスクロール進行状況')
    progressBar.setAttribute('aria-hidden', 'true')
    document.body.appendChild(progressBar)

    // --- 3D tilt on cards (desktop only, opt-out with reduced motion) ---
    let tiltRaf = 0
    let tiltTarget = null
    let tiltX = 0
    let tiltY = 0
    const applyTilt = () => {
      tiltRaf = 0
      if (!tiltTarget) return
      tiltTarget.style.transform = `perspective(600px) rotateY(${tiltX * 6}deg) rotateX(${-tiltY * 6}deg) translateY(-4px)`
    }
    const handleTiltMove = (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      tiltTarget = e.currentTarget
      tiltX = (e.clientX - rect.left) / rect.width - 0.5
      tiltY = (e.clientY - rect.top) / rect.height - 0.5
      if (!tiltRaf) tiltRaf = requestAnimationFrame(applyTilt)
    }
    const handleTiltLeave = (e) => {
      if (tiltTarget === e.currentTarget) tiltTarget = null
      e.currentTarget.style.transform = ''
    }
    const tiltCards = (hasFinePointer && !prefersReduced) ? document.querySelectorAll('.card') : []
    tiltCards.forEach((c) => {
      c.addEventListener('mousemove', handleTiltMove)
      c.addEventListener('mouseleave', handleTiltLeave)
    })

    // --- Unified scroll pipeline: top-btn, flow lines, depth tracking, progress, active nav ---
    const flowConnectors = document.querySelectorAll('.flow-connector')
    const sections = document.querySelectorAll('section[id]')
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]')
    const sectionOffsets = () => Array.from(sections).map((s) => ({ id: s.id, top: s.offsetTop - 200 }))
    let offsets = sectionOffsets()
    const recalcOffsets = () => { offsets = sectionOffsets() }
    window.addEventListener('resize', recalcOffsets, { passive: true })

    const depthMilestones = [25, 50, 75, 90]
    const depthFired = new Set()
    let scrollRaf = 0
    let activeNavId = ''
    const runScroll = () => {
      scrollRaf = 0
      const y = window.scrollY
      const vh = window.innerHeight
      const h = document.documentElement.scrollHeight - vh

      // scroll-to-top btn
      const showTop = y > 600
      if (topBtn.classList.contains('scroll-top-btn--show') !== showTop) {
        topBtn.classList.toggle('scroll-top-btn--show', showTop)
      }

      // progress bar
      progressBar.style.transform = `scaleX(${h > 0 ? y / h : 0})`

      // flow connectors
      flowConnectors.forEach((line) => {
        const rect = line.getBoundingClientRect()
        const visible = Math.max(0, Math.min(1, (vh - rect.top) / (vh * 0.5)))
        line.style.transform = `scaleY(${visible})`
      })

      // scroll depth
      if (h > 0) {
        const pct = Math.round((y / h) * 100)
        depthMilestones.forEach((m) => {
          if (pct >= m && !depthFired.has(m)) {
            depthFired.add(m)
            events.scrollDepth(m)
          }
        })
      }

      // active nav
      let current = ''
      for (let i = 0; i < offsets.length; i++) {
        if (y >= offsets[i].top) current = offsets[i].id
      }
      if (current !== activeNavId) {
        activeNavId = current
        navLinks.forEach((link) => {
          link.classList.toggle('nav-active', link.getAttribute('href') === '#' + current)
        })
      }
    }
    const onScroll = () => {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(runScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    runScroll() // initial

    // --- Global CTA click tracking (any a/button with data-cta) ---
    const onCtaDelegatedClick = (e) => {
      const el = e.target.closest('[data-cta]')
      if (!el) return
      const location = el.getAttribute('data-cta') || 'unknown'
      const label = el.textContent?.trim().slice(0, 80) || ''
      events.ctaClick(location, label)
    }
    document.addEventListener('click', onCtaDelegatedClick, { capture: true })

    // --- Outbound link tracking ---
    const onOutboundClick = (e) => {
      const a = e.target.closest('a[href]')
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (!/^https?:\/\//.test(href)) return
      if (href.startsWith(window.location.origin)) return
      events.outboundClick(href)
    }
    document.addEventListener('click', onOutboundClick, { capture: true })

    return () => {
      observer.disconnect(); counterObserver.disconnect(); painObserver.disconnect()
      tiltCards.forEach((c) => { c.removeEventListener('mousemove', handleTiltMove); c.removeEventListener('mouseleave', handleTiltLeave) })
      if (tiltRaf) cancelAnimationFrame(tiltRaf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', recalcOffsets)
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      btns.forEach(b => b.removeEventListener('click', handleBtnClick))
      document.removeEventListener('click', onAnchorClick)
      document.removeEventListener('click', onCtaDelegatedClick, { capture: true })
      document.removeEventListener('click', onOutboundClick, { capture: true })
      progressBar.remove()
      topBtn.remove()
    }
  }, [pageReady])

  return (
    <>
      {phase === 0 && <Splash onComplete={handleSplashComplete} />}
      {phase === 1 && (
        <div className="pr-video-fullscreen">
          <video
            className="pr-video-player"
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={handleVideoEnd}
            onError={handleVideoEnd}
          >
            <source src="/intro.mp4" type="video/mp4" />
          </video>
          <span className="pr-video-note">＊AIで作成した動画です</span>
          <button className="pr-video-skip" onClick={handleVideoEnd}>スキップ →</button>
        </div>
      )}
      <a href="#main" className="skip-link">メインコンテンツへスキップ</a>
      <GlobalParticles show={pageReady} />
      {phase === 2 && (
        <div id="main" className={pageReady ? 'page-enter' : ''}>
          <Navbar />
          <Hero />
          <Marquee />
          <TrustStrip />
          <Stats />
          <Why />
          <BrandStory />
          <Banner />
          <ServicesIntro />
          <Services />
          <Results />
          <PricingSimulator />
          <Testimonials />
          <Flow />
          <BlogTeaser />
          <FAQ />
          <Profile />
          <Company />
          <ContactForm />
          <CTA />
          <div className="container"><SocialShare /></div>
          <Footer onPrivacy={() => setShowPrivacy(true)} />
        </div>
      )}
      {phase === 2 && <LumenCursor />}
      {chatReady && (
        <Suspense fallback={null}>
          <ChatWidget />
        </Suspense>
      )}
      {showPrivacy && (
        <Suspense fallback={null}>
          <Privacy onClose={() => setShowPrivacy(false)} />
        </Suspense>
      )}
      {phase === 2 && <NetworkStatus />}
    </>
  )
}
