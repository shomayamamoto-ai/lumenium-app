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
import { BRAND } from './_aio-catalog.js'

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
}

const SYSTEM = [
  `あなたは ${BRAND.domain}（ルメニウム、東京のクリエイティブ／DX支援会社）のウェブサイトの文章を直す編集者です。`,
  '渡されるのは、サイトのどこかに実際に出ている一文または数行です。',
  '',
  '守ること。',
  '書き直した文章だけを返すこと。前置き、説明、かぎかっこ、「案1」のような見出しは付けない。',
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
  if (!key) return json(NO_AI, 503)

  // 1日の回数の上限。押すのが手軽なぶん、気づかないうちに増えます。
  const guard = await spendGuard('rewrite', 200)
  if (guard) return guard

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

  // どこに出ている文章か。見出しを本文のように直されると困るので、
  // 分かる範囲で伝えます。
  const where = String((body && body.where) || '').slice(0, 80)

  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  let out
  try {
    out = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          where ? `この文章が出ている場所: ${where}` : '',
          `直し方: ${WAYS[way].rule}`,
          '',
          '元の文章:',
          text,
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

  return json({ ok: true, text: got, way, label: WAYS[way].label })
}
