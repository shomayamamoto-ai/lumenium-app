import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { getMetaBySlug, getArticlesMetaSorted } from '../data/articles-meta'
import { getContentBySlug } from '../data/articles-content'

const slugHeading = (s, i) =>
  `h-${i}-${s.replace(/\s+/g, '-').replace(/[^\w\-一-龠ぁ-んァ-ン]/g, '').slice(0, 40)}`

// Convert **bold** markdown to <strong> nodes; pass other text through.
function renderInline(text) {
  if (!text.includes('**')) return text
  const parts = []
  const re = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let m
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
    parts.push(<strong key={`b-${i++}`}>{m[1]}</strong>)
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// Parse article content into semantic blocks. Consecutive `- ` lines become
// a single <ul>; paragraphs are <p>; empty lines are paragraph separators
// (no stray <br> tags that double up vertical spacing).
function renderArticleBody(content) {
  const lines = content.split('\n')
  const blocks = []
  let listBuffer = null

  const flushList = () => {
    if (listBuffer) {
      blocks.push(listBuffer)
      listBuffer = null
    }
  }

  lines.forEach((raw, i) => {
    const line = raw
    if (line.startsWith('## ')) {
      flushList()
      const text = line.replace('## ', '')
      blocks.push(<h2 key={`h2-${i}`} id={slugHeading(text, i)}>{renderInline(text)}</h2>)
      return
    }
    if (line.startsWith('##')) {
      flushList()
      blocks.push(<h3 key={`h3-${i}`}>{renderInline(line.replace('##', ''))}</h3>)
      return
    }
    if (line.startsWith('- ')) {
      const item = <li key={`li-${i}`}>{renderInline(line.replace('- ', ''))}</li>
      if (!listBuffer) {
        listBuffer = <ul key={`ul-${i}`}>{[item]}</ul>
      } else {
        const items = [...listBuffer.props.children, item]
        listBuffer = <ul key={listBuffer.key}>{items}</ul>
      }
      return
    }
    if (line.trim() === '') {
      flushList()
      return // paragraph margin handles spacing; no <br>
    }
    flushList()
    blocks.push(<p key={`p-${i}`}>{renderInline(line)}</p>)
  })
  flushList()
  return blocks
}

export default function BlogArticlePage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const article = useMemo(() => {
    const meta = getMetaBySlug(slug)
    if (!meta) return null
    const content = getContentBySlug(slug)
    return { ...meta, content: content || '' }
  }, [slug])

  const articleRef = useRef(null)
  const [readProgress, setReadProgress] = useState(0)
  const [activeId, setActiveId] = useState(null)

  const toc = useMemo(() => {
    if (!article) return []
    const entries = []
    article.content.split('\n').forEach((line, i) => {
      if (line.startsWith('## ')) {
        const text = line.replace('## ', '').trim()
        entries.push({ id: slugHeading(text, i), text })
      }
    })
    return entries
  }, [article])

  const related = useMemo(() => {
    if (!article) return []
    return getArticlesMetaSorted()
      .filter((a) => a.id !== article.id && a.category === article.category)
      .slice(0, 3)
  }, [article])

  useEffect(() => {
    if (!article) return
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = `${article.title} — Lumenium Blog`
    try { sessionStorage.setItem('lumenium-seen', '1') } catch {}
  }, [article])

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

  if (!article) {
    return (
      <div className="blog-page page-enter">
        <Navbar />
        <main className="blog-page-main">
          <section className="section">
            <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p className="section-label">NOT FOUND</p>
              <h1 className="section-title">記事が見つかりませんでした</h1>
              <p className="section-desc">URL が正しいかご確認ください。</p>
              <div style={{ marginTop: '2rem' }}>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/blog')}>
                  記事一覧に戻る
                </button>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="blog-page page-enter">
      <Navbar />
      <div className="article-read-progress" aria-hidden="true">
        <div className="article-read-progress-bar" style={{ width: `${readProgress}%` }} />
      </div>
      <main className="blog-page-main">
        <section className="section section--article">
          <div className="container">
            <div className="blog-article-layout">
              <article className="blog-article" ref={articleRef}>
                <Link to="/blog" className="blog-back" type="button">← 記事一覧に戻る</Link>
                <div className="blog-article-meta">
                  <span className="blog-card-date">{article.date}</span>
                  <span className="tag tag--filled">{article.category}</span>
                </div>
                <h1 className="blog-article-title">{article.title}</h1>
                <div className="blog-article-body">
                  {renderArticleBody(article.content)}
                </div>
                <div className="blog-article-cta">
                  <p>この記事に関するご相談や、サービスについてのお問い合わせはお気軽にどうぞ。</p>
                  <Link to="/#contact-form" className="btn btn-primary" data-cta="article-consult">
                    無料で相談する →
                  </Link>
                </div>

                {related.length > 0 && (
                  <div className="blog-related">
                    <h2 className="blog-related-title">関連する記事</h2>
                    <div className="blog-grid">
                      {related.map((a) => (
                        <Link
                          to={`/blog/${a.slug}`}
                          className="blog-card"
                          key={a.id}
                          data-cta="blog-related"
                        >
                          <span className="blog-card-date">{a.date}</span>
                          <span className="tag tag--filled">{a.category}</span>
                          <h3 className="blog-card-title">{a.title}</h3>
                          <p className="blog-card-summary">{a.summary}</p>
                          <span className="blog-card-link">続きを読む</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </article>

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
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
