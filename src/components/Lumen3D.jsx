import { useEffect, useRef } from 'react'

// 3Dの結晶を置く部品。描画そのものは src/lib/lumen3d.js にあります。
//
// 最初の表示を遅くしないために、描画の部品は画面が落ち着いてから読み込み
// ます（requestIdleCallback）。検索順位は最初の表示の速さで決まる部分が
// あり、飾りのためにそこを削る理由はありません。
//
// focusRef を渡すと、その要素の位置と大きさにぴったり重ねて結晶を置き
// ます（トップではロゴ画像の位置）。重ねた結晶の最初の1枚が描けた時点で
// onReady を呼ぶので、呼んだ側はそこで平面のロゴを消せます。3Dが使えない
// 端末では onReady は呼ばれず、平面のロゴがそのまま残ります。
// place を渡すと、要素ではなく画面の大きさから位置を決めます
// （例: 右の端に寄せる）。(幅, 高さ) => ({ x, y, r })
export default function Lumen3D({ mode = 'subtle', focusRef, focusScale = 0.5, place, className, onReady, scrollDriven = false, fadeBelow = false }) {
  const ref = useRef(null)
  // 親が描き直すたびに新しい関数が渡ってきても、3Dを作り直さないように
  // 参照で持ちます（作り直すと、そのたびに一瞬消えて最初から回り直します）。
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let api = null
    let cancelled = false

    const focus = place
      ? () => { const c = canvas.getBoundingClientRect(); return place(c.width, c.height) }
      : focusRef
      ? () => {
          const el = focusRef.current
          if (!el) return null
          const e = el.getBoundingClientRect()
          const c = canvas.getBoundingClientRect()
          return { x: e.left + e.width / 2 - c.left, y: e.top + e.height / 2 - c.top, r: e.width * focusScale }
        }
      : null

    const onScroll = () => {
      if (!api) return
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      api.setScroll(window.scrollY / max)
    }

    const start = async () => {
      if (cancelled) return
      const m = await import('../lib/lumen3d.js')
      if (cancelled) return
      api = m.mountLumen3D(canvas, {
        mode,
        focus,
        fadeBelow,
        onFirstFrame: () => {
          canvas.classList.add('is-on')
          readyRef.current && readyRef.current()
        },
      })
      if (api && scrollDriven) {
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
      }
    }

    const ric = window.requestIdleCallback || ((f) => setTimeout(f, 300))
    const id = ric(start, { timeout: 2500 })

    return () => {
      cancelled = true
      if (window.cancelIdleCallback && typeof id === 'number') { try { window.cancelIdleCallback(id) } catch (_) {} }
      window.removeEventListener('scroll', onScroll)
      if (api) api.destroy()
    }
  }, [mode, focusRef, focusScale, place, scrollDriven, fadeBelow])

  return <canvas ref={ref} className={'lumen3d ' + (className || '')} aria-hidden="true" />
}
