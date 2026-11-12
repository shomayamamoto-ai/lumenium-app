export const config = { runtime: 'edge' }

// 「人間らしい文章」を書く・直す。
//
// 書き方の決まりと点検は src/lib/rhythm.js（管理画面と同じもの）。ここは、
// その決まりを AI に渡して書いてもらい、書けたものを同じ点検にかけて返すだけです。
//
//   POST { mode:'write', material, purpose, length }  … その場の材料から書く
//   POST { mode:'rewrite', text, purpose }              … 今ある文章を、事実は変えずに書き直す
//   POST { mode:'fix', text, purpose }                  … 点検で見つかったところだけを直す
//
// 返すのは案だけです（{ ok, text, check }）。どこにも保存せず、送りもしません。
// 使うかどうか、どこに貼るかは人が決めます。
//
// 1回の呼び出しで書き直しを繰り返さないのは、待ち時間の上限（edge は約25秒）に
// 収めるためです。点検で引っかかったら、画面の「指摘のところを直す」で
// もう一度だけ送ってもらいます（mode:'fix'）。

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import { BRAND } from './_brand.js'
import { createWithFallback } from './_ai-create.js'
import { rulesText, analyze, issuesText } from '../src/lib/rhythm.js'

const MODEL = 'claude-opus-5-5'
const TIMEOUT_MS = 23000
const MAX_IN = 4000

/** 何のための文章か。長さと形の目安だけを足します（声の決まりは共通）。 */
export const PURPOSES = {
  blog: { label: 'ブログ記事', note: '見出しは付けない。段落は空行で分ける。' },
  sns: { label: 'SNSの投稿', note: '改行を使ってよい。ハッシュタグ・絵文字は付けない（付けるのは人が決める）。' },
  news: { label: 'お知らせ', note: '日付・場所・何が変わるかは、渡されていればはっきり書く。そこだけは迷わせない。' },
  story: { label: 'エッセイ・語り', note: '一人の人が考えながら書いている文。' },
  free: { label: '指定なし', note: '' },
}
export const LENGTHS = { short: [150, 250], medium: [400, 600], long: [900, 1300] }

export function buildSystem() {
  return [
    `あなたは ${BRAND.name} のウェブサイト（${BRAND.host}）や発信に使う日本語の文章を書く書き手です。`,
    '機械が書いたように読まれる文章（解説の声、そろった文末、平らな長さ、宣言から始まる構成、最後で全部まとめる締め）を避け、',
    'その場にいて考えている一人の人の文章を書きます。',
    '',
    '書き方の決まり。',
    rulesText(),
    '',
    '守ること。',
    '・返すのは本文だけ。題名、前置き、説明、「案1」、かぎかっこでの囲み、``` は付けない。',
    '・渡されていない事実（金額・実績・社名・人数・日付・お客様の声）を作らない。いちばん大事です。',
    '・決まりの名前（観察・逡巡・断定・緊張 など）を本文に書かない。決まりは使うもので、言うものではない。',
    '・**太字** などの印は、元の文章にあるときだけ残す。新しく付けない。',
  ].join('\n')
}

/** AI への依頼文。mode ごとに中身が変わります（テストが見ます）。 */
export function buildPrompt(b) {
  const purpose = PURPOSES[b.purpose] || PURPOSES.free
  const lines = [`用途: ${purpose.label}${purpose.note ? `（${purpose.note}）` : ''}`]
  if (b.mode === 'write') {
    const [lo, hi] = LENGTHS[b.length] || LENGTHS.medium
    lines.push(`長さ: ${lo}〜${hi}字くらい`)
    if (b.voice) lines.push(`書いている人: ${b.voice}`)
    lines.push('', 'その場の材料（ここに書いてあることだけを使ってください）:', b.material)
  } else if (b.mode === 'fix') {
    lines.push('', '次の文章を、下の「点検で見つかったこと」だけを直してください。', '直さなくてよい所はそのまま残すこと。事実・固有名詞・数字は変えないこと。長さは元の±2割まで。',
      '', '点検で見つかったこと:', b.issues || '（なし。読みにくい所だけを最小限に）', '', '元の文章:', b.text)
  } else {
    lines.push('', '次の文章を、書き方の決まりに沿って書き直してください。', '書いてある事実・固有名詞・数字は変えず、足さないこと。長さは元の±3割まで。', '', '元の文章:', b.text)
  }
  return lines.join('\n')
}

function clean(s) {
  return String(s || '').trim()
    .replace(/^```[a-z]*\n?|```$/g, '')
    .replace(/^(案|本文)[:：]\s*/, '')
    .replace(/^[「『]([\s\S]*)[」』]$/, (m, inner) => (/[「『」』]/.test(inner) ? m : inner))
    .trim()
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body
  try { body = await req.json() } catch { return json({ ok: false, message: '内容を読み取れませんでした。' }, 400) }
  body = body || {}

  const mode = ['write', 'rewrite', 'fix'].includes(body.mode) ? body.mode : ''
  if (!mode) return json({ ok: false, message: '書く・書き直す・直す のどれかを選んでください。' }, 400)
  const material = String(body.material || '').trim()
  const text = String(body.text || '').trim()
  const src = mode === 'write' ? material : text
  if (!src) return json({ ok: false, message: mode === 'write' ? 'その場の材料を書いてください。' : '直す文章がありません。' }, 400)
  if (src.length > MAX_IN) return json({ ok: false, message: `長すぎます（${src.length}字）。${MAX_IN}字までにしてください。` }, 400)

  const before = mode === 'write' ? null : analyze(text)
  const key = await apiKey(req)
  if (!key) return json({ ...NO_AI, check: before }, 503)

  const guard = await spendGuard('human-write', 80)
  if (guard) return guard

  const prompt = buildPrompt({
    mode,
    material,
    text,
    purpose: String(body.purpose || ''),
    length: String(body.length || ''),
    voice: String(body.voice || '').slice(0, 80),
    issues: mode === 'fix' ? issuesText(before) : '',
  })

  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  let out
  try {
    out = await createWithFallback(client, {
      model: MODEL,
      max_tokens: mode === 'write' && body.length === 'long' ? 3000 : 1800,
      system: buildSystem(),
      messages: [{ role: 'user', content: prompt }],
    }, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const m = String((e && e.message) || e)
    return json({ ok: false, message: /abort|timeout/i.test(m) ? '時間内に返ってきませんでした。短めにして、もう一度お試しください。' : `書けませんでした（${m.slice(0, 120)}）` }, 502)
  }
  const got = clean((out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''))
  if (!got) return json({ ok: false, message: '結果が空でした。もう一度お試しください。' }, 502)

  return json({ ok: true, mode, text: got, check: analyze(got), before })
}
