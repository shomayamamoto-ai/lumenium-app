// SNS（文章）の「このサイトの決まり」を保存する場所。
//
//   ${KV}social:style  … 使わない言葉と表記の統一（_social-text.js の validateStyle の形）
//
// 投稿の記録（_social.js）とは別のファイルにしています。読む人も書く人も
// 管理者だけで、送信の処理とは関係が無いためです。保存先（Upstash Redis）が
// 無いときは空の決まりを返し、保存は「保存先が要ります」と断ります。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeFor, storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { validateStyle, RULES, cleanCampaign } from './_social-text.js'

export const STYLE_KEY = `${KV}social:style`

const NO_STORE = '保存先（Upstash Redis）が未接続のため保存できません。設定状況から保存先をつないでください。'

async function cfgFor(req) {
  return req ? await storeFor(req) : storeConfig()
}

async function readJson(key, req, fallback) {
  const cfg = await cfgFor(req)
  if (!cfg) return fallback
  try {
    const [raw] = await pipeline(cfg, [['GET', key]])
    return raw ? JSON.parse(raw) : fallback
  } catch (_) { return fallback }
}

async function writeJson(key, value, req) {
  const cfg = await cfgFor(req)
  if (!cfg) return { ok: false, message: NO_STORE }
  try {
    await pipeline(cfg, [['SET', key, JSON.stringify(value)]])
    return { ok: true }
  } catch (_) { return { ok: false, message: '保存できませんでした。時間をおいてもう一度お試しください。' } }
}

/** 保存してある決まり。壊れた値が入っていても、確かめ直してから返します。 */
export async function readStyle(req) {
  return validateStyle(await readJson(STYLE_KEY, req, {})).style
}

export async function saveStyle(input, req) {
  const { style, problems } = validateStyle(input)
  const r = await writeJson(STYLE_KEY, style, req)
  return { ...r, style, problems }
}

/* ---- SNS（文章）の動き方の設定 ----
   ${KV}social:prefs  … { xAutoMetrics }
   xAutoMetrics: 毎朝の自動処理で、X の反応も取るか。X は読み取り1回ごとに
   料金がかかるので、はじめは取りません（ほかのSNSは無料なので取ります）。 */
export const PREFS_KEY = `${KV}social:prefs`

export function cleanPrefs(input) {
  const p = input && typeof input === 'object' ? input : {}
  return { xAutoMetrics: p.xAutoMetrics === true }
}

/* ---- 定型文 ----
   ${KV}social:tpl  … [{ id, title, text, nets, campaign, link }]（30個まで）
   よく出すお知らせ（定休日・新メニュー・イベント）を、題名をつけて取っておきます。 */
export const TEMPLATES_KEY = `${KV}social:tpl`
export const TEMPLATE_MAX = 30

export function validateTemplates(input) {
  const problems = []
  const out = []
  const seen = new Set()
  for (const t of Array.isArray(input) ? input : []) {
    if (!t || typeof t !== 'object') continue
    const title = String(t.title || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 40)
    const text = String(t.text || '').slice(0, 5000)
    if (!title) { problems.push('題名の無い定型文は保存しません。'); continue }
    if (!text.trim()) { problems.push(`「${title}」は本文が空です。`); continue }
    if (out.length >= TEMPLATE_MAX) { problems.push(`定型文は${TEMPLATE_MAX}個までです。`); break }
    let id = /^[a-z0-9-]{6,40}$/i.test(String(t.id || '')) ? String(t.id) : crypto.randomUUID()
    if (seen.has(id)) id = crypto.randomUUID()
    seen.add(id)
    const link = String(t.link || '').trim()
    out.push({
      id, title, text,
      nets: [...new Set((Array.isArray(t.nets) ? t.nets : []).map(String).filter((n) => RULES[n]))],
      campaign: cleanCampaign(t.campaign),
      link: /^https:\/\/\S+$/i.test(link) ? link.slice(0, 500) : '',
    })
  }
  return { templates: out, problems }
}

export async function readTemplates(req) {
  return validateTemplates(await readJson(TEMPLATES_KEY, req, [])).templates
}

export async function saveTemplates(input, req) {
  const { templates, problems } = validateTemplates(input)
  const r = await writeJson(TEMPLATES_KEY, templates, req)
  return { ...r, templates, problems }
}

export async function readPrefs(req) {

  return cleanPrefs(await readJson(PREFS_KEY, req, {}))
}

export async function savePrefs(input, req) {
  const prefs = cleanPrefs(input)
  const r = await writeJson(PREFS_KEY, prefs, req)
  return { ...r, prefs }
}

/* ---- プロフィールのリンク集（/links） ----
   ${KV}social:links  … { title, note, latest, items: [{ id, title, url, on }] }
   items は並べた順のまま出します。on が false のものは出しません。
   latest は「最近の投稿のリンク」をいくつ足すか（0〜10）。 */
export const LINKS_KEY = `${KV}social:links`
export const LINKS_MAX = 20

export function validateLinks(input) {
  const v = input && typeof input === 'object' ? input : {}
  const problems = []
  const items = []
  const seen = new Set()
  for (const it of Array.isArray(v.items) ? v.items : []) {
    if (!it || typeof it !== 'object') continue
    const title = String(it.title || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 40)
    const url = String(it.url || '').trim()
    if (!title && !url) continue
    if (!title) { problems.push('名前の無いリンクは保存しません。'); continue }
    if (!/^https:\/\/[^\s<>"]+$/i.test(url) || url.length > 500) { problems.push(`「${title}」のURLは https:// で始まる形にしてください。`); continue }
    if (items.length >= LINKS_MAX) { problems.push(`リンクは${LINKS_MAX}個までです。`); break }
    let id = /^[a-z0-9-]{6,40}$/i.test(String(it.id || '')) ? String(it.id) : crypto.randomUUID()
    if (seen.has(id)) id = crypto.randomUUID()
    seen.add(id)
    items.push({ id, title, url, on: it.on !== false })
  }
  const latest = Math.max(0, Math.min(10, Math.round(Number(v.latest) || 0)))
  return {
    links: {
      title: String(v.title || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 40),
      note: String(v.note || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 120),
      latest,
      items,
    },
    problems,
  }
}

export async function readLinks(req) {
  return validateLinks(await readJson(LINKS_KEY, req, { latest: 3, items: [] })).links
}

export async function saveLinks(input, req) {
  const { links, problems } = validateLinks(input)
  const r = await writeJson(LINKS_KEY, links, req)
  return { ...r, links, problems }
}

