import { useEffect, useRef } from 'react'
import { mountLumen3D, reducedMotion } from '../lib/lumen3d.js'
import { mountIntroScene, SCENE, LOCK_D } from '../lib/intro-scene.js'
import { SECTION } from '../data/text'

/**
 * オープニング「焦点」。
 *
 * 社名は光（lumen）、キャッチコピーは「散文化した目的に、焦点を当てる」。
 * それをカメラのレンズの動きでそのまま見せます。
 *
 *   0.0〜  ピントの合っていない八角形の光（ボケ）と、お客様が抱えがちな
 *          言葉（集客・採用・ブランド…）が、奥行きの中にぼやけて漂う。
 *          下には「散文化した目的に、」が、字がばらけた状態で浮かぶ。
 *   1.0〜  レンズがピントを探す。奥へ行き過ぎて戻り、合う。ピントが
 *          通り過ぎる瞬間だけ、その距離の言葉と光がくっきりする。
 *   2.3〜  ピントが合った光が、線を引いて中心の一点へ流れ込む。
 *          ばらけていた字も揃う。
 *   2.8〜  八枚羽根の絞りが回りながら閉じ、ロゴの八角形の枠になる。
 *   3.35   その奥で結晶が光り、横に長いレンズの光の筋が走る。
 *   3.55〜 「Lumenium」が1字ずつ、色ずれ（色収差）を残しながら焦点を結ぶ。
 *   〜5.0  結晶と名前がトップのロゴの位置へ移り、そのままトップになる。
 *
 * 前半（ボケと絞り）は intro-scene.js、結晶は lumen3d.js が描きます。
 * 結晶の回転はトップの結晶と同じ時計で動くので、重ねた時点で向きが
 * 揃い、切り替えは見えません。onHandoff でトップを後ろに描かせ、その
 * 結晶が表示されてから幕を消すので、平面のロゴも一瞬も見えません。
 *
 * 3Dが始められなかったときは onFail（呼んだ側が平面のオープニングへ）。
 */

// 時間割（秒）。すべてこの画面が最初に描かれてからの時刻です。
const DELAY = SCENE.flash - 2.3 // 結晶側の時間割（2.3秒で光る）をずらす量
const S = {
  words: [0.25, 0.9], // 漂う言葉
  caption: [0.35, 0.9, 2.2, 0.7, 2.95], // 現れる, かかる, 揃い始め, かかる, 消え始め
  name: [3.55, 0.065, 0.75], // 1字目の開始, 1字ごとの遅れ, 1字にかかる時間
  tag: [4.25, 0.8],
  handoff: 5.0,
  move: 0.9, // 結晶と名前がトップのロゴの位置へ移る
  reveal: 1.1, // トップの画面が、ぼけた状態からピントが合って現れる（移る途中から）
  out: 0.5, // 残った結晶と名前を消す
}

/* ピントの合っていない「散文化した目的」。u, v は画面上の位置（-1〜1）、
   d は奥行き。手前の大きな言葉ほど強くぼける。 */
const WORDS = [
  ['集客', -0.62, 0.52, 9], ['採用', 0.66, -0.46, 6], ['ブランド', 0.5, 0.58, 14],
  ['映像', -0.7, -0.5, 12], ['SNS', 0.2, 0.78, 5], ['伝わらない', -0.28, -0.74, 4.2],
  ['世界観', 0.78, 0.1, 18], ['AI', -0.84, 0.05, 7], ['売上', 0.36, -0.8, 16],
  ['何から始める？', -0.35, 0.3, 22], ['Web', 0.06, -0.38, 24], ['発信', -0.1, 0.62, 11],
]

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = (x) => 1 - Math.pow(1 - x, 3)
const lerp = (a, b, k) => a + (b - a) * k
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const SHADOW = 'drop-shadow(0 2px 10px rgba(4, 7, 20, 0.9)) drop-shadow(0 0 26px rgba(4, 7, 20, 0.65))'
const NAME = 'Lumenium'
const CAPTION = '散文化した目的に、'

/* フィルムの粒子。小さな雑音の絵を1枚作って、敷き詰めて揺らします。 */
function grainURL() {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const x = c.getContext('2d')
    const img = x.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    x.putImageData(img, 0, 0)
    return c.toDataURL('image/png')
  } catch (_) {
    return ''
  }
}

export default function Intro3D({ onHandoff, onDone, onFail }) {
  const rootRef = useRef(null)
  const bgRef = useRef(null)
  const sceneRef = useRef(null)
  const canvasRef = useRef(null)
  const wordsRef = useRef(null)
  const capRef = useRef(null)
  const nameRef = useRef(null)
  const tagRef = useRef(null)
  const grainRef = useRef(null)
  const cb = useRef({ onHandoff, onDone, onFail })
  cb.current = { onHandoff, onDone, onFail }

  useEffect(() => {
    /* 「視差効果を減らす」設定の端末でも、この演出は見せます（以前は結晶が
       静かに現れるだけにしていて、見どころがすべて抜けていました）。
       その代わり、酔いやすい動き ―― カメラが前へ進む動き、中心へ伸びる
       光の筋、絞りと結晶の回転、字の拡大 ―― はなくします。 */
    const calm = reducedMotion()
    const root = rootRef.current, bg = bgRef.current, canvas = canvasRef.current
    const nameEl = nameRef.current, tagEl = tagRef.current, capEl = capRef.current
    const letters = [...nameEl.querySelectorAll('.ix-ch')]
    const capChars = [...capEl.querySelectorAll('span')]
    const small = Math.min(window.innerWidth, window.innerHeight) < 700
    const words = [...wordsRef.current.children].map((el, i) => ({ el, w: WORDS[i], on: !small || i < 8 }))
    words.forEach((w) => { if (!w.on) w.el.style.display = 'none' })
    // ばらけた字の、それぞれのずれ
    const scatter = capChars.map(() => ({ x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 38, b: 4 + Math.random() * 8 }))

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
    let target = null, moveFrom = null, moveAt = 0, onAt = 0, revealAt = 0, whole = false
    const main = () => document.getElementById('main')

    const api = mountLumen3D(canvas, {
      mode: 'hero',
      intro: true,
      introDelay: DELAY,
      introCalm: calm,
      introGather: false,
      introIris: true,
      fadeBelow: true,
      focus: () => focus,
      onFirstFrame: () => { start = performance.now() },
    })
    if (!api) { cb.current.onFail && cb.current.onFail(); return }
    // 前半の場面。描けなくても、結晶のオープニングだけで続けます。
    let scene = null
    try { scene = mountIntroScene(sceneRef.current, { calm }) } catch (_) { scene = null }
    root.dataset.scene = scene ? 'on' : 'off'
    const dropScene = () => {
      if (!scene) return
      scene.destroy()
      scene = null
      sceneRef.current.style.display = 'none'
      wordsRef.current.style.display = 'none'
      capEl.style.display = 'none'
    }
    if (!scene) {
      sceneRef.current.style.display = 'none'
      wordsRef.current.style.display = 'none'
      capEl.style.display = 'none'
    }

    if (grainRef.current) {
      const u = grainURL()
      if (u) grainRef.current.style.backgroundImage = `url(${u})`
    }

    // 1字ずつに、単語全体の色の流れ（グラデーション）の該当部分を割り当てる
    nameEl.classList.add('is-split')
    nameEl.style.opacity = '1' // 見え方は1字ずつ（.ix-ch）で決める
    const wW = nameEl.offsetWidth
    letters.forEach((el) => {
      el.style.backgroundSize = `${wW}px 100%`
      el.style.backgroundPosition = `${-el.offsetLeft}px 0`
    })

    // トップの画面にかけた「ピントぼけ」を外す
    const clearMain = () => {
      const m = main()
      if (m) { m.style.filter = ''; m.style.transform = ''; m.style.transformOrigin = '' }
    }

    const finish = () => {
      if (done) return
      done = true
      clearMain()
      if (!handed) { handed = true; cb.current.onHandoff && cb.current.onHandoff() }
      cb.current.onDone && cb.current.onDone()
    }
    const skip = () => {
      if (!start || handed) return
      api.skip()
      skipped = true
      dropScene()
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

    // 前半: ボケ・漂う言葉・ばらけた字
    const drawScene = (tl) => {
      if (!scene) return
      if (tl > SCENE.end) { dropScene(); return }
      // 描画に失敗したら、この場面だけ外して結晶のオープニングで続ける
      try { scene.draw(tl, focus) } catch (_) { dropScene(); return }
      const cam = scene.camera(tl, focus)
      const vw = window.innerWidth, vh = window.innerHeight
      const tanH = Math.tan(0.4)
      const fin = easeOut(clamp01((tl - S.words[0]) / S.words[1]))
      words.forEach(({ el, w, on }, i) => {
        if (!on) return
        const [, u, v, d0] = w
        // ピントが合うと、言葉も中心へ吸い込まれる
        const k = ease(clamp01((tl - (SCENE.pour[0] + (i % 5) * 0.06)) / 0.6))
        const d = Math.max(0.8, lerp(d0 - cam.dolly, LOCK_D, k))
        const x = lerp(u * d0 * tanH * (vw / vh) * 0.82, 0, k)
        const y = lerp(v * d0 * tanH * 0.82, 0, k)
        const p = cam.at(x, y, d)
        const coc = cam.coc(d)
        const sc = (0.42 * cam.fpx) / d / 40
        const sharp = 1 - smooth(1.5, 16, coc)
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${sc})`
        el.style.filter = `blur(${Math.min(26, coc * 0.26 / Math.max(0.3, sc)).toFixed(1)}px)`
        el.style.opacity = (fin * (0.2 + 0.72 * sharp) * (1 - k)).toFixed(3)
      })
      // 「散文化した目的に、」: ばらけて浮かび、ピントが合うと揃って、消える
      const cin = easeOut(clamp01((tl - S.caption[0]) / S.caption[1]))
      const al = ease(clamp01((tl - S.caption[2]) / S.caption[3]))
      const cout = 1 - clamp01((tl - S.caption[4]) / 0.35)
      capEl.style.opacity = (cin * cout).toFixed(3)
      capChars.forEach((el, i) => {
        const s = scatter[i]
        const drift = Math.sin(tl * 0.9 + i) * 4
        el.style.transform = `translate(${(s.x * (1 - al)).toFixed(1)}px, ${((s.y + drift) * (1 - al)).toFixed(1)}px)`
        el.style.filter = al >= 1 ? '' : `blur(${(s.b * (1 - al)).toFixed(1)}px)`
        el.style.opacity = (0.45 + 0.55 * al).toFixed(3)
      })
    }

    // 名前: 1字ずつ、色がずれた光から焦点を結ぶ
    const drawName = (tl) => {
      if (whole) return
      let all = true
      letters.forEach((el, i) => {
        const p = ease(clamp01((tl - (S.name[0] + i * S.name[1])) / S.name[2]))
        if (p < 1) all = false
        const q = 1 - p
        el.style.opacity = p.toFixed(3)
        el.style.filter = q > 0.001 ? `blur(${(q * 16).toFixed(1)}px)` : ''
        el.style.transform = q > 0.001 && !calm ? `scale(${(1 + 0.4 * q).toFixed(3)})` : ''
        el.style.textShadow = q > 0.001
          ? `${(-q * 10).toFixed(1)}px 0 rgba(255, 70, 150, ${(0.75 * q).toFixed(2)}), ${(q * 10).toFixed(1)}px 0 rgba(60, 220, 255, ${(0.75 * q).toFixed(2)})`
          : ''
      })
      if (all) {
        // 揃ったら、トップの名前と同じ1枚の文字に戻す
        whole = true
        nameEl.classList.remove('is-split')
        letters.forEach((el) => el.removeAttribute('style'))
      }
    }

    const step = () => {
      raf = requestAnimationFrame(step)
      if (!start) return
      const now = performance.now()
      const tl = (now - start) / 1000 + jump

      drawScene(tl)
      drawName(tl)
      nameEl.style.filter = SHADOW
      const g = ease(clamp01((tl - S.tag[0]) / S.tag[1]))
      const tagOut = handed ? 1 - clamp01((now - onAt) / 350) : 1
      tagEl.style.opacity = g * tagOut
      tagEl.style.filter = g >= 1 ? '' : `blur(${(1 - g) * 10}px)`
      tagEl.style.letterSpacing = `${lerp(0.4, 0.1, easeOut(g))}em`

      if (!handed && tl >= S.handoff) {
        handed = true
        onAt = now
        dropScene()
        cb.current.onHandoff && cb.current.onHandoff()
      }

      if (!handed) {
        place(home.x, home.y, home.r, home.x, home.y + 5 * home.k)
        tagEl.style.top = `${home.y + home.r * 0.98}px`
        capEl.style.top = `${home.y + home.r * 1.9}px`
        return
      }

      /* ここから、トップへの切り替え。
         1. 結晶と名前が、トップのロゴの位置へ滑るように移る。
         2. その途中から、幕が薄れ、後ろのトップの画面がぼけた状態から
            ピントが合って現れる（ロゴを中心に、わずかに引いた位置から）。
            オープニングと同じ「焦点を当てる」動きで、画面が入れ替わった
            ようには見せません。
         3. トップの結晶が表示されきってから、重ねていたこちらの結晶と
            名前を消す（同じ位置・同じ向きなので、見た目は変わりません）。 */
      if (!target) {
        target = measure()
        if (target) { moveFrom = { ...focus, ny: home.y + 5 * home.k }; moveAt = now }
        // トップが見つからないまま1.5秒たったら、その場で消す
        else if (now - onAt > 1500) { target = { ...focus, nx: focus.x, ny: home.y + 5 * home.k }; moveFrom = { ...target }; moveAt = now }
        else return
      }
      const live = measure() || target
      const moveDur = (skipped ? 0.5 : S.move) * 1000
      const k = ease(clamp01((now - moveAt) / moveDur))
      place(lerp(moveFrom.x, live.x, k), lerp(moveFrom.y, live.y, k), lerp(moveFrom.r, live.r, k),
        lerp(moveFrom.x, live.nx, k), lerp(moveFrom.ny, live.ny, k))

      if (!revealAt && now - moveAt > moveDur * 0.35) {
        revealAt = now
        root.classList.add('is-leaving')
        const m = main()
        if (m) {
          // ロゴの中心を軸に寄せる。ロゴ自体の位置はずれません
          const r = m.getBoundingClientRect()
          m.style.transformOrigin = `${live.x - r.left}px ${live.y - r.top}px`
        }
      }
      if (!revealAt) return
      const rv = clamp01((now - revealAt) / ((skipped ? 0.7 : S.reveal) * 1000))
      const e = easeOut(rv)
      bg.style.opacity = (1 - e).toFixed(3)
      const m = main()
      if (m) {
        if (rv < 1) {
          m.style.filter = `blur(${(14 * (1 - e)).toFixed(2)}px)`
          m.style.transform = calm ? '' : `scale(${(1 + 0.04 * (1 - e)).toFixed(4)})`
        } else clearMain()
      }
      const homeOn = document.querySelector('.search-home-3d.is-on')
      const ready = (homeOn || now - onAt > 3000) && rv >= 1 && k >= 1
      const o = ready ? clamp01((now - Math.max(revealAt + (skipped ? 700 : S.reveal * 1000), onAt + (skipped ? 1000 : 1300))) / (S.out * 1000)) : 0
      canvas.style.opacity = 1 - o
      nameEl.style.opacity = 1 - o
      if (o >= 1) finish()
    }
    raf = requestAnimationFrame(step)

    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip() }
    const onResize = () => { home = layout(); if (scene) scene.resize() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    root.addEventListener('click', skip)
    // 最初の1枚が描けない（端末が重い・隠れたタブ）ときと、万一の止まりの保険
    const noFrame = setTimeout(() => { if (!start) finish() }, 2500)
    const failsafe = setTimeout(finish, 12000)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(noFrame); clearTimeout(failsafe)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      root.removeEventListener('click', skip)
      clearMain()
      dropScene()
      api.destroy()
    }
  }, [])

  return (
    <div className="ix" ref={rootRef} role="presentation">
      <div className="ix-bg" ref={bgRef}>
        <div className="ix-vignette" />
        <div className="ix-grain" ref={grainRef} />
      </div>
      <canvas className="ix-scene" ref={sceneRef} aria-hidden="true" />
      <div className="ix-words" ref={wordsRef} aria-hidden="true">
        {WORDS.map(([w]) => <span key={w} className="ix-word">{w}</span>)}
      </div>
      <canvas className="ix-canvas" ref={canvasRef} aria-hidden="true" />
      <p className="ix-caption" ref={capRef} aria-hidden="true">
        {[...CAPTION].map((c, i) => <span key={i}>{c}</span>)}
      </p>
      <span className="ix-name" ref={nameRef} aria-hidden="true">
        {[...NAME].map((c, i) => <span key={i} className="ix-ch">{c}</span>)}
      </span>
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
