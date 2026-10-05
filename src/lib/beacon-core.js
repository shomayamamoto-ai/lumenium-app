// 訪問の数え方の本体。トップページ（React のアプリ）も、about.html や
// services/*.html のような静的ページも、この1つのファイルを使います。
//
// 以前はアプリ用（src/lib/pageview.js）と静的ページ用（scripts/_beacon.mjs）が
// 別々に書かれていて、片方だけ直すと、同じ訪問がページによって違う数え方を
// されました。いちばん困るのは「訪問」の区切りで、アプリと静的ページで別々に
// 区切ると、1人の訪問がページを移るたびに「直接来た新しい訪問」に化けます。
// なので、区切り方と送る中身はここにしか書きません。静的ページへは
// scripts/_beacon.mjs がこのファイルをそのまま埋め込みます。
//
// ES5 のまま書いてあります。静的ページには変換を通さずに埋め込むので、
// 新しい構文を使うと、古いブラウザではそのページの計測が丸ごと止まり、
// しかも誰も気づけません。
//
// 数えるもの
//   ・ページが開かれたこと（訪問の最初の1回だけ「どこから来たか」を添える）
//   ・半分まで来た / 終わりまで来た
//   ・電話・LINE・メール・外部リンクを押した
//   ・そのページを見ていた時間（画面が表に出ていて、操作できる状態だった時間）
//   ・そのページを最後にサイトを離れた
//
// 端末に置くもの
//   ・sessionStorage に「いまの訪問」の控え（いつ始まったか、どこから来たか、
//     何ページ目か）。タブを閉じれば消え、ほかのサイトからは読めません。
//     cookie は使わず、サーバーへ識別子として送ることもしません——送るのは
//     「この訪問の何ページ目か」と「どこから来たか」だけです。
//   ・管理者が自分の端末を数から外したときの印（localStorage、管理者の端末だけ）。
//
// 訪問の区切り: 30分なにも起きなければ、次に開いたときは新しい訪問です。
// よそのサイトや計測用リンクから入り直したときも、新しい訪問として数えます。

export function lumBeacon(cfg) {
  cfg = cfg || {}
  var W = window, D = document, L = location
  var NOOP = { event: function () {}, view: function () {}, settle: function () {}, exp: function () {} }
  // 広告ブロッカーに目を付けられにくい、意味の無い名前にしてあります
  // （/api/track は古いページのためにまだ受け付けています）。
  var EP = '/api/p'
  var KEY = 'lum_s'
  var IDLE = 30 * 60 * 1000
  var CAP = 30 * 60 * 1000
  // 「操作した」と言えるもの。これが1つでもあれば直帰ではありません。
  // ページを開くだけで自動で起きるもの（サービスを見た、問い合わせ欄が
  // 画面に入った）は入れません——入れると、開いて何もせず帰った人が
  // 直帰に数えられなくなります。
  var ENGAGING = { click_tel: 1, click_line: 1, click_mail: 1, click_out: 1, contact_start: 1, contact_submit: 1, booking_confirm: 1 }

  /* 「数から外す」は送るたびに見ます。開いた時に一度だけ見る作りだと、
     管理画面で外した直後に、既に開いているページが送り続けます。 */
  function off() { try { return localStorage.getItem('lum_notrack') === '1' } catch (e) { return false } }
  if (off()) return NOOP
  // 自動で動いているブラウザ。ここで止めるのは、自分で「自動です」と
  // 名乗っているものだけです。アプリ内ブラウザ（Pinterest・Instagram など）は
  // 人が見ているので数えます。
  var ua = navigator.userAgent || ''
  if (navigator.webdriver || /headless|crawler|spider|slurp|lighthouse|pagespeed|phantomjs|[a-z]bot\/|\bbot\b|compatible;[^)]*bot/i.test(ua)) return NOOP

  function now() { return new Date().getTime() }
  function bare(h) { return String(h || '').toLowerCase().replace(/^www\./, '') }
  var self = bare(L.hostname)

  // sessionStorage が使えない環境（一部のプライベートモード）では、この
  // ページの中だけで覚えます。その場合はページを移るたびに新しい訪問に
  // なりますが、紹介元が自分のサイトなので「流入元」は増えません。
  var mem = null
  function read() {
    try {
      var x = JSON.parse(sessionStorage.getItem(KEY) || 'null')
      if (x && typeof x.n === 'number') return x
    } catch (e) {}
    return mem
  }
  function write(x) { mem = x; try { sessionStorage.setItem(KEY, JSON.stringify(x)) } catch (e) {} }
  function fresh() {
    return { id: Math.random().toString(36).slice(2, 10) + now().toString(36), start: now(), last: now(),
      src: '', med: '', cmp: '', ref: '', landing: '', n: 0, pv: 0, g: 0, t: 0 }
  }
  /** いまの訪問。30分止まっていたら、新しい訪問として始め直します。 */
  function cur() {
    var x = read()
    if (!x || now() - x.last > IDLE) { x = fresh(); write(x) }
    return x
  }
  function touch(x) { x.last = now(); write(x) }

  function post(b) {
    if (off()) return
    // 文章の実験（src/lib/experiments.js）。この訪問で見た案の印（"実験名:A"
    // など）を添えます。印は訪問の控えに置くので、トップで案を見たあと
    // 静的ページで問い合わせても、同じ案の成果として数えられます。
    var xs = read()
    if (xs && xs.xt && !b.x) b.x = xs.xt
    try {
      // keepalive: ページを離れる瞬間に送るものも、離れたあとまで届くように。
      fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), keepalive: true, credentials: 'omit' })
        .catch(function () {})
    } catch (e) { /* 数えることで、ページを壊してはいけません */ }
  }

  /* 訪問の入口。ここで一度だけ「どこから来たか」を決めます。
     計測用リンク（?ref=instagram など）の印はアドレスから消します——その
     URLがコピーされて広まっても、別の経路の人が同じ名前で数えられない
     ように。紹介元は、ホスト名までしか持ちません。 */
  function arrive() {
    var src = '', med = '', cmp = ''
    try {
      var q = new URLSearchParams(L.search)
      src = (q.get('ref') || q.get('utm_source') || '').toLowerCase().slice(0, 32)
      med = (q.get('utm_medium') || '').toLowerCase().slice(0, 32)
      cmp = (q.get('utm_campaign') || '').toLowerCase().slice(0, 48)
      if (src || med || cmp) {
        var drop = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
        for (var i = 0; i < drop.length; i++) q.delete(drop[i])
        var rest = q.toString()
        history.replaceState(history.state, '', L.pathname + (rest ? '?' + rest : '') + L.hash)
      }
    } catch (e) { /* history が使えない */ }
    var ref = ''
    try {
      if (D.referrer) {
        var u = new URL(D.referrer)
        if (u.hostname && bare(u.hostname) !== self) ref = u.protocol + '//' + u.hostname
      }
    } catch (e) {}
    // 再読み込みや「戻る」では、紹介元は最初に来たときのものが残っています。
    // それを「入り直した」と数えると、1回の訪問が2回になります。
    var nav = ''
    try { var ne = performance.getEntriesByType('navigation')[0]; nav = ne ? ne.type : '' } catch (e) {}
    var x = read()
    // 同じ印（ref と utm_campaign）のリンクを、同じ訪問の中でたどったときは
    // 続きとして数えます。プロフィールのリンク集（/links?from=instagram）から
    // 自社のページ（?ref=instagram&utm_campaign=bio）へ移るたびに「新しい
    // 訪問」が増えると、Instagram から来た1回が2回に数えられるためです。
    var same = x && src && x.src === src && x.cmp === cmp && now() - x.last <= IDLE
    var again = (!same && (src || cmp)) || (ref && nav !== 'reload' && nav !== 'back_forward')
    if (!x || now() - x.last > IDLE || again) {
      x = fresh()
      x.src = src; x.med = med; x.cmp = cmp; x.ref = ref
      write(x)
    }
  }

  // 訪問の「どこから来たか」を添えます。問い合わせや電話のボタンにも
  // 付けるので、「どこから来た人が問い合わせたか」が分かります。
  function from(b, x) {
    if (x.src) b.s = x.src
    if (x.ref) b.r = x.ref
    if (x.med) b.m = x.med
    if (x.cmp) b.c = x.cmp
    return b
  }
  // 直帰ではなくなった瞬間を一度だけ送ります。訪問ごとの記録をサーバーに
  // 持たずに直帰率を出すための印です（訪問数 − この印の数 = 直帰）。
  function engage(b, x) {
    if (x.g) return
    x.g = 1
    b.g = 1
    b.l = x.landing || '/'
  }

  function path() { return cfg.path ? cfg.path() : (L.pathname.replace(/\/$/, '') || '/') }
  function kindOf(p) { return cfg.classify ? cfg.classify(p) : (cfg.notFound ? 'not_found' : 'page') }

  /* ---- 見ていた時間 ----
     画面が表に出ていて、ウインドウが操作できる状態だった時間だけを足します。
     別のタブを見ている間や、ほかのアプリに切り替えている間は数えません。
     開きっぱなしで席を外した場合に備えて、1ページ30分で打ち切ります。 */
  var acc = 0, since = 0
  function active() { return D.visibilityState === 'visible' && (typeof D.hasFocus !== 'function' || D.hasFocus()) }
  function tick() {
    var t = now()
    if (since) { acc += t - since; since = 0 }
    if (active()) since = t
  }
  function spent() { return Math.max(0, Math.min(CAP, Math.round(acc + (since ? now() - since : 0)))) }

  var page = null     // このページで数えた住所（見つからないページなら null）
  var shown = null
  var seen = {}
  var inside = false
  var gone = false
  function resetPage() { acc = 0; since = active() ? now() : 0; seen = {}; inside = false; gone = false }

  var started = false
  function event(name, dest, engaging) {
    // 先読みの間（まだ誰も見ていない）に起きたものは送りません。
    if (!started) return
    var x = cur()
    var b = from({ p: page || path(), e: name }, x)
    if (dest) b.d = dest
    if (ENGAGING[name] || engaging) engage(b, x)
    touch(x)
    post(b)
  }

  /* そのページを離れた。見ていた時間を送ります。サイト内のリンクを押して
     移ったなら 'page_time'、そうでなければ「ここで帰った」として 'exit'。
     離脱は pagehide（本当にページを離れたとき）でだけ数えます——タブを
     切り替えただけで「帰った」と数えていた頃は、離脱が実際より多く出ました。 */
  function flush(leaving) {
    if (!page || gone) return
    tick()
    var t = spent()
    var x = cur()
    x.t = (x.t || 0) + t
    var b = from({ p: page, e: leaving && !inside ? 'exit' : 'page_time', t: t }, x)
    if (x.t >= 10000) engage(b, x)
    if (leaving) gone = true
    touch(x)
    post(b)
  }

  function view(force) {
    var p = path()
    var kind = kindOf(p)
    // すぐ別の住所へ移るページ（古いリンクの転送）は数えません。移った先で
    // 1回だけ数えます。訪問の控えは arrive() で作ってあるので、紹介元は
    // 移った先に引き継がれます。
    if (kind === 'skip') return
    if (!force && p === shown) return
    flush(false)
    shown = p
    var x = cur()
    var b = { p: p, n: x.n }
    if (kind === 'not_found') b.e = 'not_found'
    if (x.n === 0) {
      from(b, x)
      x.landing = kind === 'not_found' ? '/(404)' : p
    }
    x.n++
    if (kind === 'page') {
      x.pv = (x.pv || 0) + 1
      if (x.pv >= 2) engage(b, x)
    }
    page = kind === 'page' ? p : null
    resetPage()
    touch(x)
    post(b)
    /* サービスの詳しいページを開いた＝「サービスを見た」。一覧のページは
       詳しいページではないので数えません。 */
    if (page && /^\/services\/(?!index\.html$)[^\/]+\.html$/.test(page)) event('service_view')
  }

  /* どこまで読まれたか。半分と終わりの2点だけ送ります（細かく刻んでも、
     できることは変わらないので）。ページが変わったら数え直します。 */
  function depth() {
    if (!page) return
    var d = D.documentElement
    var h = d.scrollHeight - W.innerHeight
    // 画面に収まりきるページは、開いた時点で終わりまで見えています。
    var r = h <= 40 ? 1 : (W.scrollY || W.pageYOffset || 0) / h
    // 自分でスクロールして半分まで来たなら、それは「操作した」です。
    // 画面に収まるページで自動的に届いたぶんは、操作に数えません。
    if (r >= 0.5 && !seen.h) { seen.h = 1; event('read_half', '', h > 40) }
    if (r >= 0.9 && !seen.e) { seen.e = 1; event('read_end') }
  }
  var waiting = false
  function onScroll() {
    if (waiting) return
    waiting = true
    requestAnimationFrame(function () { waiting = false; depth() })
  }
  /** 描画が落ち着いてから、画面に収まるページのぶんを測ります。アプリは
   *  中身を描いてから呼びます（描く前の空のページは、全部見えている
   *  ように見えてしまうので）。 */
  function settle() {
    if (D.readyState === 'complete') setTimeout(depth, 1500)
    else W.addEventListener('load', function () { setTimeout(depth, 1500) })
  }

  /* サイトの外へ出ていく操作。電話・LINE・メールは問い合わせフォームを
     通らないので、導線の数字には一切出てきません。「送信 0」のまま実は
     電話が鳴っていた、が起こるので、押された「先」を数えます。
     サイト内のリンクなら印を付けておき、離脱と区別します。 */
  function onClick(ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null
    if (!a) return
    var href = a.getAttribute('href') || ''
    if (href.indexOf('tel:') === 0) return event('click_tel')
    if (href.indexOf('mailto:') === 0) return event('click_mail')
    var u
    try { u = new URL(href, L.href) } catch (x) { return }
    if (!/^https?:$/.test(u.protocol)) return
    var h = bare(u.hostname)
    if (h === self) {
      inside = true
      // 移動が起きなかったとき（別タブで開いた等）に印が残り続けないように。
      setTimeout(function () { inside = false }, 2000)
      return
    }
    if (/(^|\.)line\.me$|(^|\.)lin\.ee$/.test(h)) return event('click_line')
    event('click_out', h)
  }

  function start() {
    started = true
    arrive()
    view()
    D.addEventListener('visibilitychange', tick)
    W.addEventListener('focus', tick)
    W.addEventListener('blur', tick)
    W.addEventListener('scroll', onScroll, { passive: true })
    W.addEventListener('resize', onScroll, { passive: true })
    D.addEventListener('click', onClick, true)
    W.addEventListener('pagehide', function () { flush(true) })
    // 「戻る」でメモリから復元されたページ（bfcache）は、読み込みが起きない
    // ので、何もしないと2回目の閲覧が数えられません。
    W.addEventListener('pageshow', function (e) { if (e.persisted) view(true) })
    if (cfg.spa) {
      W.addEventListener('hashchange', function () { view() })
      W.addEventListener('popstate', function () { view() })
    }
  }
  // 先読み（prerender）されただけのページは、まだ誰も見ていません。
  // 実際に表示されたときに数えます。
  if (D.prerendering) D.addEventListener('prerenderingchange', start, { once: true })
  else start()

  /* 文章の実験の印を置き、その日に初めて見せたときだけ「見た」を送ります。
     印は「実験名:A」「実験名:B」（採用後の見張りは「実験名:W」）だけで、
     訪問者を見分けるものは何も送りません。 */
  function exp(tag, first) {
    if (!/^[a-z0-9]{4,20}:[ABW]$/.test(String(tag || ''))) return
    var x = cur()
    x.xt = tag
    touch(x)
    if (first) event('exp_view')
  }

  return { event: event, view: view, settle: settle, exp: exp }
}
