import { useEffect, useState } from 'react'
import Wordmark from './Wordmark'

/**
 * ヘッダー。
 *
 * 以前のメニューは、6つのサービス・14の案内ページ・ミニゲームまで約35の
 * リンクが並ぶ引き出しでした。初めての人が迷わないよう、ページ内の4か所と
 * 会社概要、それに相談ボタンだけにしています。ほかのページはフッターから。
 */
const LINKS = [
  { label: 'できること', href: '#services' },
  { label: '実績', href: '#works' },
  { label: 'ご依頼の流れ', href: '#flow' },
  { label: 'よくある質問', href: '#faq' },
  { label: '会社概要', href: '/about.html' },
]

export default function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className={`hd ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="hd-inner">
        <a href="#top" className="hd-logo" aria-label="Lumenium（ルメニウム）トップへ" onClick={() => setOpen(false)}>
          <img src="/lumenium-logo.svg?v=3" alt="" width="32" height="32" />
          <Wordmark className="wm--ink hd-wm" />
        </a>
        <nav className="hd-nav" aria-label="メインナビゲーション">
          {LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <a href="#contact" className="lp-btn lp-btn--primary hd-cta" data-cta="header-consult">無料で相談する</a>
        <button
          type="button"
          className="hd-menu"
          aria-expanded={open}
          aria-controls="hd-drawer"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '閉じる' : 'メニュー'}
        </button>
      </div>
      {open && (
        <nav id="hd-drawer" className="hd-drawer" aria-label="メニュー">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <a href="/pricing.html" onClick={() => setOpen(false)}>料金の詳細</a>
          <a href="/voice.html" onClick={() => setOpen(false)}>お客様の声</a>
          <a href="/blog/index.html" onClick={() => setOpen(false)}>ブログ</a>
        </nav>
      )}
    </header>
  )
}
