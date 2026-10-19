export const config = { runtime: 'edge' }

// お客様ごとのメモ・タグ・次に連絡する日（管理者のみ）。
//
//   GET                       -> { items: [{ email, name, tags, note, followUpAt, updatedAt }] }
//   GET ?view=badge           -> { total }  次に連絡する日が今日か過ぎた人の数
//   POST { action:'save', email, name?, tags?, note?, followUpAt? }  -> 1人分を保存（全部空なら消す）
//
// 同じ人かどうかはメールアドレス（大文字・小文字・前後の空白は区別しない）で決めます。
// 問い合わせ・予約・見積書・会員の記録はそれぞれの場所にあり、ここには「お店のメモ」だけを
// 置きます（会員リストの「お客様（全員）」とお客様カルテが、両方を合わせて見せます）。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'

const KEY = `${KV}cust:notes`
const CAPS = { people: 3000, tags: 8, tag: 16, note: 2000, name: 60 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n)
const one = (v, n) => clip(v, n).replace(/\s+/g, ' ').trim()
export const normEmail = (e) => String(e || '').trim().toLowerCase()
const jstDay = (now = Date.now()) => new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10)

/** 画面から来た1人分を、保存できる形に。 */
export function cleanPerson(x, prev) {
  const p = prev || {}
  const tags = x.tags !== undefined
    ? [...new Set((Array.isArray(x.tags) ? x.tags : String(x.tags || '').split(/[,、，]/)).map((t) => one(t, CAPS.tag)).filter(Boolean))].slice(0, CAPS.tags)
    : (p.tags || [])
  const f = x.followUpAt !== undefined ? String(x.followUpAt || '') : (p.followUpAt || '')
  if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return { ok: false, message: '「次に連絡する日」の日付が正しくありません。' }
  return {
    ok: true,
    person: {
      email: normEmail(x.email),
      name: x.name !== undefined ? one(x.name, CAPS.name) : (p.name || ''),
      tags,
      note: x.note !== undefined ? clip(x.note, CAPS.note).trim() : (p.note || ''),
      followUpAt: f,
    },
  }
}

export function followDue(p, now = Date.now()) {
  return !!(p && p.followUpAt && p.followUpAt <= jstDay(now))
}

async function readAll(cfg) {
  const [flat] = await pipeline(cfg, [['HGETALL', KEY]])
  const out = []
  const a = Array.isArray(flat) ? flat : []
  for (let i = 1; i < a.length; i += 2) {
    try { const p = JSON.parse(a[i]); if (p && p.email) out.push(p) } catch (_) {}
  }
  return out
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: true, stored: false, items: [] })
  const list = await readAll(cfg)
  if (new URL(req.url).searchParams.get('view') === 'badge') {
    return json({ ok: true, total: list.filter((p) => followDue(p)).length })
  }
  return json({ ok: true, stored: true, today: jstDay(), items: list })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: '保存先（Upstash Redis）が無いため保存できません。「設定状況」で保存先をつないでください。' }, 503)
  let b
  try { b = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  if (!b || b.action !== 'save') return json({ ok: false, message: '知らない操作です。' }, 400)
  const email = normEmail(b.email)
  if (!EMAIL_RE.test(email) || email.length > 120) return json({ ok: false, message: 'メールアドレスが無いお客様には、メモを残せません。' }, 400)
  const [raw] = await pipeline(cfg, [['HGET', KEY, email]])
  let prev = null
  try { prev = raw ? JSON.parse(raw) : null } catch (_) {}
  const r = cleanPerson(Object.assign({}, b, { email }), prev)
  if (!r.ok) return json(r, 400)
  const p = r.person
  if (!p.note && !p.tags.length && !p.followUpAt) {
    await pipeline(cfg, [['HDEL', KEY, email]])
    return json({ ok: true, person: null, message: 'メモ・タグ・次に連絡する日を消しました。' })
  }
  if (!prev) {
    const [n] = await pipeline(cfg, [['HLEN', KEY]])
    if (Number(n) >= CAPS.people) return json({ ok: false, message: `メモを残せる人数（${CAPS.people}人）に達しました。使わなくなった方のメモを消してください。` }, 400)
  }
  p.updatedAt = new Date().toISOString()
  await pipeline(cfg, [['HSET', KEY, email, JSON.stringify(p)]])
  return json({ ok: true, person: p, message: '保存しました。' })
}
