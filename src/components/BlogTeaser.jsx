import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getSortedArticles } from '../data/articles'

export default function BlogTeaser() {
  const latest = useMemo(() => getSortedArticles().slice(0, 3), [])

  return (
    <section className="section" id="blog">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">BLOG</p>
          <h2 className="section-title">ノウハウ・お役立ち情報</h2>
          <p className="section-desc">動画制作・AI活用・SNS運用・Web制作など、現場で役立つ情報を発信しています。</p>
        </div>

        <div className="blog-grid">
          {latest.map((a) => (
            <Link
              to={`/blog/${a.slug}`}
              className="blog-card"
              key={a.id}
              data-cta="blog-teaser-card"
            >
              <span className="blog-card-date">{a.date}</span>
              <span className="tag tag--filled">{a.category}</span>
              <h3 className="blog-card-title">{a.title}</h3>
              <p className="blog-card-summary">{a.summary}</p>
              <span className="blog-card-link">続きを読む</span>
            </Link>
          ))}
        </div>

        <div className="blog-teaser-cta">
          <Link to="/blog" className="btn btn-primary" data-cta="blog-view-all">
            記事一覧を見る →
          </Link>
        </div>
      </div>
    </section>
  )
}
