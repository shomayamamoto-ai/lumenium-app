import { useEffect, useState } from 'react'

const typingWords = ['SNS集客', '動画制作', 'AI導入', 'LINE構築', 'Web制作', 'キャスト手配']

function useTypingEffect(words, typingSpeed = 90, deletingSpeed = 50, pauseTime = 2200) {
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
        <div className="hero-particles" />
      </div>
      <div className="hero-content">
        <div className="hero-badge animate-fade-up">
          <span className="badge-dot" />
          動画制作 / DX支援 / クリエイティブ
        </div>
        <h1 className="hero-title animate-fade-up delay-1">
          あなたの「困った」を<br />
          <span className="gradient-text">丸ごと解決する相棒。</span>
        </h1>
        <div className="hero-typing animate-fade-up delay-2">
          <span className="typing-label">今のお悩み</span>
          <span className="typing-arrow">→</span>
          <span className="typing-text">{typingText}</span>
          <span className="typing-cursor" />
        </div>
        <p className="hero-description animate-fade-up delay-2">
          SNS集客、動画制作、AI導入、LINE構築、キャスト手配——<br className="hide-mobile" />
          抽象的な悩みでもOK。企画から運用まで、まるっとお任せください。
        </p>
        <div className="hero-actions animate-fade-up delay-3">
          <a href="mailto:shoma.yamamoto@lumenium.net" className="btn btn-primary btn-glow">
            <span>まずは無料で相談する</span>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#services" className="btn btn-secondary">サービスを見る</a>
        </div>
        <div className="hero-trust animate-fade-up delay-4">
          <div className="trust-item">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>初回相談 無料</span>
          </div>
          <div className="trust-item">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>48時間以内にご提案</span>
          </div>
          <div className="trust-item">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>企画〜納品まで一括対応</span>
          </div>
        </div>
      </div>
      <div className="hero-visual animate-fade-up delay-3">
        <div className="hero-card-stack">
          <div className="floating-card card-1">
            <div className="card-icon" style={{ background: 'rgba(99,102,241,0.12)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" stroke="#818cf8" strokeWidth="2" /><circle cx="12" cy="12" r="10" stroke="#818cf8" strokeWidth="2" /></svg>
            </div>
            <div className="card-info">
              <span className="card-title">動画制作・PR映像</span>
              <span className="card-sub">企画〜編集まで一括</span>
            </div>
          </div>
          <div className="floating-card card-2">
            <div className="card-icon" style={{ background: 'rgba(168,85,247,0.12)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="#c084fc" strokeWidth="2" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
            <div className="card-info">
              <span className="card-title">AI導入・研修</span>
              <span className="card-sub">現場で使えるAI活用</span>
            </div>
          </div>
          <div className="floating-card card-3">
            <div className="card-icon" style={{ background: 'rgba(6,182,212,0.12)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className="card-info">
              <span className="card-title">SNS・LINE構築</span>
              <span className="card-sub">集客導線を設計</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
