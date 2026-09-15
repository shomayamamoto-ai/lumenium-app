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
import { EVENTS } from './track.js'
import { SERVICES } from '../src/data/services.js'
import { QUESTIONS, BRAND } from './_aio-catalog.js'

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
  const cfg = storeConfig()
  if (!cfg) return { analytics: null, aio: null }

  const dates = lastDays(30)
  try {
    const cmds = [
      ['LRANGE', 'lum:aio:index', 0, 0],
      ...dates.map((d) => ['GET', K.dayViews(d)]),
      ...dates.map((d) => ['HGETALL', K.dayEvents(d)]),
    ]
    const out = await pipeline(cfg, cmds)
    const ids = Array.isArray(out[0]) ? out[0] : []
    const views = out.slice(1, 1 + dates.length).map((v) => Number(v) || 0)

    // The enquiry funnel. Advice about search rankings is only half the job:
    // without this the advisor cannot see that the visitors already arriving
    // are being lost, and where.
    const ev = {}
    for (const flat of out.slice(1 + dates.length)) {
      if (!Array.isArray(flat)) continue
      for (let i = 0; i + 1 < flat.length; i += 2) {
        ev[String(flat[i])] = (ev[String(flat[i])] || 0) + (Number(flat[i + 1]) || 0)
      }
    }

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
            byCategory: run.summary.byCategory,
            competitors: (run.summary.competitors || []).slice(0, 10),
            missed: (run.results || [])
              .filter((r) => !r.mention && !r.error && r.cat !== 'ブランド指名')
              .map((r) => r.q),
          }
        }
      } catch (_) { /* no usable run yet */ }
    }
    return {
      analytics: { days: 30, total: views.reduce((a, b) => a + b, 0), daily: views, events: ev },
      aio,
    }
  } catch (_) {
    return { analytics: null, aio: null }
  }
}

function systemPrompt(live) {
  const services = SERVICES.map((s) => `- ${s.title}（${s.price}）`).join('\n')

  const aio = live.aio
    ? [
        `最終計測: ${live.aio.finishedAt}（${live.aio.asked}問）`,
        `全体の出現率: ${(live.aio.mentionRate * 100).toFixed(0)}%`,
        `非指名質問での出現率: ${(live.aio.openMentionRate * 100).toFixed(0)}%`,
        `自社サイトが情報源に使われた率: ${(live.aio.citeRate * 100).toFixed(0)}%`,
        'カテゴリ別: ' + live.aio.byCategory.map((c) => `${c.cat} ${c.mentions}/${c.asked}`).join(' / '),
        '同時に名前が挙がった会社: ' + live.aio.competitors.map((c) => `${c.name}(${c.count})`).join(', '),
        '出現できなかった質問:\n' + live.aio.missed.map((q) => `  ・${q}`).join('\n'),
      ].join('\n')
    : 'まだ計測されていません（管理画面の「AIO出現率を計測」を実行すると入ります）。'

  const STEPS = [
    ['menu_open', 'メニューを開いた'],
    ['service_view', 'サービスを見た'],
    ['estimate_start', '見積りを開いた'],
    ['estimate_done', '概算を出した'],
    ['contact_view', '問い合わせ画面に到達'],
    ['contact_start', '入力を始めた'],
    ['contact_submit', '送信した'],
  ]
  let pv = 'アクセス解析は未接続です（Upstash Redis 未設定）。'
  if (live.analytics) {
    const ev = live.analytics.events || {}
    const lines = STEPS.map(([k, label], i) => {
      const n = ev[k] || 0
      const prev = i > 0 ? (ev[STEPS[i - 1][0]] || 0) : null
      const drop = prev ? Math.round((1 - n / prev) * 100) : null
      return `  ${label}: ${n}${drop !== null ? `（前段から −${drop}%）` : ''}`
    })
    const any = STEPS.some(([k]) => ev[k])
    pv = [
      `直近30日の合計ページビュー: ${live.analytics.total}`,
      '',
      '## 問い合わせまでの導線（直近30日）',
      any ? lines.join('\n') : '  まだ記録がありません。',
      any
        ? '脱落が大きい段が、集客より先に直すべき場所です。SEOの話と混ぜず、どちらが先かを明示してください。'
        : '',
    ].filter(Boolean).join('\n')
  }

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
    `計測に使っている質問は${QUESTIONS.length}問で、「ブランド指名」と「非指名」に分かれています。`,
    '非指名での出現率が低いことが、対策の主戦場です。',
  ].join('\n')
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const key = apiKey()
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
