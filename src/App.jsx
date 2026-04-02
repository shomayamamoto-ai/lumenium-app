import { useEffect } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Marquee from './components/Marquee'
import Why from './components/Why'
import Services from './components/Services'
import Pricing from './components/Pricing'
import Flow from './components/Flow'
import CTA from './components/CTA'
import Footer from './components/Footer'

export default function App() {
  useEffect(() => {
    // Scroll animations
    const animateElements = document.querySelectorAll('[data-animate]')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('visible'), i * 80)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )
    animateElements.forEach((el) => observer.observe(el))

    // Parallax glow
    const heroGlows = document.querySelectorAll('.hero-glow')
    const handleMouseMove = (e) => {
      const x = e.clientX / window.innerWidth
      const y = e.clientY / window.innerHeight
      heroGlows.forEach((glow, i) => {
        const factor = (i + 1) * 15
        glow.style.transform = `translate(${x * factor}px, ${y * factor}px)`
      })
    }
    document.addEventListener('mousemove', handleMouseMove)

    // Card mouse-following glow (Linear-style)
    const cards = document.querySelectorAll('.service-card, .promise-card, .case-card')
    const handleCardMouse = (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      e.currentTarget.style.setProperty('--mouse-x', `${x}px`)
      e.currentTarget.style.setProperty('--mouse-y', `${y}px`)
    }
    cards.forEach((card) => {
      card.addEventListener('mousemove', handleCardMouse)
    })

    return () => {
      observer.disconnect()
      document.removeEventListener('mousemove', handleMouseMove)
      cards.forEach((card) => card.removeEventListener('mousemove', handleCardMouse))
    }
  }, [])

  return (
    <>
      <Navbar />
      <Hero />
      <Marquee />
      <Why />
      <Services />
      <Pricing />
      <Flow />
      <CTA />
      <Footer />
    </>
  )
}
