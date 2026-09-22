// Pageview beacon. Fires once per view and once per in-app route change.
// The endpoint stores no cookie and no IP, so there is nothing to consent to
// and nothing to clean up on this side.

let last = null

/* 自分のアクセスを数えない。
   サイトを作っている本人が一番よく見るので、放っておくと数字の大半が
   自分の動作確認になります。1人しか来ていない日にその1人が自分なら、
   画面に出ているものは全部ノイズで、見る意味がありません。

   印はこの端末の localStorage にだけ置きます（管理画面のボタンで
   付け外しできます）。訪問者の端末には何も置きません——cookie も
   使いません。読めないときは「付いていない」として普通に数えます。 */
export const OPT_OUT_KEY = 'lum_notrack'

function optedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch (_) {
    return false
  }
}

function currentPath() {
  const { pathname, hash } = window.location
  // Hash routes are the app's real pages, so "/" and "/#/info/pricing" have
  // to be counted separately or the report is one giant home-page row.
  const h = hash && hash.startsWith('#/') ? hash.slice(1) : ''
  return (pathname.replace(/\/$/, '') || '') + h || '/'
}

/** Report a funnel step. Same endpoint, same privacy properties — no cookie,
 *  no IP, just a counter per day. Exported so analytics.js can reach it.
 *  `dest` は「出ていった先」。リンクのクリックだけで使います。 */
export function sendEvent(name, dest) {
  post(JSON.stringify({ p: currentPath(), e: name, ...(dest ? { d: dest } : {}) }))
}

function post(body) {
  if (optedOut()) return
  try {
    // keepalive so the request survives the navigation that triggered it.
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch (_) { /* never let counting break a page */ }
}

function send(path) {
  if (path === last) return
  last = path
  post(JSON.stringify({ p: path, r: document.referrer || '' }))
}

/* どこまで読まれたか。
   閲覧数は「開かれた」までしか言いません。開いて3秒で閉じたのか、
   最後まで読んだのかが分からないと、書いた文章が効いているのかを
   判断できず、直す場所も選べません。半分と終わりの2点だけ送ります
   （細かく刻んでも、できることは変わらないので）。

   ページが変わったら数え直します。同じページで二度は送りません。 */
function startReadDepth() {
  let seen = new Set()
  let page = currentPath()

  const check = () => {
    if (currentPath() !== page) { page = currentPath(); seen = new Set() }
    const doc = document.documentElement
    const scrollable = doc.scrollHeight - window.innerHeight
    // 画面に収まりきるページは、開いた時点で終わりまで見えています。
    const reached = scrollable <= 40 ? 1 : (window.scrollY || 0) / scrollable
    if (reached >= 0.5 && !seen.has('read_half')) { seen.add('read_half'); sendEvent('read_half') }
    if (reached >= 0.9 && !seen.has('read_end')) { seen.add('read_end'); sendEvent('read_end') }
  }

  let waiting = false
  const onScroll = () => {
    if (waiting) return
    waiting = true
    requestAnimationFrame(() => { waiting = false; check() })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  // 画面に収まるページのぶん。描画が落ち着いてから測ります。
  setTimeout(check, 1500)
}

/* サイトの外へ出ていく操作。
   電話をかける、LINEを開く、メールを書く、よそのサイトへ行く——これらは
   問い合わせフォームを通らないので、導線の数字には一切出てきません。
   「送信した 0」のまま、実は電話が鳴っていた、ということが起こります。
   いちばん取りこぼしの大きいところなので、別に数えます。

   リンクの押下そのものではなく、押された「先」を見ます。どこへ出て
   いったかが分かって初めて、どのリンクを目立たせるかを決められます。 */
function startLinkClicks() {
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (href.startsWith('tel:')) return sendEvent('click_tel')
    if (href.startsWith('mailto:')) return sendEvent('click_mail')
    let u
    try { u = new URL(href, location.href) } catch (_) { return }
    if (!/^https?:$/.test(u.protocol)) return
    const host = u.hostname.replace(/^www\./, '')
    if (host === location.hostname.replace(/^www\./, '')) return   // サイト内
    if (/(^|\.)line\.me$|(^|\.)lin\.ee$/.test(host)) return sendEvent('click_line')
    sendEvent('click_out', host)
  }, true)
}

/* そのページを最後にサイトを離れた、を数えます。
   完全には分かりません——ブラウザは「閉じた」と「次のページへ進んだ」を
   同じ合図で伝えてくるからです。そこで、サイト内のリンクを押したときに
   印を付けておき、印が無いまま画面が隠れたときだけ離脱として数えます。
   近似であることは画面にも書いてあります。 */
function startExit() {
  let internal = false
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null
    if (!a) return
    try {
      const u = new URL(a.getAttribute('href') || '', location.href)
      if (u.hostname === location.hostname) internal = true
    } catch (_) { /* tel: や mailto: は内部移動ではありません */ }
  }, true)
  // 内部移動の印は、移動が起きなかったとき（別タブで開いた等）に
  // 残り続けないよう、少ししたら消します。
  document.addEventListener('click', () => { setTimeout(() => { internal = false }, 2000) }, true)

  let sent = false
  const leave = () => {
    if (sent || internal || document.visibilityState !== 'hidden') return
    sent = true
    sendEvent('exit')
  }
  document.addEventListener('visibilitychange', leave)
  window.addEventListener('pagehide', leave)
}

export function startPageviews() {
  if (typeof window === 'undefined') return
  // Don't count the operator's own visits to the admin screens.
  if (/^\/(admin-members|login|register|fix)/.test(window.location.pathname)) return
  const fire = () => send(currentPath())
  fire()
  window.addEventListener('hashchange', fire)
  window.addEventListener('popstate', fire)
  startReadDepth()
  startLinkClicks()
  startExit()
}
