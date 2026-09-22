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
 *  no IP, just a counter per day. Exported so analytics.js can reach it. */
export function sendEvent(name) {
  post(JSON.stringify({ p: currentPath(), e: name }))
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

export function startPageviews() {
  if (typeof window === 'undefined') return
  // Don't count the operator's own visits to the admin screens.
  if (/^\/(admin-members|login|register|fix)/.test(window.location.pathname)) return
  const fire = () => send(currentPath())
  fire()
  window.addEventListener('hashchange', fire)
  window.addEventListener('popstate', fire)
  startReadDepth()
}
