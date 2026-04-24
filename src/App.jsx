import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import PageLoader from './components/PageLoader'
import HomePage from './pages/HomePage'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { applyJpBreaks } from './lib/jpBreak'

const BlogListPage = lazy(() => import('./pages/BlogListPage'))
const BlogArticlePage = lazy(() => import('./pages/BlogArticlePage'))

function JpBreaksManager() {
  const location = useLocation()
  useEffect(() => {
    // Apply BudouX to every content element whenever the URL changes.
    // Debounced so it happens after React paints the new page.
    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 300))
    const id = ric(() => applyJpBreaks(document.body), { timeout: 1000 })
    // Also observe for future DOM mutations (content that mounts later,
    // e.g., after splash/video completes) and re-process.
    const observer = new MutationObserver(() => {
      const id2 = ric(() => applyJpBreaks(document.body), { timeout: 1000 })
      // no-op: best-effort, each idle-callback is self-cancelling
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      const cic = window.cancelIdleCallback || clearTimeout
      cic(id)
    }
  }, [location.pathname])
  return null
}

function NavigationLoader() {
  const location = useLocation()
  const firstRenderRef = useRef(true)
  const [visible, setVisible] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // Skip initial mount — the homepage splash/intro video handles the first entry.
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    setVisible(true)
    setFadeOut(false)
    const fadeTimer = setTimeout(() => setFadeOut(true), 550)
    const hideTimer = setTimeout(() => setVisible(false), 900)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [location.pathname])

  if (!visible) return null
  return <PageLoader fadeOut={fadeOut} />
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <NavigationLoader />
        <JpBreaksManager />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/blog" element={<BlogListPage />} />
            <Route path="/blog/:slug" element={<BlogArticlePage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <SpeedInsights />
    </ErrorBoundary>
  )
}
