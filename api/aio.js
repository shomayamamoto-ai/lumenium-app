export const config = { runtime: 'edge' }

// SEO / AIO visibility probe.
//
// Asks an answer engine the questions a customer would actually type, with
// live web search on, and records whether Lumenium comes back. See
// _aio-catalog.js for what this does and does not claim to measure.
//
// The run is driven one question per request rather than as a single long
// call: an edge function has to answer quickly, and a web-searched answer
// takes ten to thirty seconds. One question per request also means a failure
// costs one question, not the whole run, and the browser can show progress.
//
//   POST {action:'start'}              -> {runId, questions}
//   POST {action:'ask', runId, index}  -> one scored answer, appended to the run
//   POST {action:'finalize', runId}    -> extracts company mentions, writes the summary
//   GET  ?days=90                      -> the latest run plus the history

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import { storeFor, pipeline, jstDate } from './_analytics-store.js'
import { socialActivity } from './_social.js'
import {
  QUESTIONS, CATEGORIES, BRAND, costEstimateUsd, ASK_MODEL, JUDGE_MODEL, MIN_FOR_RATE,
  namesBrand, citesBrand, hostOf, isHit, VERDICTS,
} from './_aio-catalog.js'

const MODEL = ASK_MODEL

/* 1問にかけてよい時間。
   エッジ関数は最初の応答までに使える時間が決まっていて、そこを越えると
   プラットフォーム側に切られます。切られ方が悪く、返ってくるのはJSONでは
   ないので、ブラウザ側では「なぜ落ちたか分からない失敗」になります。実際
   16問中9問がそれで消えていて、画面には英語の一文だけが残っていました。
   自分で先に打ち切れば、理由の付いた失敗として記録できます。
   SDK 側の自動リトライも切ってあります（内側で3回粘られると、その合計が
   プラットフォームの上限を越えてしまうため）。 */
const ASK_TIMEOUT_MS = 18000
const ANALYSE_TIMEOUT_MS = 22000

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
  else if (status === 400) kind = 'request'
  else if (/fetch failed|network|connection|socket/i.test(raw)) kind = 'network'
  return { kind, name, status, ms: ms || 0, message: raw.slice(0, 300) }
}

export const ERROR_LABELS = {
  timeout: '時間切れ',
  auth: 'APIキーが拒否された',
  rate: '短時間に呼びすぎ',
  server: 'Anthropic側の障害',
  request: 'リクエストが受け付けられない',
  network: '通信が切れた',
  store: '保存先への書き込み失敗',
  unknown: '原因不明',
}

/** 種類ごとに、次にやることを1つだけ。 */
export const ERROR_HINTS = {
  timeout: '応答が18秒を超えました。ウェブ検索つきの回答は時間がかかるため、混み合う時間帯に起きます。再試行では検索回数を減らして掛け直します。続くようなら時間を空けてください。',
  auth: 'APIキーが拒否されました。設定状況の画面でキーを入れ直してください（期限切れ・権限・残高のいずれかです）。',
  rate: '短時間に呼びすぎです。Anthropic側の上限に当たっています。数分おいてから再開してください。',
  server: 'Anthropic側で一時的な障害が起きています。時間を空けて再実行してください。',
  request: '送っている内容をAPIが受け付けませんでした。モデル名かウェブ検索機能の指定が、いまのAPIと合っていない可能性があります。',
  network: '通信が途中で切れました。再実行すれば通ることがほとんどです。',
  store: '回答は取得できましたが、保存先への書き込みに失敗しました。結果はこの端末に残っています。',
  unknown: '原因を特定できませんでした。下の詳細をそのまま伝えてください。',
}
const RUN_TTL = 400 * 24 * 60 * 60
const RK = (id) => `lum:aio:run:${id}`
const INDEX = 'lum:aio:index'

// Kept for the store's own errors. A missing store is no longer one of them:
// a run used to need a database as well as a key, so an admin who had pasted
// the key still met 「保存先が未設定です」 and a disabled button, with nothing
// on the key's own row to say a second thing was required. The run now keeps
// its state in the request while it is going, and the browser keeps the
// finished report — the database, when there is one, is what makes that
// history shared between devices rather than what makes the run possible.
const NO_STORE = {
  ok: false,
  code: 'STORE_NOT_CONFIGURED',
  message:
    '保存先が未設定です。Vercel の Storage から Upstash Redis を接続してください（KV_REST_API_URL と KV_REST_API_TOKEN が自動で入ります）。手で入れる場合は UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN でも構いません。',
}

/** The shape a run has to have, whether it came from the store or from the
 *  browser that is running it. Anything else in the body is ignored. */
function runFromBody(body) {
  const results = Array.isArray(body && body.results) ? body.results : []
  return {
    id: String((body && body.runId) || '').slice(0, 64) || `${jstDate()}-local`,
    startedAt: String((body && body.startedAt) || new Date().toISOString()).slice(0, 40),
    finishedAt: null,
    model: MODEL,
    results: results.filter((r) => r && typeof r.id === 'string').slice(0, 64),
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
async function readRun(cfg, id) {
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

/** Ask one question with web search on, and score the answer.
 *
 *  `attempt` > 0 means this question already failed once. The retry searches
 *  less: the overwhelming majority of failures are the answer taking longer
 *  than the function is allowed to live, and fewer searches is the one dial
 *  that shortens it without changing what is being measured. */
async function askOne(client, item, attempt = 0) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    // Low effort on purpose: the job is to search and report what is out
    // there, not to reason hard about it. It also keeps the call inside the
    // time an edge function has to answer in.
    output_config: { effort: 'low' },
    system:
      '日本のユーザーからの質問に、実際にウェブを検索して答えてください。' +
      '実在する会社名を挙げるときは、検索結果で確認できたものだけを挙げてください。' +
      // 短く答えさせるのは体裁の問題ではなく、時間の問題です。長い回答は
      // そのぶん返ってくるのが遅く、返ってこなければ計測になりません。
      '推測や一般論で会社名を作らないこと。300字程度で簡潔に答えてください。',
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: attempt ? 2 : 3 }],
    messages: [{ role: 'user', content: item.q }],
  }, { timeout: ASK_TIMEOUT_MS })

  // A server tool that fails returns HTTP 200 with an error object where the
  // result list would be, so branch on the shape before indexing it.
  const urls = []
  let answer = ''
  for (const block of res.content || []) {
    if (block.type === 'text') answer += block.text
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r && r.url) urls.push(r.url)
    }
  }

  const sources = [...new Set(urls.map(hostOf).filter(Boolean))]
  /* 引用元は、これまでホスト名に丸めていました。「発注ナビが読まれた」
     までは分かっても、その中のどのページかは分からず、載りに行く先を
     決められません。URLのまま残します（1問8件まで）。 */
  const sourceUrls = [...new Set(urls)].slice(0, 8)
  /* 自社サイトだけは、どのページが読まれたかまで残す。
     これまで引用元はホスト名に丸めていたので、「lumenium.net が読まれた」
     とは分かっても、about なのか動画のサービスページなのかは分からず、
     どのページが働いているかを知る手段がありませんでした。他社のURLは
     そこまで要らないので丸めたままにします。 */
  const ownPages = [...new Set(urls
    .filter((u) => {
      const h = hostOf(u)
      return h === BRAND.domain || h.endsWith('.' + BRAND.domain)
    })
    .map((u) => { try { return new URL(u).pathname || '/' } catch (_) { return '' } })
    .filter(Boolean))]
  return {
    id: item.id,
    cat: item.cat,
    q: item.q,
    answer: answer.trim(),
    // Whether the name is in the text. Shown live so the run has something to
    // report as it goes; the verdict that the report is built from is decided
    // in finalize, by reading the answer rather than searching it.
    named: namesBrand(answer),
    verdict: null,
    cited: citesBrand(urls),
    sources,
    sourceUrls,
    ownPages,
    searched: urls.length,
    companies: [],
    error: res.stop_reason === 'refusal' ? 'refusal' : null,
  }
}

/** One pass over every answer: which companies it named, and how it treated
 *  us. A forced tool call is used rather than free text so the shape is fixed.
 *
 *  The verdict is here rather than in a regex because the distinction that
 *  matters cannot be made by searching for the name. 「ルメニウムは見つかり
 *  ませんでした」 contains the name and is the opposite of a hit. */
async function analyseAnswers(client, results) {
  const usable = results.filter((r) => r.answer && !r.error)
  if (!usable.length) return {}

  // In batches, because this used to be one call for every answer in the run
  // with a 4,000 token ceiling on its reply. Sixteen answers do not fit: the
  // tool call was cut off part way through the list and the run reported
  // 「判定できた質問 7」 out of sixteen — more than half the work measured,
  // paid for, and then thrown away, which is most of why the report had
  // nothing in it. Four at a time fits with room to spare, and a batch that
  // fails now costs four verdicts instead of all of them.
  const out = {}
  const failures = []
  const SIZE = 4
  for (let i = 0; i < usable.length; i += SIZE) {
    const batch = usable.slice(i, i + SIZE)
    const t0 = Date.now()
    try {
      Object.assign(out, await analyseBatch(client, batch))
    } catch (e) {
      // 他のまとまりは残る。ただし「なぜこの4問だけ判定されなかったのか」は
      // 残さないと、判定できた質問 7/16 の意味が分からないままになります。
      failures.push({ ids: batch.map((r) => r.id), ...describeError(e, Date.now() - t0) })
    }
  }
  return { out, failures }
}

async function analyseBatch(client, usable) {

  const tool = {
    name: 'record_analysis',
    description: '各回答について、挙がっていた会社名と、ルメニウムの扱われ方を記録する。',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '回答のID' },
              companies: {
                type: 'array',
                items: { type: 'string' },
                description: '回答文中に名前が出てきた会社名のみ。一般名詞や役所・媒体名は除く。',
              },
              missing: {
                type: 'string',
                description:
                  'ルメニウムを「確認できない」「見つからない」とした場合に、' +
                  'その回答が不足として挙げている情報（例: 所在地、法人登記、第三者の掲載、実績）。' +
                  '回答文に書かれていない場合は空文字。40字以内。',
              },
              lumenium: {
                type: 'string',
                enum: Object.keys(VERDICTS),
                description:
                  'recommended=依頼先・候補として挙げられている / ' +
                  'mentioned=実在する会社として説明されているが依頼先としては挙がっていない / ' +
                  'denied=見つからない・確認できない・情報がないと書かれている / ' +
                  'other_company=同名の別会社（Lumenium LLC、Lumentum など）の話しかしていない / ' +
                  'absent=まったく出てこない',
              },
            },
            required: ['id', 'companies', 'lumenium'],
          },
        },
      },
      required: ['items'],
    },
  }

  // Long answers are trimmed: the verdict and the company names are decided in
  // the first part of an answer, and the whole of one can be several thousand
  // tokens of citations.
  const payload = usable
    .map((r) => `### ${r.id}\n質問: ${r.q}\n回答: ${String(r.answer).slice(0, 4000)}`)
    .join('\n\n')

  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 3000,
    output_config: { effort: 'low' },
    system:
      '与えられた各回答について、2つのことを記録してください。\n' +
      '1) その回答文中で実際に社名が挙がっている会社だけを列挙する。' +
      '回答に出てこない会社を推測で足さないこと。媒体名・ディレクトリ名（例: 発注ナビ、比較biz）や、' +
      '官公庁・団体名は会社として数えないでください。\n' +
      '3) 確認できない・見つからないとした回答については、何が不足しているとその回答が述べているかを missing に短く書く' +
      '（回答文に書かれていない場合は空文字。推測で埋めないこと）。\n' +
      '2) 日本の制作・DX支援会社である「ルメニウム / Lumenium（lumenium.net）」が、その回答でどう扱われたか。' +
      '名前が出てくるかどうかではなく、扱われ方で判定してください。' +
      '「見つかりませんでした」「確認できません」は名前が出ていても denied です。' +
      '米国の Lumenium LLC（エンジン）や Lumentum（光学）は別会社なので、' +
      'それらの話しかしていなければ other_company です。',
    tools: [tool],
    tool_choice: { type: 'tool', name: 'record_analysis' },
    messages: [{ role: 'user', content: payload }],
  }, { timeout: ANALYSE_TIMEOUT_MS })

  const call = (res.content || []).find((b) => b.type === 'tool_use')
  const out = {}
  const items = call && call.input && Array.isArray(call.input.items) ? call.input.items : []
  for (const it of items) {
    if (!it || typeof it.id !== 'string') continue
    out[it.id] = {
      companies: Array.isArray(it.companies)
        ? it.companies.map((c) => String(c).trim()).filter(Boolean).slice(0, 12)
        : [],
      // 相手が「何が足りない」と言ったか。回答文の中にしかなく、16本を
      // 人が読まないかぎり誰も気づかない一文です。ここが、自社サイトに
      // 何を足せばよいかを直接決めます。
      missing: String(it.missing || '').trim().slice(0, 60),
      // An unrecognised value is left null and excluded from the rates, rather
      // than being rounded towards either answer.
      verdict: VERDICTS[it.lumenium] ? it.lumenium : null,
    }
  }
  return out
}

/** Everything the report shows is derived here, from the stored answers.
 *
 *  `fallback` means the analysis pass did not run, so there is no verdict and
 *  the only thing left is whether the name is in the text. That is the old,
 *  wrong measure, so the run is marked and the UI says which one it is. */
function summarise(results, fallback) {
  const hit = (r) => (fallback ? !!r.named : isHit(r.verdict))
  // An answer with no verdict is not evidence either way, so it is left out of
  // the denominator rather than counted as a miss.
  const judged = (r) => r && !r.error && r.answer && (fallback || r.verdict)
  const done = results.filter(judged)
  const rate = (list) => (list.length ? list.filter(hit).length / list.length : 0)

  /* 分野ごとの成績。
     率は、答えが返ってきた数が MIN_FOR_RATE に届いた分野にだけ付けます。
     1問しか返っていない分野の率は 0% か 100% にしかならず、分野の傾向
     としては読めないのに、他の分野と同じ顔で並んでしまうからです
     （アクセス解析で割合を伏せたのと同じ理由です）。
     質問を出した数そのものが少ないときだけでなく、失敗して返って
     こなかったときにも効きます——8問中1問しか返らなかった分野は、
     8問ぶんの信頼性を持ちません。 */
  const byCategory = CATEGORIES.map((cat) => {
    const list = done.filter((r) => r.cat === cat)
    const planned = results.filter((r) => r && r.cat === cat).length
    const thin = list.length < MIN_FOR_RATE
    return {
      cat,
      asked: list.length,
      planned,
      mentions: list.filter(hit).length,
      cites: list.filter((r) => r.cited).length,
      thin,
      rate: thin ? null : rate(list),
    }
  }).filter((c) => c.planned > 0)

  // Share of voice: how often each company was named, us included, across the
  // questions where nobody typed our name. The 指名 questions are excluded —
  // we are named there by construction, and counting them flatters us.
  const open = done.filter((r) => r.cat !== 'ブランド指名')
  const tally = new Map()
  for (const r of open) {
    for (const c of new Set(r.companies || [])) {
      // Our own row is counted from the verdict below and nowhere else. The
      // extractor also returns us by name, and counting both put Lumenium at
      // 26 out of a possible 13.
      if (namesBrand(c)) continue
      tally.set(c, (tally.get(c) || 0) + 1)
    }
  }
  tally.set('Lumenium', open.filter(hit).length)
  const competitors = [...tally.entries()]
    .map(([name, count]) => ({
      name,
      count,
      share: open.length ? count / open.length : 0,
      us: name === 'Lumenium',
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  const hosts = new Map()
  for (const r of done) for (const h of new Set(r.sources || [])) hosts.set(h, (hosts.get(h) || 0) + 1)

  /* 複数の質問で読まれたページ。ここに自社が載っていない限り、そのカテゴリ
     の答えの材料に入りません。ドメインではなくページ単位で出すのは、
     「発注ナビに載る」ではなく「この一覧ページに載る」が実際の作業だから
     です。 */
  const pages = new Map()
  for (const r of done) {
    for (const u of new Set(r.sourceUrls || [])) {
      const h = hostOf(u)
      if (!h || h === BRAND.domain || h.endsWith('.' + BRAND.domain)) continue
      pages.set(u, (pages.get(u) || 0) + 1)
    }
  }

  // 働いているページ。読まれていないページを直しても、出現率は動きません。
  const own = new Map()
  for (const r of done) for (const p of new Set(r.ownPages || [])) own.set(p, (own.get(p) || 0) + 1)

  const answered = results.filter((r) => r && !r.error && r.answer)
  const counted = (v) => done.filter((r) => r.verdict === v).length

  /* 失敗の内訳。「出現率 0%」と「16問中7問しか返ってこなかった」は、
     同じ画面に並んでいても意味がまるで違います。前者は結果、後者は結果が
     無いということ。種類ごとに数えて、率と一緒に必ず出します。 */
  const errorKinds = {}
  for (const r of results) {
    if (!r || !r.error) continue
    const k = r.errorKind || 'unknown'
    if (!errorKinds[k]) errorKinds[k] = { kind: k, label: ERROR_LABELS[k] || k, hint: ERROR_HINTS[k] || '', count: 0, sample: '', ms: 0 }
    errorKinds[k].count++
    errorKinds[k].sample = errorKinds[k].sample || ((r.detail && r.detail.message) || r.error || '')
    errorKinds[k].ms = Math.max(errorKinds[k].ms, (r.detail && r.detail.ms) || r.ms || 0)
  }

  // 相手が足りないと言ったこと。同じ趣旨が何度も出るなら、それが次に
  // 書くべきものです。
  const missing = [...new Set(results.map((r) => (r && r.missing) || '').filter(Boolean))].slice(0, 8)

  return {
    missingEvidence: missing,
    asked: done.length,
    // 出した質問の数。率の分母がこれより小さいときは、率を読む前に
    // 「取れた分だけの率だ」と分かる必要があります。
    total: results.length,
    coverage: results.length ? done.length / results.length : 0,
    errors: Object.values(errorKinds).sort((a, b) => b.count - a.count),
    // Answers that came back but could not be judged, kept apart from the ones
    // that never came back at all.
    unjudged: answered.length - done.length,
    failed: results.length - answered.length,
    fallback: !!fallback,
    mentionRate: rate(done),
    openMentionRate: rate(open),
    // The number to act on: named as somewhere you could actually go. A
    // mention that merely confirms we exist does not win work.
    recommendRate: open.length ? open.filter((r) => r.verdict === 'recommended').length / open.length : 0,
    verdicts: fallback ? null : {
      recommended: counted('recommended'),
      mentioned: counted('mentioned'),
      denied: counted('denied'),
      other_company: counted('other_company'),
      absent: counted('absent'),
    },
    citeRate: done.length ? done.filter((r) => r.cited).length / done.length : 0,
    byCategory,
    competitors,
    citedPages: [...pages.entries()]
      .map(([url, count]) => ({ url, host: hostOf(url), count }))
      .filter((p) => p.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    ownPages: [...own.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    topSources: [...hosts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  }
}

/** What to do next, read out of the run rather than guessed at.
 *
 *  The report used to stop at the rates: 「非指名 0%」 is a fact, not an
 *  instruction, and a list of fifteen competitors each named once says who is
 *  winning without saying what they did. Every item below names the evidence
 *  it came from — the questions, the companies, the pages the answer actually
 *  read — so it can be checked rather than believed. Nothing here is written
 *  by a model; it is arithmetic over what came back, which is why it can be
 *  trusted to say 「まだ分からない」 when the run did not measure enough. */
function buildActions(results, s, social) {
  const done = results.filter((r) => r && !r.error && r.answer)
  const open = done.filter((r) => r.cat !== 'ブランド指名')
  const out = []

  // 1. Questions where the answer said we could not be found. That is not a
  //    ranking problem — the page exists and says so — it is an evidence
  //    problem, and it is the one thing that blocks every other question.
  const denied = done.filter((r) => r.verdict === 'denied')
  if (denied.length) {
    out.push({
      rank: 1,
      title: `「実在が確認できない」と答えられた質問が ${denied.length} 件`,
      why: 'サイトの中で何を書いても、外に裏づけが無いと答えるエンジンには確認できません。自社サイトだけが情報源の会社は、存在を疑われる側に置かれます。',
      how: '第三者の面に社名・所在地・代表者・URLを同じ表記で載せる（法人番号公表サイト、求人・発注系のディレクトリ、取引先の実績ページ、プレスリリース）。1件ずつ増やすたびにこの数字は下がります。',
      evidence: denied.map((r) => r.q).slice(0, 4),
      kind: 'exists',
    })
  }

  // 2. Where competitors are named and we are not. Per category, with the
  //    names that took the slot — that is the shortlist to be measured against.
  const lost = (s.byCategory || [])
    .filter((c) => c.cat !== 'ブランド指名' && c.asked > 0 && c.mentions === 0)
    .map((c) => {
      const rows = open.filter((r) => r.cat === c.cat)
      const names = [...new Set(rows.flatMap((r) => r.companies || []).filter((n) => !namesBrand(n)))]
      return { cat: c.cat, asked: c.asked, names: names.slice(0, 6), qs: rows.map((r) => r.q) }
    })
    .filter((c) => c.names.length)
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

  // 3. The pages the answer engine actually read. Being on them is the only
  //    lever here that does not depend on our own site at all.
  const ours = (s.topSources || []).filter((h) => h.name === BRAND.domain || h.name.endsWith('.' + BRAND.domain))
  const theirs = (s.topSources || []).filter((h) => !ours.includes(h) && h.count > 1)
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

  // 4. Our own pages: read at all?
  if (done.length) {
    const cites = done.filter((r) => r.cited).length
    out.push({
      rank: 4,
      title: `自社サイトが情報源になった質問 ${cites} / ${done.length} 件`,
      why: cites
        ? '読まれている質問があるということは、ページの作りではなく中身の不足で落ちている質問があるということです。'
        : '一度も読まれていません。ページが無いか、その質問に答える形になっていないかのどちらかです。',
      how: '計測している質問文を、そのままページの見出しにする。答えは最初の2〜3行に置き、そこに金額・対応地域・期間・連絡先を数字で書く。',
      evidence: done.filter((r) => r.cited).map((r) => r.q).slice(0, 4),
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
  if (s.failed || s.unjudged) {
    out.push({
      rank: 0,
      title: `今回の計測で使えなかった質問 ${s.failed + s.unjudged} 件`,
      why: '失敗した質問は「出てこなかった」ではなく「測れなかった」なので、出現率の分母から外してあります。数が多い回の数字は、少ない回と比べないでください。',
      how: 'もう一度計測すると、失敗分だけ取り直せます。続くようなら時間帯を変えてください。',
      evidence: results.filter((r) => r && r.error).map((r) => `${r.q}（${r.error}）`).slice(0, 4),
      kind: 'coverage',
    })
  }

  return out.sort((a, b) => a.rank - b.rank)
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const cfg = await storeFor(req)
  const meta = {
    questions: QUESTIONS.length,
    categories: CATEGORIES,
    estimateUsd: costEstimateUsd(),
    aiReady: !!(await apiKey(req)),
    stored: !!cfg,
    brand: BRAND.domain,
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

  /* 前の回。繰り返し測る意味は、前と比べられることにしかありません。
     同じ0%でも「前も0%」と「前は12%だった」では話がまったく違い、
     競合や引用元の出入りは、何かが動いたかどうかの最初の兆候です。 */
  const before = latest ? runs.filter((r) => r.summary && r.id !== latest.id)[0] : null
  const names = (list) => new Set((list || []).map((c) => c.name))
  const prev = before ? {
    id: before.id,
    finishedAt: before.finishedAt,
    asked: before.summary.asked,
    total: before.summary.total || before.summary.asked,
    openMentionRate: before.summary.openMentionRate,
    citeRate: before.summary.citeRate,
    // 前回に無くて今回いる会社／面と、その逆。
    newCompetitors: latest && latest.summary
      ? [...names(latest.summary.competitors)].filter((n) => !names(before.summary.competitors).has(n) && n !== 'Lumenium').slice(0, 8)
      : [],
    goneCompetitors: latest && latest.summary
      ? [...names(before.summary.competitors)].filter((n) => !names(latest.summary.competitors).has(n) && n !== 'Lumenium').slice(0, 8)
      : [],
    newSources: latest && latest.summary
      ? [...names(latest.summary.topSources)].filter((n) => !names(before.summary.topSources).has(n)).slice(0, 8)
      : [],
  } : null

  return json({
    ok: true,
    meta,
    social,
    latest,
    prev,
    runs: runs.filter((r) => r.summary).map((r) => ({
      id: r.id,
      finishedAt: r.finishedAt,
      openMentionRate: r.summary.openMentionRate,
      asked: r.summary.asked,
    })),
    history: runs
      .filter((r) => r.summary)
      .map((r) => ({
        id: r.id,
        finishedAt: r.finishedAt,
        mentionRate: r.summary.mentionRate,
        openMentionRate: r.summary.openMentionRate,
        citeRate: r.summary.citeRate,
        asked: r.summary.asked,
      })),
  })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const key = await apiKey(req)
  if (!key) return json(NO_AI, 503)

  const cfg = await storeFor(req)

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  const action = body && body.action

  if (action === 'start') {
    // Three full runs a day. A run is roughly $1.54, and the admin key also
    // travels in the members share links — a leaked one should not be able to
    // spend without limit.
    const capped = await spendGuard('aio', 3)
    if (capped) return capped
    const run = {
      id: `${jstDate()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      model: MODEL,
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
    return json({
      ok: true, runId: run.id, startedAt: run.startedAt, stored: !!cfg && !storeWarning, storeWarning,
      questions: QUESTIONS.map(({ id, cat, q }) => ({ id, cat, q })),
    })
  }

  // 自動リトライは切る。内側で3回粘られると、その合計がエッジ関数の持ち
  // 時間を越えて、外から切られる。再試行はこちら側（1問ずつ）で行います。
  const client = new Anthropic({ apiKey: key, maxRetries: 0 })

  /* 1問だけ、その場で試す。
     16問を$1.54かけて回して、返ってきたのが英語の一文だけ——という回り方を
     もう一度させないための入口です。壊れているかどうかを確かめるのに、
     毎回フルの計測を走らせる必要はありません。約$0.10。 */
  if (action === 'probe') {
    const capped = await spendGuard('aio-probe', 20)
    if (capped) return capped
    const item = QUESTIONS[Math.max(0, Math.min(QUESTIONS.length - 1, Number(body.index) || 0))]
    const t0 = Date.now()
    try {
      const r = await askOne(client, item, 0)
      return json({
        ok: true,
        probe: {
          ok: true, q: item.q, ms: Date.now() - t0,
          named: r.named, cited: r.cited, searched: r.searched,
          sources: (r.sources || []).slice(0, 6),
          preview: String(r.answer || '').slice(0, 200),
        },
      })
    } catch (e) {
      const d = describeError(e, Date.now() - t0)
      return json({ ok: true, probe: { ok: false, q: item.q, ...d, hint: ERROR_HINTS[d.kind] } })
    }
  }

  if (action === 'ask') {
    const index = Number(body.index)
    const item = QUESTIONS[index]
    if (!item) return json({ ok: false, message: '質問が見つかりません。' }, 400)
    // With a store the run is kept there between questions; without one the
    // answer goes straight back to the browser, which is holding the run.
    let run = cfg ? await readRun(cfg, body.runId) : null
    let storeWarning = null
    if (run && run.unreachable) {
      // 保存先が落ちている。質問は投げられるので投げる。
      storeWarning = run.unreachable
      run = null
    } else if (cfg && !run) {
      return json({ ok: false, message: '集計セッションが見つかりません。最初からやり直してください。' }, 404)
    }

    const attempt = Math.max(0, Math.min(3, Number(body.attempt) || 0))
    const t0 = Date.now()
    let result
    try {
      result = await askOne(client, item, attempt)
      result.ms = Date.now() - t0
    } catch (e) {
      const d = describeError(e, Date.now() - t0)
      result = {
        id: item.id, cat: item.cat, q: item.q, answer: '',
        named: false, verdict: null, cited: false, sources: [], searched: 0, companies: [],
        // 画面に出るのは短い日本語、原因の特定に要る素の文は detail に。
        error: ERROR_HINTS[d.kind] || d.message,
        errorKind: d.kind,
        detail: d,
        ms: d.ms,
      }
    }

    // 保存に失敗しても、取れた回答は捨てない。ここで例外を投げていたので、
    // 料金を払って取れた回答がそのまま消え、ブラウザ側には理由の分からない
    // 失敗だけが残っていました。
    if (run) {
      run.results = run.results.filter((r) => r.id !== result.id).concat(result)
      try {
        await writeRun(cfg, run)
      } catch (e) {
        storeWarning = describeError(e, 0).message
      }
    }
    return json({ ok: true, index, total: QUESTIONS.length, result, storeWarning })
  }

  if (action === 'finalize') {
    // From the store if there is one; otherwise the browser sends back the
    // answers it collected question by question.
    let run = cfg ? await readRun(cfg, body.runId) : runFromBody(body)
    // 保存先が読めないときは、ブラウザが持っている分だけで集計する。
    // 取れている回答を、保存先の不調だけで捨てるいわれはありません。
    if (run && run.unreachable) run = runFromBody(body)
    // 保存先にその計測が無い（開始時の書き込みに失敗していた等）ときも、
    // ブラウザが答えを持っていれば、それで集計する。最後の一歩で、取れて
    // いる回答を全部捨てるのが一番もったいない。
    if (!run && Array.isArray(body && body.results) && body.results.length) run = runFromBody(body)
    if (!run) return json({ ok: false, message: '集計セッションが見つかりません。' }, 404)
    // A question whose request never came back was written nowhere, so the
    // report could not tell a question that failed from one that was never
    // asked. The browser knows which ones those were; take them from it.
    const sent = Array.isArray(body && body.results) ? body.results : []
    if (cfg && sent.length) {
      const have = new Set(run.results.map((r) => r.id))
      for (const r of sent) {
        if (r && typeof r.id === 'string' && !have.has(r.id)) run.results.push(r)
      }
    }
    if (!run.results.length) return json({ ok: false, message: '集計できる回答がありません。' }, 400)

    let fallback = false
    let analysisFailures = []
    try {
      const { out: byId, failures } = await analyseAnswers(client, run.results)
      analysisFailures = failures
      run.results = run.results.map((r) => ({
        ...r,
        companies: (byId[r.id] && byId[r.id].companies) || [],
        verdict: (byId[r.id] && byId[r.id].verdict) || null,
        missing: (byId[r.id] && byId[r.id].missing) || '',
      }))
      // Nothing came back at all — treat it as the pass having failed rather
      // than reporting every question as a miss.
      if (!run.results.some((r) => r.verdict)) fallback = true
    } catch (_) {
      // The analysis is the second half of the run. A failure here still
      // leaves a usable report rather than losing the answers, but it is only
      // the rough text match, so the run says so and the UI repeats it.
      fallback = true
    }
    run.companiesFailed = fallback
    run.analysisFailures = analysisFailures

    run.summary = summarise(run.results, fallback)
    run.actions = buildActions(run.results, run.summary, await socialActivity(30))
    // Frozen with the run: comparing this month's mention rate against last
    // month's only means something if you can also see what was published in
    // between, and that number moves.
    run.social = await socialActivity(30)
    run.finishedAt = new Date().toISOString()
    let saved = false
    if (cfg) {
      try { await writeRun(cfg, run); saved = true } catch (_) { saved = false }
    }
    // stored:false のとき、ブラウザはこの結果を自分の端末に残します。
    return json({ ok: true, run, stored: saved })
  }

  return json({ ok: false, message: '不明な操作です。' }, 400)
}
