import { useState, useEffect, useRef } from 'react'
import { useFocusTrap } from '../lib/focusTrap'

// The drawer is grouped by heading rather than one flat list, so every
// section of the site — and each of the six service areas — has its own
// entry instead of hiding behind a single "サービス" link.
const NAV_GROUPS = [
  {
    label: '事業内容',
    items: [
      { label: '動画制作・映像編集', service: 'video' },
      { label: 'AI導入・生成AI研修', service: 'ai' },
      { label: 'SNS運用・LINE構築', service: 'sns' },
      { label: 'Web制作・アプリ開発', service: 'web' },
      { label: 'キャスト手配・イベント', service: 'cast' },
      { label: 'クリエイティブ制作', service: 'creative' },
      { label: 'サービス一覧', href: '#/info/services' },
    ],
  },
  {
    label: 'ご検討の方へ',
    items: [
      { label: 'お困りごと', href: '#/info/pain' },
      { label: '料金・お見積り', href: '#/info/pricing' },
      { label: '実績・制作事例', href: '#/info/results' },
      { label: 'お客様の声', href: '#/info/testimonials' },
      { label: 'ご依頼の流れ', href: '#/info/flow' },
      { label: 'よくある質問', href: '#/info/faq' },
    ],
  },
  {
    label: 'Lumeniumについて',
    items: [
      { label: 'Lumeniumとは', href: '#/info/story' },
      { label: 'ポジショニング', href: '#/info/positioning' },
      { label: '代表紹介', href: '#/info/about' },
      { label: '会社概要', href: '#/info/company' },
    ],
  },
  {
    label: '読みもの',
    items: [
      { label: 'ブログ', href: '#/info/blog' },
      { label: 'お知らせ', href: '#/info/news' },
      { label: 'サービス案内トップ', href: '#/info' },
    ],
  },
]

// Standalone pages, each on its own real URL (the in-app '#/…' sections share
// one URL as far as a search engine is concerned, so these are what actually
// get indexed). Plain links — they leave the app on purpose.
const NAV_PAGES = [
  { label: 'ルメニウムとは', href: '/about.html' },
  { label: '料金・費用の目安', href: '/pricing.html' },
  { label: '実績・制作事例', href: '/works.html' },
  { label: 'よくある質問', href: '/faq.html' },
  { label: 'サイトマップ（全ページ一覧）', href: '/sitemap.html' },
]

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

  // Opening a service from the menu behaves exactly like searching for it:
  // land on the services page with that service's detail panel already open.
  const handleServiceClick = (e, id) => {
    e.preventDefault()
    setMenuOpen(false)
    try { sessionStorage.setItem('lum_open_service', id) } catch (_) {}
    if (window.location.hash === '#/info/services') {
      window.dispatchEvent(new CustomEvent('lumenium:open-service', { detail: id }))
    } else {
      window.location.hash = '#/info/services'
    }
  }

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
        <a href="#" className="nav-logo" aria-label="Lumenium（ルメニウム）ホーム">
          <img src="/lumenium-logo.svg?v=2" alt="Lumenium（ルメニウム）" className="nav-logo-img" width="40" height="40" />
          <span className="nav-logo-stack">
            <span className="nav-logo-name">Lumenium</span>
            <span className="nav-logo-tag">散文化した目的に焦点を当てる</span>
          </span>
        </a>
        <div
          className={`nav-backdrop ${menuOpen ? 'show' : ''}`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
        <div id="primary-nav" ref={menuRef} className={`nav-links ${menuOpen ? 'active' : ''}`}>
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) =>
                item.service ? (
                  <a
                    key={item.label}
                    href="#/info/services"
                    onClick={(e) => handleServiceClick(e, item.service)}
                  >{item.label}</a>
                ) : (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={(e) => handleLinkClick(e, item.href)}
                  >{item.label}</a>
                )
              )}
            </div>
          ))}

          <div className="nav-group">
            <p className="nav-group-label">詳しいページ</p>
            {NAV_PAGES.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </div>

          <div className="nav-group">
            <p className="nav-group-label">ミニゲーム</p>
            {/* The 3 standard games are free for everyone; the two members
                games stay behind the login gate. */}
            <a href="/game.html">🚀 シューティング</a>
            <a href="/runner.html">🏃 ランナー</a>
            <a href="/racing.html">🏰 ディフェンス</a>
            <a href="/hitblow.html">🔦 コード解読（ヒットアンドブロー）</a>
            {isMember ? (
              <>
                <a href="/members/arena">⭐ 会員限定ブレイカー</a>
                <a href="/members/puzzle">🧩 会員限定2048</a>
              </>
            ) : (
              <>
                <a href="/login.html?next=arena" className="nav-game-login">⭐ 会員限定ブレイカー 🔒</a>
                <a href="/login.html?next=puzzle" className="nav-game-login">🧩 会員限定2048 🔒</a>
              </>
            )}
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
