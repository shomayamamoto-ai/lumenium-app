import { useEffect, useRef } from 'react'
import { useFocusTrap } from '../lib/focusTrap'

export default function VideoModal({ src = '/intro.mp4', title = 'Lumenium PR動画', onClose }) {
  const overlayRef = useRef(null)
  const videoRef = useRef(null)
  useFocusTrap(overlayRef, true)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Autoplay once mounted
    const id = setTimeout(() => { videoRef.current?.play().catch(() => {}) }, 80)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
      clearTimeout(id)
    }
  }, [onClose])

  return (
    <div
      className="video-modal-overlay"
      ref={overlayRef}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="video-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="video-modal-close"
          onClick={onClose}
          aria-label="動画を閉じる"
          type="button"
        >
          ✕
        </button>
        <video
          ref={videoRef}
          className="video-modal-player"
          controls
          playsInline
          preload="auto"
          autoPlay
        >
          <source src={src} type="video/mp4" />
          お使いのブラウザは動画再生に対応していません。
        </video>
        <p className="video-modal-note">＊ AI で生成・編集した PR 動画です</p>
      </div>
    </div>
  )
}
