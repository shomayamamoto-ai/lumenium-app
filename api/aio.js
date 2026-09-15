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
import { storeConfig, pipeline, jstDate } from './_analytics-store.js'
import {
  QUESTIONS, CATEGORIES, BRAND, costEstimateUsd,
  mentionsBrand, citesBrand, hostOf,
} from './_aio-catalog.js'

const MODEL = 'claude-opus-5'
const RUN_TTL = 400 * 24 * 60 * 60
const RK = (id) => `lum:aio:run:${id}`
const INDEX = 'lum:aio:index'

const NO_STORE = {
  ok: false,
  code: 'STORE_NOT_CONFIGURED',
  message:
    '保存先が未設定です。Vercel の Storage から Upstash Redis を接続し、UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を環境変数に設定して再デプロイしてください。',
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
    mention: mentionsBrand(answer),
    cited: citesBrand(urls),
    sources,
    searched: urls.length,
    companies: [],
    error: res.stop_reason === 'refusal' ? 'refusal' : null,
  }
}

/** One pass over every answer, pulling out the company names each one named.
 *  A forced tool call is used rather than free text so the shape is fixed. */
async function extractCompanies(client, results) {
  const usable = results.filter((r) => r.answer && !r.error)
  if (!usable.length) return {}

  const tool = {
    name: 'record_companies',
    description: '各回答で実際に名前が挙がっていた制作会社・支援会社を記録する。',
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
            },
            required: ['id', 'companies'],
          },
        },
      },
      required: ['items'],
    },
  }

  const payload = usable
    .map((r) => `### ${r.id}\n質問: ${r.q}\n回答: ${r.answer}`)
    .join('\n\n')

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system:
      '与えられた各回答について、その回答文中で実際に社名が挙がっている会社だけを列挙してください。' +
      '回答に出てこない会社を推測で足さないこと。媒体名・ディレクトリ名（例: 発注ナビ、比較biz）や、' +
      '官公庁・団体名は会社として数えないでください。',
    tools: [tool],
    tool_choice: { type: 'tool', name: 'record_companies' },
    messages: [{ role: 'user', content: payload }],
  })

  const call = (res.content || []).find((b) => b.type === 'tool_use')
  const out = {}
  const items = call && call.input && Array.isArray(call.input.items) ? call.input.items : []
  for (const it of items) {
    if (!it || typeof it.id !== 'string') continue
    out[it.id] = Array.isArray(it.companies)
      ? it.companies.map((c) => String(c).trim()).filter(Boolean).slice(0, 12)
      : []
  }
  return out
}

/** Everything the report shows is derived here, from the stored answers. */
function summarise(results) {
  const done = results.filter((r) => r && !r.error && r.answer)
  const rate = (list) => (list.length ? list.filter((r) => r.mention).length / list.length : 0)

  const byCategory = CATEGORIES.map((cat) => {
    const list = done.filter((r) => r.cat === cat)
    return {
      cat,
      asked: list.length,
      mentions: list.filter((r) => r.mention).length,
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
      // Our own row is counted from `mention` below and nowhere else. The
      // extractor also returns us by name, and counting both put Lumenium at
      // 26 out of a possible 13.
      if (mentionsBrand(c)) continue
      tally.set(c, (tally.get(c) || 0) + 1)
    }
  }
  tally.set('Lumenium', open.filter((r) => r.mention).length)
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

  return {
    asked: done.length,
    failed: results.length - done.length,
    mentionRate: rate(done),
    openMentionRate: rate(open),
    citeRate: done.length ? done.filter((r) => r.cited).length / done.length : 0,
    byCategory,
    competitors,
    topSources: [...hosts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const cfg = storeConfig()
  const meta = {
    questions: QUESTIONS.length,
    categories: CATEGORIES,
    estimateUsd: costEstimateUsd(),
    aiReady: !!apiKey(),
    brand: BRAND.domain,
  }
  if (!cfg) return json({ ...NO_STORE, meta }, 503)

  let ids = []
  try {
    const [raw] = await pipeline(cfg, [['LRANGE', INDEX, 0, 29]])
    ids = Array.isArray(raw) ? raw : []
  } catch (_) {
    return json({ ok: false, code: 'STORE_ERROR', message: '保存先の読み取りに失敗しました。', meta }, 502)
  }

  if (!ids.length) return json({ ok: true, meta, latest: null, history: [] })

  const runs = (await pipeline(cfg, ids.map((id) => ['GET', RK(id)])))
    .map((raw) => { try { return JSON.parse(raw) } catch (_) { return null } })
    .filter(Boolean)

  const latest = runs[0] || null
  return json({
    ok: true,
    meta,
    latest,
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

  const key = apiKey()
  if (!key) return json(NO_AI, 503)

  const cfg = storeConfig()
  if (!cfg) return json(NO_STORE, 503)

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
    await writeRun(cfg, run)
    await pipeline(cfg, [['LPUSH', INDEX, run.id], ['LTRIM', INDEX, 0, 59]])
    return json({ ok: true, runId: run.id, questions: QUESTIONS.map(({ id, cat, q }) => ({ id, cat, q })) })
  }

  const client = new Anthropic({ apiKey: key })

  if (action === 'ask') {
    const index = Number(body.index)
    const item = QUESTIONS[index]
    if (!item) return json({ ok: false, message: '質問が見つかりません。' }, 400)
    const run = await readRun(cfg, body.runId)
    if (!run) return json({ ok: false, message: '集計セッションが見つかりません。最初からやり直してください。' }, 404)

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

    run.results = run.results.filter((r) => r.id !== result.id).concat(result)
    await writeRun(cfg, run)
    return json({ ok: true, index, total: QUESTIONS.length, result })
  }

  if (action === 'finalize') {
    const run = await readRun(cfg, body.runId)
    if (!run) return json({ ok: false, message: '集計セッションが見つかりません。' }, 404)

    try {
      const byId = await extractCompanies(client, run.results)
      run.results = run.results.map((r) => ({ ...r, companies: byId[r.id] || [] }))
    } catch (_) {
      // Company extraction is the optional half. A failure here still leaves
      // a usable appearance-rate report rather than losing the whole run.
      run.companiesFailed = true
    }

    run.summary = summarise(run.results)
    run.finishedAt = new Date().toISOString()
    await writeRun(cfg, run)
    return json({ ok: true, run })
  }

  return json({ ok: false, message: '不明な操作です。' }, 400)
}
