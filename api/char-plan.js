export const config = { runtime: 'edge' }

// キャラクター工房。アニメ調のキャラクターを「何枚描いても同じ人」に見せるための
// 設定資料（CHARACTER DESIGN → REFERENCE SHEET → FINAL ARTWORK）を Claude が作ります。
//
//   POST { action:'design', brief }  → 設定資料（見た目の決まり・配色・表情・小物・
//                                       画像生成AIへの指示文：三面図・表情集・小物・配色）
//   POST { action:'scenes', design, scenes:[…], layout } → 場面ごとの指示文（決まりを全部入れて）
//   POST { action:'check', design, images:[{ name, data(JPEG base64) }] }
//                                    → 描いた絵が設定資料どおりか（髪・目・服・小物・色）を1枚ずつ点検
//
// 絵そのものは描きません（描くのは画像生成AI）。返すのは、そのAIに渡す指示文と点検の結果です。
// 返事は長いので、受け取った端から流します（api/cm-plan.js と同じやり方。失敗は \u0000 のあとに理由）。

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'

const MODEL = 'claude-opus-5-5'
const ERR = '\n\u0000'
const str = { type: 'string' }
const strs = { type: 'array', items: str }
const obj = (properties) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })

export const DESIGN_SCHEMA = obj({
  name: str,
  summary: str,
  appearance: obj({ face: str, hair: str, eyes: str, body: str, outfit: str, shoes: str }),
  accessories: { type: 'array', items: obj({ name: str, detail: str }) },
  palette: { type: 'array', items: obj({ name: str, hex: str, where: str }) },
  expressions: { type: 'array', items: obj({ label: str, detail: str }) },
  must_keep: strs,
  fixed_prompt_en: str,
  negative_en: str,
  sheets: { type: 'array', items: obj({ kind: { type: 'string', enum: ['turnaround', 'expressions', 'accessories', 'palette', 'full'] }, title: str, prompt_en: str }) },
})
export const SCENES_SCHEMA = obj({
  scenes: { type: 'array', items: obj({ title: str, prompt_en: str, note: str }) },
  panel_prompt_en: str,
})
export const CHECK_SCHEMA = obj({
  images: { type: 'array', items: obj({ name: str, score: { type: 'integer' }, matches: strs, differences: strs, fix_en: str }) },
  overall: str,
})

const STYLES = { anime: 'アニメ塗り（セル画風・はっきりした線）', soft: '柔らかい厚塗り（光の表現が多い）', water: '水彩風', chibi: 'ちびキャラ（2〜3頭身）', manga: 'モノクロの漫画風' }

export function designSystem() {
  return [
    'あなたはアニメ・イラストのキャラクターデザイナーです。画像生成AIで何枚描いても同じキャラクターに見えるように、設定資料を作ります。',
    '',
    '守ること。',
    '・見た目は、描き手（画像生成AI）が迷わないほど具体的に。髪は色・長さ・前髪の形・はね方、目は色・形・まつ毛、服は色・素材・形・柄の位置まで。',
    '・palette は 5〜8 色。hex は #RRGGBB。where はどこに使う色か（髪・目・上着 など）。',
    '・expressions は 6 個（通常・笑顔・怒り・驚き・照れ・悲しみ など、そのキャラらしい言い方で）。',
    '・must_keep は、絵が変わっても絶対に崩してはいけない特徴（3〜6個。例: 左耳だけのイヤリング、前髪の赤いメッシュ）。',
    '・fixed_prompt_en は、どの絵の指示文にもそのまま入れる英語の固定の描写（見た目・服・小物・絵柄。1段落）。negative_en は避けるもの。',
    '・sheets は REFERENCE SHEET を作るための画像生成AI向けの英語の指示文。turnaround（正面・横・後ろの三面図、白背景）、expressions（表情集）、accessories（小物の拡大図）、palette（配色見本）、full（決めポーズの全身）を1つずつ。どれにも fixed_prompt_en の内容を含める。',
    '・実在の人物・既存の作品のキャラクターに似せない。日本語の欄は日本語、_en の欄は英語。',
  ].join('\n')
}

export function designPrompt(b) {
  return [
    `名前（仮でも可）: ${b.name || '（おまかせ）'}`,
    `年齢・性別など: ${b.age || '（おまかせ）'}`,
    `性格: ${b.personality || '（おまかせ）'}`,
    `どこで使うか・世界観: ${b.world || '（おまかせ）'}`,
    `好きな色・雰囲気: ${b.colors || '（おまかせ）'}`,
    `絵柄: ${STYLES[b.style] || STYLES.anime}`,
    b.notes ? `ほかの希望: ${b.notes}` : '',
  ].filter(Boolean).join('\n')
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

const clip = (v, n) => String(v == null ? '' : v).slice(0, n)

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let b
  try { b = await req.json() } catch { return json({ ok: false, message: '内容を読み取れませんでした。' }, 400) }
  b = b || {}
  let params
  if (b.action === 'design') {
    const br = b.brief || {}
    const brief = { name: clip(br.name, 40), age: clip(br.age, 80), personality: clip(br.personality, 200), world: clip(br.world, 200), colors: clip(br.colors, 120), style: clip(br.style, 20), notes: clip(br.notes, 400) }
    if (!Object.values(brief).some((v) => v && v !== 'anime')) return json({ ok: false, message: 'キャラクターの手がかりを1つ以上書いてください。' }, 400)
    params = { system: designSystem(), messages: [{ role: 'user', content: designPrompt(brief) }], output_config: { effort: 'medium', format: { type: 'json_schema', schema: DESIGN_SCHEMA } }, max_tokens: 6000 }
  } else if (b.action === 'scenes') {
    const scenes = (Array.isArray(b.scenes) ? b.scenes : []).map((s) => clip(s, 200).trim()).filter(Boolean).slice(0, 8)
    if (!scenes.length) return json({ ok: false, message: '描きたい場面を1つ以上書いてください。' }, 400)
    params = {
      system: designSystem() + '\n\n今回は、設定資料はできています。渡す場面ごとに、画像生成AI向けの英語の指示文を作ってください。どれにも設定資料の fixed_prompt_en を先頭にそのまま入れ、そのあとに構図・ポーズ・表情・背景・光・画面の形を書く。note は日本語で、描くときに気をつけること。panel_prompt_en は全場面を1枚にまとめた複数コマのイラスト（' + (b.layout === '4' ? '縦4コマ' : '2×2のコマ割り') + '）の指示文。',
      messages: [{ role: 'user', content: `設定資料:\n${JSON.stringify(b.design || {}).slice(0, 12000)}\n\n画面の形: ${clip(b.aspect, 10) || '1:1'}\n\n場面:\n${scenes.map((s, i) => `${i + 1}. ${s}`).join('\n')}` }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCENES_SCHEMA } },
      max_tokens: 5000,
    }
  } else if (b.action === 'check') {
    const images = (Array.isArray(b.images) ? b.images : []).slice(0, 6)
      .filter((f) => f && typeof f.data === 'string' && f.data.length < 600000 && /^[A-Za-z0-9+/=]+$/.test(f.data))
    if (!images.length) return json({ ok: false, message: '点検する絵がありません。' }, 400)
    const content = [{ type: 'text', text: `設定資料:\n${JSON.stringify(b.design || {}).slice(0, 12000)}\n\n次の絵を1枚ずつ、設定資料どおりかを点検してください。` }]
    for (const f of images) {
      content.push({ type: 'text', text: `絵: ${clip(f.name, 60)}` })
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } })
    }
    params = {
      system: 'あなたはアニメのキャラクターデザインの監修者です。設定資料と描かれた絵を比べ、同じキャラクターに見えるかを点検します。髪（色・長さ・前髪）、目の色、顔立ち、服（色・形・柄）、小物、配色、must_keep の特徴を順に見て、合っている所（matches）と違う所（differences）を日本語で短く書く。score は 0〜100（設定資料どおりなら 100）。fix_en は、描き直すときに画像生成AIへの指示文に足すとよい英語の一文。overall は全体の所見を日本語で。',
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: CHECK_SCHEMA } },
      max_tokens: 4000,
    }
  } else return json({ ok: false, message: 'design・scenes・check のどれかを指定してください。' }, 400)

  const key = await apiKey(req)
  if (!key) return json(NO_AI, 503)
  const guard = await spendGuard('char-plan', 40)
  if (guard) return guard

  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  return streamFrom(async (write) => {
    const stream = client.messages.stream({ model: MODEL, ...params }, { signal: AbortSignal.timeout(240000) })
    stream.on('text', (t) => write(t))
    const fin = await stream.finalMessage()
    if (fin.stop_reason === 'refusal') write(ERR + 'この内容では作れませんでした。言い方を変えてお試しください。')
    else if (fin.stop_reason === 'max_tokens') write(ERR + '長くなりすぎて途中で切れました。もう一度お試しください。')
  })
}
