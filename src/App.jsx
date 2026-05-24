import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import Splash from './components/Splash'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import TrustStrip from './components/TrustStrip'
import Stats from './components/Stats'
import ServicesIntro from './components/ServicesIntro'
import Why from './components/Why'
import Banner from './components/Banner'
import BrandStory from './components/BrandStory'
import Services from './components/Services'
import Results from './components/Results'
import PricingSimulator from './components/PricingSimulator'
import Testimonials from './components/Testimonials'
import Flow from './components/Flow'
import FAQ from './components/FAQ'
import Profile from './components/Profile'
import ContactForm from './components/ContactForm'
import SocialShare from './components/SocialShare'
import Company from './components/Company'
import CTA from './components/CTA'
import Footer from './components/Footer'
import GlobalParticles from './components/GlobalParticles'
import LumenCursor from './components/LumenCursor'
import ErrorBoundary from './components/ErrorBoundary'
import NetworkStatus from './components/NetworkStatus'
import SkeletonSection from './components/Skeleton'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { events } from './lib/analytics'
import { initWebVitals } from './lib/webVitals'

// Lazy-loaded: heavy + below-the-fold or on-demand components
const Blog = lazy(() => import('./components/Blog'))
const ChatWidget = lazy(() => import('./components/ChatWidget'))
const Privacy = lazy(() => import('./components/Privacy'))

export default function App() {
  // phase 0 = light-convergence splash, phase 2 = main page.
  // The PR video is no longer a forced full-screen interstitial; it lives in the
  // Hero as a clickable showcase, so the splash hands straight off to the page.
  const [phase, setPhase] = useState(0)
  const [pageReady, setPageReady] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [chatReady, setChatReady] = useState(false)

  const handleSplashComplete = useCallback(() => {
    setPhase(2) // Skip the old PR-video interstitial — go straight to the page
    document.body.classList.remove('splash-active')
    setTimeout(() => setPageReady(true), 50)
  }, [])

  useEffect(() => {
    document.body.classList.add('splash-active')
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

    // --- Magnetic buttons (desktop only, respects reduced-motion) ---
    // Primary CTAs subtly follow the cursor when the pointer is near them.
    const magneticBtns = hasFinePointer && !prefersReduced
      ? document.querySelectorAll('.btn-accent, .btn-primary, .btn-white, .btn-ghost-w')
      : []
    const onMagneticMove = (e) => {
      const btn = e.currentTarget
      const rect = btn.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      btn.style.setProperty('--mag-x', `${x * 0.18}px`)
      btn.style.setProperty('--mag-y', `${y * 0.35}px`)
    }
    const onMagneticLeave = (e) => {
      e.currentTarget.style.setProperty('--mag-x', '0px')
      e.currentTarget.style.setProperty('--mag-y', '0px')
    }
    magneticBtns.forEach(b => {
      b.classList.add('is-magnetic')
      b.addEventListener('mousemove', onMagneticMove)
      b.addEventListener('mouseleave', onMagneticLeave)
    })

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
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', recalcOffsets)
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      btns.forEach(b => b.removeEventListener('click', handleBtnClick))
      magneticBtns.forEach(b => {
        b.classList.remove('is-magnetic')
        b.removeEventListener('mousemove', onMagneticMove)
        b.removeEventListener('mouseleave', onMagneticLeave)
        b.style.removeProperty('--mag-x')
        b.style.removeProperty('--mag-y')
      })
      document.removeEventListener('click', onAnchorClick)
      document.removeEventListener('click', onCtaDelegatedClick, { capture: true })
      document.removeEventListener('click', onOutboundClick, { capture: true })
      progressBar.remove()
      topBtn.remove()
    }
  }, [pageReady])

  return (
    <ErrorBoundary>
      {phase === 0 && <Splash onComplete={handleSplashComplete} />}
      <a href="#main" className="skip-link">メインコンテンツへスキップ</a>
      <GlobalParticles show={pageReady} />
      {phase === 2 && (
        <div id="main" className={pageReady ? 'page-enter' : ''}>
          <Navbar />
          <Hero />
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
          <Suspense fallback={<SkeletonSection title="Blog" cards={3} columns={3} />}>
            <Blog />
          </Suspense>
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
      <SpeedInsights />
    </ErrorBoundary>
  )
}
