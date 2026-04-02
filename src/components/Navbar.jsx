import { useState, useEffect } from 'react'
import Logo from './Logo'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-container">
        <a href="#" className="nav-logo">
          <Logo size={32} />
          <span>Lumenium</span>
        </a>
        <div className={`nav-links ${menuOpen ? 'active' : ''}`}>
          <a href="#pain" onClick={(e) => handleLinkClick(e, '#pain')}>お困りごと</a>
          <a href="#services" onClick={(e) => handleLinkClick(e, '#services')}>サービス</a>
          <a href="#results" onClick={(e) => handleLinkClick(e, '#results')}>実績</a>
          <a href="#flow" onClick={(e) => handleLinkClick(e, '#flow')}>ご依頼の流れ</a>
          <a href="#contact" className="nav-cta" onClick={(e) => handleLinkClick(e, '#contact')}>無料相談</a>
        </div>
        <button className="nav-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="メニュー">
          <span style={menuOpen ? { transform: 'rotate(45deg) translate(5px, 5px)' } : {}} />
          <span style={menuOpen ? { opacity: 0 } : {}} />
          <span style={menuOpen ? { transform: 'rotate(-45deg) translate(5px, -5px)' } : {}} />
        </button>
      </div>
    </nav>
  )
}
