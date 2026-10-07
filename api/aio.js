export const config = { runtime: 'edge' }

// SEO / AIO visibility probe.
//
// Asks answer engines the questions a customer would actually type, with live
// web search on, and records whether the company comes back. See
// _aio-catalog.js for what this does and does not claim to measure, and
// _engines.js for the engines.
//
// An engine does not give the same answer twice, so each question is asked
// several times (`samples`), and every rate is reported with the range it
// could reasonably be in (_aio-stats.js). One run of one question was a coin
// toss reported as a measurement.
//
// The run is driven from the browser, one answer per request, rather than as
// a single long call: this is an edge function, which has to start answering
// within about 25 seconds, and a web-searched answer takes ten to thirty. One
// answer per request also means a failure costs one answer, not the whole
// run, and the browser can show progress. Reading the answers (the judge) is
// driven the same way, four answers per request, for the same reason — with
// several samples there are now too many answers to read in one request.
//
//   GET  ?run=<id>                           -> the latest (or that) run, the history, settings
//   PUT  {questions:[…]} | {reset:true}      -> save / reset this site's question list
//   POST {action:'start', samples, engines}  -> {runId, questions, samples, engines}
//   POST {action:'ask', runId, index, sample, engine[, resume, continuation]}
//                                            -> one answer, scored for citations
//   POST {action:'judge', items:[{key,q,answer}]} -> how each answer treated us
//   POST {action:'finalize', runId, results} -> the summary, stored with the run
//   POST {action:'probe', index, engine}     -> one answer, nothing stored

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, NO_AI, spendGuard } from './_admin-auth.js'
import { storeFor, storeConfig, pipeline, jstDate } from './_analytics-store.js'
import { socialActivity } from './_social.js'
import {
  DEFAULT_QUESTIONS, BRAND, JUDGE_MODEL, JUDGE_BATCH, JUDGE_EST_USD, MIN_FOR_RATE, LIMITS,
  namesBrand, hostOf, isHit, isOwnHost, isOwnCompany, companyKey, isBranded, VERDICTS, SENTIMENTS,
  validateQuestions, questionSetHash, categoriesOf, planRun,
} from './_aio-catalog.js'
import { ENGINES, ENGINE_IDS, engineKeys, askEngine } from './_engines.js'
import { rate, compareRates } from './_aio-stats.js'
import { KV, BRAND as SITE } from './_brand.js'

/* 1回の回答にかけてよい時間。
   エッジ関数は最初の応答までに使える時間が決まっていて、そこを越えると
   プラットフォーム側に切られます。切られ方が悪く、返ってくるのはJSONでは
   ないので、ブラウザ側では「なぜ落ちたか分からない失敗」になります。実際
   16問中9問がそれで消えていて、画面には英語の一文だけが残っていました。
   自分で先に打ち切れば、理由の付いた失敗として記録できます。
   SDK 側の自動リトライも切ってあります（内側で3回粘られると、その合計が
   プラットフォームの上限を越えてしまうため）。 */
export const ASK_TIMEOUT_MS = 18000
const ANALYSE_TIMEOUT_MS = 22000

/* 検索の途中で止まった回答（pause_turn）を続けさせる回数。続きは別の
   リクエストで送ります——1回の続きにも数十秒かかり、同じリクエストの
   中ではエッジ関数の持ち時間に収まらないためです。2回続けても終わら
   なければ「途中で切れた回答」として、率には入れません。 */
export const MAX_CONTINUATIONS = 2

export const SAMPLE_OPTIONS = [1, 3, 5]
export const DEFAULT_SAMPLES = 3

/* 1日の上限。費用が掛かるのは回数なので、回数で数えます。
   これまでは「1日3回の計測」でしたが、1回の計測が28回の呼び出しの
   こともあれば、質問60×5回×4つのAIで1,200回のこともあります。
   回数で切らないと、上限の意味が設定次第で40倍変わります。
   最大の設定（60問×5回×4つのAI＋判定）が1回は回せる大きさにしてあり、
   ASK は再試行と続きの分を含むので、計画した回数より多めです。 */
const RUNS_PER_DAY = 3
export const CALLS_PER_DAY = 1600
export const ASK_PER_DAY = 2000
export const JUDGE_PER_DAY = 500

/** 失敗を、直し方が分かる形に変える。英語の一文だけでは何をすればよいか
 *  決まらない。種類・HTTPステータス・かかった時間の3つが分かれば、時間
 *  切れなのか、キーなのか、呼びすぎなのかが区別できます。 */
export function describeError(e, ms) {
  const name = (e && (e.name || (e.constructor && e.constructor.name))) || 'Error'
  const status = (e && (e.status || e.statusCode)) || null
  const raw = String((e && e.message) || e)
  let kind = 'unknown'
  if (name === 'AbortError' || /timed out|timeout|aborted/i.test(raw)) kind = 'timeout'
  else if (status === 401 || status === 403) kind = 'auth'
  else if (status === 429) kind = 'rate'
  else if (status && status >= 500) kind = 'server'
  else if (status === 400 || status === 404) kind = 'request'
  else if (/fetch failed|network|connection|socket/i.test(raw)) kind = 'network'
  return { kind, name, status, ms: ms || 0, message: raw.slice(0, 300) }
}

export const ERROR_LABELS = {
  timeout: '時間切れ',
  auth: 'APIキーが拒否された',
  rate: '短時間に呼びすぎ',
  server: 'AIの提供元の障害',
  request: 'リクエストが受け付けられない',
  network: '通信が切れた',
  refusal: 'AIが回答を断った',
  store: '保存先への書き込み失敗',
  unknown: '原因不明',
}

/** 種類ごとに、次にやることを1つだけ。 */
export const ERROR_HINTS = {
  timeout: '応答が18秒を超えました。ウェブ検索つきの回答は時間がかかるため、混み合う時間帯に起きます。再試行は同じ条件で掛け直します（条件を変えると、別のものを測ることになるため）。続くようなら時間を空けてください。',
  auth: 'APIキーが拒否されました。設定状況の画面でキーを入れ直してください（期限切れ・権限・残高のいずれかです）。',
  rate: '短時間に呼びすぎです。AIの提供元の上限に当たっています。数分おいてから再開してください。',
  server: 'AIの提供元で一時的な障害が起きています。時間を空けて再実行してください。',
  request: '送っている内容をAPIが受け付けませんでした。モデル名かウェブ検索機能の指定が、いまのAPIと合っていない可能性があります。',
  network: '通信が途中で切れました。再実行すれば通ることがほとんどです。',
  refusal: 'AIがこの質問への回答を断りました。測れなかった回答として、率の分母から外してあります。',
  store: '回答は取得できましたが、保存先への書き込みに失敗しました。結果はこの端末に残っています。',
  unknown: '原因を特定できませんでした。下の詳細をそのまま伝えてください。',
}

export const RUN_TTL = 400 * 24 * 60 * 60
const RK = (id) => `${KV}aio:run:${id}`
// One hash field per answer. Answers from different engines arrive at the
// same time, and a read-modify-write of one run document would lose some.
export const RES = (id) => `${KV}aio:res:${id}`
const INDEX = `${KV}aio:index`
const QKEY = `${KV}aio:questions`

const NO_STORE = {
  ok: false,
  code: 'STORE_NOT_CONFIGURED',
  message:
    '保存先が未設定です。Vercel の Storage から Upstash Redis を接続してください（KV_REST_API_URL と KV_REST_API_TOKEN が自動で入ります）。手で入れる場合は UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN でも構いません。',
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt
}

/** Older runs have no `branded` on their answers; the category was all
 *  there was. Both are honoured, plus the text itself. */
const brandedOf = (r) => !!r && (r.branded === true || r.cat === 'ブランド指名' || namesBrand(r.q))

/** This site's question list: the one saved from the admin, or the defaults.
 *  A saved list that no longer validates is ignored rather than trusted. */
export async function loadQuestions(cfg) {
  if (cfg) {
    try {
      const [raw] = await pipeline(cfg, [['GET', QKEY]])
      if (raw) {
        const v = validateQuestions(JSON.parse(raw))
        if (v.ok) return { list: v.questions, custom: true }
      }
    } catch (_) { /* the defaults still work */ }
  }
  return { list: DEFAULT_QUESTIONS.map((q) => ({ ...q, branded: isBranded(q) })), custom: false }
}

/** The shape a run has to have, whether it came from the store or from the
 *  browser that is running it. Anything else in the body is ignored. */
function runFromBody(body) {
  const s = (body && body.settings) || {}
  return {
    id: String((body && body.runId) || '').slice(0, 64) || `${jstDate()}-local`,
    startedAt: String((body && body.startedAt) || new Date().toISOString()).slice(0, 40),
    finishedAt: null,
    settings: {
      samples: clampInt(s.samples, 1, 5, 1),
      engines: Array.isArray(s.engines) ? s.engines.filter((e) => ENGINES[e]) : ['claude'],
      questionsHash: String(s.questionsHash || '').slice(0, 16),
      questionCount: clampInt(s.questionCount, 0, LIMITS.questions, 0),
    },
    results: [],
    summary: null,
  }
}

/** 保存先から読む。読めないときは null ではなく、読めなかったという事実を
 *  返す（null は「そんな計測は無い」の意味で使われていて、区別が要る）。
 *
 *  ここが素直に例外を投げていたのが、計測が壊れていた原因のひとつです。
 *  保存先が一瞬でも応答しないと、質問を投げる前に関数ごと落ち、ブラウザ
 *  には理由の分からない失敗だけが残っていました。保存はあくまで便利のため
 *  で、計測そのものは保存先が無くても成立します。 */
export async function readRun(cfg, id) {
  let raw
  try {
    ;[raw] = await pipeline(cfg, [['GET', RK(id)]])
  } catch (e) {
    return { unreachable: describeError(e, 0).message }
  }
  if (!raw) return null
  try { return JSON.parse(raw) } catch (_) { return null }
}

async function writeRun(cfg, run) {
  await pipeline(cfg, [['SET', RK(run.id), JSON.stringify(run), 'EX', RUN_TTL]])
}

/** The answers stored one by one while a run is going. */
export async function readAnswers(cfg, id) {
  try {
    const [flat] = await pipeline(cfg, [['HGETALL', RES(id)]])
    const out = []
    for (let i = 1; Array.isArray(flat) && i < flat.length; i += 2) {
      try { out.push(JSON.parse(flat[i])) } catch (_) {}
    }
    return out
  } catch (_) {
    return []
  }
}

export const keyOf = (r) => (r && (r.key || r.id)) || ''

/** What is kept of an answer. The paused turn's content is a request body
 *  for the next call, not part of the record. */
export function storable(r) {
  const { resume, ...rest } = r || {}
  return { ...rest, answer: String(rest.answer || '').slice(0, 3000) }
}

/** Turn an engine's answer into the record the report is built from.
 *  The verdict is left empty: it is decided later, by reading the answer. */
export function scoreAnswer(item, a, sample) {
  const cited = (a.citedUrls || []).slice(0, 10)
  const searchedList = a.searchedUrls || []
  const firstOwn = cited.findIndex((e) => isOwnHost(e.host))
  const all = cited.concat(searchedList)
  // Gemini's links are redirects; they say which site, but not which page.
  const pages = all.filter((e) => e.url && !e.redirect)
  const text = String(a.text || '')
  return {
    key: `${item.id}#${a.engine}#${sample}`,
    id: item.id,
    cat: item.cat,
    q: item.q,
    branded: isBranded(item),
    engine: a.engine,
    model: a.model,
    sample,
    answer: text.trim(),
    // Whether the name is in the text. Shown live so the run has something to
    // report as it goes; the verdict the report is built from is decided by
    // the judge, by reading the answer rather than searching it.
    named: namesBrand(text),
    verdict: null,
    // The answer named our site as a source, and where in its list.
    cited: firstOwn >= 0,
    citedRank: firstOwn >= 0 ? firstOwn + 1 : null,
    citedUrls: cited.map((e) => ({ url: e.url, title: e.title, host: e.host })),
    // The search returned our site. Weaker: read, not necessarily used.
    searched: searchedList.some((e) => isOwnHost(e.host)) || firstOwn >= 0,
    searchCount: searchedList.length,
    sources: [...new Set(all.map((e) => e.host).filter(Boolean))],
    /* 引用元は、これまでホスト名に丸めていました。「発注ナビが読まれた」
       までは分かっても、その中のどのページかは分からず、載りに行く先を
       決められません。URLのまま残します（1回の回答で8件まで）。 */
    sourceUrls: [...new Set(pages.map((e) => e.url))].slice(0, 8),
    /* 自社サイトは、どのページが読まれたかまで残す。about なのか動画の
       サービスページなのかが分からないと、どのページが働いているかを
       知る手段がありません。 */
    ownPages: [...new Set(pages.filter((e) => isOwnHost(e.host))
      .map((e) => { try { return new URL(e.url).pathname || '/' } catch (_) { return '' } })
      .filter(Boolean))],
    companies: [],
    position: null,
    sentiment: null,
    missing: '',
    truncated: !!a.truncated,
    truncReason: a.truncReason || null,
    error: a.error ? (ERROR_HINTS[a.error] || a.error) : null,
    errorKind: a.error ? (a.error === 'refusal' ? 'refusal' : 'request') : undefined,
  }
}

/** One batch of answers read by the judge: which companies each named, how
 *  it treated us, where we came in its list and in what tone.
 *
 *  The verdict is here rather than in a regex because the distinction that
 *  matters cannot be made by searching for the name. 「ルメニウムは見つかり
 *  ませんでした」 contains the name and is the opposite of a hit.
 *
 *  Batches of four, because this used to be one call over every answer with
 *  a 4,000 token ceiling on its reply. Sixteen answers did not fit: the reply
 *  was cut off part way and the run reported 「判定できた質問 7」 out of
 *  sixteen — more than half the work measured, paid for, and thrown away.
 *
 *  Structured output rather than a forced tool call: the current model does
 *  not accept a forced tool choice, and a JSON schema fixes the shape just as
 *  firmly. */
export async function analyseBatch(client, items) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'companies', 'missing', 'verdict', 'position', 'sentiment'],
          properties: {
            id: { type: 'string' },
            companies: { type: 'array', items: { type: 'string' } },
            missing: { type: 'string' },
            verdict: { type: 'string', enum: Object.keys(VERDICTS) },
            position: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
            sentiment: { type: 'string', enum: [...Object.keys(SENTIMENTS), 'none'] },
          },
        },
      },
    },
  }

  const us = `「${BRAND.kana} / ${BRAND.name}（${BRAND.domain}）」`
  const lookalikes = SITE.lookalikes.length
    ? `名前の似た別会社（${SITE.lookalikes.join('、')}）の話しかしていなければ other_company です。`
    : '同じ名前の別の会社の話しかしていなければ other_company です。'

  // Long answers are trimmed: the verdict and the company names are decided in
  // the first part of an answer.
  const payload = items
    .map((r) => `### ${r.key}\n質問: ${r.q}\n回答: ${String(r.answer).slice(0, 4000)}`)
    .join('\n\n')

  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 6000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema },
    },
    system:
      '与えられた各回答（### の後ろが id）について、次の6項目を記録してください。\n' +
      '1) companies: その回答文中で実際に社名が挙がっている会社だけ。回答に出てこない会社を推測で足さないこと。' +
      '媒体名・ディレクトリ名（例: 発注ナビ、比較biz）や、官公庁・団体名は会社として数えない。\n' +
      `2) verdict: ${us}がその回答でどう扱われたか。名前が出てくるかどうかではなく、扱われ方で判定する。` +
      'recommended=依頼先・候補として挙げられている / mentioned=実在する会社として説明されているが依頼先としては挙がっていない / ' +
      'denied=見つからない・確認できない・情報がないと書かれている / other_company=同名・似た名前の別会社の話しかしていない / absent=まったく出てこない。' +
      '「見つかりませんでした」「確認できません」は名前が出ていても denied。' + lookalikes + '\n' +
      `3) position: verdict が recommended か mentioned のとき、回答に挙がった会社の並びの中で${us}が何番目か（1から数える）。それ以外は null。\n` +
      '4) sentiment: verdict が recommended か mentioned のとき、その書かれ方が positive（好意的）/ neutral（中立）/ negative（否定的・注意喚起）のどれか。それ以外は none。\n' +
      '5) missing: 確認できない・見つからないとした回答について、その回答が不足として挙げている情報を40字以内で（例: 所在地、法人登記、第三者の掲載、実績）。' +
      '回答文に書かれていない場合は空文字。推測で埋めないこと。\n' +
      '6) id: 見出しの id をそのまま。',
    messages: [{ role: 'user', content: payload }],
  }, { timeout: ANALYSE_TIMEOUT_MS })

  if (res.stop_reason === 'max_tokens') throw new Error('judge reply was cut off (max_tokens)')
  if (res.stop_reason === 'refusal') throw new Error('judge refused')
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  let parsed
  try { parsed = JSON.parse(text) } catch (_) { throw new Error('judge reply was not JSON') }
  const out = {}
  for (const it of (parsed && parsed.items) || []) {
    if (!it || typeof it.id !== 'string') continue
    const verdict = VERDICTS[it.verdict] ? it.verdict : null
    const hit = isHit(verdict)
    out[it.id] = {
      companies: Array.isArray(it.companies)
        ? it.companies.map((c) => String(c).trim()).filter(Boolean).slice(0, 12)
        : [],
      // 相手が「何が足りない」と言ったか。回答文の中にしかなく、全部を
      // 人が読まないかぎり誰も気づかない一文です。ここが、自社サイトに
      // 何を足せばよいかを直接決めます。
      missing: String(it.missing || '').trim().slice(0, 60),
      // An unrecognised value is left null and excluded from the rates, rather
      // than being rounded towards either answer.
      verdict,
      position: hit && Number.isInteger(it.position) && it.position > 0 ? it.position : null,
      sentiment: hit && SENTIMENTS[it.sentiment] ? it.sentiment : null,
    }
  }
  return out
}

/** The rates for one set of answers, each with its 95% range. */
function ratesOf(done, fallback) {
  const hit = (r) => (fallback ? !!r.named : isHit(r.verdict))
  const open = done.filter((r) => !brandedOf(r))
  const count = (list, f) => list.filter(f).length
  return {
    // The number to act on: named as somewhere you could actually go.
    recommend: rate(count(open, (r) => r.verdict === 'recommended'), open.length),
    openMention: rate(count(open, hit), open.length),
    mention: rate(count(done, hit), done.length),
    // The answer gave our site as a source…
    cite: rate(count(done, (r) => r.cited), done.length),
    // …or at least the search returned it.
    searched: rate(count(done, (r) => r.searched), done.length),
  }
}

const distinct = (list, f) => new Set(list.map(f)).size

/** Everything the report shows is derived here, from the stored answers.
 *
 *  `fallback` means the judge did not run, so there is no verdict and the
 *  only thing left is whether the name is in the text. That is the old,
 *  wrong measure, so the run is marked and the UI says which one it is. */
export function summarise(results, fallback, settings) {
  const hit = (r) => (fallback ? !!r.named : isHit(r.verdict))
  const answered = (r) => r && !r.error && r.answer
  // A cut-off answer, or one with no verdict, is not evidence either way, so
  // it is left out of the denominator rather than counted as a miss.
  const scored = (r) => answered(r) && !r.truncated && (fallback || r.verdict)
  const done = results.filter(scored)
  const open = done.filter((r) => !brandedOf(r))
  const stats = ratesOf(done, fallback)
  const engineIds = (settings && settings.engines && settings.engines.length)
    ? settings.engines
    : [...new Set(results.map((r) => r.engine || 'claude'))]

  // Per engine: the same rates, so "ChatGPT finds us, Claude does not" can be
  // seen rather than averaged away.
  const engines = engineIds.map((id) => {
    const list = results.filter((r) => (r.engine || 'claude') === id)
    const d = list.filter(scored)
    return {
      id,
      label: (ENGINES[id] && ENGINES[id].label) || id,
      model: (list.find((r) => r.model) || {}).model || '',
      total: list.length,
      asked: d.length,
      failed: list.filter((r) => !answered(r)).length,
      truncated: list.filter((r) => answered(r) && r.truncated).length,
      stats: ratesOf(d, fallback),
    }
  })

  // Per question: how many of the times it was asked we came back (k/n).
  const order = []
  const byQ = new Map()
  for (const r of results) {
    if (!r || !r.id) continue
    if (!byQ.has(r.id)) {
      byQ.set(r.id, { id: r.id, cat: r.cat, q: r.q, branded: brandedOf(r), n: 0, hits: 0, recs: 0, cites: 0, searched: 0, total: 0, perEngine: {} })
      order.push(r.id)
    }
    const row = byQ.get(r.id)
    row.total++
    const e = r.engine || 'claude'
    if (!row.perEngine[e]) row.perEngine[e] = { n: 0, hits: 0, recs: 0, cites: 0 }
    if (!scored(r)) continue
    row.n++
    row.perEngine[e].n++
    if (hit(r)) { row.hits++; row.perEngine[e].hits++ }
    if (r.verdict === 'recommended') { row.recs++; row.perEngine[e].recs++ }
    if (r.cited) { row.cites++; row.perEngine[e].cites++ }
    if (r.searched) row.searched++
  }
  const byQuestion = order.map((id) => byQ.get(id))

  /* 分野ごとの成績。
     率は、答えが返ってきた「質問」が MIN_FOR_RATE に届いた分野にだけ
     付けます。同じ1問を5回聞いても、分野の傾向は1問ぶんしか分かりません。
     標本の数ではなく、違う質問の数で決めます。 */
  const cats = categoriesOf(results.filter(Boolean))
  const byCategory = cats.map((cat) => {
    const list = done.filter((r) => r.cat === cat)
    const all = results.filter((r) => r && r.cat === cat)
    const questions = distinct(list, (r) => r.id)
    const thin = questions < MIN_FOR_RATE
    const k = list.filter(hit).length
    return {
      cat,
      asked: list.length,
      planned: all.length,
      questions,
      plannedQuestions: distinct(all, (r) => r.id),
      branded: all.length > 0 && all.every(brandedOf),
      mentions: k,
      cites: list.filter((r) => r.cited).length,
      thin,
      rate: thin ? null : (list.length ? k / list.length : 0),
      ci: thin ? null : rate(k, list.length),
    }
  }).filter((c) => c.planned > 0)

  /* 競合。社名の表記ゆれ（株式会社・全角半角など）をそろえてから数え、
     自社は数えません。同じ会社が3通りの書き方で1回ずつ並ぶと、いちばん
     よく挙がる相手が見えなくなるためです。
     数えるのは非指名の回答だけ。指名の質問では自社が出るのが当然で、
     入れると自社のシェアが実際より大きく見えます。 */
  const tally = new Map()
  for (const r of open) {
    const seen = new Set()
    for (const raw of r.companies || []) {
      if (isOwnCompany(raw)) continue
      const k = companyKey(raw)
      if (!k || seen.has(k)) continue
      seen.add(k)
      if (!tally.has(k)) tally.set(k, { count: 0, names: new Map(), qs: new Set() })
      const t = tally.get(k)
      t.count++
      t.qs.add(r.id)
      t.names.set(String(raw).trim(), (t.names.get(String(raw).trim()) || 0) + 1)
    }
  }
  const ourHits = open.filter(hit).length
  const others = [...tally.values()].reduce((s, t) => s + t.count, 0)
  const competitors = [...tally.values()]
    .map((t) => ({
      // The spelling the answers used most.
      name: [...t.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: t.count,
      questions: t.qs.size,
      share: open.length ? t.count / open.length : 0,
      us: false,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
  competitors.push({ name: BRAND.name, count: ourHits, questions: distinct(open.filter(hit), (r) => r.id), share: open.length ? ourHits / open.length : 0, us: true })
  competitors.sort((a, b) => b.count - a.count)

  // Where we came in the list, when we were in it. Non-branded only: in an
  // answer to a question with our name in it, coming first proves nothing.
  const placed = open.filter((r) => hit(r) && Number.isInteger(r.position))
  const sentiment = { positive: 0, neutral: 0, negative: 0 }
  for (const r of done) if (hit(r) && sentiment[r.sentiment] !== undefined) sentiment[r.sentiment]++

  /* 参照された面・ページ。「何問で」は質問の数で数えます。同じ質問を
     3回聞いて3回同じページが出ても、それは「3問で読まれた」ではありません。 */
  const byHost = new Map()
  const citedHosts = new Map()
  const pages = new Map()
  const own = new Map()
  const add = (m, k, id) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(id) }
  for (const r of done) {
    for (const h of r.sources || []) add(byHost, h, r.id)
    for (const c of r.citedUrls || []) if (c.host) add(citedHosts, c.host, r.id)
    for (const u of r.sourceUrls || []) {
      const h = hostOf(u)
      if (h && !isOwnHost(h)) add(pages, u, r.id)
    }
    for (const p of r.ownPages || []) add(own, p, r.id)
  }
  const ranked = (m) => [...m.entries()].map(([k, s]) => [k, s.size]).sort((a, b) => b[1] - a[1])

  /* 失敗の内訳。「出現率 0%」と「半分しか返ってこなかった」は、同じ画面に
     並んでいても意味がまるで違います。前者は結果、後者は結果が無いという
     こと。種類ごとに数えて、率と一緒に必ず出します。 */
  const errorKinds = {}
  for (const r of results) {
    if (!r || !r.error) continue
    const k = r.errorKind || 'unknown'
    if (!errorKinds[k]) errorKinds[k] = { kind: k, label: ERROR_LABELS[k] || k, hint: ERROR_HINTS[k] || '', count: 0, sample: '', ms: 0 }
    errorKinds[k].count++
    errorKinds[k].sample = errorKinds[k].sample || ((r.detail && r.detail.message) || r.error || '')
    errorKinds[k].ms = Math.max(errorKinds[k].ms, (r.detail && r.detail.ms) || r.ms || 0)
  }

  const counted = (v) => done.filter((r) => r.verdict === v).length
  const answeredCount = results.filter(answered).length
  const truncated = results.filter((r) => answered(r) && r.truncated).length

  return {
    // 相手が足りないと言ったこと。同じ趣旨が何度も出るなら、それが次に
    // 書くべきものです。
    missingEvidence: [...new Set(results.map((r) => (r && r.missing) || '').filter(Boolean))].slice(0, 8),
    asked: done.length,
    // 出した回数。率の分母がこれより小さいときは、率を読む前に
    // 「取れた分だけの率だ」と分かる必要があります。
    total: results.length,
    questions: byQuestion.length,
    samples: (settings && settings.samples) || 1,
    engineIds,
    coverage: results.length ? done.length / results.length : 0,
    errors: Object.values(errorKinds).sort((a, b) => b.count - a.count),
    // Answers that came back but could not be judged, kept apart from the ones
    // that were cut off and the ones that never came back at all.
    unjudged: Math.max(0, answeredCount - truncated - done.length),
    truncated,
    failed: results.length - answeredCount,
    fallback: !!fallback,
    stats,
    // The plain numbers, as before, for the history and the advisor.
    mentionRate: stats.mention.p,
    openMentionRate: stats.openMention.p,
    recommendRate: stats.recommend.p,
    citeRate: stats.cite.p,
    searchRate: stats.searched.p,
    verdicts: fallback ? null : {
      recommended: counted('recommended'),
      mentioned: counted('mentioned'),
      denied: counted('denied'),
      other_company: counted('other_company'),
      absent: counted('absent'),
    },
    engines,
    byQuestion,
    byCategory,
    competitors,
    // Of all the times a company was named in a non-branded answer, how many
    // were us.
    shareOfVoice: { ours: ourHits, others, value: ourHits + others ? ourHits / (ourHits + others) : 0 },
    position: placed.length
      ? { avg: placed.reduce((s, r) => s + r.position, 0) / placed.length, n: placed.length, first: placed.filter((r) => r.position === 1).length }
      : null,
    sentiment,
    citedPages: ranked(pages).filter(([, n]) => n > 1).slice(0, 12)
      .map(([url, count]) => ({ url, host: hostOf(url), count })),
    ownPages: ranked(own).slice(0, 10).map(([path, count]) => ({ path, count })),
    topSources: ranked(byHost).slice(0, 12).map(([name, count]) => ({ name, count })),
    topCited: ranked(citedHosts).slice(0, 12).map(([name, count]) => ({ name, count })),
  }
}

/** What to do next, read out of the run rather than guessed at.
 *
 *  Every item names the evidence it came from — the questions, the companies,
 *  the pages the answers actually read — so it can be checked rather than
 *  believed. Nothing here is written by a model; it is arithmetic over what
 *  came back, which is why it can be trusted to say 「まだ分からない」 when
 *  the run did not measure enough. Counts are in questions, not in samples:
 *  the same question asked three times is still one thing to fix. */
function buildActions(results, s, social) {
  const done = results.filter((r) => r && !r.error && r.answer && !r.truncated)
  const open = done.filter((r) => !brandedOf(r))
  const qsOf = (list) => [...new Map(list.map((r) => [r.id, r.q])).values()]
  const out = []

  // 1. Questions where an answer said we could not be found. That is not a
  //    ranking problem — the page exists and says so — it is an evidence
  //    problem, and it is the one thing that blocks every other question.
  const denied = done.filter((r) => r.verdict === 'denied')
  if (denied.length) {
    const qs = qsOf(denied)
    out.push({
      rank: 1,
      title: `「実在が確認できない」と答えられた質問が ${qs.length} 件（回答 ${denied.length} 回）`,
      why: 'サイトの中で何を書いても、外に裏づけが無いと答えるAIには確認できません。自社サイトだけが情報源の会社は、存在を疑われる側に置かれます。',
      how: '第三者の面に社名・所在地・代表者・URLを同じ表記で載せる（法人番号公表サイト、求人・発注系のディレクトリ、取引先の実績ページ、プレスリリース）。1件ずつ増やすたびにこの数字は下がります。',
      evidence: qs.slice(0, 4),
      kind: 'exists',
    })
  }

  // 2. Where competitors are named and we are not. Per category, with the
  //    names that took the slot — that is the shortlist to be measured against.
  const hit = (r) => (s.fallback ? !!r.named : isHit(r.verdict))
  const lost = categoriesOf(open)
    .map((cat) => {
      const rows = open.filter((r) => r.cat === cat)
      if (rows.some(hit)) return null
      const names = [...new Set(rows.flatMap((r) => r.companies || []).filter((n) => !isOwnCompany(n)))]
      return { cat, names: names.slice(0, 6) }
    })
    .filter((c) => c && c.names.length)
  if (lost.length) {
    out.push({
      rank: 2,
      title: `他社だけが挙がったカテゴリ ${lost.length} 件`,
      why: 'そのカテゴリの質問には答えが出ていて、そこに自社が入っていないということです。需要が無いのではなく、候補として持っていないだけなので、ここは埋められます。',
      how: '挙がった会社のページと自社の該当ページを並べ、答えに必要な具体（料金の幅・対応範囲・実績数・所在地・連絡手段）が抜けている項目を足す。質問文そのものを見出しにしたページが最短です。',
      evidence: lost.map((c) => `${c.cat}：${c.names.join('、')}`),
      kind: 'category',
    })
  }

  // 3. The sites the answer engines actually read. Being on them is the only
  //    lever here that does not depend on our own site at all.
  const theirs = (s.topSources || []).filter((h) => !isOwnHost(h.name) && h.count > 1)
  if (theirs.length) {
    out.push({
      rank: 3,
      title: `複数の質問で読まれていた情報源 ${theirs.length} 件`,
      why: '答えを組み立てる材料にされている面です。そこに載っていない会社は、そもそも材料に入りません。',
      how: '掲載条件を確認して、載せられるものから載せる（多くは無料の事業者登録）。載ったら次の計測で、その質問の出現率が動くかを見ます。',
      evidence: theirs.slice(0, 6).map((h) => `${h.name}（${h.count}問で参照）`),
      kind: 'sources',
    })
  }

  // 4. Our own pages: given as a source at all?
  if (done.length) {
    const asked = distinct(done, (r) => r.id)
    const citedQs = qsOf(done.filter((r) => r.cited))
    const searchedOnly = distinct(done.filter((r) => r.searched && !r.cited), (r) => r.id)
    out.push({
      rank: 4,
      title: `自社サイトが答えの出典になった質問 ${citedQs.length} / ${asked} 件`,
      why: (citedQs.length
        ? '出典になっている質問があるということは、ページの作りではなく中身の不足で落ちている質問があるということです。'
        : '一度も出典になっていません。ページが無いか、その質問に答える形になっていないかのどちらかです。') +
        (searchedOnly ? `検索では読まれたのに出典にされなかった質問が ${searchedOnly} 件あります。読まれても、答えに使える一文が無かったということです。` : ''),
      how: '計測している質問文を、そのままページの見出しにする。答えは最初の2〜3行に置き、そこに金額・対応地域・期間・連絡先を数字で書く。',
      evidence: citedQs.slice(0, 4),
      kind: 'cited',
    })
  }

  // 5. Publishing rate. An engine can only find what was published.
  if (social && social.posts === 0) {
    out.push({
      rank: 5,
      title: '直近30日の発信が0件',
      why: '新しい一次情報が出ていない期間は、答えに使える新しい材料も増えません。',
      how: '案件が終わるたびに1件、事実だけの短い記録を出す（何を・どの業種に・どのくらいの期間で）。SNS投稿タブから出した分はこの数字に入ります。',
      evidence: [],
      kind: 'publish',
    })
  }

  // 6. How much of the run is actually usable. Said out loud, because a report
  //    built on half a run looks the same as one built on all of it.
  const unusable = (s.failed || 0) + (s.unjudged || 0) + (s.truncated || 0)
  if (unusable) {
    out.push({
      rank: 0,
      title: `今回の計測で使えなかった回答 ${unusable} 回`,
      why: '失敗した回答・途中で切れた回答は「出てこなかった」ではなく「測れなかった」なので、率の分母から外してあります。数が多い回の数字は幅が広くなります。',
      how: 'もう一度計測すると取り直せます。続くようなら時間帯を変えてください。',
      evidence: results.filter((r) => r && (r.error || r.truncated))
        .map((r) => `${r.q}（${r.error || '途中で切れた回答'}）`).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4),
      kind: 'coverage',
    })
  }

  return out.sort((a, b) => a.rank - b.rank)
}

/** Can two runs be compared? Only when they asked the same questions of the
 *  same engines. A different question set is a different number, however
 *  alike the two percentages look. */
export function comparable(a, b) {
  const sa = a && a.settings
  const sb = b && b.settings
  if (!sa || !sb || !sa.questionsHash || !sb.questionsHash) {
    return { ok: false, reason: '以前の形式の計測で、質問の組と使ったAIの記録がありません' }
  }
  if (sa.questionsHash !== sb.questionsHash) return { ok: false, reason: '質問の組が違います' }
  const ea = [...(sa.engines || [])].sort().join(',')
  const eb = [...(sb.engines || [])].sort().join(',')
  if (ea !== eb) return { ok: false, reason: '使ったAIが違います' }
  return { ok: true, reason: '' }
}

function engineMeta(keys) {
  return ENGINE_IDS.map((id) => ({
    id,
    label: ENGINES[id].label,
    model: ENGINES[id].model(),
    ready: !!keys[id],
    estUsd: ENGINES[id].estUsd,
  }))
}

/** 計測を始める。管理画面のボタンと、自動の計測（_aio-auto.js）の両方から。
 *  断るときは { error, status } を、始めたときは { run, plan } を返します。 */
export async function startRun(cfg, keys, opts = {}) {
  const samples = SAMPLE_OPTIONS.includes(Number(opts.samples)) ? Number(opts.samples) : DEFAULT_SAMPLES
  const asked = Array.isArray(opts.engines) && opts.engines.length ? opts.engines : ['claude']
  const engines = ENGINE_IDS.filter((id) => asked.includes(id))
  const missing = engines.filter((id) => !keys[id])
  if (!engines.length) return { status: 400, error: { ok: false, message: '使うAIが選ばれていません。' } }
  if (missing.length) {
    return { status: 400, error: { ok: false, code: 'NO_ENGINE_KEY', message: `${missing.map((id) => ENGINES[id].label).join('、')} のキーが未設定です。設定状況の画面で入れてください。` } }
  }
  const { list, custom } = await loadQuestions(cfg)
  const plan = planRun(list.length, samples, engines, Object.fromEntries(ENGINE_IDS.map((id) => [id, ENGINES[id].estUsd])))
  // A run bigger than a whole day's ceiling would only ever be refused with
  // 「本日の上限に達しました」, which reads as "come back tomorrow" when
  // tomorrow will refuse it too. Say what is actually wrong.
  if (plan.calls > CALLS_PER_DAY) {
    return {
      status: 400,
      error: {
        ok: false, code: 'RUN_TOO_LARGE',
        message: `この設定では1回の計測が${plan.calls}回の呼び出しになり、1日の上限（${CALLS_PER_DAY}回）を越えます。回数か使うAIを減らしてください。`,
      },
    }
  }
  const asError = async (res) => ({ status: res.status, error: await res.json() })
  const capped = await spendGuard('aio', RUNS_PER_DAY)
  if (capped) return asError(capped)
  // The day's ceiling in calls, reserved in full now, so a leaked admin key
  // cannot spend without limit and a run is refused before it starts rather
  // than cut off half way.
  const overCalls = await spendGuard('aio-calls', CALLS_PER_DAY, plan.calls)
  if (overCalls) return asError(overCalls)
  const run = {
    id: `${jstDate()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    auto: !!opts.auto,
    settings: {
      samples,
      engines,
      questionsHash: questionSetHash(list),
      questionCount: list.length,
      customQuestions: custom,
      models: Object.fromEntries(engines.map((id) => [id, ENGINES[id].model()])),
      judgeModel: JUDGE_MODEL,
    },
    questions: list,
    results: [],
    summary: null,
  }
  let storeWarning = null
  if (cfg) {
    try {
      await writeRun(cfg, run)
      await pipeline(cfg, [['LPUSH', INDEX, run.id], ['LTRIM', INDEX, 0, 59]])
    } catch (e) {
      // 保存できないだけ。計測は回せるので、そのまま回して最後に
      // ブラウザ側へ返します（そちらが原本を持っています）。
      storeWarning = describeError(e, 0).message
    }
  }
  return { run, plan, storeWarning }
}

/** 1つの質問を1つのAIに1回聞いた結果。失敗も同じ形で返します。
 *  paused のときは resume を付けて返すので、続きは呼んだ側が送ります。 */
export async function askOnce(keys, item, engine, sample, continuation = 0, resumeIn = null) {
  const t0 = Date.now()
  let result
  try {
    const resume = engine === 'claude' && continuation > 0 && Array.isArray(resumeIn) ? resumeIn : null
    const a = await askEngine(engine, keys[engine], item.q, { timeoutMs: ASK_TIMEOUT_MS, resume })
    result = scoreAnswer(item, a, sample)
    if (a.paused) {
      if (continuation < MAX_CONTINUATIONS) {
        result.paused = true
        result.resume = a.resume
      } else {
        result.truncated = true
        result.truncReason = 'paused'
      }
    }
    result.continuations = continuation
    result.ms = Date.now() - t0
  } catch (e) {
    const d = describeError(e, Date.now() - t0)
    result = {
      key: `${item.id}#${engine}#${sample}`, id: item.id, cat: item.cat, q: item.q, branded: isBranded(item),
      engine, model: ENGINES[engine].model(), sample, answer: '',
      named: false, verdict: null, cited: false, citedRank: null, citedUrls: [], searched: false,
      searchCount: 0, sources: [], sourceUrls: [], ownPages: [], companies: [],
      // 画面に出るのは短い日本語、原因の特定に要る素の文は detail に。
      error: ERROR_HINTS[d.kind] || d.message,
      errorKind: d.kind,
      detail: d,
      ms: d.ms,
    }
  }
  return result
}

/** 集めた回答から集計して、計測を閉じる。 */
export async function finalizeRun(cfg, run, sent, analysisFailures) {
  const merged = new Map()
  for (const r of run.results || []) if (keyOf(r)) merged.set(keyOf(r), r)
  if (cfg) for (const r of await readAnswers(cfg, run.id)) merged.set(keyOf(r), r)
  // The browser's copy wins: it carries the verdicts, and the answers that
  // never reached the store (a request that failed outright was written
  // nowhere, so without these the report could not tell a failure from a
  // question that was never asked).
  for (const r of sent || []) if (r && typeof r.id === 'string') merged.set(keyOf(r), storable(r))
  const results = [...merged.values()].slice(0, LIMITS.questions * 5 * ENGINE_IDS.length)
  if (!results.length) return { status: 400, error: { ok: false, message: '集計できる回答がありません。' } }

  // Nothing was judged at all — treat it as the judge having failed rather
  // than reporting every answer as a miss.
  const fallback = !results.some((r) => r.verdict)
  run.companiesFailed = fallback
  run.analysisFailures = (Array.isArray(analysisFailures) ? analysisFailures : []).slice(0, 50)
  run.results = results.map(storable)
  run.summary = summarise(run.results, fallback, run.settings)
  const social = await socialActivity(30)
  run.actions = buildActions(run.results, run.summary, social)
  // Frozen with the run: comparing this month's mention rate against last
  // month's only means something if you can also see what was published in
  // between, and that number moves.
  run.social = social
  run.finishedAt = new Date().toISOString()
  let stored = false
  if (cfg) {
    try {
      await writeRun(cfg, run)
      await pipeline(cfg, [['DEL', RES(run.id)]])
      stored = true
    } catch (_) { stored = false }
  }
  return { run, stored }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const cfg = await storeFor(req)
  const keys = await engineKeys(req)
  const { list, custom } = await loadQuestions(cfg)
  // 自動計測の状態。止まっている計測があれば、ここで続きを呼び直します
  // （画面を開くだけで再開するように）。読めなくても画面は出します。
  let auto = null
  if (cfg) {
    try {
      const A = await import('./_aio-auto.js')
      auto = await A.autoStatus(cfg)
      if (auto.running && auto.stale) auto.kicked = await A.kick(new URL(req.url).origin)
    } catch (_) { auto = null }
  }
  const meta = {
    auto,
    questions: list.length,
    questionSet: { custom, hash: questionSetHash(list), list, defaults: DEFAULT_QUESTIONS.length },
    categories: categoriesOf(list),
    engines: engineMeta(keys),
    samples: { options: SAMPLE_OPTIONS, default: DEFAULT_SAMPLES },
    judgeBatch: JUDGE_BATCH,
    judgeEstUsd: JUDGE_EST_USD,
    estimateUsd: planRun(list.length, DEFAULT_SAMPLES, ['claude'], { claude: ENGINES.claude.estUsd }).usd,
    limits: { ...LIMITS, callsPerDay: CALLS_PER_DAY },
    aiReady: !!keys.claude,
    stored: !!cfg,
    brand: BRAND.domain,
    brandName: BRAND.name,
  }
  // What went out in the same window. An answer engine has to have something
  // recent to find; a mention rate read without the publishing rate beside it
  // invites the wrong fix.
  const social = await socialActivity(30)
  // Without a store there is no shared history to send; the browser keeps its
  // own and draws that. The panel is otherwise fully usable.
  if (!cfg) return json({ ok: true, meta, social, latest: null, history: [], runs: [] })

  let ids = []
  try {
    const [raw] = await pipeline(cfg, [['LRANGE', INDEX, 0, 29]])
    ids = Array.isArray(raw) ? raw : []
  } catch (_) {
    return json({ ok: false, code: 'STORE_ERROR', message: '保存先の読み取りに失敗しました。', meta }, 502)
  }

  if (!ids.length) return json({ ok: true, meta, social, latest: null, history: [] })

  const runs = (await pipeline(cfg, ids.map((id) => ['GET', RK(id)])))
    .map((raw) => { try { return JSON.parse(raw) } catch (_) { return null } })
    .filter(Boolean)

  // A specific past run, when asked for. Comparing against a month ago is the
  // whole point of measuring repeatedly, and only the newest was reachable.
  const wanted = new URL(req.url).searchParams.get('run')
  const latest = (wanted && runs.find((r) => r.id === wanted)) || runs[0] || null

  // A run that never finished keeps its answers in the per-answer hash.
  if (latest && !latest.summary) {
    const have = new Set((latest.results || []).map(keyOf))
    for (const r of await readAnswers(cfg, latest.id)) if (!have.has(keyOf(r))) (latest.results = latest.results || []).push(r)
  }

  /* 前の回。繰り返し測る意味は、前と比べられることにしかありません。
     ただし比べてよいのは、同じ質問を同じAIに聞いた回だけです。違う回と
     並べると、質問を入れ替えただけで「上がった」と読めてしまいます。
     そして差が誤差の範囲かどうかを、必ず一緒に言います。 */
  const pos = latest ? runs.indexOf(latest) : -1
  const older = pos >= 0 ? runs.slice(pos + 1).filter((r) => r.summary) : []
  const before = latest && latest.summary ? older.find((r) => comparable(latest, r).ok) : null
  const skipped = latest && latest.summary && older.length && older[0] !== before
    ? { id: older[0].id, finishedAt: older[0].finishedAt, reason: comparable(latest, older[0]).reason }
    : null
  const names = (list) => new Set((list || []).filter((c) => !c.us).map((c) => companyKey(c.name)))
  const label = (list) => new Map((list || []).filter((c) => !c.us).map((c) => [companyKey(c.name), c.name]))
  let prev = null
  if (before) {
    const ls = latest.summary
    const bs = before.summary
    const cmp = (k) => ({
      before: bs.stats && bs.stats[k],
      after: ls.stats && ls.stats[k],
      ...compareRates(bs.stats && bs.stats[k], ls.stats && ls.stats[k]),
    })
    const nowNames = label(ls.competitors)
    const thenNames = label(bs.competitors)
    prev = {
      comparable: true,
      id: before.id,
      finishedAt: before.finishedAt,
      asked: bs.asked,
      total: bs.total || bs.asked,
      openMentionRate: bs.openMentionRate,
      recommendRate: bs.recommendRate,
      citeRate: bs.citeRate,
      settings: before.settings,
      compare: { recommend: cmp('recommend'), openMention: cmp('openMention'), cite: cmp('cite') },
      skipped,
      // 前回に無くて今回いる会社／面と、その逆。
      newCompetitors: [...names(ls.competitors)].filter((n) => !names(bs.competitors).has(n)).map((n) => nowNames.get(n)).slice(0, 8),
      goneCompetitors: [...names(bs.competitors)].filter((n) => !names(ls.competitors).has(n)).map((n) => thenNames.get(n)).slice(0, 8),
      newSources: [...new Set((ls.topSources || []).map((h) => h.name))]
        .filter((n) => !(bs.topSources || []).some((h) => h.name === n)).slice(0, 8),
    }
  } else if (skipped) {
    prev = { comparable: false, ...skipped }
  }

  const brief = (r) => ({
    id: r.id,
    finishedAt: r.finishedAt,
    auto: !!r.auto,
    mentionRate: r.summary.mentionRate,
    openMentionRate: r.summary.openMentionRate,
    recommendRate: r.summary.recommendRate,
    citeRate: r.summary.citeRate,
    asked: r.summary.asked,
    stats: r.summary.stats ? { openMention: r.summary.stats.openMention, recommend: r.summary.stats.recommend, cite: r.summary.stats.cite } : null,
    settings: r.settings ? { samples: r.settings.samples, engines: r.settings.engines, questionsHash: r.settings.questionsHash } : null,
  })
  const finished = runs.filter((r) => r.summary)
  return json({ ok: true, meta, social, latest, prev, runs: finished.map(brief), history: finished.map(brief) })
}

/** Save this site's own question list, or go back to the defaults. Kept in
 *  the store, because the list is what a client edits — not something to
 *  redeploy for. */
export async function PUT(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await storeFor(req)
  if (!cfg) return json(NO_STORE, 503)
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  try {
    if (body && body.reset === true) {
      await pipeline(cfg, [['DEL', QKEY]])
      return json({ ok: true, custom: false, questions: DEFAULT_QUESTIONS.length })
    }
    const v = validateQuestions(body && body.questions)
    if (!v.ok) return json({ ok: false, message: v.message }, 400)
    await pipeline(cfg, [['SET', QKEY, JSON.stringify(v.questions)]])
    return json({ ok: true, custom: true, questions: v.questions.length, hash: questionSetHash(v.questions) })
  } catch (e) {
    return json({ ok: false, code: 'STORE_ERROR', message: '保存先への書き込みに失敗しました。' }, 502)
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const keys = await engineKeys(req)
  const cfg = await storeFor(req)

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  const action = body && body.action

  /* 自動計測（_aio-auto.js）。設定の保存と「今すぐ自動で計測」。
     自動の計測はサーバーだけで進むので、保存先と CRON_SECRET が要ります。 */
  if (action === 'auto-save' || action === 'auto-now') {
    if (!storeConfig()) return json({ ok: false, message: '自動計測には保存先（Upstash Redis）を Vercel の環境変数に入れる必要があります。' }, 503)
    const A = await import('./_aio-auto.js')
    const store = storeConfig()
    if (action === 'auto-save') {
      await A.saveSettings(store, { on: body.on, every: body.every, samples: body.samples, engines: body.engines })
      return json({ ok: true, auto: await A.autoStatus(store) })
    }
    if (!(process.env.CRON_SECRET || '').trim()) {
      return json({ ok: false, code: 'NO_CRON_SECRET', message: 'CRON_SECRET が未設定のため、自動計測を動かせません。Vercel の環境変数に入れてください。' }, 503)
    }
    const r = await A.startAuto(store, 'manual')
    if (!r.ok) return json({ ok: false, message: r.message }, 400)
    const kicked = await A.kick(new URL(req.url).origin)
    return json({ ok: true, kicked, auto: await A.autoStatus(store) })
  }

  // The judge is Claude whichever engines answer, so its key is required.
  if (!keys.claude) return json(NO_AI, 503)

  if (action === 'start') {
    const r = await startRun(cfg, keys, { samples: body.samples, engines: body.engines })
    if (r.error) return json(r.error, r.status)
    const { run, plan, storeWarning } = r
    return json({
      ok: true, runId: run.id, startedAt: run.startedAt, stored: !!cfg && !storeWarning, storeWarning,
      samples: run.settings.samples, engines: run.settings.engines, settings: run.settings, plan,
      // The pause between two answers from the same engine. Back to back, the
      // provider's per-minute limit cuts the second half of a run off.
      paceMs: 1500,
      maxContinuations: MAX_CONTINUATIONS,
      judgeBatch: JUDGE_BATCH,
      questions: run.questions.map(({ id, cat, q, branded }) => ({ id, cat, q, branded })),
    })
  }

  /* 1問だけ、その場で試す。
     全部を回して、返ってきたのが英語の一文だけ——という回り方をもう一度
     させないための入口です。壊れているかどうかを確かめるのに、毎回
     フルの計測を走らせる必要はありません。 */
  if (action === 'probe') {
    const capped = await spendGuard('aio-probe', 20)
    if (capped) return capped
    const engine = ENGINES[body.engine] ? body.engine : 'claude'
    if (!keys[engine]) return json({ ok: false, message: `${ENGINES[engine].label} のキーが未設定です。` }, 400)
    const { list } = await loadQuestions(cfg)
    const item = list[clampInt(body.index, 0, list.length - 1, 0)]
    const t0 = Date.now()
    try {
      const a = await askEngine(engine, keys[engine], item.q, { timeoutMs: ASK_TIMEOUT_MS })
      const r = scoreAnswer(item, a, 0)
      return json({
        ok: true,
        probe: {
          ok: true, q: item.q, engine, ms: Date.now() - t0,
          named: r.named, cited: r.cited, searched: r.searched, searchCount: r.searchCount,
          citedCount: r.citedUrls.length, truncated: r.truncated, paused: !!a.paused,
          sources: (r.sources || []).slice(0, 6),
          preview: String(r.answer || '').slice(0, 200),
        },
      })
    } catch (e) {
      const d = describeError(e, Date.now() - t0)
      return json({ ok: true, probe: { ok: false, q: item.q, engine, ...d, hint: ERROR_HINTS[d.kind] } })
    }
  }

  if (action === 'ask') {
    const engine = ENGINES[body.engine] ? body.engine : 'claude'
    if (!keys[engine]) return json({ ok: false, message: `${ENGINES[engine].label} のキーが未設定です。` }, 400)
    const capped = await spendGuard('aio-ask', ASK_PER_DAY)
    if (capped) return capped
    const index = Number(body.index)
    const sample = clampInt(body.sample, 0, 4, 0)
    const continuation = clampInt(body.continuation, 0, MAX_CONTINUATIONS, 0)

    // With a store, the question comes from the run as it was started; the
    // browser cannot swap it. Without one, the browser is holding the run and
    // sends the question, which is checked like a saved one.
    let run = cfg ? await readRun(cfg, body.runId) : null
    let storeWarning = null
    if (run && run.unreachable) {
      // 保存先が落ちている。質問は投げられるので投げる。
      storeWarning = run.unreachable
      run = null
    }
    let item = run && Array.isArray(run.questions) ? run.questions[index] : null
    if (!item && body.question) {
      const v = validateQuestions([body.question])
      if (v.ok) item = v.questions[0]
    }
    if (!item) return json({ ok: false, message: '質問が見つかりません。最初からやり直してください。' }, 400)

    const result = await askOnce(keys, item, engine, sample, continuation, body.resume)

    // 保存に失敗しても、取れた回答は捨てない。ここで例外を投げていたので、
    // 料金を払って取れた回答がそのまま消え、ブラウザ側には理由の分からない
    // 失敗だけが残っていました。
    if (cfg && run && !result.paused) {
      try {
        await pipeline(cfg, [['HSET', RES(run.id), result.key, JSON.stringify(storable(result))], ['EXPIRE', RES(run.id), RUN_TTL]])
      } catch (e) {
        storeWarning = describeError(e, 0).message
      }
    }
    return json({ ok: true, index, sample, engine, result, storeWarning })
  }

  if (action === 'judge') {
    const capped = await spendGuard('aio-judge', JUDGE_PER_DAY)
    if (capped) return capped
    const items = (Array.isArray(body.items) ? body.items : [])
      .filter((r) => r && typeof r.key === 'string' && r.answer)
      .slice(0, JUDGE_BATCH)
      .map((r) => ({ key: r.key.slice(0, 120), q: String(r.q || '').slice(0, LIMITS.q), answer: String(r.answer).slice(0, 4000) }))
    if (!items.length) return json({ ok: false, message: '判定する回答がありません。' }, 400)
    // 自動リトライは切る。内側で粘られると、その合計がエッジ関数の持ち
    // 時間を越えて、外から切られる。再試行はブラウザ側で行います。
    const client = new Anthropic({ apiKey: keys.claude, maxRetries: 0 })
    const t0 = Date.now()
    try {
      return json({ ok: true, verdicts: await analyseBatch(client, items) })
    } catch (e) {
      // 他のまとまりは残る。ただし「なぜこの4件だけ判定されなかったのか」は
      // 残さないと、判定できた回答の数の意味が分からないままになります。
      return json({ ok: true, verdicts: {}, failure: { keys: items.map((r) => r.key), ...describeError(e, Date.now() - t0) } })
    }
  }

  if (action === 'finalize') {
    // From the store if there is one; otherwise the browser sends back the
    // answers it collected one by one.
    let run = cfg ? await readRun(cfg, body.runId) : null
    // 保存先が読めない・その計測が無い（開始時の書き込みに失敗していた等）
    // ときも、ブラウザが答えを持っていれば、それで集計する。最後の一歩で、
    // 取れている回答を全部捨てるのが一番もったいない。
    if (!run || run.unreachable) run = runFromBody(body)
    const r = await finalizeRun(cfg, run, Array.isArray(body && body.results) ? body.results : [], body.analysisFailures)
    if (r.error) return json(r.error, r.status)
    // stored:false のとき、ブラウザはこの結果を自分の端末に残します。
    return json({ ok: true, run: r.run, stored: r.stored })
  }

  return json({ ok: false, message: '不明な操作です。' }, 400)
}
