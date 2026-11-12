export const config = { runtime: 'edge' }

// CM制作キット。人物・声・BGM を AI で作り、After Effects で編集する CM の
// 「設計図」と「仕上がりの点検」を Claude が受け持ちます。
//
//   POST { action:'plan', product, target, message, tone, seconds, aspect }
//     → 構成案（カットごとの秒数・画面・字幕・ナレーション・動画生成AIへの指示文、
//        人物の設定（全カットで同じ人に見せるため）、声とBGMの指示文、確かめること）
//   POST { action:'check', plan, frames:[{ no, t, data(JPEG base64) }], facts }
//     → 書き出した動画の各カットの1コマを見て、構成案どおりか・字幕が読めるか・
//        人物が同じ人に見えるかを点検した結果
//
// 動画・声・音楽そのものは作りません（作るのは、それぞれの生成サービス）。
// ここが返すのは、そのサービスに渡す指示文と、組み立て・点検の手順だけです。
//
// 返事は長くなるので、受け取った端から画面へ流します（edge の待ち時間の上限に
// 掛からないように）。流し終わったら、画面の側で JSON として読みます。
// 途中で失敗したときは、最後に "\n\u0000" に続けて理由を書きます。

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import { BRAND } from './_brand.js'

const MODEL = 'claude-opus-5-5'
const ERR = '\n\u0000'

const str = { type: 'string' }
const num = { type: 'number' }
const obj = (properties) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })

export const PLAN_SCHEMA = obj({
  concept: str,
  tagline: str,
  person: obj({ description: str, prompt_en: str }),
  shots: {
    type: 'array',
    items: obj({ no: { type: 'integer' }, start: num, end: num, scene: str, camera: str, onscreen_text: str, narration: str, video_prompt_en: str, image_prompt_en: str }),
  },
  voice: obj({ direction: str, prompt_en: str }),
  bgm: obj({ direction: str, bpm: { type: 'integer' }, prompt_en: str }),
  checks: { type: 'array', items: str },
})

export const CHECK_SCHEMA = obj({
  verdict: { type: 'string', enum: ['ok', 'fix', 'redo'] },
  overall: str,
  shots: { type: 'array', items: obj({ no: { type: 'integer' }, ok: { type: 'boolean' }, comment: str }) },
  fixes: { type: 'array', items: str },
})

export const SECONDS = [15, 17, 30]
export const ASPECTS = ['16:9', '9:16', '1:1']

export function planPrompt(b) {
  const sec = SECONDS.includes(+b.seconds) ? +b.seconds : 17
  return [
    `商品・サービス: ${b.product}`,
    b.target ? `届けたい相手: ${b.target}` : '',
    b.message ? `いちばん伝えたい一言: ${b.message}` : '',
    b.tone ? `雰囲気: ${b.tone}` : '',
    `長さ: ちょうど${sec}秒`,
    `画面の形: ${ASPECTS.includes(b.aspect) ? b.aspect : '16:9'}`,
  ].filter(Boolean).join('\n')
}

export function planSystem() {
  return [
    `あなたは ${BRAND.name} の CM ディレクターです。人物の映像・ナレーションの声・BGM は生成AIで作り、編集は After Effects で行う前提で、短い CM の構成案を作ります。`,
    '',
    '守ること。',
    '・カット（shots）は 4〜8 個。start は 0 から始め、各カットの end は次のカットの start と同じにし、最後の end は指定の長さちょうどにする（秒、小数第1位まで）。',
    '・1カットは 1.2 秒以上。最後のカットは商品名とひとことを見せる締めにする。',
    '・人物（person）は全カットで同じ人に見えるよう、年齢・髪型・服装・体格・顔の特徴を具体的に決め、prompt_en はその固定の描写を英語で。各カットの video_prompt_en / image_prompt_en には、その固定の描写をそのまま含める。',
    '・video_prompt_en は動画生成AI向けの英語の指示文（被写体・動き・カメラ・光・レンズ・雰囲気。1〜3文）。image_prompt_en は、そのカットの最初の1コマを画像生成AIで作るときの英語の指示文。どちらにも画面の形（縦横比）を書く。字幕や文字は映像に入れない（no text, no captions）と書く。',
    '・onscreen_text は画面に出す日本語の字幕（短く。無ければ空）。narration はそのカットで読む日本語のナレーション（1秒に約6文字まで。無ければ空）。',
    '・voice.prompt_en は音声生成AI向けの声の指示（性別・年代・声質・話す速さ・感情）。bgm.prompt_en は音楽生成AI向けの指示（ジャンル・楽器・BPM・展開。指定の秒数で終わること、何秒目に盛り上がるか）。',
    '・checks は、編集を終えたあとに確かめること（3〜6個。具体的に）。',
    '・渡されていない事実（価格・実績・受賞・お客様の声）を作らない。実在の人物・有名人・他社の商標に似せない。',
    '・日本語の欄は日本語で、_en の欄は英語で書く。',
  ].join('\n')
}

export function checkSystem() {
  return [
    `あなたは ${BRAND.name} の CM の仕上がりを確かめる編集責任者です。`,
    '渡されるのは、構成案と、書き出した動画から各カットの途中を1コマずつ切り出した画像、機械で測った事実（長さ・縦横・暗いコマ・似すぎたコマ）です。',
    '各カットについて、構成案の場面になっているか、人物が全カットで同じ人に見えるか、字幕が読める大きさと位置か（端に寄りすぎていないか、背景に埋もれていないか）、映像に意図しない文字や崩れ（手指・顔・物の形）が無いかを見て、日本語で短く書く。',
    'verdict は、そのまま出せるなら ok、直せば出せるなら fix、作り直しが必要なら redo。fixes は After Effects や生成のやり直しで何をすればよいかを、具体的に（どのカットで、何を）。',
    '1コマしか見ていないので、動きや音については断定しない。',
  ].join('\n')
}

function streamFrom(run) {
  const enc = new TextEncoder()
  return new Response(new ReadableStream({
    async start(ctrl) {
      try { await run((s) => ctrl.enqueue(enc.encode(s))) } catch (e) {
        const m = String((e && e.message) || e)
        ctrl.enqueue(enc.encode(ERR + (/abort|timeout/i.test(m) ? '時間内に終わりませんでした。もう一度お試しください。' : `作れませんでした（${m.slice(0, 160)}）`)))
      }
      ctrl.close()
    },
  }), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let b
  try { b = await req.json() } catch { return json({ ok: false, message: '内容を読み取れませんでした。' }, 400) }
  b = b || {}
  const action = b.action === 'check' ? 'check' : b.action === 'plan' ? 'plan' : ''
  if (!action) return json({ ok: false, message: 'plan か check を指定してください。' }, 400)

  let params
  if (action === 'plan') {
    const product = String(b.product || '').trim().slice(0, 200)
    if (!product) return json({ ok: false, message: '何のCMかを書いてください。' }, 400)
    params = {
      system: planSystem(),
      messages: [{ role: 'user', content: planPrompt({ ...b, product, target: String(b.target || '').slice(0, 200), message: String(b.message || '').slice(0, 200), tone: String(b.tone || '').slice(0, 120) }) }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      max_tokens: 6000,
    }
  } else {
    const frames = (Array.isArray(b.frames) ? b.frames : []).slice(0, 10)
      .filter((f) => f && typeof f.data === 'string' && f.data.length < 400000 && /^[A-Za-z0-9+/=]+$/.test(f.data))
    if (!frames.length) return json({ ok: false, message: '動画から切り出したコマがありません。' }, 400)
    const plan = JSON.stringify(b.plan || {}).slice(0, 12000)
    const content = [{ type: 'text', text: `構成案:\n${plan}\n\n機械で測った事実:\n${String(b.facts || '').slice(0, 2000)}` }]
    for (const f of frames) {
      content.push({ type: 'text', text: `カット${f.no}（${Number(f.t).toFixed(1)}秒のコマ）` })
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } })
    }
    params = {
      system: checkSystem(),
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: CHECK_SCHEMA } },
      max_tokens: 3000,
    }
  }

  const key = await apiKey(req)
  if (!key) return json(NO_AI, 503)
  const guard = await spendGuard('cm-plan', 40)
  if (guard) return guard

  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  return streamFrom(async (write) => {
    const stream = client.messages.stream({ model: MODEL, ...params }, { signal: AbortSignal.timeout(240000) })
    stream.on('text', (t) => write(t))
    const fin = await stream.finalMessage()
    if (fin.stop_reason === 'refusal') write(ERR + 'この内容では作れませんでした。言い方を変えてお試しください。')
    else if (fin.stop_reason === 'max_tokens') write(ERR + '長くなりすぎて途中で切れました。カットを減らすか、もう一度お試しください。')
  })
}
