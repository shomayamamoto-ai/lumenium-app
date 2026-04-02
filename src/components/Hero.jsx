import { useEffect, useRef, useState } from 'react'

const typingWords = ['SNS集客', '動画制作', 'AI導入', 'LINE構築', 'Web制作', 'イベント企画']

function useTypingEffect(words, typingSpeed = 100, deletingSpeed = 60, pauseTime = 2000) {
  const [text, setText] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentWord = words[wordIndex]
    let timeout

    if (!isDeleting && text === currentWord) {
      timeout = setTimeout(() => setIsDeleting(true), pauseTime)
    } else if (isDeleting && text === '') {
      setIsDeleting(false)
      setWordIndex((prev) => (prev + 1) % words.length)
    } else {
      timeout = setTimeout(() => {
        setText(currentWord.substring(0, text.length + (isDeleting ? -1 : 1)))
      }, isDeleting ? deletingSpeed : typingSpeed)
    }

    return () => clearTimeout(timeout)
  }, [text, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, pauseTime])

  return text
}

export default function Hero() {
  const typingText = useTypingEffect(typingWords)

  return (
    <section className="hero">
      <div className="hero-bg">
        <div className="hero-grid" />
        <div className="hero-glow hero-glow-1" />
        <div className="hero-glow hero-glow-2" />
        <div className="hero-glow hero-glow-3" />
      </div>
      <div className="hero-content">
        <div className="hero-badge animate-fade-up">
          <span className="badge-dot" />
          動画制作・DX支援のプロフェッショナル
        </div>
        <h1 className="hero-title animate-fade-up delay-1">
          「困った」を丸ごと<br />
          <span className="gradient-text">任せられる相棒。</span>
        </h1>
        <div className="hero-typing animate-fade-up delay-2">
          <span className="typing-label">今のお悩み →</span>
          <span className="typing-text">{typingText}</span>
          <span className="typing-cursor">|</span>
        </div>
        <p className="hero-description animate-fade-up delay-2">
          SNS集客、動画制作、AI導入、LINE構築——<br className="hide-mobile" />
          抽象的な悩みでも大丈夫。企画から運用まで、まるっとお任せください。
        </p>
        <div className="hero-actions animate-fade-up delay-3">
          <a href="mailto:shoma.yamamoto@lumenium.net" className="btn btn-primary btn-glow">
            まずは無料で相談する
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#services" className="btn btn-secondary">できることを見る</a>
        </div>
        <div className="hero-stats animate-fade-up delay-4">
          {[
            { color: '#6366f1', label: '150名+', sub: 'キャスト在籍', icon: <path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" /> },
            { color: '#a855f7', label: '数十万人', sub: 'CH動画制作実績', icon: <path d="M3 17l4-4 3 3 7-8" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> },
            { color: '#06b6d4', label: '48時間', sub: '初回提案', icon: <><path d="M10 18a8 8 0 100-16 8 8 0 000 16z" stroke="#06b6d4" strokeWidth="2" /><path d="M10 6v4l3 3" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" /></> },
          ].map((stat, i) => (
            <div key={i} className="stat-wrapper">
              {i > 0 && <div className="stat-divider" />}
              <div className="stat">
                <div className="stat-icon-row">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">{stat.icon}</svg>
                </div>
                <span className="stat-highlight">{stat.label}</span>
                <span className="stat-label">{stat.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hero-visual animate-fade-up delay-3">
        <div className="hero-card-stack">
          <div className="floating-card card-1">
            <div className="card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" stroke="#6366f1" strokeWidth="2" /><circle cx="12" cy="12" r="10" stroke="#6366f1" strokeWidth="2" /></svg>
            </div>
            <span>動画制作・PR映像</span>
            <div className="card-bar"><div className="card-bar-fill" style={{ width: '92%' }} /></div>
          </div>
          <div className="floating-card card-2">
            <div className="card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="#a855f7" strokeWidth="2" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
            <span>AI導入・研修</span>
            <div className="card-bar"><div className="card-bar-fill purple" style={{ width: '87%' }} /></div>
          </div>
          <div className="floating-card card-3">
            <div className="card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <span>SNS運用・LINE構築</span>
            <div className="card-bar"><div className="card-bar-fill cyan" style={{ width: '80%' }} /></div>
          </div>
        </div>
      </div>
    </section>
  )
}
