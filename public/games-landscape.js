/**
 * スマホでは横向きで遊ぶゲームにするための、共通の小さな仕組み。
 *
 *   <script src="/games-landscape.js" defer></script>
 *
 * ・スマホ（指で操作する小さい画面）だけが対象。パソコンやタブレットは何もしません。
 * ・縦向きのあいだは「横向きにしてください」の画面で覆い、遊んでいる途中なら一時停止
 *   （window.lumenPause があれば使う）。横向きに戻すと、ここで止めたときだけ再開します。
 * ・<html> に is-phone と is-landscape / is-portrait を付けるので、各ゲームは
 *   横向き用の並びを CSS で書けます。向きが変わると lum:orient を投げます。
 * ・最初のタップで、できる端末（Android など）は全画面＋横向き固定にします。
 *   iPhone の Safari は固定できないので、案内の画面だけが頼りです。
 */
(function () {
  'use strict'
  var root = document.documentElement
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches
  var small = Math.min(screen.width || 0, screen.height || 0) < 600
  if (!coarse || !small) return
  root.classList.add('is-phone')

  var css = document.createElement('style')
  css.textContent =
    '.lgl-gate{position:fixed;inset:0;z-index:9500;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:28px;text-align:center;' +
      'background:radial-gradient(ellipse at 50% 40%,#0d1338 0,#020212 70%);color:#f8fafc;font-family:inherit;touch-action:none}' +
    'html.is-portrait .lgl-gate{display:flex}' +
    '.lgl-phone{width:62px;height:104px;border:3px solid #22d3ee;border-radius:14px;position:relative;box-shadow:0 0 24px rgba(34,211,238,.45);animation:lglTurn 2.4s cubic-bezier(.2,0,0,1) infinite}' +
    '.lgl-phone::after{content:"";position:absolute;left:50%;bottom:7px;width:16px;height:3px;margin-left:-8px;border-radius:2px;background:#22d3ee}' +
    '@keyframes lglTurn{0%,20%{transform:rotate(0)}55%,100%{transform:rotate(-90deg)}}' +
    '.lgl-t{font-size:20px;font-weight:800;letter-spacing:.04em}' +
    '.lgl-s{font-size:13px;line-height:1.8;color:rgba(248,250,252,.7);max-width:300px}' +
    '.lgl-x{margin-top:6px;padding:10px 18px;font-size:12px;letter-spacing:.2em;color:rgba(248,250,252,.7);border:1px solid rgba(248,250,252,.25);text-decoration:none;font-family:inherit}' +
    '@media (prefers-reduced-motion: reduce){.lgl-phone{animation:none;transform:rotate(-90deg)}}'
  document.head.appendChild(css)

  var gate = document.createElement('div')
  gate.className = 'lgl-gate'
  gate.setAttribute('role', 'dialog')
  gate.setAttribute('aria-label', 'スマホを横向きにしてください')
  gate.innerHTML = '<div class="lgl-phone" aria-hidden="true"></div>' +
    '<p class="lgl-t">スマホを横向きにしてください</p>' +
    '<p class="lgl-s">このゲームは横向きで遊びます。画面の向きのロックがオンなら、オフにしてから横にしてください。</p>' +
    '<a class="lgl-x" href="/">← トップに戻る</a>'

  var heldByUs = false
  function apply() {
    var portrait = window.innerHeight > window.innerWidth
    var was = root.classList.contains('is-portrait')
    root.classList.toggle('is-portrait', portrait)
    root.classList.toggle('is-landscape', !portrait)
    if (portrait && !heldByUs && typeof window.lumenPause === 'function') {
      try { window.lumenPause(true); heldByUs = true } catch (e) {}
    } else if (!portrait && heldByUs) {
      heldByUs = false
      try { window.lumenPause(false) } catch (e) {}
    }
    if (was !== portrait) {
      try { window.dispatchEvent(new CustomEvent('lum:orient', { detail: { portrait: portrait } })) } catch (e) {}
    }
  }

  // できる端末では、最初のタップで全画面＋横向き固定（ブラウザのバーが消えて広くなる）
  var tried = false
  function lockOnce() {
    if (tried) return
    tried = true
    try {
      var p = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : null
      var lock = function () {
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}) } catch (e) {}
      }
      if (p && p.then) p.then(lock, function () {}); else lock()
    } catch (e) {}
  }
  document.addEventListener('pointerup', lockOnce, { capture: true, passive: true })

  function boot() {
    document.body.appendChild(gate)
    apply()
    // ゲーム側は先に一度、向きが分からないまま大きさを決めているので、知らせ直す
    try { window.dispatchEvent(new CustomEvent('lum:orient', { detail: { portrait: window.innerHeight > window.innerWidth } })) } catch (e) {}
  }
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', function () { setTimeout(apply, 120) })
  root.classList.add(window.innerHeight > window.innerWidth ? 'is-portrait' : 'is-landscape')
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot)
  window.lumenOrient = { apply: apply }
})()
