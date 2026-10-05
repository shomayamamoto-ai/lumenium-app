// 文章編集で「項目を足す・隠す」「ページの検索結果の見え方（SEO）」
// 「ブログ記事を書く」の分。content.json の中で、文字の上書き（"住所": "文"）
// とは別の場所に置きます:
//
//   "added":  { "faq": [ {id, group, q, a} ], "testimonials": [ {id, text, name, detail} ],
//               "cases": [ {id, tag, title, desc} ], "articles": [ {slug, title, date, category, description, body} ] }
//   "hidden": { "faq": [id], "testimonials": [id], "cases": [id] }
//   "seo":    { "/pricing.html": { "title": "…", "description": "…" } }
//
// 足した項目はサイトを表示するとき（ブラウザ）とビルドのとき（静的ページ）の
// 両方で、元のデータの後ろに付け足します。隠した項目は両方で外します。
// どちらも元のデータ（src/data）は書き換えません。消したくなったら
// 「隠す」を外すだけで戻ります。
//
// 決まり（文字数・形）はここ1か所。保存の窓口（api/content-save.js）・
// 表示側（content-registry.js の applyOverrides）・テストが同じものを使います。
// Plain ESM with no imports.

export const LISTS = {
  faq: {
    label: 'よくある質問', max: 30,
    fields: { q: ['質問', 4, 120], a: ['回答', 10, 1000] },
  },
  testimonials: {
    label: 'お客様の声', max: 30,
    fields: { text: ['お声', 8, 200], name: ['お名前（業種など）', 2, 40], detail: ['ご依頼の内容', 0, 60] },
  },
  cases: {
    label: '実績（主な事例）', max: 30,
    fields: { tag: ['分野', 1, 20], title: ['題名', 4, 60], desc: ['説明', 10, 300] },
  },
}

export const ADDED_ID = /^[a-z][a-z0-9-]{2,40}$/

/** 1件の確認。問題があれば、そのまま画面に出せる文を返します。 */
export function checkItem(list, item) {
  const spec = LISTS[list]
  if (!spec) return '不明な一覧です。'
  if (!item || typeof item !== 'object') return '内容がありません。'
  if (!ADDED_ID.test(String(item.id || ''))) return '項目の id が正しくありません。'
  for (const [k, [label, min, max]] of Object.entries(spec.fields)) {
    const v = String(item[k] ?? '').trim()
    if (v.length < min) return min <= 1 ? `${label}を入れてください。` : `${label}は${min}文字以上で書いてください。`
    if (v.length > max) return `${label}は${max}文字までです（いま${v.length}文字）。`
  }
  if (list === 'faq' && !/^[a-z0-9-]{2,40}$/.test(String(item.group || ''))) return '質問を載せるグループを選んでください。'
  return ''
}

function cleanItem(list, item) {
  const out = { id: String(item.id) }
  if (list === 'faq') out.group = String(item.group)
  for (const k of Object.keys(LISTS[list].fields)) out[k] = String(item[k] ?? '').trim()
  return out
}

/* ---- SEO ---- */
export const SEO_PATH = /^\/[a-z0-9/_-]{1,80}\.html$/
export const SEO_LIMIT = { title: 80, description: 200 }
/** 目安（検索結果で切れずに出やすい長さ）。超えても保存はできます。 */
export const SEO_GUIDE = { title: [15, 62], description: [60, 160] }

export function checkSeo(path, v) {
  if (!SEO_PATH.test(String(path))) return 'ページの指定が正しくありません。'
  if (!v || typeof v !== 'object') return '内容がありません。'
  const title = String(v.title ?? '').trim()
  const description = String(v.description ?? '').trim()
  if (!title && !description) return 'タイトルか説明のどちらかを入れてください（両方空にするなら「元に戻す」を押してください）。'
  if (title.length > SEO_LIMIT.title) return `タイトルは${SEO_LIMIT.title}文字までです。`
  if (description.length > SEO_LIMIT.description) return `説明は${SEO_LIMIT.description}文字までです。`
  if (/[<>]/.test(title + description)) return '< と > は使えません。'
  return ''
}

/** 目安から外れていたら、その一言（画面の数え表示と同じ判断）。 */
export function seoHint(kind, text) {
  const [lo, hi] = SEO_GUIDE[kind]
  const n = String(text || '').trim().length
  if (!n) return ''
  if (n < lo) return `短めです（目安 ${lo}〜${hi} 文字）`
  if (n > hi) return `長めです。検索結果では途中で切れることがあります（目安 ${lo}〜${hi} 文字）`
  return ''
}

/* ---- ブログ記事 ---- */
export const ARTICLE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
const RESERVED = new Set(['index'])
export const ARTICLE_LIMIT = { title: [4, 80], description: [10, 160], body: [50, 20000], category: [1, 20] }

/** 記事の住所（/blog/<slug>.html）に使えるか。 */
export function validArticleSlug(s) {
  s = String(s || '')
  return ARTICLE_SLUG.test(s) && !/--/.test(s) && !RESERVED.has(s) && !/^post-/.test(s)
}

/** 記事の確認。taken は、すでに使われている slug（元からある記事の分も）。 */
export function checkArticle(a, taken = []) {
  if (!a || typeof a !== 'object') return '内容がありません。'
  const slug = String(a.slug || '')
  if (!validArticleSlug(slug)) return '記事の住所（英字の名前）は、英小文字・数字・ハイフンで60文字まで。先頭と末尾は英数字、「post-」で始まるものと「index」は使えません。'
  if (taken.includes(slug)) return `「${slug}」はほかの記事で使っています。別の名前にしてください。`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date || ''))) return '公開日を選んでください。'
  for (const [k, [min, max]] of Object.entries(ARTICLE_LIMIT)) {
    const n = String(a[k] ?? '').trim().length
    const label = { title: '題名', description: '説明', body: '本文', category: 'カテゴリ' }[k]
    if (n < min) return `${label}は${min}文字以上で書いてください。`
    if (n > max) return `${label}は${max}文字までです（いま${n}文字）。`
  }
  return ''
}

/** 保存した形（admin）→ サイトの記事の形（src/data/articles.js と同じ）。 */
export function toArticle(a) {
  return {
    id: a.slug, slug: a.slug, added: true,
    date: String(a.date).replace(/-/g, '.'),
    category: String(a.category).trim(),
    title: String(a.title).trim(),
    summary: String(a.description).trim(),
    content: String(a.body).replace(/\r\n/g, '\n').trim(),
  }
}

/* ---- 表示側：足す・隠す ---- */

/**
 * content.json の added / hidden を、表示に使う一覧（root）に当てはめます。
 * 同じ id のものは二度足しません（同じ画面で2回呼ばれても同じ結果）。
 * 決まりに合わない項目は黙って飛ばします（手で壊したファイルでもサイトは出る）。
 */
export function applyExtra(data, root) {
  if (!data || typeof data !== 'object' || !root) return 0
  let n = 0
  const added = data.added && typeof data.added === 'object' ? data.added : {}
  const hidden = data.hidden && typeof data.hidden === 'object' ? data.hidden : {}
  const site = root.site || {}
  const targets = { testimonials: site.TESTIMONIALS, cases: site.CASE_STUDIES }

  for (const list of ['testimonials', 'cases']) {
    const arr = targets[list]
    if (!Array.isArray(arr)) continue
    for (const item of Array.isArray(added[list]) ? added[list] : []) {
      if (checkItem(list, item) || arr.some((x) => x && x.id === item.id)) continue
      const c = cleanItem(list, item)
      if (list === 'testimonials') c.initial = c.name.slice(0, 1)
      arr.push(c); n++
    }
  }
  if (Array.isArray(root.faq) && root.faq.length) {
    for (const item of Array.isArray(added.faq) ? added.faq : []) {
      if (checkItem('faq', item)) continue
      if (root.faq.some((g) => (g.items || []).some((x) => x && x.id === item.id))) continue
      const g = root.faq.find((x) => x.id === item.group) || root.faq[root.faq.length - 1]
      const c = cleanItem('faq', item)
      delete c.group
      g.items.push(c); n++
    }
  }
  if (Array.isArray(root.articles)) {
    const taken = root.articles.map((a) => String(a.slug || ''))
    for (const a of Array.isArray(added.articles) ? added.articles : []) {
      if (checkArticle(a, taken)) continue
      root.articles.push(toArticle(a)); taken.push(a.slug); n++
    }
  }
  // 隠す
  const drop = (arr, ids) => {
    if (!Array.isArray(arr) || !Array.isArray(ids) || !ids.length) return
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] && ids.includes(arr[i].id)) { arr.splice(i, 1); n++ }
  }
  drop(targets.testimonials, hidden.testimonials)
  drop(targets.cases, hidden.cases)
  if (Array.isArray(root.faq)) for (const g of root.faq) drop(g.items, hidden.faq)
  return n
}

/* ---- 保存側：変更を今の内容に重ねる ---- */

/**
 * ops = { added: { faq: { <id>: item | null } }, hidden: { faq: { <id>: true | false } },
 *         seo: { <path>: { title, description } | null }, articles: { <slug>: article | null } }
 * 今の content.json（cur）に重ねた新しい added / hidden / seo と、変わった数を返します。
 * 誰かが別の画面で足した項目を消さないよう、id ごとに重ねます。
 */
export function applyOps(cur, ops, { builtinSlugs = [] } = {}) {
  const added = clone(cur && cur.added) || {}
  const hidden = clone(cur && cur.hidden) || {}
  const seo = clone(cur && cur.seo) || {}
  let changed = 0
  if (!ops || typeof ops !== 'object') return { error: '変更内容がありません。' }

  for (const [list, byId] of Object.entries(ops.added || {})) {
    if (!LISTS[list]) return { error: '不明な一覧です。' }
    const arr = Array.isArray(added[list]) ? added[list] : []
    for (const [id, item] of Object.entries(byId || {})) {
      const at = arr.findIndex((x) => x && x.id === id)
      if (item === null) { if (at >= 0) { arr.splice(at, 1); changed++ } continue }
      const c = { ...item, id }
      const why = checkItem(list, c)
      if (why) return { error: why }
      const v = cleanItem(list, c)
      if (at >= 0) { if (JSON.stringify(arr[at]) !== JSON.stringify(v)) { arr[at] = v; changed++ } } else { arr.push(v); changed++ }
    }
    if (arr.length > LISTS[list].max) return { error: `${LISTS[list].label}に足せるのは${LISTS[list].max}件までです。` }
    added[list] = arr
  }
  for (const [list, byId] of Object.entries(ops.hidden || {})) {
    if (!LISTS[list]) return { error: '不明な一覧です。' }
    const set = new Set(Array.isArray(hidden[list]) ? hidden[list] : [])
    for (const [id, on] of Object.entries(byId || {})) {
      if (!/^[a-z0-9-]{2,60}$/.test(id)) return { error: '項目の id が正しくありません。' }
      if (on && !set.has(id)) { set.add(id); changed++ }
      if (!on && set.has(id)) { set.delete(id); changed++ }
    }
    hidden[list] = [...set].sort()
  }
  for (const [path, v] of Object.entries(ops.seo || {})) {
    if (v === null) { if (seo[path]) { delete seo[path]; changed++ } continue }
    const why = checkSeo(path, v)
    if (why) return { error: why }
    const next = { title: String(v.title || '').trim(), description: String(v.description || '').trim() }
    if (JSON.stringify(seo[path]) !== JSON.stringify(next)) { seo[path] = next; changed++ }
  }
  if (Object.keys(seo).length > 100) return { error: 'SEO の設定は100ページまでです。' }
  if (ops.articles) {
    const arr = Array.isArray(added.articles) ? added.articles : []
    for (const [key, a] of Object.entries(ops.articles)) {
      const at = arr.findIndex((x) => x && x.slug === key)
      if (a === null) { if (at >= 0) { arr.splice(at, 1); changed++ } continue }
      const taken = builtinSlugs.concat(arr.filter((x, i) => i !== at).map((x) => x.slug))
      const why = checkArticle(a, taken)
      if (why) return { error: why }
      const v = { slug: a.slug, title: String(a.title).trim(), date: a.date, category: String(a.category).trim(),
        description: String(a.description).trim(), body: String(a.body).replace(/\r\n/g, '\n').trim() }
      if (at >= 0) { if (JSON.stringify(arr[at]) !== JSON.stringify(v)) { arr[at] = v; changed++ } } else { arr.push(v); changed++ }
    }
    if (arr.length > 200) return { error: '記事は200本までです。' }
    added.articles = arr
  }
  // 空の入れ物は残さない（ファイルの差分が読みやすいように）
  for (const k of Object.keys(added)) if (!added[k].length) delete added[k]
  for (const k of Object.keys(hidden)) if (!hidden[k].length) delete hidden[k]
  return { added, hidden, seo, changed }
}

function clone(x) { return x && typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : null }
