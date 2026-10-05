// Every editable string on the site lives in one of these modules. The admin
// page writes overrides to public/content.json as a flat map of dotted paths
// (e.g. "site.TESTIMONIALS.0.text"); this module knows how to enumerate those
// paths and how to apply them back onto the live objects.
//
// Plain ESM with no JSX so the static page generators can import it too.

import * as site from '../data/site.js'
import { FAQ_GROUPS } from '../data/faq.js'
import { articles } from '../data/articles.js'
import { SERVICES } from '../data/services.js'
import { SECTION } from '../data/text.js'
import { itemId, idArray, migratePath, ID_SEG } from './content-ids.js'
import { applyExtra } from './content-extra.js'

// Arrays whose items all carry an `id` (or a `key`) are addressed by it —
// "site.TESTIMONIALS.@voice-p8q48v.text" — so an override stays on its item
// when the list is reordered or grows. Plain string lists (ACHIEVEMENTS,
// highlights…) have nothing to name an item by and keep their index. Older
// index paths are read through migratePath (src/lib/content-ids.js).
//
// Group -> root object. The group name is the first path segment.
export const REGISTRY = {
  text: SECTION,
  services: SERVICES,
  site: {
    CASE_STUDIES: site.CASE_STUDIES,
    ACHIEVEMENTS: site.ACHIEVEMENTS,
    TESTIMONIALS: site.TESTIMONIALS,
    FLOW_STEPS: site.FLOW_STEPS,
    PRICE_OPTIONS: site.PRICE_OPTIONS,
    PAIN_POINTS: site.PAIN_POINTS,
    BRAND_CHAPTERS: site.BRAND_CHAPTERS,
    POSITIONING_NOTES: site.POSITIONING_NOTES,
    CAREER: site.CAREER,
    PROFILE_BRICKS: site.PROFILE_BRICKS,
  },
  faq: FAQ_GROUPS,
  articles,
}

// Human labels for the admin page, so the groups don't read as code.
export const GROUP_LABELS = {
  'text': '各セクションの見出し・説明文',
  'services': 'サービス6種の紹介文',
  'site.CASE_STUDIES': '実績（主な事例）',
  'site.ACHIEVEMENTS': '実績（その他）',
  'site.TESTIMONIALS': 'お客様の声',
  'site.FLOW_STEPS': 'ご依頼の流れ',
  'site.PRICE_OPTIONS': '料金シミュレーター',
  'site.PAIN_POINTS': 'お困りごと',
  'site.BRAND_CHAPTERS': '社名の由来・考え方',
  'site.POSITIONING_NOTES': '他社との違い',
  'site.CAREER': '代表の経歴',
  'site.PROFILE_BRICKS': '代表紹介（得意領域ほか）',
  'faq': 'よくある質問',
  'articles': 'ブログ記事',
}

// Keys whose value is a string but which must not be edited as free text.
const LOCKED = new Set(['id', 'key', 'icon', 'initial', 'accent', 'no', 'num'])

/**
 * Walk the registry and yield every editable string leaf as
 * { path, value }. Non-strings (numbers, booleans) are skipped: this is a
 * copy editor, not a schema editor, and letting numbers through would let a
 * typo turn a price into text.
 */
export function collectPaths(root = REGISTRY, prefix = '') {
  const out = []
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      const byId = idArray(node)
      node.forEach((v, i) => {
        const seg = byId ? '@' + itemId(v) : String(i)
        walk(v, path ? `${path}.${seg}` : seg)
      })
      return
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k], path ? `${path}.${k}` : k)
      return
    }
    if (typeof node !== 'string') return
    const leaf = path.split('.').pop()
    if (LOCKED.has(leaf)) return
    out.push({ path: prefix ? `${prefix}.${path}` : path, value: node })
  }
  walk(root, '')
  return out
}

/** One segment down: "@id" finds the item with that id in an array. */
function step(node, seg) {
  if (node == null || typeof node !== 'object') return undefined
  if (ID_SEG.test(seg) && Array.isArray(node)) {
    const id = seg.slice(1)
    return node.find((x) => itemId(x) === id)
  }
  return seg in node ? node[seg] : undefined
}

/**
 * Apply a { path: string } override map onto the live registry objects.
 * Only replaces leaves that already exist and are already strings, so a stale
 * or hand-edited content.json can never introduce new shapes or wrong types.
 * The `added` / `hidden` sections are the one way to change a list's length,
 * and they are checked item by item (src/lib/content-extra.js).
 * Returns the number of values actually applied.
 */
export function applyOverrides(overrides, root = REGISTRY) {
  if (!overrides || typeof overrides !== 'object') return 0
  let applied = 0
  for (const [raw, value] of Object.entries(overrides)) {
    if (typeof value !== 'string') continue
    // Older files keyed by index: read them as the item they meant.
    const path = migratePath(raw)
    if (!path) continue
    if (path !== raw && Object.prototype.hasOwnProperty.call(overrides, path)) continue
    const parts = String(path).split('.')
    const leaf = parts.pop()
    if (LOCKED.has(leaf)) continue
    let node = root
    let ok = true
    for (const p of parts) {
      node = step(node, p)
      if (node === undefined) { ok = false; break }
    }
    if (!ok || node == null || typeof node !== 'object') continue
    if (typeof node[leaf] !== 'string') continue
    node[leaf] = value
    applied++
  }
  // Items added in the admin (FAQ, お客様の声, 実績, blog posts) go after the
  // built-in ones, and hidden ones come out — here, so the app, the prerender
  // and every static page generator get the same lists from one call.
  return applied + applyExtra(overrides, root)
}
