export const config = { runtime: 'edge' }

// 口コミを書きやすくするページ（/review.html）の窓口。お客様が使うので、管理キーは要りません。
//
//   GET                              -> { ok, on, shop, intro, link, services, aspects, levels, overall, styles }
//   POST { action:'draft', answers, seed } -> { ok, text, by:'ai'|'rule' }  下書き（保存しません）
//   POST { action:'event', kind }    -> 数えるだけ（open: 開いた / google: Google の画面を開いた）
//
// 決まりは api/_review-assist.js。ここでは、
//   ・設定で「使う」にしたときだけ動かす
//   ・1人が続けて押しすぎないようにする（IP ごと）。AI の回数には1日の上限
//   ・AI の下書きが点検（作り話・誘導）を通らなければ、答えをそのまま文にした下書きを返す
// 答えも下書きも、どこにも保存しません。残すのは、週ごとの数（開いた・下書き・Google を開いた）だけです。

import Anthropic from '@anthropic-ai/sdk'
import { json, apiKey, spendGuard } from './_admin-auth.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { hit } from './_ratelimit.js'
import { KV } from './_brand.js'
import { BRAND } from './_aio-catalog.js'
import { createWithFallback } from './_ai-create.js'
import { readPrefs, readMeta, linkFor, RK } from './_reviews.js'
import {
  LEVELS, OVERALL, STYLES, normalizeAnswers, enough, composeDraft, systemText, promptText, checkDraft, cleanDraft, weekOf,
} from './_review-assist.js'

const MODEL = 'claude-haiku-5-5'
const TIMEOUT_MS = 15000
const DAILY_AI = 200

async function count(cfg, kind) {
  if (!cfg) return
  const key = RK.assist(weekOf())
  try { await pipeline(cfg, [['HINCRBY', key, kind, 1], ['EXPIRE', key, 800 * 24 * 3600, 'NX']]) } catch (_) { /* 数えられなくても、画面は止めません */ }
}

async function load() {
  const cfg = storeConfig()
  const prefs = await readPrefs(cfg)
  const a = prefs.assist
  let link = ''
  if (a.on && cfg) { try { link = linkFor(prefs, await readMeta(cfg)) } catch (_) {} }
  return { cfg, prefs, a, link }
}

export async function GET() {
  const { prefs, a, link } = await load()
  if (!a.on) return json({ ok: true, on: false })
  return json({
    ok: true, on: true, shop: prefs.shopName, intro: a.intro, link,
    services: a.services, aspects: a.aspects, levels: LEVELS, overall: OVERALL, styles: STYLES,
  })
}

export async function POST(req) {
  let body
  try { body = await req.json() } catch { return json({ ok: false, message: '内容を読み取れませんでした。' }, 400) }
  body = body || {}
  const { cfg, a } = await load()
  if (!a.on) return json({ ok: false, message: 'このページは、いま使えません。' }, 404)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  if (body.action === 'event') {
    const kind = body.kind === 'google' ? 'google' : body.kind === 'open' ? 'open' : ''
    if (!kind) return json({ ok: false }, 400)
    const rl = await hit(`${KV}rev:as:ev:${ip}`, 12, 600)
    if (!rl.limited) await count(cfg, kind)
    return json({ ok: true })
  }

  if (body.action !== 'draft') return json({ ok: false, message: 'draft か event を指定してください。' }, 400)

  const ans = normalizeAnswers(body.answers, a)
  if (!enough(ans)) return json({ ok: false, message: '答えを1つ以上選ぶか、ひとことを書いてください。' }, 400)
  const seed = Math.abs(Math.floor(Number(body.seed) || 0)) % 100000

  const rl = await hit(`${KV}rev:as:rl:${ip}`, 6, 600)
  if (rl.limited) return json({ ok: false, message: '続けて作りすぎています。少しおいてからお試しください。' }, 429, { 'retry-after': String(rl.retryAfter) })

  // 答えをそのまま文にした下書き。AI が使えないとき・点検を通らないときは、これを返します。
  const plain = composeDraft(ans, seed)
  let text = plain
  let by = 'rule'

  const key = await apiKey(req)
  if (key && !(await spendGuard('review-assist', DAILY_AI))) {
    try {
      const client = new Anthropic({ apiKey: key, maxRetries: 0 })
      const out = await createWithFallback(client, {
        model: MODEL, max_tokens: 500, system: systemText(),
        messages: [{ role: 'user', content: promptText(ans) }],
      }, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      const got = cleanDraft((out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''))
      if (out.stop_reason !== 'refusal' && checkDraft(got, ans, a, BRAND).ok) { text = got; by = 'ai' }
    } catch (_) { /* AI が返らなくても、答えから作った下書きがあります */ }
  }

  await count(cfg, 'draft')
  return json({ ok: true, text, by })
}
