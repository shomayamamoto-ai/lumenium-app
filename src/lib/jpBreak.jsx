import { useEffect } from 'react'
import { loadDefaultJapaneseParser } from 'budoux'

// Lazy singleton parser — only instantiated the first time Japanese text
// needs phrase-aware wrapping.
let _parser = null
const getParser = () => (_parser ||= loadDefaultJapaneseParser())

// Tags whose text should NOT be post-processed.
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE', 'CODE', 'TEXTAREA', 'INPUT',
  'BUTTON', 'SELECT', 'OPTION', 'META', 'LINK',
])

const PROCESSED_ATTR = 'data-jp-wrapped'

const isMostlyJapanese = (str) => {
  if (!str || str.length < 4) return false
  const jpChars = (str.match(/[　-ヿ㐀-䶿一-鿿＀-￯]/g) || []).length
  return jpChars / str.length > 0.25
}

/**
 * Walk `root` and replace each text-only leaf element's content with
 * BudouX-segmented <span class="jp-phrase"> nodes so the browser can only
 * break at 文節 boundaries (combined with CSS `word-break: keep-all`).
 *
 * Safe to call multiple times — already-processed elements are skipped.
 */
export function applyJpBreaks(root) {
  if (!root || typeof window === 'undefined') return
  const parser = getParser()

  // Find elements that contain ONLY text (no other element children) and
  // have a meaningful amount of Japanese. Those are the candidates.
  const candidates = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT
      if (node.hasAttribute(PROCESSED_ATTR)) return NodeFilter.FILTER_REJECT
      // Skip if any non-text element child (we only touch pure-text leaves).
      const children = node.childNodes
      if (children.length === 0) return NodeFilter.FILTER_SKIP
      let hasText = false
      for (const c of children) {
        if (c.nodeType === Node.ELEMENT_NODE) return NodeFilter.FILTER_SKIP
        if (c.nodeType === Node.TEXT_NODE && c.nodeValue.trim()) hasText = true
      }
      if (!hasText) return NodeFilter.FILTER_SKIP
      if (!isMostlyJapanese(node.textContent)) return NodeFilter.FILTER_SKIP
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let n
  while ((n = walker.nextNode())) candidates.push(n)

  for (const el of candidates) {
    const text = el.textContent
    const segments = parser.parse(text)
    if (segments.length <= 1) {
      el.setAttribute(PROCESSED_ATTR, '1')
      continue
    }
    // Build new child nodes: one inline-block span per phrase.
    const frag = document.createDocumentFragment()
    for (const seg of segments) {
      const span = document.createElement('span')
      span.className = 'jp-phrase'
      span.textContent = seg
      frag.appendChild(span)
    }
    // Replace contents atomically so layout pass is minimal.
    while (el.firstChild) el.removeChild(el.firstChild)
    el.appendChild(frag)
    el.setAttribute(PROCESSED_ATTR, '1')
  }
}

/**
 * React hook: re-run applyJpBreaks on the document whenever `dependency`
 * changes. Debounced with requestIdleCallback so it never blocks paint.
 */
export function useJpBreaks(dependency) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 200))
    const id = ric(() => applyJpBreaks(document.body))
    return () => {
      const cic = window.cancelIdleCallback || clearTimeout
      cic(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependency])
}

/**
 * Legacy React-controlled variant: wrap a given string into phrase spans.
 * Used inside JSX-authored blocks (e.g., BlogArticlePage) where we fully
 * control the output tree.
 */
export function wrapJp(text, keyPrefix = 'jp') {
  if (!text || typeof text !== 'string') return text
  const parser = getParser()
  const segments = parser.parse(text)
  if (segments.length <= 1) return text
  return segments.map((seg, i) => (
    <span key={`${keyPrefix}-${i}`} className="jp-phrase">{seg}</span>
  ))
}
