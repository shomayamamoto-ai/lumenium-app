import { useState, useEffect, useRef } from 'react'
import { useFocusTrap } from '../lib/focusTrap'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Member state comes from the JS-readable lum_member flag cookie (UI only —
  // real authority lives in the HttpOnly session cookie checked server-side).
  const [isMember, setIsMember] = useState(false)

  useEffect(() => {
    const check = () => setIsMember(document.cookie.split('; ').includes('lum_member=1'))
    check()
    // Re-check when the tab regains focus (e.g. after logging in on login.html)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  const menuRef = useRef(null)
  // The drawer is now used on every breakpoint (hamburger-only nav), so trap
  // focus whenever it is open regardless of viewport width.
  useFocusTrap(menuRef, menuOpen)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Lock body scroll when menu is open + close on Escape.
  // No padding compensation needed — `scrollbar-gutter: stable` on <html>
  // keeps the scrollbar's space reserved at all times, so toggling overflow
  // never shifts the layout (fixed elements included).
  useEffect(() => {
    if (menuOpen) {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = prevOverflow
        window.removeEventListener('keydown', onKey)
      }
    }
  }, [menuOpen])

  const handleLinkClick = (e, href) => {
    e.preventDefault()
    setMenuOpen(false)
    // Hash-router links ('#/info/...'): navigate; if the hash is already
    // current (same item clicked again), scroll to the section manually.
    if (href.startsWith('#/')) {
      if (window.location.hash === href) {
        const section = href.split('/')[2]
        const el = section && document.getElementById(section)
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 80
          window.scrollTo({ top, behavior: 'smooth' })
        }
      } else {
        window.location.hash = href
      }
      return
    }
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
          <span className="nav-logo-stack">
            <span className="nav-logo-name">Lumenium</span>
            <span className="nav-logo-tag">散文化した目的に焦点を当てる</span>
          </span>
        </a>
        <div id="primary-nav" ref={menuRef} className={`nav-links ${menuOpen ? 'active' : ''}`}>
          <a href="#/info" onClick={(e) => handleLinkClick(e, '#/info')}>サービス案内</a>
          <a href="#/info/pain" onClick={(e) => handleLinkClick(e, '#/info/pain')}>お困りごと</a>
          <a href="#/info/services" onClick={(e) => handleLinkClick(e, '#/info/services')}>サービス</a>
          <a href="#/info/pricing" onClick={(e) => handleLinkClick(e, '#/info/pricing')}>料金</a>
          <a href="#/info/results" onClick={(e) => handleLinkClick(e, '#/info/results')}>実績</a>
          <a href="#/info/flow" onClick={(e) => handleLinkClick(e, '#/info/flow')}>ご依頼の流れ</a>
          <a href="#/info/blog" onClick={(e) => handleLinkClick(e, '#/info/blog')}>ブログ</a>
          <a href="#/info/about" onClick={(e) => handleLinkClick(e, '#/info/about')}>代表紹介</a>
          <div className="nav-dropdown">
            <span
              className="nav-dropdown-trigger"
              onClick={(e) => { e.stopPropagation(); e.currentTarget.parentElement.classList.toggle('nav-dropdown--open') }}
              role="button"
              tabIndex={0}
              aria-haspopup="true"
            >ミニゲーム ▾</span>
            <div className="nav-dropdown-menu" onClick={(e) => e.stopPropagation()}>
              {/* The 3 standard games are free for everyone; only the
                  breaker stays members-only behind the login gate. */}
              <a href="/game.html">🚀 シューティング</a>
              <a href="/runner.html">🏃 ランナー</a>
              <a href="/racing.html">🏰 ディフェンス</a>
              {isMember ? (
                <a href="/members/arena">⭐ 会員限定ブレイカー</a>
              ) : (
                <a href="/login.html?next=arena" className="nav-game-login">⭐ 会員限定ブレイカー 🔒</a>
              )}
            </div>
          </div>
          <a href="#/info/contact-form" className="nav-cta" onClick={(e) => handleLinkClick(e, '#/info/contact-form')} data-cta="nav-consult">
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
