// お知らせの「どれを、いつ、どこに出すか」を1か所に。
//
// 読むのは4か所です: サイトのページを作るスクリプト
// (scripts/build-content-pages.mjs)、公開用の news.json を絞るところ
// (scripts/prerender.mjs)、保存する窓口 (api/news-post.js) と毎朝の自動処理
// (api/_news-cron.js)。それぞれが自分で「予約の日が来たか」を判断すると、
// 1か所だけ1日ずれる、ということが起きます。
//
// news.json の1件の形:
//   { id, date, title, body, link,
//     status?: 'published' | 'scheduled',   無ければ公開済み（以前の投稿）
//     publishAt?: 'YYYY-MM-DD',              予約のときの公開日（日本時間）
//     unpublishAt?: 'YYYY-MM-DD',            掲載を終える日。この日までは出し、翌日から外す
//     ended?: true,                          掲載を終えた印（毎朝の自動処理が付けます）
//     pinned?: true,                         固定表示（一覧のいちばん上に出す）
//     category?: 'hours' | 'menu' | …        カテゴリ（NEWS_CATEGORIES の id。無ければ「お知らせ」）
//     image?: { url, alt } }                 画像（alt は必須）
// 下書きは news.json には入りません（保存先の Redis にだけ置きます）。
//
// Plain ESM with no imports, so the edge functions and the build share it.

/** 日本時間の今日（YYYY-MM-DD）。 */
export function jstToday(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** 実在する日付か。2026-02-30 のようなものは false。 */
export function realDay(s) {
  if (!DAY_RE.test(String(s || ''))) return false
  const d = new Date(s + 'T00:00:00Z')
  return !isNaN(d) && d.toISOString().slice(0, 10) === s
}

export function newsStatus(n) {
  return n && n.status === 'scheduled' ? 'scheduled' : 'published'
}

/** 掲載を終える日が過ぎたか。終える日の当日までは出し、翌日（日本時間）から外します。 */
export function isExpired(n, today = jstToday()) {
  return !!(n && realDay(n.unpublishAt) && n.unpublishAt < today)
}

/** サイトに出してよいか。予約は、公開日（日本時間）になってから。
 *  掲載を終える日を過ぎたものは、印（ended）が付く前でも出しません。 */
export function isLive(n, today = jstToday()) {
  if (!n || typeof n !== 'object' || !n.title) return false
  if (n.ended || isExpired(n, today)) return false
  if (newsStatus(n) === 'scheduled') return realDay(n.publishAt) && n.publishAt <= today
  return true
}

/** サイトに出す分だけ。固定表示のものを先に、あとは保存のときの並び（日付順）のまま。 */
export function liveNews(items, today = jstToday()) {
  return pinnedFirst((Array.isArray(items) ? items : []).filter((n) => isLive(n, today)))
}

/** 固定表示（pinned）を上に。固定どうし・それ以外どうしの順は変えません。 */
export function pinnedFirst(items) {
  const list = Array.isArray(items) ? items : []
  return list.filter((n) => n && n.pinned).concat(list.filter((n) => !(n && n.pinned)))
}

/** 固定表示できる数。いくつも固定すると、新しいお知らせが下に埋もれます。 */
export const PIN_MAX = 3

/* カテゴリは決まった中から選びます（自由に作れると、似た名前が増えて
   絞り込みが役に立たなくなります）。id はサイトの絞り込みと保存に使う
   英字、label は画面とサイトに出す名前。 */
export const NEWS_CATEGORIES = [
  { id: 'info', label: 'お知らせ' },
  { id: 'hours', label: '営業日・休業' },
  { id: 'menu', label: '新メニュー・サービス' },
  { id: 'campaign', label: 'キャンペーン' },
  { id: 'media', label: 'メディア掲載' },
]

/** カテゴリの id（知らないもの・空は「お知らせ」）。 */
export function newsCategory(n) {
  const c = String((n && n.category) || '')
  return NEWS_CATEGORIES.some((x) => x.id === c) ? c : 'info'
}

export function categoryLabel(id) {
  const c = NEWS_CATEGORIES.find((x) => x.id === id)
  return c ? c.label : NEWS_CATEGORIES[0].label
}

/** 予約のうち、公開日が来たもの（毎朝の自動処理が、サイトを作り直すきっかけにします）。
 *  公開日が来たときにはもう掲載を終える日も過ぎていたものは、出さないので数えません。 */
export function dueScheduled(items, today = jstToday()) {
  return (Array.isArray(items) ? items : [])
    .filter((n) => n && newsStatus(n) === 'scheduled' && realDay(n.publishAt) && n.publishAt <= today && !isExpired(n, today) && !n.ended)
}

/** 掲載を終える日が過ぎ、まだ印（ended）の付いていないもの。サイトを作り直さないと
 *  ページが残り続けるので、毎朝の自動処理がこれを見て作り直させます。 */
export function dueEnded(items, today = jstToday()) {
  return (Array.isArray(items) ? items : []).filter((n) => n && !n.ended && isExpired(n, today))
}

// 1件ずつのページの住所（/news/<slug>.html）に使える形。英小文字・数字・
// ハイフンだけ、先頭と末尾は英数字、64文字まで。
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export function validSlug(s) {
  return SLUG_RE.test(String(s || '')) && !/--/.test(String(s))
}

/** 1件のページの住所。id がそのまま使えるとき（n-20260928-01 の形）は id。 */
export function newsSlug(n) {
  const s = String((n && (n.slug || n.id)) || '').toLowerCase()
  return validSlug(s) ? s : ''
}

/** 画像の確認。置き場所（Vercel Blob）の https の住所と、説明（alt）が要ります。 */
export function checkImage(img) {
  if (img == null || img === '') return { ok: true, image: null }
  if (typeof img !== 'object') return { ok: false, message: '画像の指定が正しくありません。' }
  const url = String(img.url || '').trim()
  const alt = String(img.alt || '').trim()
  if (!url) return { ok: true, image: null }
  if (!/^https:\/\/[^\s"'<>]+$/.test(url) || url.length > 500) return { ok: false, message: '画像の住所が正しくありません。もう一度アップロードしてください。' }
  if (!alt) return { ok: false, message: '画像の説明（何が写っているか）を入れてください。目の不自由な方の読み上げや、検索エンジンが画像を理解するのに使われます。' }
  if (alt.length > 120) return { ok: false, message: '画像の説明は120文字までにしてください。' }
  return { ok: true, image: { url, alt } }
}
