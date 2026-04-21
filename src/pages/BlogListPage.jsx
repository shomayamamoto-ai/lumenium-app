import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { getSortedArticles, ALL_CATEGORY } from '../data/articles'

export default function BlogListPage() {
  const [filter, setFilter] = useState(ALL_CATEGORY)

  const sortedArticles = useMemo(() => getSortedArticles(), [])

  const categories = useMemo(() => {
    const set = new Set(sortedArticles.map((a) => a.category))
    return [ALL_CATEGORY, ...Array.from(set)]
  }, [sortedArticles])

  const filteredArticles = useMemo(() => {
    if (filter === ALL_CATEGORY) return sortedArticles
    return sortedArticles.filter((a) => a.category === filter)
  }, [sortedArticles, filter])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = 'Blog — Lumenium | ノウハウ・お役立ち情報'
    // User arrived at an internal page — skip splash on next home navigation
    try { sessionStorage.setItem('lumenium-seen', '1') } catch {}
  }, [])

  return (
    <div className="blog-page page-enter">
      <Navbar />
      <main className="blog-page-main">
        <section className="section section--blog-hero">
          <div className="container">
            <p className="section-label">BLOG</p>
            <h1 className="section-title">ノウハウ・お役立ち情報</h1>
            <p className="section-desc">
              動画制作・AI活用・SNS運用・Web制作など、現場で役立つ情報を発信しています。
            </p>
          </div>
        </section>

        <section className="section section--blog-list">
          <div className="container">
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
                <Link
                  to={`/blog/${a.slug}`}
                  className="blog-card"
                  key={a.id}
                  data-cta="blog-card"
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
        </section>
      </main>
      <Footer />
    </div>
  )
}
