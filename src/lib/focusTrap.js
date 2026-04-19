// Lightweight focus trap for modals/drawers.
// Usage (React):
//   const ref = useRef(null)
//   useFocusTrap(ref, isOpen)
import { useEffect } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return
    const root = ref.current
    const prevFocus = document.activeElement

    const getFocusable = () =>
      Array.from(root.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('inert') && el.offsetParent !== null
      )

    // Move focus into the container on open
    const focusable = getFocusable()
    if (focusable.length) {
      focusable[0].focus()
    } else {
      root.setAttribute('tabindex', '-1')
      root.focus()
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const els = getFocusable()
      if (els.length === 0) {
        e.preventDefault()
        return
      }
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', onKeyDown)
    return () => {
      root.removeEventListener('keydown', onKeyDown)
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus() } catch {}
      }
    }
  }, [active, ref])
}
