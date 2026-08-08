import { useState, useRef, useEffect } from 'react'
import { events } from '../lib/analytics'

// Google-style minimal home: a big logo and one search box.
// Known topics route straight to the info page section; anything else is
// handed to the AI chat widget via the `lumenium:ask` custom event.

// Service-specific keywords open that service's detail panel directly
// (checked before the generic topic routes below).
const SERVICE_MAP = [
  { re: /SNS|LINE|ライン|インスタ|Instagram|運用代行|Bot|ボット|集客/i, id: 'sns' },
  { re: /動画|映像|採用動画|PR動画|ムービー|YouTube|ユーチューブ|編集|撮影/i, id: 'video' },
  { re: /AI|研修|ChatGPT|生成AI|講師|教材|DX/i, id: 'ai' },
  { re: /Web|HP|ホームページ|LP|ランディング|サイト制作|アプリ/i, id: 'web' },
  { re: /キャスト|モデル|MC|司会|イベント|アイドル|配信者/i, id: 'cast' },
  { re: /ロゴ|バナー|ポスター|イラスト|デザイン|作詞|作曲|ライター/i, id: 'creative' },
]

const TOPIC_ROUTES = [
  { re: /料金|価格|費用|いくら|見積/i, hash: '#/info/pricing' },
  { re: /実績|事例|ポートフォリオ/i, hash: '#/info/results' },
  { re: /声|評判|レビュー|口コミ/i, hash: '#/info/testimonials' },
  { re: /流れ|依頼|進め方|納期/i, hash: '#/info/flow' },
  { re: /質問|FAQ|よくある/i, hash: '#/info/faq' },
  { re: /会社|概要|運営|代表/i, hash: '#/info/company' },
  { re: /問い合わせ|相談|連絡|コンタクト/i, hash: '#/info/contact-form' },
  { re: /ブログ|記事|コラム/i, hash: '#/info/blog' },
  { re: /サービス|動画|映像|AI|SNS|LINE|Web|HP|LP|アプリ|ロゴ|キャスト|制作|研修/i, hash: '#/info/services' },
]

const CHIPS = [
  { label: 'サービス', hash: '#/info/services' },
  { label: '料金', hash: '#/info/pricing' },
  { label: '実績', hash: '#/info/results' },
  { label: 'お客様の声', hash: '#/info/testimonials' },
  { label: 'よくある質問', hash: '#/info/faq' },
  { label: 'お問い合わせ', hash: '#/info/contact-form' },
]

function askAI(query) {
  window.dispatchEvent(new CustomEvent('lumenium:ask', { detail: query }))
}

export default function SearchHome() {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const onSearch = (e) => {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    events.ctaClick('home-search', query.slice(0, 60))
    // 1) Service match → jump to services AND open that service's detail panel
    const service = SERVICE_MAP.find((s) => s.re.test(query))
    if (service) {
      sessionStorage.setItem('lum_open_service', service.id)
      window.location.hash = '#/info/services'
      return
    }
    // 2) Generic topic → jump to the matching section
    const topic = TOPIC_ROUTES.find((t) => t.re.test(query))
    if (topic) {
      window.location.hash = topic.hash
      return
    }
    // 3) Anything else → ask the AI
    askAI(query)
  }

  const onAsk = () => {
    const query = q.trim()
    events.ctaClick('home-ask-ai', query.slice(0, 60) || '(empty)')
    askAI(query || 'Lumeniumについて教えて')
  }

  return (
    <main className="search-home" id="top">
      <div className="search-home-inner">
        <div className="search-home-brand">
          <img src="/favicon.svg" alt="" width="72" height="72" className="search-home-mark" />
          <h1 className="search-home-logo">Lumenium</h1>
          <p className="search-home-tag">散文化した目的に焦点を当てる</p>
        </div>

        <form className="search-home-form" onSubmit={onSearch} role="search">
          <div className="search-home-box">
            <svg className="search-home-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 14L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="何をお探しですか？ 例：採用動画・AI研修・LP制作…"
              aria-label="サイト内検索・AIへの質問"
              maxLength={200}
              enterKeyHint="search"
            />
          </div>
          <div className="search-home-actions">
            <button type="submit" className="search-home-btn">検索</button>
            <button type="button" className="search-home-btn" onClick={onAsk}>AIに相談する</button>
          </div>
        </form>

        <div className="search-home-chips" aria-label="よく見られるページ">
          {CHIPS.map((c) => (
            <a key={c.label} href={c.hash} className="search-home-chip">{c.label}</a>
          ))}
        </div>
      </div>

      <footer className="search-home-footer">
        <a href="#/info">サービス案内</a>
        <a href="#/info/company">会社概要</a>
        <a href="#/info/contact-form">お問い合わせ</a>
        <a href="/specified-commerce.html">特定商取引法に基づく表記</a>
      </footer>
    </main>
  )
}
