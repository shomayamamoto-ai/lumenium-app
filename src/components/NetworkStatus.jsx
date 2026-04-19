import { useEffect, useState } from 'react'

/**
 * Shows a bottom banner when:
 *  - The browser goes offline (informational)
 *  - A new service worker has been installed and is waiting (prompt to refresh)
 */
export default function NetworkStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState(null)

  // Online/offline events
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  // Service worker update detection
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let mounted = true

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || !mounted) return
      if (reg.waiting) {
        setUpdateAvailable(true)
        setWaitingWorker(reg.waiting)
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            if (!mounted) return
            setUpdateAvailable(true)
            setWaitingWorker(newWorker)
          }
        })
      })
    })

    const onControllerChange = () => window.location.reload()
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      mounted = false
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const handleUpdate = () => {
    if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING')
  }

  if (!online) {
    return (
      <div className="net-banner net-banner--offline" role="status" aria-live="polite">
        <span className="net-banner-dot" aria-hidden="true" />
        <span className="net-banner-text">
          オフラインです — 一部の機能が制限される場合があります
        </span>
      </div>
    )
  }

  if (updateAvailable) {
    return (
      <div className="net-banner net-banner--update" role="status" aria-live="polite">
        <span className="net-banner-text">新しいバージョンが利用できます</span>
        <button
          className="net-banner-action"
          onClick={handleUpdate}
          type="button"
          aria-label="ページを再読み込みして最新バージョンを適用"
        >
          更新
        </button>
      </div>
    )
  }

  return null
}
