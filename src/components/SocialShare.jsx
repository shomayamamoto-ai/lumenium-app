import { useState } from 'react'

const SITE = {
  url: 'https://lumenium.net',
  title: 'Lumenium | 動画制作・DX支援のプロフェッショナル',
}

const shareTargets = [
  {
    name: 'X',
    ariaLabel: 'Xでシェア',
    href: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
    ),
  },
  {
    name: 'Facebook',
    ariaLabel: 'Facebookでシェア',
    href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21.9v-8.6h2.9l.4-3.4h-3.3V7.7c0-1 .3-1.7 1.7-1.7h1.8V3c-.3 0-1.4-.1-2.7-.1-2.7 0-4.5 1.6-4.5 4.6v2.5H6.9v3.4h2.9v8.6z"/></svg>
    ),
  },
  {
    name: 'LINE',
    ariaLabel: 'LINEでシェア',
    href: (u, t) => `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 5.78 2 10.4c0 4.13 3.59 7.59 8.47 8.24.33.07.78.22.89.5.1.26.07.66.03.92l-.14.87c-.04.26-.2 1.02.89.56C13.24 21 19 17.38 20.9 13.2c.72-1.58.72-2.05.72-2.8C22 5.78 17.52 2 12 2"/></svg>
    ),
  },
]

export default function SocialShare() {
  const [copied, setCopied] = useState(false)

  const onShare = (href) => {
    window.open(href, '_blank', 'noopener,noreferrer,width=600,height=500')
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(SITE.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Fallback — prompt
      window.prompt('このURLをコピーしてください', SITE.url)
    }
  }

  return (
    <div className="social-share" aria-label="ソーシャルシェア">
      <p className="social-share-label">このページをシェア</p>
      <div className="social-share-buttons">
        {shareTargets.map((t) => (
          <button
            key={t.name}
            className={`social-share-btn social-share-btn--${t.name.toLowerCase()}`}
            onClick={() => onShare(t.href(SITE.url, SITE.title))}
            aria-label={t.ariaLabel}
            type="button"
          >
            {t.icon}
          </button>
        ))}
        <button
          className={`social-share-btn social-share-btn--copy ${copied ? 'is-copied' : ''}`}
          onClick={onCopy}
          aria-label="URLをコピー"
          type="button"
        >
          {copied ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          )}
        </button>
      </div>
    </div>
  )
}
