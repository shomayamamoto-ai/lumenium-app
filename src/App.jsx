import { useEffect } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Marquee from './components/Marquee'
import Why from './components/Why'
import Services from './components/Services'
import Results from './components/Results'
import Flow from './components/Flow'
import CTA from './components/CTA'
import Footer from './components/Footer'

export default function App() {
  useEffect(() => {
    // Scroll-triggered reveal animations
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

    // Parallax glow on mouse
    const heroGlows = document.querySelectorAll('.hero-glow')
    const handleMouseMove = (e) => {
      const x = e.clientX / window.innerWidth
      const y = e.clientY / window.innerHeight
      heroGlows.forEach((glow, i) => {
        const factor = (i + 1) * 20
        glow.style.transform = `translate(${x * factor}px, ${y * factor}px)`
      })
    }
    document.addEventListener('mousemove', handleMouseMove)

    // Card mouse-following glow (Linear-style)
    const cards = document.querySelectorAll('.glow-card')
    const handleCardMouse = (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`)
      e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`)
    }
    cards.forEach((c) => c.addEventListener('mousemove', handleCardMouse))

    // Counter animation
    const counters = document.querySelectorAll('[data-count]')
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target
            const target = parseInt(el.dataset.count, 10)
            const suffix = el.dataset.suffix || ''
            const prefix = el.dataset.prefix || ''
            const duration = 2000
            const start = performance.now()
            const animate = (now) => {
              const progress = Math.min((now - start) / duration, 1)
              const eased = 1 - Math.pow(1 - progress, 4)
              el.textContent = prefix + Math.floor(target * eased).toLocaleString() + suffix
              if (progress < 1) requestAnimationFrame(animate)
            }
            requestAnimationFrame(animate)
            counterObserver.unobserve(el)
          }
        })
      },
      { threshold: 0.5 }
    )
    counters.forEach((c) => counterObserver.observe(c))

    return () => {
      observer.disconnect()
      counterObserver.disconnect()
      document.removeEventListener('mousemove', handleMouseMove)
      cards.forEach((c) => c.removeEventListener('mousemove', handleCardMouse))
    }
  }, [])

  return (
    <>
      <Navbar />
      <Hero />
      <Marquee />
      <Why />
      <Services />
      <Results />
      <Flow />
      <CTA />
      <Footer />
    </>
  )
}
