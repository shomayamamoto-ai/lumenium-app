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
  LEVELS, OVERALL, STYLES, normalizeAnswers, enough, composeDraft, systemText, promptText, retryText, checkDraft, cleanDraft, weekOf, tallyFields,
} from './_review-assist.js'

const MODEL = 'claude-haiku-5-5'
const TIMEOUT_MS = 12000
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

/** 下書きを1つ作ります。{ text, by:'ai'|'rule', tried, reasons }
 *
 *  まず、答えをそのまま文にした下書き（作り話が入りようがない）を用意します。AI が使えるときは
 *  AI に頼み、点検（作り話・誘導）を通ったらそちらを返します。通らなければ、理由を添えて
 *  もう一度だけ頼みます。それでも通らないとき・AI が返らないときは、用意した下書きを返します。
 *  reasons は、AI の下書きを外した理由です（お客様の画面には出しません。お店の「見本」で見ます）。 */
export async function makeDraft(req, ans, a, seed) {
  const plain = composeDraft(ans, seed)
  const res = { text: plain, by: 'rule', tried: 0, reasons: [], ai: false }
  const key = await apiKey(req)
  if (!key) { res.reasons.push('AI のキーが無いため、答えをそのまま文にしました。'); return res }
  res.ai = true
  if (await spendGuard('review-assist', DAILY_AI)) { res.reasons.push('今日の AI の上限に達したため、答えをそのまま文にしました。'); return res }
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0 })
    const started = Date.now()
    const messages = [{ role: 'user', content: promptText(ans) }]
    for (let i = 0; i < 2; i++) {
      // 2回目は、残り時間があるときだけ（お客様を待たせすぎないため）。
      if (i === 1 && Date.now() - started > 9000) break
      res.tried++
      const out = await createWithFallback(client, { model: MODEL, max_tokens: 500, system: systemText(), messages }, { signal: AbortSignal.timeout(i ? 9000 : TIMEOUT_MS) })
      if (out.stop_reason === 'refusal') { res.reasons.push('AI が下書きを断りました。'); break }
      const got = cleanDraft((out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''))
      const chk = checkDraft(got, ans, a, BRAND)
      if (chk.ok) { res.text = got; res.by = 'ai'; res.reasons = []; return res }
      res.reasons = chk.reasons
      messages.push({ role: 'assistant', content: got || '（空）' }, { role: 'user', content: retryText(got, chk.reasons) })
    }
  } catch (e) {
    res.reasons.push(`AI が返りませんでした（${String((e && e.message) || e).slice(0, 80)}）。`)
  }
  return res
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

  const { text, by } = await makeDraft(req, ans, a, seed)

  await count(cfg, 'draft')
  // 選ばれた答えの数（項目ごとの よかった・ふつう・いまひとつ）。文もひとことも残しません。
  // 「別の言い回し」で作り直したときは数えません。
  if (body.first && cfg) {
    const key = RK.assist(weekOf())
    try { await pipeline(cfg, tallyFields(ans).map((f) => ['HINCRBY', key, f, 1])) } catch (_) {}
  }
  return json({ ok: true, text, by })
}
