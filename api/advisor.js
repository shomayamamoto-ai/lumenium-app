export const config = { runtime: 'edge' }

// 管理画面の AIアドバイザー。
//
// 各ツールの数字（自動改善の毎朝のまとめ＋問い合わせのジャンル別の件数・
// これからの予約の件数・お知らせの日付・自動改善の提案・クローラーの来訪・
// AIの答えの中身）を、個人の情報を抜いた短い文章にして渡し、次に何を
// するかを聞きます。集め方は _advisor-data.js、文章にするのは _advisor-core.js。
// ウェブ検索も使えるので、いまのやり方を確かめてから答えます。
//
// 「実行」ボタン: AIは道具（tool）として、お知らせ・文章・SNS・動画の
// 下書きや ToDo をボタンで出します。ここでは中身を確かめて画面に送るだけで、
// 何も実行しません。押したときに起きることは、ボタンの下にそのまま書きます。
//
// SSE で返します。edge の関数は最初の1バイトを早く返す必要があり、
// 考えた答えにはそれより時間がかかるからです。送るもの:
//   { meta }    最初に1回（使うモデル・渡した数字の名前）
//   { t }       本文の続き
//   { action }  「実行」ボタン1つ
//   { note }    途中のお知らせ（別のモデルで続けた、など）
//   { saved }   会話を保存した（id と題名）
//   { done, yen }  終わり（この回答の額の目安）
//   { error }

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import { storeFor, pipeline } from './_analytics-store.js'
import { SERVICES } from '../src/data/services.js'
import { QUESTIONS, BRAND } from './_aio-catalog.js'
import { BRAND as SITE } from './_brand.js'
import { setting } from './_settings.js'
import { recordUsage, advisorMonth, monthlyCap, ADVISOR_DAILY_CALLS, ADVISOR_MODELS, ADVISOR_KINDS } from './_ai-pricing.js'
import {
  groundingText, actionTools, checkAction, setCopyPaths, cleanMessages, historyForModel, parseTail,
  usageYen, TOOL_TO_KIND, ACTIONS_PER_ANSWER, SOURCE_LABELS,
} from './_advisor-core.js'

const MAX_TURNS = 16
/** 1回の相談の中で、AIとやりとりする回数の上限（ウェブ検索の続き・ボタンの確認を含む）。 */
const MAX_LOOPS = 6

/* 主なページ。以前はこの会社のページ一覧を手で書いていたため、別のサイトに
   載せると存在しないページについて助言していました。いまは
   ・設定 ADVISOR_PAGES（カンマ区切り。「/menu.html メニュー, /access.html アクセス」）があればそれ
   ・なければ、公開中のサイトの sitemap-urls.txt（ビルド時に作られる一覧）
   の順で、実際にあるページから作ります。 */
const MAX_PAGES = 40

export function pagesFromList(text, base) {
  const host = (() => { try { return new URL(base).host } catch (_) { return '' } })()
  return String(text || '').split(/[\n,]+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    if (!/^https?:/i.test(line)) return line
    try { const u = new URL(line); return u.host === host ? u.pathname : '' } catch (_) { return '' }
  }).filter(Boolean).slice(0, MAX_PAGES)
}

async function sitePages(req) {
  const own = await setting('ADVISOR_PAGES', '', req)
  if (own) return pagesFromList(own, SITE.url)
  try {
    const res = await fetch(`${SITE.url}/sitemap-urls.txt`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const list = pagesFromList(await res.text(), SITE.url)
      if (list.length) return list
    }
  } catch (_) { /* 一覧が読めなくても、相談はできるようにします */ }
  return ['/']
}

/* 指示文のうち、数字に関係なく変わらない部分。キャッシュがよく効くよう、
   日付や件数はここに入れません（下の liveBlock に入れます）。 */
function staticPrompt() {
  const services = SERVICES.map((s) => `- ${s.title}（${s.price}）`).join('\n')
  return [
    `あなたは ${BRAND.domain}（${SITE.kana || SITE.name}）専属の相談相手です。集客（検索・AIでの見え方・SNS）から、問い合わせ・予約・会員まで、このサイトの数字を見て次の一手を答えます。`,
    `相手はこのサイトのオーナー${SITE.ownerName ? `（${SITE.ownerName}）` : ''}本人で、ITに詳しくない小さな事業者です。管理画面から相談しています。日本語で答えてください。`,
    '',
    '【あなたの仕事】',
    '一般論の講座ではなく、このサイトで次に何をするかを具体的に答えること。',
    '優先順位をつけ、なぜそれが先かを、下の数字を根拠に示す。',
    '「誰が」「どこで」やるかを書く（Search Console登録、Googleビジネスプロフィール、外部メディア掲載など、管理画面の外でやることは、その旨を明示して手順を書く）。',
    '確かめられることは web_search で確認する。',
    '',
    '【数字の使い方（いちばん大事）】',
    '数字を使ったら、その文の中で、どの数字かを名前で示す。名前は【いまの数字】の［ ］の中の言葉をそのまま使う。',
    '例:「問い合わせ画面まで来た42人のうち、送信したのは9人でした（アクセス解析：過去30日）。」',
    '［判断できません］［参考程度］が付いた数字や、「まだありません」と書かれた数字から、結論を出さない。',
    'そのときは「まだ数が少なく、この数字からは言えません」とはっきり書き、何をどれだけ貯めれば言えるようになるかを書く。',
    '下の数字に根拠のない一般的な助言（「SNSを頑張りましょう」「コンテンツを充実させましょう」など）は書かない。',
    'どうしても一般論になるときは「このサイトの数字からではなく一般的な話です」と断る。',
    '推測は推測だと書く。数字を作らない。',
    '',
    '【実行ボタン（道具）】',
    'すぐ使える形の提案（お知らせの文、サイトの文章の書き換え、SNSの投稿文、文章の比べる案、動画の仮説、オーナーが自分でやること）があるときは、道具を使ってボタンにする。',
    '1回の答えでボタンは4つまで。本当に使うものだけにする。質問に答えるだけのときは使わない。',
    'ボタンは押されるまで何もしない。押されても、入力欄に入るか一覧に1件入るだけで、公開・投稿・保存はオーナーがいつもの画面で行う。',
    'だから本文では「入力欄に入れられるようにしました」「ボタンを押すと入ります」と書き、「投稿しました」「直しました」とは決して書かない。',
    '文章の書き換え（prefill_copy）の path は【文章編集で開ける項目】にあるものだけを使う。実験（draft_experiment）の key は【自動改善で実験できる項目】だけ。',
    '道具がエラーを返したら、その理由に合わせて直してもう一度だけ試すか、本文で文案を示す。',
    '',
    '【答えの書き方】',
    'ここでの答えは、そのまま別のAIに貼り付けて相談を続けたり、人に転送したりするために使われます。',
    '貼った先では、この管理画面も数字も見えません。読む相手が何も知らない前提で書いてください。',
    '',
    '記号で飾らないこと。# や ## の見出し、** の強調、バッククォート、縦棒の表、引用記号は使わない。',
    '行頭に - や * を置かない。並べるときは「1つ目は」「2つ目は」と文章で書くか、行頭に「・」を置く。',
    '番号を振るときは 1. ではなく「1つ目」「2つ目」と書く。',
    '',
    '高校生が読んで分かる言葉で書くこと。カタカナの専門語を並べない。',
    '専門語をどうしても使うときは、初めて出したところで短く言い換える。',
    '例:「インデックス（検索エンジンがそのページを見つけて、検索結果に出せる状態にしていること）」',
    '同じ扱いにする語: クローラー、AIO、非指名、被リンク、構造化データ、ディレクトリ、NAP、CTA、コンバージョン。',
    '',
    '1文を短くし、2〜3行ごとに1行空ける。長い前置きは書かない。',
    '数字を出すときは「何の数字か」「いつ測ったものか」を文の中で説明する。',
    '最後に、この話を知らない相手にそのまま渡せるよう、いまの状況と頼みたいことを3〜5行でまとめる。',
    '',
    '【答えの最後の2行】',
    'まとめのあと、改行してから次の2行を、この形のまま、この順で書いてください。',
    'SOURCES:: 使った数字の名前1 || 使った数字の名前2',
    'NEXT:: 質問1 || 質問2 || 質問3',
    '',
    'SOURCES は、この答えで実際に使った数字の名前（［ ］の中の言葉そのまま）。使っていなければ「SOURCES:: なし」。',
    'NEXT は、相手がボタンとして押す次の質問。2つから4つ、それぞれ25文字以内。',
    '「はい」「もっと詳しく」のような、押しても内容の決まらないものは書かない。いま答えた内容の「次の一手」になっているものを書く。',
    'この2行は画面には出ず、印とボタンに変わります。本文でこの2行に触れないこと。',
    '',
    '【このサイトの前提】',
    [`ドメイン: ${BRAND.domain}`, SITE.area, SITE.ownerName && `代表 ${SITE.ownerName}`, SITE.founded].filter(Boolean).join(' / '),
    `${SITE.description ? SITE.description + '。' : ''}事業は${SERVICES.length}領域:`,
    services,
    '',
    '既に実施済み（重複提案しないこと）: 構造化データ（Organization/FAQPage/Service/DefinedTerm ほか）、',
    'sitemap.xml（実際に中身が変わった日を lastmod に入れている）、llms.txt、同名企業との区別、',
    'サービス別静的ページ、カテゴリ別の記事ページ、IndexNow スクリプト、管理画面の自動改善（文章の比べる実験）。',
    '',
    `AIでの見え方は${QUESTIONS.length}問の質問で測っていて、「ブランド指名」と「非指名」に分かれています。非指名での出現が、対策の主戦場です。`,
    '「見つからないと回答」はインデックスと実在性の問題、「出てこない」は内容と被リンクの問題で、打ち手が違います。',
    'クローラーの来訪が0なら「内容が弱い」のではなく「まだ見つかっていない」状態で、ページの書き直しより、外部からのリンク・事業者ディレクトリ・Googleビジネスプロフィールなど、サイトの外の足がかりを優先する。',
    '問い合わせの導線で人が大きく減っている段があれば、集客より先にそこを直す。どちらが先かを明示する。人数と回数を取り違えない。',
    '数字は個人の情報を抜いて件数にしたものです。お客様の名前や問い合わせの中身は渡していないので、推測もしないこと。',
  ].join('\n')
}

const STATIC = staticPrompt()
/** 料金の目安（/api/advisor-store）で、指示文の長さに使います。 */
export const STATIC_PROMPT_CHARS = STATIC.length

/** その時点の数字。live: { pages, ground?, ...loadGrounding の答え } */
function liveBlock(live) {
  const g = (live && live.ground) || groundingText(live || {})
  return [
    '【使える数字の名前】',
    Object.values(SOURCE_LABELS).join(' / '),
    '',
    '【主なページ】',
    ((live && live.pages) || ['/']).map((p) => `- ${p}`).join('\n'),
    '',
    '【いまの数字】',
    g.text,
  ].join('\n')
}

/** 指示文全体（テストと、昔の呼び出し方のため）。 */
export function systemPrompt(live) {
  return STATIC + '\n\n' + liveBlock(live)
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const key = await apiKey(req)
  if (!key) return json(NO_AI, 503)

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }

  // 会話の形をそろえる（長すぎる会話は古い方から落とす）。AIには直近の分だけ。
  const saved = cleanMessages(body.messages)
  let recent = saved.slice(-MAX_TURNS)
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1)
  if (!recent.length || recent[recent.length - 1].role !== 'user') {
    return json({ ok: false, message: '質問が空です。' }, 400)
  }
  const quick = body.mode === 'quick'
  const model = quick ? ADVISOR_MODELS.quick : ADVISOR_MODELS.deep
  const kind = quick ? ADVISOR_KINDS.quick : ADVISOR_KINDS.deep

  const capped = await spendGuard('advisor', ADVISOR_DAILY_CALLS)
  if (capped) return capped

  // 月の上限（円の目安）。1日の回数だけでは、長い相談が続いた月に請求が
  // 思ったより膨らむことがあるので、使ったトークンから出した額でも止めます。
  // 2つのモデルの分を足した額で比べます。
  const cap = monthlyCap(await setting('ADVISOR_MONTHLY_YEN', '', req))
  const month = await advisorMonth()
  if (month.recorded && month.yen >= cap) {
    return json({
      ok: false, code: 'MONTHLY_LIMIT',
      message: `今月のAIアドバイザーの利用額が上限の目安（約${cap.toLocaleString('ja-JP')}円）に達しました。来月1日に再開します。上限は「設定状況 › キーの入力」の ADVISOR_MONTHLY_YEN で変えられます。`,
    }, 429)
  }

  const cfg = await storeFor(req)
  const [{ loadGrounding }, pages] = await Promise.all([import('./_advisor-data.js'), sitePages(req)])
  const g = await loadGrounding(cfg, req)
  setCopyPaths(g.copyPaths)
  const ground = groundingText(g)
  const live = { pages, ground }
  const client = new Anthropic({ apiKey: key })
  const encoder = new TextEncoder()
  const store = cfg ? await import('./_advisor-store.js') : null

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      const history = historyForModel(recent)
      const actions = []
      let acc = ''
      let yen = 0
      let plain = false
      send({ meta: { mode: quick ? 'quick' : 'deep', sources: ground.sources } })
      try {
        for (let loop = 0; loop < MAX_LOOPS; loop++) {
          // 断られたときは、Anthropic が勧める別のモデルで続けます（fallbacks: 'default'）。
          // ただしこの指定（と会話全体のキャッシュ指定）を API が受け付けない
          // ときは、相談そのものが止まらないよう、付けずに1回だけ送り直します
          // （plain が true の回）。
          const extra = plain ? {} : {
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            // 会話の続きもキャッシュに載せます（直前までのやりとりを毎回読み直さない）。
            cache_control: { type: 'ephemeral' },
          }
          const s = client.beta.messages.stream({
            model,
            max_tokens: quick ? 8000 : 16000,
            ...extra,
            output_config: { effort: quick ? 'low' : 'medium' },
            system: [
              { type: 'text', text: STATIC, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: liveBlock(live), cache_control: { type: 'ephemeral' } },
            ],
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: quick ? 2 : 4 }, ...actionTools()],
            messages: history,
          })
          s.on('text', (t) => { acc += t; send({ t }) })
          s.on('streamEvent', (ev) => {
            if (ev && ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'fallback') {
              send({ note: '途中から、別のモデルで答えを続けています。' })
            }
          })
          let final
          try {
            final = await s.finalMessage()
          } catch (e) {
            // 最初の1回で、まだ何も流していない「指定の誤り（400）」なら、付け足しを外して送り直します。
            if (!plain && loop === 0 && !acc && e && e.status === 400) { plain = true; loop--; continue }
            throw e
          }
          // 1回ごとの使用量を月の合計に足します（設定状況の「今月の目安」と月の上限に使う）。
          await recordUsage(kind, final.usage)
          yen += usageYen(model, final.usage)

          if (final.stop_reason === 'refusal') {
            const t = '\n\n（この内容には回答できませんでした。言い方を変えて試してください。）'
            acc += t; send({ t })
            break
          }
          if (final.stop_reason === 'tool_use') {
            // ボタンの中身を確かめて、画面に送ります。実行はしません。
            const results = []
            for (const b of final.content) {
              if (b.type !== 'tool_use') continue
              let input = b.input
              if (typeof input === 'string') { try { input = JSON.parse(input) } catch (_) { input = null } }
              const k = TOOL_TO_KIND[b.name]
              const r = k ? checkAction(k, input) : { ok: false, message: 'この道具はありません。' }
              if (r.ok && actions.length < ACTIONS_PER_ANSWER) {
                actions.push(r.action)
                send({ action: r.action })
                results.push({ type: 'tool_result', tool_use_id: b.id, content: `ボタンにしました。オーナーが押すまで何も起きません。押すと: ${r.action.does}` })
              } else {
                results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: r.ok ? `この答えではボタンは${ACTIONS_PER_ANSWER}つまでです。` : r.message })
              }
            }
            history.push({ role: 'assistant', content: final.content })
            history.push({ role: 'user', content: results })
            continue
          }
          // ウェブ検索の途中で手番が返ってきたときは、そのまま続けます。
          if (final.stop_reason === 'pause_turn') {
            history.push({ role: 'assistant', content: final.content })
            continue
          }
          if (final.stop_reason === 'max_tokens') {
            const t = '\n\n（答えが長くなりすぎたため、ここで切れました。「続きを」と送ると続きを書きます。）'
            acc += t; send({ t })
          }
          break
        }

        // 会話を保存します（保存先があるときだけ）。題名は最初の質問から。
        if (store && acc.trim() && body.save !== false) {
          const tail = parseTail(acc)
          const meta = await store.saveConv(cfg, pipeline, {
            id: body.convId,
            messages: [...saved, { role: 'assistant', content: acc, actions, sources: tail.sources }],
          }).catch(() => null)
          if (meta) send({ saved: meta })
        }
        send({ done: true, yen: Math.round(yen * 10) / 10 })
      } catch (e) {
        send({ error: String((e && e.message) || e).slice(0, 300) })
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  })
}
