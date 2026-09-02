import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { useEffect, useState } from 'react'

// お知らせ — reads the statically served /news.json (committed from the
// admin page via the GitHub-backed publishing API). Renders nothing while
// loading or when there is no news.
export default function News() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('/news.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (alive) setItems(Array.isArray(data) ? data : []) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [])

  if (!items || items.length === 0) return null

  return (
    <section className="section" id="news">
      <div className="container container--narrow">
        <div className="section-header" data-animate>
          <p className="section-label">{SECTION.news.label}</p>
          <h2 className="section-title">{rich(SECTION.news.title)}</h2>
        </div>
        <ul className="news-list" data-animate data-delay="1">
          {items.slice(0, 8).map((n) => (
            <li key={n.id} className="news-item">
              <time className="news-date" dateTime={n.date}>{(n.date || '').replace(/-/g, '.')}</time>
              <div className="news-body">
                <p className="news-title">
                  {n.link ? (
                    <a href={n.link} target={/^https?:/.test(n.link) ? '_blank' : undefined} rel="noopener noreferrer">
                      {n.title}
                    </a>
                  ) : n.title}
                </p>
                {n.body ? <p className="news-text">{n.body}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
