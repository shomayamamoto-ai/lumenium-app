import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { useState, useEffect, useRef, useMemo } from 'react'

import { articles } from '../data/articles'

function ArticleCard({ article, onClick }) {
  return (
    <div className="blog-card" onClick={() => onClick(article)}>
      <span className="blog-card-date">{article.date}</span>
      <span className="tag tag--filled">{article.category}</span>
      <h3 className="blog-card-title">{article.title}</h3>
      <p className="blog-card-summary">{article.summary}</p>
      <span className="blog-card-link">続きを読む</span>
    </div>
  )
}

// Simple slug helper for heading ids
const slug = (s, i) => `h-${i}-${s.replace(/\s+/g, '-').replace(/[^\w\-一-龠ぁ-んァ-ン]/g, '').slice(0, 40)}`

function ArticleView({ article, onBack }) {
  const articleRef = useRef(null)
  const [readProgress, setReadProgress] = useState(0)
  const [activeId, setActiveId] = useState(null)

  // Parse ## headings into TOC entries
  const toc = useMemo(() => {
    const entries = []
    article.content.split('\n').forEach((line, i) => {
      if (line.startsWith('## ')) {
        const text = line.replace('## ', '').trim()
        entries.push({ id: slug(text, i), text })
      }
    })
    return entries
  }, [article])

  // Reading progress + active heading tracking
  useEffect(() => {
    const el = articleRef.current
    if (!el) return

    const onScroll = () => {
      const rect = el.getBoundingClientRect()
      const viewportH = window.innerHeight
      const total = rect.height - viewportH
      const scrolled = Math.max(0, -rect.top)
      const pct = total > 0 ? Math.min(100, (scrolled / total) * 100) : 0
      setReadProgress(pct)

      // Active heading = topmost one still above the fold
      const headings = el.querySelectorAll('h2[id]')
      let current = null
      headings.forEach((h) => {
        if (h.getBoundingClientRect().top < 120) current = h.id
      })
      setActiveId(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [article])

  const onTocClick = (e, id) => {
    e.preventDefault()
    const target = document.getElementById(id)
    if (target) {
      const y = target.getBoundingClientRect().top + window.scrollY - 96
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <>
      <div className="article-read-progress" aria-hidden="true">
        <div className="article-read-progress-bar" style={{ width: `${readProgress}%` }} />
      </div>
      <div className="blog-article-layout">
        <div className="blog-article" ref={articleRef}>
          <button className="blog-back" onClick={onBack} type="button">記事一覧に戻る</button>
          <div className="blog-article-meta">
            <span className="blog-card-date">{article.date}</span>
            <span className="tag tag--filled">{article.category}</span>
          </div>
          <h1 className="blog-article-title">{article.title}</h1>
          <div className="blog-article-body">
            {article.content.split('\n').map((line, i) => {
              if (line.startsWith('## ')) {
                const text = line.replace('## ', '')
                return <h2 key={i} id={slug(text, i)}>{text}</h2>
              }
              if (line.startsWith('##')) return <h3 key={i}>{line.replace('##', '')}</h3>
              if (line.startsWith('- ')) return <li key={i}>{line.replace('- ', '')}</li>
              if (line.trim() === '') return <br key={i} />
              return <p key={i}>{line}</p>
            })}
          </div>
          <div className="blog-article-cta">
            <p>この記事に関するご相談や、サービスについてのお問い合わせはお気軽にどうぞ。</p>
            <a href="#contact-form" className="btn btn-primary" data-cta="article-consult" onClick={onBack}>無料で相談する →</a>
          </div>
        </div>

        {toc.length > 1 && (
          <aside className="blog-toc" aria-label="目次">
            <p className="blog-toc-label">目次</p>
            <ol className="blog-toc-list">
              {toc.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    onClick={(e) => onTocClick(e, t.id)}
                    className={activeId === t.id ? 'is-active' : ''}
                  >
                    {t.text}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </>
  )
}

const ALL_CATEGORY = 'すべて'

export default function Blog() {
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState(ALL_CATEGORY)

  // Sort articles by date descending (newest first)
  const sortedArticles = useMemo(
    () => [...articles].sort((a, b) => b.date.localeCompare(a.date)),
    []
  )

  const categories = useMemo(() => {
    const set = new Set(sortedArticles.map((a) => a.category))
    return [ALL_CATEGORY, ...Array.from(set)]
  }, [sortedArticles])

  const filteredArticles = useMemo(() => {
    if (filter === ALL_CATEGORY) return sortedArticles
    return sortedArticles.filter((a) => a.category === filter)
  }, [sortedArticles, filter])

  return (
    <section className="section" id="blog">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">{SECTION.blog.label}</p>
          <h2 className="section-title">{rich(SECTION.blog.title)}</h2>
          <p className="section-desc">{rich(SECTION.blog.desc)}</p>
        </div>

        {selected ? (
          <ArticleView article={selected} onBack={() => setSelected(null)} />
        ) : (
          <>
            <div className="blog-filters" role="tablist" aria-label="カテゴリで絞り込み">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={filter === c}
                  className={`blog-filter ${filter === c ? 'is-active' : ''}`}
                  onClick={() => setFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="blog-grid">
              {filteredArticles.map((a) => (
                <ArticleCard key={a.id} article={a} onClick={setSelected} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
