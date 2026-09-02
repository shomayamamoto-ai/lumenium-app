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
      node.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i)))
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

/**
 * Apply a { path: string } override map onto the live registry objects.
 * Only replaces leaves that already exist and are already strings, so a stale
 * or hand-edited content.json can never introduce new shapes or wrong types.
 * Returns the number of values actually applied.
 */
export function applyOverrides(overrides, root = REGISTRY) {
  if (!overrides || typeof overrides !== 'object') return 0
  let applied = 0
  for (const [path, value] of Object.entries(overrides)) {
    if (typeof value !== 'string') continue
    const parts = String(path).split('.')
    const leaf = parts.pop()
    if (LOCKED.has(leaf)) continue
    let node = root
    let ok = true
    for (const p of parts) {
      if (node == null || typeof node !== 'object' || !(p in node)) { ok = false; break }
      node = node[p]
    }
    if (!ok || node == null || typeof node !== 'object') continue
    if (typeof node[leaf] !== 'string') continue
    node[leaf] = value
    applied++
  }
  return applied
}
