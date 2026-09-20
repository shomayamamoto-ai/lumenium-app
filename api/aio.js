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
  QUESTIONS, CATEGORIES, BRAND, costEstimateUsd,
  namesBrand, citesBrand, hostOf, isHit, VERDICTS,
} from './_aio-catalog.js'

const MODEL = 'claude-opus-5'
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
    '保存先が未設定です。Vercel の Storage から Upstash Redis を接続し、UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を環境変数に設定して再デプロイしてください。',
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

async function readRun(cfg, id) {
  const [raw] = await pipeline(cfg, [['GET', RK(id)]])
  if (!raw) return null
  try { return JSON.parse(raw) } catch (_) { return null }
}

async function writeRun(cfg, run) {
  await pipeline(cfg, [['SET', RK(run.id), JSON.stringify(run), 'EX', RUN_TTL]])
}

/** Ask one question with web search on, and score the answer. */
async function askOne(client, item) {
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
      '推測や一般論で会社名を作らないこと。400字程度で簡潔に答えてください。',
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
    messages: [{ role: 'user', content: item.q }],
  })

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
  const SIZE = 4
  for (let i = 0; i < usable.length; i += SIZE) {
    const batch = usable.slice(i, i + SIZE)
    try {
      Object.assign(out, await analyseBatch(client, batch))
    } catch (_) { /* the other batches still stand */ }
  }
  return out
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
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: 'low' },
    system:
      '与えられた各回答について、2つのことを記録してください。\n' +
      '1) その回答文中で実際に社名が挙がっている会社だけを列挙する。' +
      '回答に出てこない会社を推測で足さないこと。媒体名・ディレクトリ名（例: 発注ナビ、比較biz）や、' +
      '官公庁・団体名は会社として数えないでください。\n' +
      '2) 日本の制作・DX支援会社である「ルメニウム / Lumenium（lumenium.net）」が、その回答でどう扱われたか。' +
      '名前が出てくるかどうかではなく、扱われ方で判定してください。' +
      '「見つかりませんでした」「確認できません」は名前が出ていても denied です。' +
      '米国の Lumenium LLC（エンジン）や Lumentum（光学）は別会社なので、' +
      'それらの話しかしていなければ other_company です。',
    tools: [tool],
    tool_choice: { type: 'tool', name: 'record_analysis' },
    messages: [{ role: 'user', content: payload }],
  })

  const call = (res.content || []).find((b) => b.type === 'tool_use')
  const out = {}
  const items = call && call.input && Array.isArray(call.input.items) ? call.input.items : []
  for (const it of items) {
    if (!it || typeof it.id !== 'string') continue
    out[it.id] = {
      companies: Array.isArray(it.companies)
        ? it.companies.map((c) => String(c).trim()).filter(Boolean).slice(0, 12)
        : [],
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

  const byCategory = CATEGORIES.map((cat) => {
    const list = done.filter((r) => r.cat === cat)
    return {
      cat,
      asked: list.length,
      mentions: list.filter(hit).length,
      cites: list.filter((r) => r.cited).length,
      rate: rate(list),
    }
  }).filter((c) => c.asked > 0)

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

  const answered = results.filter((r) => r && !r.error && r.answer)
  const counted = (v) => done.filter((r) => r.verdict === v).length

  return {
    asked: done.length,
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
  return json({
    ok: true,
    meta,
    social,
    latest,
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
    if (cfg) {
      await writeRun(cfg, run)
      await pipeline(cfg, [['LPUSH', INDEX, run.id], ['LTRIM', INDEX, 0, 59]])
    }
    return json({
      ok: true, runId: run.id, startedAt: run.startedAt, stored: !!cfg,
      questions: QUESTIONS.map(({ id, cat, q }) => ({ id, cat, q })),
    })
  }

  const client = new Anthropic({ apiKey: key })

  if (action === 'ask') {
    const index = Number(body.index)
    const item = QUESTIONS[index]
    if (!item) return json({ ok: false, message: '質問が見つかりません。' }, 400)
    // With a store the run is kept there between questions; without one the
    // answer goes straight back to the browser, which is holding the run.
    const run = cfg ? await readRun(cfg, body.runId) : null
    if (cfg && !run) return json({ ok: false, message: '集計セッションが見つかりません。最初からやり直してください。' }, 404)

    let result
    try {
      result = await askOne(client, item)
    } catch (e) {
      result = {
        id: item.id, cat: item.cat, q: item.q, answer: '',
        mention: false, cited: false, sources: [], searched: 0, companies: [],
        error: String((e && e.message) || e).slice(0, 200),
      }
    }

    if (run) {
      run.results = run.results.filter((r) => r.id !== result.id).concat(result)
      await writeRun(cfg, run)
    }
    return json({ ok: true, index, total: QUESTIONS.length, result })
  }

  if (action === 'finalize') {
    // From the store if there is one; otherwise the browser sends back the
    // answers it collected question by question.
    const run = cfg ? await readRun(cfg, body.runId) : runFromBody(body)
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
    try {
      const byId = await analyseAnswers(client, run.results)
      run.results = run.results.map((r) => ({
        ...r,
        companies: (byId[r.id] && byId[r.id].companies) || [],
        verdict: (byId[r.id] && byId[r.id].verdict) || null,
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

    run.summary = summarise(run.results, fallback)
    run.actions = buildActions(run.results, run.summary, await socialActivity(30))
    // Frozen with the run: comparing this month's mention rate against last
    // month's only means something if you can also see what was published in
    // between, and that number moves.
    run.social = await socialActivity(30)
    run.finishedAt = new Date().toISOString()
    if (cfg) await writeRun(cfg, run)
    return json({ ok: true, run, stored: !!cfg })
  }

  return json({ ok: false, message: '不明な操作です。' }, 400)
}
