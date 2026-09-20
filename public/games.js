/* The way out of a mini-game, and the way to the others.
 *
 * Each game is its own standalone page — three under public/ and three served
 * from an edge function to members only — so until now every one of them was a
 * dead end: whatever way you arrived, the only way on was the browser's back
 * button, and there was no way at all to reach a different game. This is one
 * control, loaded by all of them, that carries both.
 *
 * It is deliberately one button and one sheet rather than a bar: the games
 * have wildly different chrome — a minimap in one corner, a thumb stick in
 * another, a scoreboard along the bottom — and anything laid out along an edge
 * would land on top of one of them. A single corner button can be told which
 * corner is free, and the sheet it opens covers the screen, where nothing can
 * collide with it.
 *
 * Usage, at the end of a game's <body>:
 *   <script src="/games.js" data-game="territory" data-corner="top-right" defer></script>
 *
 *   data-game   which entry to mark as the one you are on (optional)
 *   data-corner where the button sits: top-center (default), top-left,
 *               top-right, bottom-left, bottom-right, bottom-center
 *   data-attach a selector for a control the game already has — its own way
 *               back to the site. Given one, no new button is added: that
 *               control opens the sheet instead, and the sheet's first row is
 *               the way home it used to be. A game keeps the chrome it was
 *               designed with and gains the rest.
 *
 * A game that can pause may expose window.lumenPause = function (on) {...};
 * it is called with true when the sheet opens and false when it closes, so a
 * game does not carry on being played while its player is reading a menu.
 */
(function () {
  var GAMES = [
    { href: '/game.html', mark: '🚀', name: 'シューティング', note: '迫る敵を撃ち落とす', id: 'shooter' },
    { href: '/runner.html', mark: '🏃', name: 'ランナー', note: '走って、跳んで、避ける', id: 'runner' },
    { href: '/racing.html', mark: '🏰', name: 'ディフェンス', note: '拠点を守り抜く', id: 'defense' },
    { href: '/hitblow.html', mark: '🔦', name: 'コード解読', note: 'ヒットアンドブロー', id: 'hitblow' },
    { href: '/members/arena', mark: '⭐', name: 'ブレイカー', note: '会員限定', id: 'arena', member: true },
    { href: '/members/puzzle', mark: '🧩', name: '2048', note: '会員限定', id: 'puzzle', member: true },
    { href: '/members/territory', mark: '🏳️', name: '陣取り', note: '会員限定', id: 'territory', member: true }
  ]

  var me = document.currentScript
  var here = (me && me.getAttribute('data-game')) || ''
  var corner = (me && me.getAttribute('data-corner')) || 'top-center'
  var attach = (me && me.getAttribute('data-attach')) || ''

  var css = [
    '.lgm-btn{position:fixed;z-index:9000;display:flex;align-items:center;gap:6px;',
    'padding:8px 13px;border-radius:999px;border:1px solid rgba(245,247,251,0.24);',
    'background:rgba(10,13,28,0.82);color:#f5f7fb;font:700 12px/1 inherit;letter-spacing:0.06em;',
    'cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
    'font-family:inherit;touch-action:manipulation}',
    '.lgm-btn:hover{border-color:rgba(245,247,251,0.5)}',
    '.lgm-btn:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}',
    '.lgm-tl{top:calc(10px + env(safe-area-inset-top));left:calc(10px + env(safe-area-inset-left))}',
    '.lgm-tr{top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right))}',
    '.lgm-bl{bottom:calc(10px + env(safe-area-inset-bottom));left:calc(10px + env(safe-area-inset-left))}',
    '.lgm-br{bottom:calc(10px + env(safe-area-inset-bottom));right:calc(10px + env(safe-area-inset-right))}',
    // Where the four-game switcher used to sit in most of these games, so the
    // control they already had a place for is in that place.
    '.lgm-tc{top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%)}',
    '.lgm-bc{bottom:calc(10px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%)}',
    '.lgm-wrap{position:fixed;inset:0;z-index:9001;display:none;align-items:center;justify-content:center;padding:18px}',
    '.lgm-wrap.on{display:flex}',
    '.lgm-scrim{position:absolute;inset:0;background:rgba(4,6,14,0.82);border:0;padding:0;width:100%;cursor:default}',
    '.lgm-card{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 36px);overflow-y:auto;',
    '-webkit-overflow-scrolling:touch;border-radius:18px;border:1px solid rgba(245,247,251,0.18);',
    'background:linear-gradient(180deg,#141830,#0b0e1d);padding:16px;',
    'box-shadow:0 26px 60px rgba(0,0,0,0.55);color:#f5f7fb;font-family:inherit}',
    '.lgm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}',
    '.lgm-ttl{font:700 12px/1 inherit;letter-spacing:0.22em;color:rgba(245,247,251,0.72);margin:0}',
    '.lgm-x{width:32px;height:32px;border-radius:50%;border:1px solid rgba(245,247,251,0.22);',
    'background:transparent;color:#f5f7fb;font:600 15px/1 inherit;cursor:pointer;font-family:inherit}',
    '.lgm-x:hover{border-color:rgba(245,247,251,0.5)}',
    '.lgm-home{display:flex;align-items:center;gap:10px;padding:13px 14px;margin-bottom:12px;',
    'border-radius:13px;border:1px solid rgba(165,180,252,0.45);background:rgba(99,102,241,0.18);',
    'color:#e0e7ff;text-decoration:none;font:700 14px/1.3 inherit}',
    '.lgm-home:hover{background:rgba(99,102,241,0.3)}',
    '.lgm-lbl{margin:0 0 8px;font:700 11px/1 inherit;letter-spacing:0.18em;color:rgba(245,247,251,0.55)}',
    '.lgm-list{display:grid;gap:7px}',
    '.lgm-item{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:12px;',
    'border:1px solid rgba(245,247,251,0.14);background:rgba(255,255,255,0.04);',
    'color:#f5f7fb;text-decoration:none}',
    '.lgm-item:hover{border-color:rgba(245,247,251,0.42);background:rgba(255,255,255,0.09)}',
    '.lgm-item[aria-current="page"]{border-color:rgba(103,232,249,0.6);background:rgba(103,232,249,0.12)}',
    '.lgm-mk{font-size:19px;line-height:1}',
    '.lgm-nm{font:700 14px/1.3 inherit}',
    '.lgm-nt{display:block;font:500 11.5px/1.4 inherit;color:rgba(245,247,251,0.62);letter-spacing:0.01em}',
    '.lgm-now{margin-left:auto;font:700 10.5px/1 inherit;letter-spacing:0.14em;color:#67e8f9}',
    '@media (max-width:420px){.lgm-btn{padding:7px 11px;font-size:11.5px}}'
  ].join('')

  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  var cls = {
    'top-left': 'lgm-tl', 'top-right': 'lgm-tr', 'top-center': 'lgm-tc',
    'bottom-left': 'lgm-bl', 'bottom-right': 'lgm-br', 'bottom-center': 'lgm-bc'
  }[corner] || 'lgm-tc'

  var btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'lgm-btn ' + cls
  btn.setAttribute('aria-haspopup', 'dialog')
  btn.innerHTML = '<span aria-hidden="true">☰</span> メニュー'

  var wrap = document.createElement('div')
  wrap.className = 'lgm-wrap'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'true')
  wrap.setAttribute('aria-label', 'メニュー')

  var rows = GAMES.map(function (g) {
    var on = g.id === here
    // A members game is linked directly even when signed out: its endpoint
    // redirects to the login with the game named in the address, so the sign-in
    // lands you in the game you asked for rather than back at the beginning.
    return '<a class="lgm-item" href="' + g.href + '"' + (on ? ' aria-current="page"' : '') + '>' +
      '<span class="lgm-mk" aria-hidden="true">' + g.mark + '</span>' +
      '<span><span class="lgm-nm">' + g.name + '</span>' +
      '<span class="lgm-nt">' + g.note + '</span></span>' +
      (on ? '<span class="lgm-now">プレイ中</span>' : '') +
      '</a>'
  }).join('')

  wrap.innerHTML =
    '<button type="button" class="lgm-scrim" tabindex="-1" aria-hidden="true"></button>' +
    '<div class="lgm-card">' +
      '<div class="lgm-head"><p class="lgm-ttl">LUMENIUM</p>' +
      '<button type="button" class="lgm-x" aria-label="閉じる">✕</button></div>' +
      '<a class="lgm-home" href="/"><span aria-hidden="true">←</span> ルメニウムのホームへ</a>' +
      '<p class="lgm-lbl">ほかのゲーム</p>' +
      '<div class="lgm-list">' + rows + '</div>' +
    '</div>'

  function pause(on) {
    try { if (typeof window.lumenPause === 'function') window.lumenPause(on) } catch (e) {}
  }

  var last = null
  function open() {
    last = document.activeElement
    wrap.classList.add('on')
    pause(true)
    var first = wrap.querySelector('.lgm-home')
    if (first) first.focus()
  }
  function close() {
    wrap.classList.remove('on')
    pause(false)
    if (last && last.focus) last.focus()
  }

  btn.addEventListener('click', open)
  wrap.querySelector('.lgm-scrim').addEventListener('click', close)
  wrap.querySelector('.lgm-x').addEventListener('click', close)
  // Captured, so a game that handles Escape itself does not swallow it first.
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !wrap.classList.contains('on')) return
    e.stopPropagation()
    e.preventDefault()
    close()
  }, true)
  // Keys and pointers that reach the sheet are for the sheet, not for whatever
  // is still running behind it.
  ;['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart'].forEach(function (t) {
    wrap.addEventListener(t, function (e) { e.stopPropagation() })
  })

  function mount() {
    var own = attach ? document.querySelector(attach) : null
    if (own) {
      // The game already has somewhere for this to live — use it, and add no
      // chrome of our own to a screen that is already full of it.
      own.addEventListener('click', function (e) { e.preventDefault(); open() })
      own.setAttribute('aria-haspopup', 'dialog')
    } else {
      document.body.appendChild(btn)
    }
    document.body.appendChild(wrap)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
