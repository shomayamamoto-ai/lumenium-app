// 自動改善の「下書き」をAIに書いてもらう部分。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// ルールが出した提案のうち、文章が要るもの（実験の案・SNSの投稿・
// お知らせ）だけを、1日1回まとめて1回の呼び出しで頼みます。
//   ・形は JSON で指定して受け取ります（structured output）。
//   ・返ってきた案は、そのまま使いません。_auto-core.js の textProblem で
//     金額・連絡先・言い切り・長さを確かめ、通らないものは捨てます。
//   ・お金の上限: 1日の回数（spendGuard）と、月の目安（設定の monthlyYen）。
//     どちらかを超えたら呼びません。キーが無いときも呼びません（提案は
//     ルールだけで出ます）。

import Anthropic from '@anthropic-ai/sdk'
import { BRAND } from './_brand.js'
import { recordUsage, monthUsage } from './_ai-pricing.js'
import { textProblem, EXP_KEYS } from './_auto-core.js'
import { createWithFallback } from './_ai-create.js'

export const MODEL = 'claude-opus-5-5'
export const DAILY_CALLS = 3
export const USAGE_KIND = 'auto'

/** 下書きが要る提案。すでに下書きがあるものは頼みません。 */
export function needsDraft(p) {
  if (!p || p.status !== 'open' || p.draft) return false
  return p.kind === 'experiment' || p.kind === 'sns' || p.kind === 'news'
}

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['copy', 'sns', 'news'],
  properties: {
    copy: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'text', 'why'], properties: { id: { type: 'string' }, text: { type: 'string' }, why: { type: 'string' } } } },
    sns: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } } } },
    news: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'body'], properties: { id: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } } } },
  },
}

export function promptFor(list) {
  const lines = list.map((p) => {
    const a = p.action || {}
    if (p.kind === 'experiment') {
      return `- id=${p.id} 種類=copy 対象=${(EXP_KEYS[a.key] || {}).label || a.key}\n  いまの文章（A）: ${JSON.stringify(a.a)}\n  根拠: ${p.evidence.map((e) => e.text).join(' / ')}\n  ねらい: ${p.why || ''}`
    }
    if (p.kind === 'sns') return `- id=${p.id} 種類=sns 柱=${a.pillarName || '（指定なし）'}\n  根拠: ${p.evidence.map((e) => e.text).join(' / ')}`
    return `- id=${p.id} 種類=news 書くこと=${(a.topics || []).join('、')}`
  })
  return [
    `あなたは ${BRAND.name}（${BRAND.description || '小さな会社'}${BRAND.area ? '・' + BRAND.area : ''}）のWebサイトの文章を手伝います。`,
    '下の提案ごとに下書きを1つずつ書いてください。読むのはITに詳しくない人です。やさしい日本語で、誇張しないでください。',
    '',
    '決まり（必ず守る）:',
    '- copy: いまの文章（A）と比べるための別案（B）を1つ。長さはAの±15%以内、改行の数はA以下。',
    '- copy では、金額・料金・「無料」・電話番号・メール・URL・「必ず」「保証」「最安」「No.1」などの言い切りを、Aに無いなら書かない。事実（何をしている会社か）は変えない。',
    '- copy の why は、なぜこの言い方を試すのかを40字以内で。',
    '- sns: 140字以内の投稿文を1つ。宣伝より、読んだ人の役に立つ話を。ハッシュタグは2つまで。架空の数字やお客様の声は書かない。',
    '- news: お知らせの下書き。title は30字以内、body は400字以内。分からない事実（住所・設立年など）は「（ここに◯◯を書く）」と空欄にし、作らない。',
    '- 当てはまる提案が無い種類は、空の配列にする。',
    '',
    '提案:',
    ...lines,
  ].join('\n')
}

/** AIの答えを、提案ごとの下書きにします。決まりに合わない案は捨てます。 */
export function draftsFrom(out, list, now = Date.now()) {
  const by = Object.fromEntries(list.map((p) => [p.id, p]))
  const drafts = {}
  for (const c of (out && out.copy) || []) {
    const p = by[c.id]
    if (!p || p.kind !== 'experiment') continue
    const text = String(c.text || '').replace(/\r/g, '').trim()
    if (textProblem(p.action.a, text)) continue
    drafts[p.id] = { kind: 'copy', text, why: String(c.why || '').slice(0, 80), at: new Date(now).toISOString(), by: 'ai' }
  }
  for (const s of (out && out.sns) || []) {
    const p = by[s.id]
    if (!p || p.kind !== 'sns') continue
    const text = String(s.text || '').trim().slice(0, 500)
    if (text) drafts[p.id] = { kind: 'sns', text, at: new Date(now).toISOString(), by: 'ai' }
  }
  for (const n of (out && out.news) || []) {
    const p = by[n.id]
    if (!p || p.kind !== 'news') continue
    const title = String(n.title || '').trim().slice(0, 60)
    const body = String(n.body || '').trim().slice(0, 1200)
    if (title && body) drafts[p.id] = { kind: 'news', title, body, at: new Date(now).toISOString(), by: 'ai' }
  }
  return drafts
}

/** 1回の呼び出しで、下書きをまとめて頼みます。
 *  { ok, drafts, reason } — 呼ばなかった・失敗したときは reason に日本語で。 */
export async function writeDrafts(list, { key, monthlyYen, guard }) {
  const todo = list.filter(needsDraft).slice(0, 6)
  if (!todo.length) return { ok: true, drafts: {}, reason: '下書きが要る提案はありませんでした。' }
  if (!key) return { ok: false, drafts: {}, reason: 'AIのキーが無いため、下書きは作っていません（提案はルールだけで出ています）。' }
  const month = await monthUsage(USAGE_KIND, MODEL)
  if (month.recorded && month.yen >= monthlyYen) return { ok: false, drafts: {}, reason: `今月のAIの利用額が上限の目安（約${monthlyYen}円）に達したため、下書きは作っていません。` }
  if (guard && (await guard())) return { ok: false, drafts: {}, reason: '本日のAIの回数の上限に達しました。' }
  try {
    const client = new Anthropic({ apiKey: key })
    const res = await createWithFallback(client, {
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: promptFor(todo) }],
    })
    await recordUsage(USAGE_KIND, res.usage)
    if (res.stop_reason === 'refusal') return { ok: false, drafts: {}, reason: 'AIが下書きを断りました。' }
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
    let out = null
    try { out = JSON.parse(text) } catch (_) { return { ok: false, drafts: {}, reason: 'AIの答えを読み取れませんでした。' } }
    return { ok: true, drafts: draftsFrom(out, todo) }
  } catch (e) {
    return { ok: false, drafts: {}, reason: 'AIに下書きを頼めませんでした（' + String((e && e.message) || e).slice(0, 80) + '）。' }
  }
}
