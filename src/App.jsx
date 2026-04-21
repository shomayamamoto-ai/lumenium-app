import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import PageLoader from './components/PageLoader'
import HomePage from './pages/HomePage'
import { SpeedInsights } from '@vercel/speed-insights/react'

const BlogListPage = lazy(() => import('./pages/BlogListPage'))
const BlogArticlePage = lazy(() => import('./pages/BlogArticlePage'))

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
