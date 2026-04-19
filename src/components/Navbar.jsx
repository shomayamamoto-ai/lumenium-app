import { useState, useEffect, useRef } from 'react'
import { useFocusTrap } from '../lib/focusTrap'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  // Only active when menu is open AND we are on mobile (< 768)
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  )
  useFocusTrap(menuRef, menuOpen && isMobile)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Lock body scroll when mobile menu is open + close on Escape
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
      const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKey)
      }
    }
  }, [menuOpen])

  const handleLinkClick = (e, href) => {
    e.preventDefault()
    setMenuOpen(false)
    const target = document.querySelector(href)
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} aria-label="メインナビゲーション">
      <div className="nav-container">
        <a href="#" className="nav-logo" aria-label="Lumenium ホーム">
          <img src="/lumenium-logo.svg?v=2" alt="Lumenium" className="nav-logo-img" width="40" height="40" />
          <span>Lumenium</span>
        </a>
        <div id="primary-nav" ref={menuRef} className={`nav-links ${menuOpen ? 'active' : ''}`}>
          <a href="#pain" onClick={(e) => handleLinkClick(e, '#pain')}>お困りごと</a>
          <a href="#services" onClick={(e) => handleLinkClick(e, '#services')}>サービス</a>
          <a href="#pricing" onClick={(e) => handleLinkClick(e, '#pricing')}>料金</a>
          <a href="#results" onClick={(e) => handleLinkClick(e, '#results')}>実績</a>
          <a href="#flow" onClick={(e) => handleLinkClick(e, '#flow')}>ご依頼の流れ</a>
          <a href="#blog" onClick={(e) => handleLinkClick(e, '#blog')}>ブログ</a>
          <a href="#about" onClick={(e) => handleLinkClick(e, '#about')}>代表紹介</a>
          <div className="nav-dropdown">
            <span
              className="nav-dropdown-trigger"
              onClick={(e) => { e.stopPropagation(); e.currentTarget.parentElement.classList.toggle('nav-dropdown--open') }}
              role="button"
              tabIndex={0}
              aria-haspopup="true"
            >ミニゲーム ▾</span>
            <div className="nav-dropdown-menu" onClick={(e) => e.stopPropagation()}>
              <a href="/game.html">🚀 シューティング</a>
              <a href="/runner.html">🏃 ランナー</a>
              <a href="/racing.html">🏰 ディフェンス</a>
            </div>
          </div>
          <a href="#contact-form" className="nav-cta" onClick={(e) => handleLinkClick(e, '#contact-form')} data-cta="nav-consult">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5l7 5 7-5M3 5v10h14V5M3 5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            無料相談
          </a>
        </div>
        <button
          className="nav-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </nav>
  )
}
