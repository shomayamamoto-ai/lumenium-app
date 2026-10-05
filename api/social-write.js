export const config = { runtime: 'edge' }

// SNS投稿の下書きを、投稿先ごとに AI に書いてもらいます。
//
// 渡すのは「何について書くか」（メモ、またはお知らせ1件）。返すのは投稿先
// ごとの案だけで、送りはしません。案は画面の「SNSごとの調整」に入り、
// 人が読んで直してから送ります。SNSは出したら取り消せないので、AIの文章が
// そのまま出ていく作りにはしません。
//
// 守らせること。
//   ・文字数（X は日本語1文字=2で数えるので、日本語なら120字前後まで）
//   ・ハッシュタグは X・Instagram・Threads だけ、0〜3個（並べすぎると
//     宣伝くさくなり、読まれなくなります）
//   ・渡していない事実（金額・実績・日付）を作らない
//
// 返事は JSON の形を指定して受け取ります（structured outputs）。文章の中に
// JSON を探しに行く作りは、たまに壊れます。

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import { BRAND } from './_brand.js'
import { RULES, lengthFor, xLength } from './_social-text.js'
import { createWithFallback } from './_ai-create.js'

const MODEL = 'claude-opus-5-5'
const TIMEOUT_MS = 22000
const MAX_IN = 3000
const TAGGED = ['x', 'instagram', 'threads', 'bluesky']

/* 投稿先ごとの書き方。短い指示にしてあります。長く細かく書くほど、
   どの投稿先の案も同じ型にはまっていきます。 */
const TONE = {
  x: '短く、最初の1文で要点が分かるように。言い切りで、絵文字は0〜1個。',
  facebook: '近所の人に知らせるような、ていねいで温かい文。3〜6文。何をすればいいか（見る・予約する・問い合わせる）を最後に1文。',
  instagram: '写真に添える言葉として、情景や気持ちが伝わる文。改行を使って読みやすく。URLは押せないので書かず、最後に「詳しくはプロフィールのリンクから」と書く。',
  threads: '会話のように、少しくだけた口調で。2〜4文。',
  linkedin: '仕事の相手に向けた、落ち着いた文。何が変わったか・誰の役に立つかを具体的に。ハッシュタグは付けない。',
  line: '友だち登録してくれたお客様への短いお便り。あいさつ1文、要点、最後にしてほしいこと1文。絵文字は1〜2個まで。',
  gbp: 'Google検索やマップでお店を探している人に向けた、事実中心の文。何を・いつまで・いくらかを先に。地名やサービス名を自然に入れる。電話番号・URL・ハッシュタグは書かない（リンクはボタンで付きます）。',
  bluesky: '会話のように、短く自然な口調で。2〜3文。ハッシュタグは0〜1個。',
}

const SYSTEM = [
  `あなたは ${BRAND.name}${BRAND.kana && BRAND.kana !== BRAND.name ? `（${BRAND.kana}）` : ''} のSNS担当です。会社のサイトは ${BRAND.host} です。`,
  '渡された話題について、指定されたSNSごとに日本語の投稿文を書きます。',
  '',
  '守ること。',
  '渡されていない事実（金額・実績・日付・人数・社名・受賞歴）を書かない。これがいちばん大事です。分からないことは書かずに済ませる。',
  'URLは本文に書かない（リンクは別の欄から自動で付きます）。',
  'hashtags には # を付けない語だけを入れる。X・Instagram・Threads は0〜3個、関係の深いものだけ。それ以外のSNSは空にする。',
  '本文の中にハッシュタグを書かない（hashtags に入れる）。',
  '誇張した言い方（業界No.1、絶対、必ず儲かる など）を使わない。',
].join('\n')

function schema(nets) {
  const one = {
    type: 'object',
    properties: { text: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } },
    required: ['text', 'hashtags'],
    additionalProperties: false,
  }
  return {
    type: 'object',
    properties: { drafts: { type: 'object', properties: Object.fromEntries(nets.map((n) => [n, one])), required: nets, additionalProperties: false } },
    required: ['drafts'],
    additionalProperties: false,
  }
}

/** 投稿先ごとの文字数の目安。リンクとハッシュタグの分を先に引きます。 */
export function budgetFor(net, hasLink) {
  const r = RULES[net]
  if (net === 'x') {
    // 280 からリンク（改行+23）とハッシュタグ3個ぶんの余白を引き、日本語は1字=2。
    const room = 280 - (hasLink ? 24 : 0) - 30
    return Math.floor(room / 2)
  }
  const cap = { facebook: 400, instagram: 400, threads: 300, linkedin: 600, line: 300 }[net] || 300
  return Math.min(cap, r.limit - (hasLink ? 120 : 0))
}

/** 案を、送れる形の本文に組み立てます（ハッシュタグは末尾に）。 */
export function assemble(net, d) {
  const tags = TAGGED.includes(net)
    ? [...new Set((d.hashtags || []).map((t) => String(t).replace(/^[#＃]+/, '').replace(/[\s#＃]+/g, '')).filter(Boolean))].slice(0, 3)
    : []
  const text = String(d.text || '').trim().replace(/\n{3,}/g, '\n\n')
  return tags.length ? `${text}\n\n${tags.map((t) => '#' + t).join(' ')}` : text
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '内容を読み取れませんでした。' }, 400) }

  const topic = String((body && body.topic) || '').trim()
  const src = (body && body.source) || null
  const source = src && typeof src === 'object'
    ? { title: String(src.title || '').slice(0, 200), body: String(src.body || '').slice(0, 2000), date: String(src.date || '').slice(0, 20) }
    : null
  const nets = (Array.isArray(body && body.nets) ? body.nets : []).map(String).filter((n) => RULES[n])
  const hasLink = !!(body && body.link)
  if (!topic && !(source && (source.title || source.body))) {
    return json({ ok: false, message: '何について書くか（メモ、またはお知らせ）を入れてください。' }, 400)
  }
  if (topic.length > MAX_IN) return json({ ok: false, message: `メモが長すぎます（${MAX_IN}字まで）。` }, 400)
  if (!nets.length) return json({ ok: false, message: '投稿先を1つ以上選んでください。' }, 400)

  const key = await apiKey(req)
  if (!key) return json(NO_AI, 503)
  // 書き直し（rewrite）とは別の上限。下書きは1回で6案作るぶん重いので、
  // 片方を使い切ってももう片方は使えるようにしています。
  const guard = await spendGuard('social-write', 60)
  if (guard) return guard

  const ask = [
    source ? `元にするお知らせ:\nタイトル: ${source.title}\n${source.date ? `日付: ${source.date}\n` : ''}本文: ${source.body}` : '',
    topic ? `書きたいこと・メモ:\n${topic}` : '',
    hasLink ? '（リンクは本文の後ろに自動で付きます）' : '',
    '',
    '書くSNSと、それぞれの書き方・文字数の上限:',
    ...nets.map((n) => `- ${n}: ${TONE[n]}（本文は${budgetFor(n, hasLink)}文字以内${n === 'x' ? '。Xは日本語1文字を2と数えるため短めに' : ''}）`),
  ].filter((l) => l !== null).join('\n')

  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  let out
  try {
    out = await createWithFallback(client, {
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(nets) } },
      messages: [{ role: 'user', content: ask }],
    }, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const m = String((e && e.message) || e)
    return json({
      ok: false,
      message: /abort|timeout/i.test(m) ? '時間内に返ってきませんでした。もう一度お試しください。' : `下書きを作れませんでした（${m.slice(0, 120)}）`,
    }, 502)
  }
  if (out.stop_reason === 'refusal') return json({ ok: false, message: 'この内容では下書きを作れませんでした。言い方を変えてお試しください。' }, 422)

  let parsed = null
  try {
    parsed = JSON.parse((out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''))
  } catch (_) {}
  const drafts = parsed && parsed.drafts
  if (!drafts) return json({ ok: false, message: '下書きの形が想定と違いました。もう一度お試しください。' }, 502)

  const result = {}
  for (const n of nets) {
    if (!drafts[n]) continue
    const text = assemble(n, drafts[n])
    // リンクが付いたときの長さで確かめます（X はリンク=23）。
    const sent = hasLink ? `${text}\nhttps://${BRAND.host}/` : text
    const count = n === 'x' ? xLength(sent) : lengthFor(n, sent)
    result[n] = { text, count, limit: RULES[n].limit, over: count > RULES[n].limit }
  }
  return json({
    ok: true,
    drafts: result,
    // Instagram のリンクは押せないので、本文の後ろにも付けない案にします。
    noLink: hasLink && result.instagram ? ['instagram'] : [],
    message: Object.values(result).some((d) => d.over)
      ? '文字数を超えた案があります（赤い数字）。短くしてから送ってください。'
      : '下書きを作りました。各SNSのタブで読んで、直してから送ってください。',
  })
}
