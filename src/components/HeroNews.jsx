import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../lib/focusTrap'

// お知らせ on the hero.
//
// The news lived in one section of the info page, which meant knowing it was
// there and going looking — the owner's words were that finding it took too
// long. The three most recent headlines now sit on the first screen, and a
// headline opens the whole item rather than scrolling somewhere else: the
// body is usually two sentences, so a panel says everything the section
// would have.
//
// Same /news.json the section reads, committed from the admin page.

function fmt(date) {
  return String(date || '').replace(/-/g, '.')
}

function Detail({ item, onClose }) {
  const ref = useRef(null)
  useFocusTrap(ref, true)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const external = /^https?:/.test(item.link || '')
  return (
    <div
      className="news-modal-overlay"
      ref={ref}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <div className="news-modal" onClick={(e) => e.stopPropagation()}>
        <button className="news-modal-close" onClick={onClose} aria-label="閉じる" type="button">✕</button>
        <time className="news-modal-date" dateTime={item.date}>{fmt(item.date)}</time>
        <h2 className="news-modal-title">{item.title}</h2>
        {item.body ? <p className="news-modal-body">{item.body}</p> : null}
        <div className="news-modal-foot">
          {item.link ? (
            <a
              className="news-modal-link"
              href={item.link}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
            >
              詳しく見る →
            </a>
          ) : null}
          <a className="news-modal-all" href="#/info/news" onClick={onClose}>すべてのお知らせ</a>
        </div>
      </div>
    </div>
  )
}

export default function HeroNews() {
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('/news.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (alive) setItems(Array.isArray(data) ? data : []) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [])

  // Nothing while loading, and nothing at all when there is no news — an
  // empty 「お知らせ」 heading on the first screen is worse than no heading.
  if (!items || !items.length) return null

  return (
    <div className="hero-news">
      <span className="hero-news-label">お知らせ</span>
      <ul className="hero-news-list">
        {items.slice(0, 3).map((n) => (
          <li key={n.id}>
            <button type="button" className="hero-news-item" onClick={() => setOpen(n)}>
              <time className="hero-news-date" dateTime={n.date}>{fmt(n.date)}</time>
              <span className="hero-news-title">{n.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <a className="hero-news-all" href="#/info/news">一覧 →</a>
      {open ? <Detail item={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}
