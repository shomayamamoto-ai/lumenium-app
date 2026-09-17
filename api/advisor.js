export const config = { runtime: 'edge' }

// The SEO/AIO advisor in the admin page.
//
// It is given the site's own service data (imported, so it cannot drift from
// what the site actually says), whatever the last visibility probe found, and
// the last thirty days of pageviews — then asked what to do next. Web search
// is on so it can check current practice rather than answer from memory.
//
// Streams as SSE: an edge function has to produce a first byte quickly, and a
// considered answer takes longer than that.

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import { storeConfig, pipeline, lastDays, K } from './_analytics-store.js'
import { MAIN, SIDE, ENGAGE, STEP_KEYS } from './analytics.js'
import { socialActivity, socialStatus } from './_social.js'
import { SERVICES } from '../src/data/services.js'
import { QUESTIONS, BRAND, VERDICTS, isHit } from './_aio-catalog.js'

const MODEL = 'claude-opus-5'
const MAX_TURNS = 16

const PAGES = [
  '/ (トップ・放射状メニュー)', '/about.html ルメニウムとは', '/services/ サービス6領域',
  '/pricing.html 料金', '/works.html 実績', '/voice.html お客様の声', '/flow.html ご依頼の流れ',
  '/faq.html よくある質問', '/profile.html 代表プロフィール', '/story.html ストーリー',
  '/positioning.html ポジショニング', '/pain.html お悩み', '/news.html お知らせ',
  '/blog/ ブログ', '/contact.html お問い合わせ', '/sitemap.html サイトマップ',
]

async function liveNumbers() {
  // How much went out, and where. Advice about being invisible in answer
  // engines is half an answer if the month it covers contained two posts:
  // "書く量を増やす" and "書いたものを出す先を増やす" are different jobs.
  const social = { activity: await socialActivity(30), networks: await socialStatus() }

  const cfg = storeConfig()
  if (!cfg) return { analytics: null, aio: null, social }

  const dates = lastDays(30)
  try {
    const cmds = [
      ['LRANGE', 'lum:aio:index', 0, 0],
      ...dates.map((d) => ['GET', K.dayViews(d)]),
      ...dates.map((d) => ['HGETALL', K.dayEvents(d)]),
      ['PFCOUNT', ...dates.map((d) => K.dayVisitors(d))],
      ...STEP_KEYS.map((e) => ['PFCOUNT', ...dates.map((d) => K.dayEventUsers(d, e))]),
    ]
    const out = await pipeline(cfg, cmds)
    const ids = Array.isArray(out[0]) ? out[0] : []
    const views = out.slice(1, 1 + dates.length).map((v) => Number(v) || 0)

    // The enquiry funnel. Advice about search rankings is only half the job:
    // without this the advisor cannot see that the visitors already arriving
    // are being lost, and where.
    const ev = {}
    for (const flat of out.slice(1 + dates.length, 1 + 2 * dates.length)) {
      if (!Array.isArray(flat)) continue
      for (let i = 0; i + 1 < flat.length; i += 2) {
        ev[String(flat[i])] = (ev[String(flat[i])] || 0) + (Number(flat[i + 1]) || 0)
      }
    }

    // …and the same steps in people, which is the only unit a rate can be
    // built from. The advisor used to be handed event counts divided by each
    // other, so an optional detour in the middle of the list produced a
    // "drop" of −1700% and it was told that as fact.
    let at = 1 + 2 * dates.length
    const arrivals = Number(out[at++]) || 0
    const people = {}
    for (const e of STEP_KEYS) people[e] = Number(out[at++]) || 0

    let aio = null
    if (ids.length) {
      const [raw] = await pipeline(cfg, [['GET', `lum:aio:run:${ids[0]}`]])
      try {
        const run = JSON.parse(raw)
        if (run && run.summary) {
          aio = {
            finishedAt: run.finishedAt,
            asked: run.summary.asked,
            mentionRate: run.summary.mentionRate,
            openMentionRate: run.summary.openMentionRate,
            citeRate: run.summary.citeRate,
            recommendRate: run.summary.recommendRate,
            verdicts: run.summary.verdicts,
            fallback: !!run.summary.fallback,
            byCategory: run.summary.byCategory,
            competitors: (run.summary.competitors || []).slice(0, 10),
            // The questions we did not come back on, and why — 「見つからないと
            // 言われた」 and 「話題にすら出ない」 need different work, and the
            // advisor could not tell them apart when this was one flag.
            missed: (run.results || [])
              .filter((r) => !r.error && r.cat !== 'ブランド指名' && !isHit(r.verdict))
              .map((r) => ({ q: r.q, verdict: r.verdict })),
          }
        }
      } catch (_) { /* no usable run yet */ }
    }
    return {
      analytics: {
        days: 30, total: views.reduce((a, b) => a + b, 0), daily: views,
        events: ev, people, arrivals,
      },
      aio,
      social,
    }
  } catch (_) {
    return { analytics: null, aio: null, social }
  }
}

function systemPrompt(live) {
  const services = SERVICES.map((s) => `- ${s.title}（${s.price}）`).join('\n')

  const aio = live.aio
    ? [
        `最終計測: ${live.aio.finishedAt}（${live.aio.asked}問）`,
        `全体の出現率: ${(live.aio.mentionRate * 100).toFixed(0)}%`,
        `非指名質問での出現率: ${(live.aio.openMentionRate * 100).toFixed(0)}%`,
        `そのうち依頼先の候補として挙げられた率: ${((live.aio.recommendRate || 0) * 100).toFixed(0)}%`,
        `自社サイトが情報源に使われた率: ${(live.aio.citeRate * 100).toFixed(0)}%`,
        live.aio.verdicts
          ? '回答の扱われ方の内訳: ' + Object.entries(live.aio.verdicts)
              .filter(([, n]) => n)
              .map(([k, n]) => `${VERDICTS[k] ? VERDICTS[k].label : k} ${n}件`).join(' / ')
          : '（この回は回答の読み取りができず、社名が本文に含まれるかだけで判定しています。実際より高く出ます）',
        'カテゴリ別: ' + live.aio.byCategory.map((c) => `${c.cat} ${c.mentions}/${c.asked}`).join(' / '),
        '同時に名前が挙がった会社: ' + live.aio.competitors.map((c) => `${c.name}(${c.count})`).join(', '),
        // Why we did not appear matters more than that we did not. Being told
        // we could not be found is an indexing problem; not coming up at all
        // is a content and authority problem. They do not share a fix.
        '出現できなかった質問（かっこ内は理由）:\n' + live.aio.missed
          .map((m) => `  ・${m.q}（${VERDICTS[m.verdict] ? VERDICTS[m.verdict].label : '判定できず'}）`).join('\n'),
      ].join('\n')
    : 'まだ計測されていません（管理画面の「AIO出現率を計測」を実行すると入ります）。'

  let pv = 'アクセス解析は未接続です（Upstash Redis 未設定）。'
  if (live.analytics) {
    const ev = live.analytics.events || {}
    const ppl = live.analytics.people || {}
    const arrivals = live.analytics.arrivals || 0

    const row = ([k, label], prev) => {
      const n = ppl[k] || 0
      const rate = arrivals ? Math.round((n / arrivals) * 100) : 0
      // Only when it is a loss. A step bigger than the one above it means
      // people arrived straight into it, which is information, not a negative.
      const tail = prev === null ? ''
        : n > prev ? '（前段より多い＝そこに直接到達している人がいる）'
        : prev > 0 ? `（前段から −${Math.round((1 - n / prev) * 100)}%）`
        : ''
      return `  ${label}: ${n}人 / ${ev[k] || 0}回 — 訪問の${rate}%${tail}`
    }

    const main = []
    let prev = arrivals
    for (const s of MAIN) { main.push(row(s, prev)); prev = ppl[s[0]] || 0 }

    const any = arrivals || STEP_KEYS.some((k) => ppl[k])
    pv = [
      `直近30日の合計ページビュー: ${live.analytics.total}`,
      `同期間の延べ訪問者: ${arrivals}（同じ日の再訪は1人、日をまたぐと別の1人）`,
      '',
      '## 問い合わせまでの導線（直近30日）',
      '数値は「人数 / 回数」で、割合はすべて延べ訪問者に対する人数の割合です。',
      any ? main.join('\n') : '  まだ記録がありません。',
      '',
      '### 任意の経路（全員が通るわけではないので、上の導線とは分けて見ること）',
      SIDE.map((s) => row(s, null)).join('\n'),
      ENGAGE.map((s) => row(s, null)).join('\n'),
      any
        ? '脱落が大きい段が、集客より先に直すべき場所です。SEOの話と混ぜず、どちらが先かを明示してください。' +
          '回数と人数を取り違えないこと（1人が3回見ても人数は1です）。'
        : '',
    ].filter(Boolean).join('\n')
  }

  const act = live.social && live.social.activity
  const ready = ((live.social && live.social.networks) || []).filter((n) => n.ready)
  const sns = !act || !act.posts
    ? '直近30日、この管理画面からのSNS投稿は0件です。' +
      (ready.length
        ? `投稿できる状態なのは ${ready.map((n) => n.label).join('・')} です。`
        : 'どのSNSも資格情報が未入力で、管理画面からは投稿できません。') +
      '（管理画面を経由しない手動投稿はここに出ません。数を語るときは必ずその旨を断ること）'
    : [
        `直近30日: ${act.posts}回（成功 ${act.sent} / 失敗 ${act.failed}）、直近7日: ${act.last7}回`,
        '内訳: ' + Object.entries(act.byNet).map(([k, n]) => `${k} ${n}件`).join(' / '),
        `最後の投稿: ${act.lastAt || '記録なし'}`,
        '投稿できる状態: ' + (ready.length ? ready.map((n) => n.label).join('・') : 'なし'),
        'これは管理画面から出した分だけの数です。手動投稿は含みません。',
      ].join('\n')

  return [
    'あなたは lumenium.net（ルメニウム）専属のSEO / AIO（AI検索最適化）アドバイザーです。',
    '相手はこのサイトのオーナー（山本捷真）本人で、管理画面から相談しています。日本語で答えてください。',
    '',
    '# あなたの仕事',
    '一般論のSEO講座ではなく、**このサイトで次に何をするか**を具体的に答えること。',
    '・優先順位をつけ、なぜそれが先かを一行で示す',
    '・「誰が」「どこで」やるかを書く（あなたが直接できないこと＝Search Console登録、',
    '  Googleビジネスプロフィール、外部メディア掲載などは、その旨を明示して手順を書く）',
    '・サイト側のコード変更で済むものは、どのページの何を変えるかまで書く',
    '・数字の根拠がないときは推測だと断る。checkできることは web_search で確認する',
    '・長い前置きはせず、箇条書きで短く',
    '',
    '# このサイトの前提',
    `ドメイン: ${BRAND.domain} / 東京 / 代表 山本捷真 / 2026年設立`,
    'クリエイティブ／DX支援カンパニー。事業は6領域:',
    services,
    '',
    '主なページ:',
    PAGES.map((p) => `- ${p}`).join('\n'),
    '',
    '既に実施済み（重複提案しないこと）: 構造化データ（Organization/FAQPage/Service/DefinedTerm ほか）、',
    'sitemap.xml と sitemap-content.xml、llms.txt、about.html での同名企業との区別、',
    'サービス別静的ページ、カテゴリ別の記事ページ、IndexNow スクリプト。',
    '',
    '# いまの計測値',
    pv,
    '',
    '## AIO出現率（answer engine に実際に質問した結果）',
    aio,
    '',
    '## SNS発信量（管理画面から投稿した分）',
    sns,
    'answer engine は最近の言及と一次情報を拾います。出現率が低いまま発信も少ないなら、',
    '内部施策より先に「出す量」を指摘してください。逆に発信しているのに出てこないなら、',
    '出し先・書き方・被リンクの問題として切り分けること。',
    '',
    `計測に使っている質問は${QUESTIONS.length}問で、「ブランド指名」と「非指名」に分かれています。`,
    '非指名での出現率が低いことが、対策の主戦場です。',
    '「見つからないと回答」はインデックスと実在性の問題、「出てこない」は内容と被リンクの問題で、打ち手が違います。',
    'どちらが多いかを見てから助言してください。',
  ].join('\n')
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const key = await apiKey()
  if (!key) return json(NO_AI, 503)

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ ok: false, message: '質問が空です。' }, 400)
  }

  const capped = await spendGuard('advisor', 80)
  if (capped) return capped

  const live = await liveNumbers()
  const client = new Anthropic({ apiKey: key })
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      const history = [...messages]
      try {
        // A server tool can hand the turn back with pause_turn when it has
        // more work to do; continue it rather than truncating the answer.
        for (let turn = 0; turn < 3; turn++) {
          const s = client.messages.stream({
            model: MODEL,
            max_tokens: 4000,
            output_config: { effort: 'medium' },
            system: [{ type: 'text', text: systemPrompt(live), cache_control: { type: 'ephemeral' } }],
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
            messages: history,
          })

          s.on('text', (t) => send({ t }))
          const final = await s.finalMessage()

          if (final.stop_reason === 'refusal') {
            send({ t: '\n\n（この内容には回答できませんでした。言い方を変えて試してください。）' })
            break
          }
          if (final.stop_reason !== 'pause_turn') break
          history.push({ role: 'assistant', content: final.content })
        }
        send({ done: true })
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
