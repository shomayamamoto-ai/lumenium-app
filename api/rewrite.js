export const config = { runtime: 'edge' }

// 文章編集の「AIに書き直してもらう」。
//
// 書き換えたい一文を送ると、指定した向き（短く／やさしく／具体的に）で
// 書き直した案を返します。置き換えはしません——返すのは案だけで、採用
// するかどうかは画面側で人が決めます。書いたものが黙って差し替わるのは、
// 編集画面で一番やってはいけないことです。
//
// 短い1文を1往復するだけなので、ストリーミングはしません。待ち時間より、
// 「押した／返ってきた」が分かることのほうが大事な場面です。

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import { BRAND } from './_brand.js'

const MODEL = 'claude-sonnet-5'
const MAX_IN = 1200
const TIMEOUT_MS = 20000

/** 書き直しの向き。画面のボタンと1対1です。 */
export const WAYS = {
  short: {
    label: '短く',
    note: '言いたいことは変えずに、短くします。',
    rule: '意味を変えずに短くしてください。目安は元の6〜7割の長さです。削るのは言い換えや前置きで、事実（金額・期間・地名・数）は必ず残します。',
  },
  plain: {
    label: 'やさしく',
    note: '専門語を減らし、高校生でも分かる言葉にします。',
    rule: 'カタカナの専門語と業界用語を、ふつうの言葉に置き換えてください。1文を短くし、読む速さが落ちないようにします。長さは元と同じくらいで構いません。',
  },
  concrete: {
    label: '具体的に',
    note: '曖昧な言い方を、数字や固有名詞に置き換えます。',
    rule: '「豊富な実績」「幅広く対応」のような、何とでも読める言い方を具体的にしてください。ただし、渡されていない事実を作ってはいけません。元の文にある事実だけを使い、具体化できない部分は曖昧なまま残すか、言い切らない書き方にしてください。',
  },
  polish: {
    label: '整える',
    note: '意味はそのままに、読みやすく直します。',
    rule: '意味と長さはできるだけ変えず、読点の位置、語順、重複した言い回しだけを直してください。新しい情報を足さないこと。',
  },
  /* 誤字・表記ゆれ。ほかの4つと違い、言い回しは変えません。直したところを
     一つずつ返すので、案を採る前に「何が直ったか」を読めます。このサイトで
     決めた書き方（SNS（文章）の「このサイトの決まり」の表記の統一）は、
     AIに頼らず先にそのまま当てます。 */
  proof: {
    label: '誤字・表記ゆれ',
    note: '誤字・脱字・表記のゆれだけを直します（言い回しは変えません）。',
    rule: [
      '誤字・脱字、変換の間違い、表記のゆれ（同じ言葉の書き方が文中でそろっていない。例: 下さい／ください、全角と半角の数字の混在）、句読点の重複だけを直してください。',
      '言い回し・語順・長さは変えないこと。直すところが無ければ、元の文をそのまま返すこと。',
      '出力は JSON 1つだけにすること（前置きや ``` は付けない）: {"text":"直した全文","changes":[{"from":"元の部分","to":"直した部分","why":"誤字|脱字|表記ゆれ|句読点|変換ミス"}]}',
    ].join('\n'),
    json: true,
  },
}

const boldCount = (t) => (String(t).match(/\*\*/g) || []).length

/** 誤字・表記ゆれの答え（JSON）を読む。読めない・書き換えすぎ・太字の印が
 *  崩れたものは null（案として出しません）。 */
export function parseProof(raw, original) {
  const m = String(raw || '').match(/\{[\s\S]*\}/)
  if (!m) return null
  let o
  try { o = JSON.parse(m[0]) } catch (_) { return null }
  const text = typeof (o && o.text) === 'string' ? o.text.trim() : ''
  if (!text) return null
  // 直すのは文字の間違いだけ。長さが大きく変わったなら、書き直されています。
  if (Math.abs(text.length - original.length) > Math.max(12, original.length * 0.15)) return null
  if (boldCount(text) !== boldCount(original)) return null
  if (text === original) return { text, changes: [] }
  const changes = (Array.isArray(o.changes) ? o.changes : [])
    .filter((c) => c && typeof c.from === 'string' && typeof c.to === 'string' && c.from !== c.to)
    .slice(0, 12)
    .map((c) => ({ from: c.from.slice(0, 40), to: c.to.slice(0, 40), why: String(c.why || '').slice(0, 20) }))
  return { text, changes }
}

/** このサイトで決めた書き方を当てる（AIを使いません）。例外の言葉の中、
 *  すでに直した形の中、URL の中は変えません（notationHits と同じ決まり）。 */
export function applyNotation(text, rules, hitsOf) {
  let out = String(text || '')
  const changes = []
  for (const r of Array.isArray(rules) ? rules : []) {
    if (!r || !r.from || !r.to || r.from === r.to) continue
    const hits = hitsOf(out, r)
    if (!hits.length) continue
    for (let i = hits.length - 1; i >= 0; i--) out = out.slice(0, hits[i]) + r.to + out.slice(hits[i] + r.from.length)
    changes.push({ from: r.from, to: r.to, why: 'このサイトの表記の決まり' + (hits.length > 1 ? `（${hits.length}か所）` : '') })
  }
  return { text: out, changes }
}

const SYSTEM = [
  // 社名は _brand.js から。ここに社名や所在地を書き込むと、同じ仕組みを
  // 別の会社のサイトに載せたとき、その会社の文章が他社の名前で直されます。
  `あなたは ${BRAND.name}${BRAND.kana && BRAND.kana !== BRAND.name ? `（${BRAND.kana}）` : ''} のウェブサイト（${BRAND.host}）の文章を直す編集者です。`,
  '渡されるのは、サイトのどこかに実際に出ている一文または数行です。',
  '',
  '守ること。',
  '書き直した文章だけを返すこと（直し方で返す形を指定したときは、その形で）。前置き、説明、かぎかっこ、「案1」のような見出しは付けない。',
  '元の文に無い事実（金額・実績・社名・年数・人数）を足さない。これがいちばん大事です。',
  '元の改行の数と位置は、意味が壊れない限りそのまま残す。',
  '**で囲まれた部分は太字の指定です。囲みは残したまま、中身だけを直す。',
  '元が英語や英数字だけの短い語（DIGITAL CREATIVE STUDIO など）は、日本語にしない。',
  '元より極端に長くしない。',
].join('\n')

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const key = await apiKey(req)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, message: '内容を読み取れませんでした。' }, 400)
  }

  const text = String((body && body.text) || '').trim()
  const way = WAYS[String((body && body.way) || '')] ? String(body.way) : ''
  if (!text) return json({ ok: false, message: '書き直す文章がありません。' }, 400)
  if (text.length > MAX_IN) {
    return json({ ok: false, message: `長すぎます（${text.length}字）。${MAX_IN}字までにしてください。` }, 400)
  }
  if (!way) return json({ ok: false, message: '書き直し方が選ばれていません。' }, 400)

  // 誤字・表記ゆれは、このサイトの決まりだけならAIのキーが無くても直せます。
  let local = null
  if (way === 'proof') {
    try {
      const [{ readStyle }, { notationHits }] = await Promise.all([import('./_social-store.js'), import('./_social-text.js')])
      const style = await readStyle(req)
      local = applyNotation(text, style && style.notation, notationHits)
    } catch (_) { local = { text, changes: [] } }
    if (!key) {
      return json({ ok: true, way, label: WAYS.proof.label, text: local.text, changes: local.changes,
        note: 'AIのキーが未設定のため、このサイトで決めた表記（SNS（文章）の「このサイトの決まり」）だけで直しました。' })
    }
  }
  if (!key) return json(NO_AI, 503)

  // 1日の回数の上限。押すのが手軽なぶん、気づかないうちに増えます。
  const guard = await spendGuard('rewrite', 200)
  if (guard) return guard
  const input = local ? local.text : text

  // どこに出ている文章か。見出しを本文のように直されると困るので、
  // 分かる範囲で伝えます。
  const where = String((body && body.where) || '').slice(0, 80)

  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  let out
  try {
    out = await client.messages.create({
      model: MODEL,
      // 誤字・表記ゆれは全文と直したところの一覧を返すので、長めに。
      max_tokens: way === 'proof' ? 2400 : 900,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          where ? `この文章が出ている場所: ${where}` : '',
          `直し方: ${WAYS[way].rule}`,
          '',
          '元の文章:',
          input,
        ].filter(Boolean).join('\n'),
      }],
    }, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const m = String((e && e.message) || e)
    return json({
      ok: false,
      message: /abort|timeout/i.test(m)
        ? '時間内に返ってきませんでした。もう一度お試しください。'
        : `書き直せませんでした（${m.slice(0, 120)}）`,
    }, 502)
  }

  const got = (out.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('')
    .trim()
    // 念のため。前置きを付けるなと言ってあっても、かぎかっこで包まれて
    // 返ることがあります。中身だけを採ります。
    .replace(/^[「『"']|[」』"']$/g, '')
    .trim()

  if (!got) return json({ ok: false, message: '書き直しの結果が空でした。' }, 502)

  if (way === 'proof') {
    const p = parseProof(got, input)
    if (!p) return json({ ok: false, message: '直した結果を読み取れませんでした。もう一度お試しください。' }, 502)
    return json({ ok: true, text: p.text, way, label: WAYS.proof.label, changes: [...local.changes, ...p.changes] })
  }

  return json({ ok: true, text: got, way, label: WAYS[way].label })
}
