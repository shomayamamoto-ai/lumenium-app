import { useEffect, useRef } from 'react'
import { mountLumen3D, INTRO_LENGTH, reducedMotion } from '../lib/lumen3d.js'
import { SECTION } from '../data/text'

/**
 * オープニング（3D）。
 *
 * 画面いっぱいに散らばった光が渦を巻いて中心へ集まり、結晶（ロゴの星）が
 * 形になった瞬間に、ロゴと同じ8方向の光を放ちます。そこへ名前と
 * キャッチコピーが焦点を結ぶように現れ、最後は結晶と名前がトップの
 * ロゴの位置まで移って、そのままトップの画面に溶け込みます。
 *
 * 切り替えが見えないように:
 *   ・結晶の回転はトップの結晶と同じ時計で動いているので、重ねた時点で
 *     向きがぴったり揃います（演出の回転は、落ち着く前に消えます）。
 *   ・onHandoff でトップを後ろに描かせ、その結晶が表示されてから、この
 *     幕を消します。平面のロゴが一瞬見えることはありません。
 *
 * 3Dが始められなかったときは onFail を呼びます（呼んだ側が平面の
 * オープニングに切り替えます）。
 */

// 時間割（秒）。数字はすべてこの画面が最初に描かれてからの時刻です。
const FULL = {
  name: [2.6, 0.8], // 名前が焦点を結ぶ
  tag: [3.05, 0.8], // キャッチコピー
  handoff: INTRO_LENGTH + 0.5, // トップを後ろに描かせる
  move: 0.8, // トップのロゴの位置へ移る
  bg: 0.6, // 背景を消す
  out: 0.45, // 残った結晶と名前を消す
}
const GENTLE = { name: [0.25, 0.6], tag: [0.5, 0.6], handoff: 1.8, move: 0, bg: 0.6, out: 0.6 }

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const lerp = (a, b, k) => a + (b - a) * k
const SHADOW = 'drop-shadow(0 2px 10px rgba(4, 7, 20, 0.9)) drop-shadow(0 0 26px rgba(4, 7, 20, 0.65))'

export default function Intro3D({ onHandoff, onDone, onFail }) {
  const rootRef = useRef(null)
  const bgRef = useRef(null)
  const canvasRef = useRef(null)
  const nameRef = useRef(null)
  const tagRef = useRef(null)
  const cb = useRef({ onHandoff, onDone, onFail })
  cb.current = { onHandoff, onDone, onFail }

  useEffect(() => {
    const gentle = reducedMotion()
    const S = gentle ? GENTLE : FULL
    const root = rootRef.current, bg = bgRef.current, canvas = canvasRef.current
    const nameEl = nameRef.current, tagEl = tagRef.current

    // 結晶の置き場所（この幕の中の CSS px）。描画側は毎コマこれを読みます。
    const focus = { x: 0, y: 0, r: 0 }
    // トップでのロゴの大きさの見込み（.search-home-mark の幅 × 0.42）。
    // 幕の中では少し大きく、画面の真ん中に置きます。
    const layout = () => {
      const vw = window.innerWidth, vh = window.innerHeight
      const r1 = Math.max(196, Math.min(0.38 * vw, 340)) * 0.42
      const k = vw < 700 ? 1.15 : 1.25
      return { x: vw / 2, y: vh * 0.45, r: r1 * k, k }
    }
    let home = layout()
    Object.assign(focus, home)

    let start = 0, jump = 0, handed = false, done = false, raf = 0, skipped = false
    let target = null, moveFrom = null, moveAt = 0, onAt = 0, fadeAt = 0

    const api = mountLumen3D(canvas, {
      mode: 'hero',
      intro: true,
      fadeBelow: true,
      focus: () => focus,
      onFirstFrame: () => { start = performance.now() },
    })
    if (!api) { cb.current.onFail && cb.current.onFail(); return }

    const finish = () => {
      if (done) return
      done = true
      if (!handed) { handed = true; cb.current.onHandoff && cb.current.onHandoff() }
      cb.current.onDone && cb.current.onDone()
    }
    const skip = () => {
      if (!start || handed) return
      api.skip()
      skipped = true
      const tl = (performance.now() - start) / 1000 + jump
      if (tl < S.handoff) jump += S.handoff - tl
    }

    // トップの、結晶と名前がある場所
    const measure = () => {
      const mark = document.querySelector('.search-home-mark')
      const logo = document.querySelector('.search-home-logo')
      if (!mark || !logo) return null
      const m = mark.getBoundingClientRect(), l = logo.getBoundingClientRect()
      if (!m.width || !l.width) return null
      return { x: m.left + m.width / 2, y: m.top + m.height / 2, r: m.width * 0.42, nx: l.left + l.width / 2, ny: l.top + l.height / 2 }
    }

    const place = (x, y, s, nx, ny) => {
      focus.x = x; focus.y = y; focus.r = s
      nameEl.style.transform = `translate(${nx}px, ${ny}px) translate(-50%, -50%) scale(${s / (home.r / home.k)})`
    }

    const step = () => {
      raf = requestAnimationFrame(step)
      if (!start) return
      const now = performance.now()
      const tl = (now - start) / 1000 + jump

      // 名前: ぼやけた光から、字が焦点を結ぶ
      const n = ease(clamp01((tl - S.name[0]) / S.name[1]))
      nameEl.style.opacity = n
      nameEl.style.filter = gentle || n >= 1 ? SHADOW : `blur(${(1 - n) * 14}px) ${SHADOW}`
      nameEl.style.letterSpacing = gentle ? '' : `${lerp(0.32, -0.03, n)}em`
      const g = ease(clamp01((tl - S.tag[0]) / S.tag[1]))
      const tagOut = handed ? 1 - clamp01((now - onAt) / 350) : 1
      tagEl.style.opacity = g * tagOut
      tagEl.style.filter = gentle || g >= 1 ? '' : `blur(${(1 - g) * 10}px)`

      if (!handed && tl >= S.handoff) {
        handed = true
        onAt = now
        cb.current.onHandoff && cb.current.onHandoff()
      }

      if (!handed) {
        place(home.x, home.y, home.r, home.x, home.y + 5 * home.k)
        tagEl.style.top = `${home.y + home.r * 0.98}px`
        return
      }

      // トップの結晶とロゴの位置へ移る（動きを減らす設定では移らずに消える）
      if (!target) {
        target = measure()
        if (target) { moveFrom = { ...focus, ny: home.y + 5 * home.k }; moveAt = now }
        // トップが見つからないまま1.5秒たったら、その場で消す
        else if (now - onAt > 1500) { target = { ...focus, nx: focus.x, ny: home.y + 5 * home.k }; moveFrom = { ...target }; moveAt = now }
        else return
      }
      const live = measure() || target
      // 飛ばしたときは、移る時間も短く
      const k = S.move ? ease(clamp01((now - moveAt) / ((skipped ? 0.45 : S.move) * 1000))) : 0
      if (S.move) {
        place(lerp(moveFrom.x, live.x, k), lerp(moveFrom.y, live.y, k), lerp(moveFrom.r, live.r, k),
          lerp(moveFrom.x, live.nx, k), lerp(moveFrom.ny, live.ny, k))
      }
      if (k < 1 && S.move) return

      // 背景を消して、後ろのトップを見せる。トップの結晶が表示されきって
      // から、残っていたこちらの結晶と名前を消します。
      if (!fadeAt) { fadeAt = now; root.classList.add('is-leaving') }
      const b = clamp01((now - fadeAt) / (S.bg * 1000))
      bg.style.opacity = 1 - b
      const homeOn = document.querySelector('.search-home-3d.is-on')
      const outAt = gentle ? fadeAt : fadeAt + S.bg * 1000
      const o = homeOn || now - onAt > 3000 ? clamp01((now - Math.max(outAt, onAt + (skipped ? 1000 : 1300))) / (S.out * 1000)) : 0
      const keep = gentle ? 1 - b : 1 - o
      canvas.style.opacity = keep
      nameEl.style.opacity = n * keep
      if (b >= 1 && keep <= 0) finish()
    }
    raf = requestAnimationFrame(step)

    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip() }
    const onResize = () => { home = layout() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    root.addEventListener('click', skip)
    // 最初の1枚が描けない（端末が重い・隠れたタブ）ときと、万一の止まりの保険
    const noFrame = setTimeout(() => { if (!start) finish() }, 2500)
    const failsafe = setTimeout(finish, 11000)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(noFrame); clearTimeout(failsafe)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      root.removeEventListener('click', skip)
      api.destroy()
    }
  }, [])

  return (
    <div className="ix" ref={rootRef} role="presentation">
      <div className="ix-bg" ref={bgRef} />
      <canvas className="ix-canvas" ref={canvasRef} aria-hidden="true" />
      <span className="ix-name" ref={nameRef} aria-hidden="true">Lumenium</span>
      <p className="ix-tag" ref={tagRef} aria-hidden="true">{SECTION.home.tagline}</p>
      <button
        type="button"
        className="lx-skip ix-skip"
        onClick={(e) => { e.stopPropagation(); rootRef.current && rootRef.current.click() }}
        aria-label="オープニングをスキップ"
      >
        SKIP
      </button>
    </div>
  )
}
