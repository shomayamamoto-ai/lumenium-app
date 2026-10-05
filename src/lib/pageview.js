// Pageview beacon for the app. The counting itself — what a visit is, when it
// ends, what is sent — lives in beacon-core.js, which the static pages embed
// as well, so a visit that moves between the app and a static page is one
// visit counted one way. This file only tells it which addresses are real.
//
// The endpoint stores no cookie and no IP, so there is nothing to consent to.

import { lumBeacon } from './beacon-core'
import { resolveRoute } from './routes'

/* 自分のアクセスを数えない。
   サイトを作っている本人が一番よく見るので、放っておくと数字の大半が
   自分の動作確認になります。印はこの端末の localStorage にだけ置きます
   （管理画面のボタンで付け外しできます）。読む側は beacon-core.js です。 */
export const OPT_OUT_KEY = 'lum_notrack'

let api = null

/** Report a funnel step. Same endpoint, same privacy properties.
 *  `dest` は「出ていった先」。リンクのクリックだけで使います。 */
export function sendEvent(name, dest) {
  if (api) api.event(name, dest)
}

/** いまの訪問の「どこから来たか」（beacon-core.js が sessionStorage に置いた控え）。
 *  問い合わせフォームが添えて送り、問い合わせ管理で「Instagram（計測リンク）
 *  から来た人」のように出します。中身は計測が送っているものと同じ4つだけです。 */
export function visitSource() {
  try {
    const x = JSON.parse(window.sessionStorage.getItem('lum_s') || 'null')
    if (!x) return null
    return { s: x.src || '', m: x.med || '', c: x.cmp || '', r: x.ref || '' }
  } catch (_) {
    return null
  }
}

/** Called before the app renders, so the first pageview does not wait for
 *  content.json (it used to wait up to ~2s, and a visitor who left in that
 *  time was never counted at all). */
export function startPageviews() {
  if (typeof window === 'undefined' || api) return
  // Don't count the operator's own visits to the admin screens.
  if (/^\/(admin-members|login|register|fix)/.test(window.location.pathname)) return
  api = lumBeacon({
    spa: true,
    path: () => resolveRoute().path,
    classify: () => resolveRoute().kind,
  })
}

/** 文章の実験（src/lib/experiments.js）の印。first はその日に初めて見せたとき。 */
export function tagExperiment(tag, first) {
  if (api && api.exp) api.exp(tag, first)
}

/** Once the page has drawn: a page that fits on screen has been read to the
 *  end, but only once there is something on it. */
export function settlePageviews() {
  if (api) api.settle()
}
