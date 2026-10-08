import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import Header from './components/Header'
import Landing from './components/Landing'
import MobileCTA from './components/MobileCTA'
import ErrorBoundary from './components/ErrorBoundary'
import NetworkStatus from './components/NetworkStatus'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { events } from './lib/analytics'
import { initWebVitals } from './lib/webVitals'
import { scrollBehavior } from './lib/motion'
import { resolveRoute } from './lib/routes'
import NotFound from './components/NotFound'
import Intro3D from './components/Intro3D'
import Splash from './components/Splash'
import { supports3D } from './lib/lumen3d-support'

// The landing page is the site now, so it ships in the main bundle.
// ChatWidget/Privacy stay on-demand.
const ChatWidget = lazy(() => import('./components/ChatWidget'))
const Privacy = lazy(() => import('./components/Privacy'))

// The legacy '#/info/<section>' table moved to lib/routes.js, so the pageview
// code reads the same one and counts what this component actually shows.

export default function App() {
  /* The page is always drawn; `phase` stays (2 = page shown) so the
     effects below keep their guards. */
  const phase = 2

  /* オープニング。流すかどうかは index.html の小さなスクリプトが、描く前に
     1回だけ決めます（トップページを外から開いたとき、タブごとに1回）。
     3Dが使える端末では光が集まって結晶になる3Dのオープニング（'3d'）、
     使えない端末では平面のオープニング（'flat'）。ページは最初から幕の
     後ろに描いてあるので、幕が薄れればそのまま読み始められます。
     クリック・Esc・Enter・SKIP でいつでも飛ばせます。 */
  const [intro, setIntro] = useState(() => {
    if (typeof window === 'undefined' || !window.__lumIntro) return 'none'
    return supports3D() ? '3d' : 'flat'
  })
  const endIntro = useCallback(() => setIntro('none'), [])
  useEffect(() => {
    if (intro === 'none') return
    try { sessionStorage.setItem('lum:intro', '1') } catch (_) { /* private mode */ }
    const root = document.documentElement
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = '' }
  }, [intro])
  const [pageReady, setPageReady] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [chatReady, setChatReady] = useState(false)

  /* Hash routing. The site is one landing page now. Old in-app addresses
     ('#/info/<section>', still linked from the static pages, bookmarks and
     search results) go to the matching place on the landing page, or to the
     standalone page that now holds that content. */
  const [route, setRoute] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash))
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const isInfo = true
  const infoMounted = true
  const infoSection = ''
  // Recomputed per hash change; the path itself never changes in the app.
  const where = resolveRoute(typeof window === 'undefined' ? undefined : { pathname: window.location.pathname, hash: route })
  useEffect(() => {
    const r = resolveRoute()
    if (r.redirect) { window.location.replace(r.redirect); return }
    if (r.kind !== 'page') return
    const id = r.anchor
    // Leave a clean address behind, without adding a history entry.
    // replaceState fires no hashchange, so this is not counted a second time.
    if (r.legacy) window.history.replaceState(null, '', window.location.pathname + window.location.search + (id ? '#' + id : ''))
    if (!id) return
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (!el) return
      const y = el.getBoundingClientRect().top + window.scrollY - 72
      window.scrollTo({ top: Math.max(0, y), behavior: scrollBehavior() })
    })
  }, [route])

  useEffect(() => {
    setPageReady(true)
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

    // Anything that arrives after this point. Every [data-animate] element
    // starts at opacity 0 and only this observer ever adds .visible, and the
    // observer took its list once — so a section that waits on a fetch was
    // invisible for ever. Measured on 「一覧 →」: /#/info/news rendered 698px
    // of お知らせ at opacity 0, which is why the page looked empty.
    const lateComers = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue
          if (node.matches?.('[data-animate]') && !node.classList.contains('visible')) observer.observe(node)
          node.querySelectorAll?.('[data-animate]:not(.visible)').forEach((el) => observer.observe(el))
          if (node.matches?.('[data-count]')) counterObserver.observe(node)
          node.querySelectorAll?.('[data-count]:not(.counter-done)').forEach((el) => counterObserver.observe(el))
        }
      }
    })
    lateComers.observe(document.body, { childList: true, subtree: true })

    /* The button ripple, the magnetic buttons (CTAs drifting toward the
       pointer) and the custom glowing cursor are gone. Asked for: gimmicks
       that sparkle or move on their own read as cheap and can make people
       feel sick. Buttons answer a hover with colour and outline only. */

    // --- Pressed state, for fingers ---
    // :active is unreliable for touch: measured with a real touch through the
    // browser's own input pipeline, holding a finger on a button changed
    // nothing — no transform, no background, no border. Mobile engines only
    // apply :active under conditions a page cannot count on, so the pressed
    // look is set here instead, on pointerdown, before any state changes or
    // any render runs. One listener for the whole document; it adds a class
    // and nothing else, so it costs a touch nothing.
    const PRESSABLE = 'button, a[href], [role="button"], .pricing-sim-item, .pricing-refine-opt'
    let held = null
    const release = () => { if (held) { held.classList.remove('is-pressing'); held = null } }
    const onPressDown = (e) => {
      const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null
      release()
      if (!el || el.hasAttribute('disabled')) return
      held = el
      el.classList.add('is-pressing')
    }
    document.addEventListener('pointerdown', onPressDown, { passive: true, capture: true })
    document.addEventListener('pointerup', release, { passive: true, capture: true })
    // A scroll that starts on a button cancels the press, which is what the
    // finger meant — and what the browser tells us by cancelling the pointer.
    document.addEventListener('pointercancel', release, { passive: true, capture: true })
    window.addEventListener('blur', release)

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
      // '#/...' are hash-router links — let the browser update the hash
      if (!href || href === '#' || href.startsWith('#/')) return
      let target = null
      try { target = document.querySelector(href) } catch { return }
      if (!target) {
        // Legacy in-page anchor whose section isn't on this (solo) page:
        // route to it instead of dying silently.
        e.preventDefault()
        window.location.hash = href === '#top' ? '' : '#/info/' + href.slice(1)
        return
      }
      e.preventDefault()
      const y = target.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top: y, behavior: prefersReduced ? 'auto' : 'smooth' })
    }
    // 捕捉フェーズで受ける。子孫が stopPropagation() を呼ぶと、この
    // listener は document に付いている以上まったく動かない — そして
    // React のリスナーは root に付くので、React の onClick 内の
    // stopPropagation() はネイティブのイベントごと止めてしまう。実際に
    // サービス詳細のパネルがそれをしていて、中のリンクは全部ブラウザ既定の
    // 動き（#contact-form へ移動 → ルーターが知らない住所 → ホーム）に
    // なっていた。捕捉なら誰よりも先に受け取れる。
    document.addEventListener('click', onAnchorClick, true)

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
    // Reduce Motion: jump instead of gliding the whole page.
    topBtn.onclick = () => window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' })
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

      // progress bar — only meaningful on genuinely scrollable pages.
      // On the near-unscrollable search home, y/h exploded to ~60% from a
      // few px of drag (and iOS rubber-banding pushed it out of range),
      // leaving the bar stuck at a bogus position.
      const scrollable = h > 160
      const shown = scrollable ? '1' : '0'
      if (progressBar.dataset.show !== shown) {
        progressBar.dataset.show = shown
        progressBar.style.opacity = scrollable ? '1' : '0'
      }
      progressBar.style.transform = `scaleX(${scrollable ? Math.min(1, Math.max(0, y / h)) : 0})`

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
          const href = link.getAttribute('href')
          link.classList.toggle('nav-active', href === '#' + current || href === '#/info/' + current)
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
      lateComers.disconnect()
      release()
      document.removeEventListener('pointerdown', onPressDown, { capture: true })
      document.removeEventListener('pointerup', release, { capture: true })
      document.removeEventListener('pointercancel', release, { capture: true })
      window.removeEventListener('blur', release)
      observer.disconnect(); counterObserver.disconnect(); painObserver.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', recalcOffsets)
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      document.removeEventListener('click', onAnchorClick, true)
      document.removeEventListener('click', onCtaDelegatedClick, { capture: true })
      document.removeEventListener('click', onOutboundClick, { capture: true })
      progressBar.remove()
      topBtn.remove()
    }
    // Re-run when the view or the solo section switches (and once the lazy
    // info DOM exists) so observers rebind to the new DOM
  }, [pageReady, isInfo, infoMounted, infoSection])

  return (
    <ErrorBoundary>
      {intro === '3d' && <Intro3D onDone={endIntro} onFail={() => setIntro('flat')} />}
      {intro === 'flat' && <Splash onComplete={endIntro} />}
      <a href="#main" className="skip-link">メインコンテンツへスキップ</a>
      <Header />
      <main id="main">
        {where.kind === 'not_found' ? <NotFound /> : <Landing onPrivacy={() => setShowPrivacy(true)} />}
      </main>
      <MobileCTA />
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
