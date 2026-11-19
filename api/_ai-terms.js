// AI用語図鑑（取り込んだ用語）の置き場と、AI に用語の意味を渡すところ。
//
// 図鑑の中身は、このリポジトリには入っていません（図鑑は別の非公開リポジトリです）。
// 管理画面の「AI用語図鑑」で JSON を取り込むと、保存先（Upstash）に入ります。
// 読めるのは、ログインした人だけです（api/ai-terms.js）。
//
//   terms:meta      … いつ・だれが取り込んだか、分野の一覧（id・名前・数）
//   terms:s:<id>    … 分野ごとの中身（グループと項目）
//
// 文章・SNS・CM・キャラクターの画面には「使う型・用語」の欄があります。
// そこに書かれた言葉（例：「PREP法で」）の中から図鑑の用語を探し、その意味を
// AI への依頼文に足します（termBlock）。図鑑を取り込んでいなくても、欄に書いた
// 指定そのものは AI に渡ります。

import { storeConfig, storeFor, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'

export const LIMITS = {
  sections: 150, groups: 80, items: 12000,
  id: 24, title: 160, tip: 700, jp: 140, en: 1800, desc: 700,
  hints: 600, body: 3_000_000,
}
export const TK = { meta: `${KV}terms:meta`, sec: (id) => `${KV}terms:s:${id}` }

const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n)

/** 「Web演出 48」→「Web演出」。数は項目から数え直します。 */
export function labelOf(chip, title) {
  const c = String(chip || '').replace(/\s+\d+\S*$/, '').trim()
  return c || String(title || '').trim()
}

/** 取り込む JSON を確かめて、決まった形にそろえます。{ ok, sections, count, … } か { ok:false, message }。 */
export function normalizeTerms(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.sections)) {
    return { ok: false, message: '図鑑のファイルではないようです（sections がありません）。' }
  }
  const seen = new Set()
  const sections = []
  let count = 0
  for (const s of payload.sections.slice(0, LIMITS.sections)) {
    if (!s || typeof s !== 'object') continue
    const id = String(s.id || '').toLowerCase()
    if (!/^[a-z0-9-]+$/.test(id) || id.length > LIMITS.id || seen.has(id)) continue
    const groups = []
    for (const g of (Array.isArray(s.groups) ? s.groups : []).slice(0, LIMITS.groups)) {
      if (!g || typeof g !== 'object') continue
      const items = []
      for (const it of Array.isArray(g.items) ? g.items : []) {
        const a = Array.isArray(it) ? it : it && typeof it === 'object' ? [it.jp, it.en, it.desc] : null
        if (!a) continue
        const jp = clip(a[0], LIMITS.jp)
        if (!jp) continue
        if (count >= LIMITS.items) break
        items.push([jp, clip(a[1], LIMITS.en), clip(a[2], LIMITS.desc)])
        count++
      }
      if (items.length) groups.push({ title: clip(g.title, LIMITS.title), items })
    }
    if (!groups.length) continue
    seen.add(id)
    const title = clip(s.title, LIMITS.title)
    sections.push({ id, label: clip(labelOf(s.chip, title), 60), title, tip: clip(s.tip, LIMITS.tip), groups })
  }
  if (!count) return { ok: false, message: '用語が1つも入っていませんでした。' }
  return {
    ok: true, sections, count,
    name: clip(payload.name, 80) || 'AI用語図鑑',
    copyright: clip(payload.copyright, 80),
    exportedAt: clip(payload.exportedAt, 40),
  }
}

export const countOf = (s) => s.groups.reduce((a, g) => a + g.items.length, 0)

/* ---- 用語を探す ---- */

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase()
const ASCII_NAME = /^[\x20-\x7e]+$/

/** 探すときの名前の一覧。長い名前から先に当てます。[探す言葉, 項目, 分野の名前] */
export function lexicon(sections) {
  const out = []
  const seen = new Set()
  for (const s of sections || []) {
    for (const g of s.groups || []) {
      for (const it of g.items || []) {
        const names = [it[0]]
        // 英語の名前（pan・Parallax scrolling など）でも当たるように。指示文（日本語の文）は名前ではありません。
        if (it[1] && it[1] !== it[0] && ASCII_NAME.test(it[1]) && it[1].length >= 3 && it[1].length <= 40) names.push(it[1])
        for (const n of names) {
          const k = norm(n)
          if (k.length < 2 || seen.has(k)) continue
          seen.add(k)
          out.push([k, it, s.label || s.title || ''])
        }
      }
    }
  }
  return out.sort((a, b) => b[0].length - a[0].length)
}

/** 欄に書かれた言葉から、図鑑の用語を探します（長い名前を優先。重なった所は1つだけ）。
 *  2文字の名前（パン・余白 など）は、「」で囲んであるときだけ当てます。 */
export function findTerms(hints, lex, max = 8) {
  const text = norm(hints)
  if (!text || !lex || !lex.length) return []
  const taken = []
  const found = []
  for (const [k, it, label] of lex) {
    if (found.length >= max) break
    let from = 0
    for (;;) {
      const i = text.indexOf(k, from)
      if (i < 0) break
      const j = i + k.length
      from = j
      if (taken.some(([a, b]) => i < b && j > a)) continue
      if (k.length < 3 && !(/[「『"“]/.test(text[i - 1] || '') && /[」』"”]/.test(text[j] || ''))) continue
      if (ASCII_NAME.test(k) && (/[a-z0-9]/.test(text[i - 1] || '') || /[a-z0-9]/.test(text[j] || ''))) continue
      taken.push([i, j])
      found.push({ at: i, jp: it[0], en: it[1], desc: it[2], section: label })
      break
    }
  }
  return found.sort((a, b) => a.at - b.at)
}

/** 用語1つの意味を1行で。指示文（色つきの文）に型の中身が書いてあるので、説明と両方を渡します。 */
export function meaningOf(m) {
  const parts = []
  if (m.en && m.en !== m.jp) parts.push(m.en.replace(/\s*\n+\s*/g, ' / ').slice(0, 260))
  if (m.desc) parts.push(m.desc.slice(0, 200))
  return `・${m.jp}${m.section ? `（${m.section}）` : ''}: ${parts.join(' ／ ') || '（説明なし）'}`
}

/** AI への依頼文に足す段落。指定が無ければ ''。 */
export function blockText(hints, matches) {
  const h = clip(hints, LIMITS.hints)
  if (!h) return ''
  const lines = [
    '',
    '使う型・用語の指定（この指定に沿って作ってください。渡されていない事実は、型を埋めるためでも作らないこと）:',
    h,
  ]
  if (matches && matches.length) lines.push('', '指定に出てくる用語の意味:', ...matches.map(meaningOf))
  return lines.join('\n')
}

/* ---- 保存先 ---- */

export async function readMeta(cfg) {
  const [raw] = await pipeline(cfg, [['GET', TK.meta]])
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export async function readAll(cfg) {
  const meta = await readMeta(cfg)
  if (!meta || !Array.isArray(meta.sections) || !meta.sections.length) return { meta: null, sections: [] }
  const raws = await pipeline(cfg, [['MGET', ...meta.sections.map((s) => TK.sec(s.id))]])
  const list = Array.isArray(raws[0]) ? raws[0] : []
  const sections = []
  meta.sections.forEach((s, i) => {
    try { const v = JSON.parse(list[i] || 'null'); if (v && Array.isArray(v.groups)) sections.push(v) } catch { /* こわれた分野は出さない */ }
  })
  return { meta, sections }
}

/** 取り込み。分野ごとに書き、最後に一覧（meta）を書きます。前にあって今回ない分野は消します。 */
export async function saveAll(cfg, data, who) {
  const before = await readMeta(cfg)
  // 1回の送信が大きくなりすぎないよう、およそ250KBごとに分けて送ります。
  let batch = []
  let size = 0
  const flush = async () => { if (batch.length) { await pipeline(cfg, batch); batch = []; size = 0 } }
  for (const s of data.sections) {
    const raw = JSON.stringify(s)
    if (size + raw.length > 250000) await flush()
    batch.push(['SET', TK.sec(s.id), raw])
    size += raw.length
  }
  await flush()
  const meta = {
    v: 1, name: data.name, copyright: data.copyright, exportedAt: data.exportedAt,
    importedAt: new Date().toISOString(), by: (who && who.name) || '', count: data.count,
    sections: data.sections.map((s) => ({ id: s.id, label: s.label, title: s.title, count: countOf(s) })),
  }
  const keep = new Set(meta.sections.map((s) => s.id))
  const stale = ((before && before.sections) || []).map((s) => s.id).filter((id) => !keep.has(id))
  await pipeline(cfg, [['SET', TK.meta, JSON.stringify(meta)], ...(stale.length ? [['DEL', ...stale.map(TK.sec)]] : [])])
  CACHE.at = 0
  return meta
}

export async function clearAll(cfg) {
  const meta = await readMeta(cfg)
  const ids = ((meta && meta.sections) || []).map((s) => s.id)
  await pipeline(cfg, [['DEL', TK.meta, ...ids.map(TK.sec)]])
  CACHE.at = 0
}

/* ---- AI の窓口から使うところ ---- */

const CACHE = { at: 0, lex: null }
const CACHE_MS = 5 * 60 * 1000

/** 欄の中身（hints）を、AI への依頼文に足す段落にします。保存先が読めなくても、指定そのものは渡します。 */
export async function termBlock(hints, req) {
  const h = clip(hints, LIMITS.hints)
  if (!h) return ''
  let matches = []
  try {
    const cfg = req ? await storeFor(req) : storeConfig()
    if (cfg) {
      if (!CACHE.lex || Date.now() - CACHE.at > CACHE_MS) {
        const { sections } = await readAll(cfg)
        CACHE.lex = lexicon(sections)
        CACHE.at = Date.now()
      }
      matches = findTerms(h, CACHE.lex)
    }
  } catch { /* 図鑑が読めないときは、意味を足さずに進めます */ }
  return blockText(h, matches)
}
