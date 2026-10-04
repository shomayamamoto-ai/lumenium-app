// 各ページの「最終更新日」を、中身が変わった日にするための台帳。
//
// 以前は、ビルドした日がそのまま全ページの dateModified・画面の「最終更新」・
// sitemap の lastmod になっていました。ビルドは毎日のように走るので、何も
// 書き換えていないページまで毎日「今日更新した」と名乗ることになります。
// 検索エンジンは lastmod が実際の変更と合わないサイトの lastmod を信用しなく
// なる（Google・Bing とも公表しています）ので、これは数字として嘘で、
// しかも効き目を自分で消していました。
//
// やり方: 日付の欄を空にしたページの中身から指紋（ハッシュ）を作り、
// scripts/lastmod.json に {パス: {hash, date}} で残します。
//   ・指紋が前回と同じ → 前回の日付をそのまま使う
//   ・指紋が変わった   → 今日（日本時間）にする
//   ・初めて見るページ → 渡された日付（ブログなら公開日）、無ければ今日
// lastmod.json はコミットしておきます。Vercel のビルドはコミットしませんが、
// 中身が同じなら同じ日付になるので、何度ビルドしても日付は動きません。
//
// 指紋に使うのはページの「本文」（タイトル・説明文・<main> の中）だけです。
// ヘッダーやフッターのリンクを1つ足しただけで全ページが「更新」になるのは、
// 読む人にとっての更新ではないからです。
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

/** ページの中で日付が入る場所の目印。指紋を取ってから本当の日付に置き換えます。 */
export const DATE = '%%LASTMOD%%'

export const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

const FILE = new URL('./lastmod.json', import.meta.url)

let store = null
let before = ''
function load() {
  if (store) return store
  try { before = readFileSync(FILE, 'utf8'); store = JSON.parse(before) } catch (_) { store = {} }
  return store
}

/** The part of a page a reader would call its content. */
export function contentOf(html) {
  const s = String(html)
  const title = (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]
  const desc = (s.match(/<meta[^>]+name=["']description["'][^>]*>/i) || [''])[0]
  const main = s.match(/<main\b[^>]*>([\s\S]*)<\/main>/i)
  return [title, desc, main ? main[1] : s].join('\n')
}

/** 台帳に載る前のページは、いま公開している版に書いてある日付から始めます。
 *  台帳を作った日に、中身の変わっていない全ページが「今日更新」になるのを
 *  避けるためです（その日付も、以前はビルドした日でしたが、今日よりは
 *  中身ができた日に近い値です）。 */
function published(path) {
  try {
    const old = readFileSync(new URL('../public' + (path.endsWith('/') ? path + 'index.html' : path), import.meta.url), 'utf8')
    const m = old.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"/) || old.match(/最終更新[:：]\s*(\d{4}-\d{2}-\d{2})/)
    return m ? m[1] : ''
  } catch (_) { return '' }
}

const fingerprint = (text) => createHash('sha256').update(String(text).split(DATE).join('')).digest('hex').slice(0, 16)

/** The date this page last changed, recorded as a side effect.
 *  `source` overrides what is fingerprinted (a blog post passes its own text,
 *  so a change to the list of other posts under it does not re-date it). */
export function dateFor(path, html, { initial, source } = {}) {
  const s = load()
  const hash = fingerprint(source != null ? source : contentOf(html))
  const prev = s[path]
  let date
  if (prev && prev.hash === hash) date = prev.date
  else if (!prev && (initial || published(path))) date = initial || published(path)
  else date = TODAY
  s[path] = { hash, date }
  return date
}

/** Fingerprint the page, then put the date in every place marked with DATE. */
export function stamp(path, html, opts) {
  const date = dateFor(path, html, opts)
  return { html: String(html).split(DATE).join(date), date }
}

/** The recorded date for a page, without changing anything. */
export function lastmodOf(path) {
  const e = load()[path]
  return e ? e.date : ''
}

/** The newest date across the site — when anything on it last changed. */
export function newestDate() {
  return Object.values(load()).map((e) => e.date).sort().pop() || TODAY
}

/** Write the ledger back, only if something in it changed (so a build with
 *  nothing new leaves the file — and git — untouched). Keys are sorted so the
 *  file diffs cleanly. */
export function saveLastmod() {
  const s = load()
  const sorted = Object.fromEntries(Object.keys(s).sort().map((k) => [k, s[k]]))
  const text = JSON.stringify(sorted, null, 2) + '\n'
  if (text !== before) { writeFileSync(FILE, text); before = text }
}
