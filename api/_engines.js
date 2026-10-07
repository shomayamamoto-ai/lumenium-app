// The answer engines the AIO probe can ask, behind one shape.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// Customers do not all use the same AI. Measuring only Claude says how
// visible the company is to Claude; a client deciding where to spend effort
// wants to know about ChatGPT, Perplexity and Gemini as well, and the four do
// not agree — each searches a different index and cites differently. Each
// adapter below asks one question with that engine's own web search switched
// on and returns the same thing:
//
//   { engine, model, text, citedUrls, searchedUrls, truncated, truncReason,
//     paused, resume, error }
//
//   citedUrls    the sources the answer itself cited, in the order it cited
//                them — the strong signal (「答えの出典になった」)
//   searchedUrls what the engine's search returned — the weak one
//                (「検索で読まれた」): read, but not necessarily used
//   each entry   { url, title, host } — `host` is what our-site detection
//                uses. Gemini hands back redirect URLs, so its host comes
//                from the title/domain field instead, and `redirect` is set.
//   truncated    the answer was cut off (token limit, or a search loop that
//                never finished). A cut-off answer is not scored as "absent":
//                it is left out of the rates.
//   error        an in-band refusal or block. Transport and HTTP failures
//                throw instead (with .status), so aio.js can say which kind
//                of failure it was.
//
// The judge that reads the answers stays Claude for every engine, so that
// "recommended" means the same thing whichever engine produced the answer.

import Anthropic from '@anthropic-ai/sdk'
import { ASK_MODEL, CLAUDE_EST_USD, hostOf } from './_aio-catalog.js'
import { setting } from './_settings.js'

const env = (n) => (process.env[n] || '').trim()

/* 同じ指示をすべてのエンジンに渡します。エンジンごとに言い方を変えると、
   出てきた差がエンジンの差なのか指示の差なのか分からなくなるためです。
   短く答えさせるのは体裁の問題ではなく時間の問題で、長い回答は返って
   くるのが遅く、返ってこなければ計測になりません。 */
export const SYSTEM =
  '日本のユーザーからの質問に、実際にウェブを検索して答えてください。' +
  '実在する会社名を挙げるときは、検索結果で確認できたものだけを挙げてください。' +
  '推測や一般論で会社名を作らないこと。300字程度で簡潔に答えてください。'

/** What each engine is, where its key lives, and roughly what one answer
 *  costs (shown before a run; an estimate, not a bill). The model can be
 *  changed by environment variable without a code change, because these
 *  providers rename their models more often than this file is edited. */
export const ENGINES = {
  claude: {
    label: 'Claude',
    key: 'ANTHROPIC_API_KEY',
    model: () => ASK_MODEL,
    estUsd: CLAUDE_EST_USD,
  },
  openai: {
    label: 'ChatGPT（OpenAI）',
    key: 'OPENAI_API_KEY',
    model: () => env('AIO_OPENAI_MODEL') || 'gpt-5-mini',
    // $10 / 1,000 searches plus a small model's tokens.
    estUsd: 0.02,
  },
  perplexity: {
    label: 'Perplexity',
    key: 'PERPLEXITY_API_KEY',
    model: () => env('AIO_PERPLEXITY_MODEL') || 'sonar',
    estUsd: 0.008,
  },
  gemini: {
    label: 'Gemini',
    key: 'GEMINI_API_KEY',
    model: () => env('AIO_GEMINI_MODEL') || 'gemini-3.6-flash',
    // Grounded prompts are billed per search on top of tokens.
    estUsd: 0.04,
  },
}

export const ENGINE_IDS = Object.keys(ENGINES)

/** Which engines have a key, without revealing any of them. */
export async function engineKeys(req) {
  const out = {}
  for (const id of ENGINE_IDS) out[id] = await setting(ENGINES[id].key, '', req)
  return out
}

/* ---- shared helpers ---- */

/** Tracking parameters some engines add to every link. Dropped so the same
 *  page counts once however it was reached. */
export function cleanUrl(u) {
  try {
    const url = new URL(String(u))
    for (const k of [...url.searchParams.keys()]) if (/^utm_/i.test(k)) url.searchParams.delete(k)
    return url.toString()
  } catch (_) {
    return String(u || '')
  }
}

const entry = (url, title) => {
  const u = cleanUrl(url)
  return { url: u, title: String(title || '').slice(0, 200), host: hostOf(u) }
}

/** First occurrence wins, so the order is the order of first citation. */
export function uniqueEntries(list) {
  const seen = new Set()
  const out = []
  for (const e of list) {
    const k = e && (e.url || e.host)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

function httpError(engine, status, body) {
  const msg = (body && body.error && (body.error.message || body.error)) || (typeof body === 'string' ? body : '')
  const e = new Error(`${engine} ${status}: ${String(msg || '').slice(0, 240)}`)
  e.status = status
  return e
}

/** fetch with its own deadline. The edge function has a fixed time to start
 *  answering; stopping first means the failure arrives with a reason. */
async function postJson(engine, url, headers, body, timeoutMs) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs || 18000)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const te = new Error(`${engine}: timed out`)
      te.name = 'AbortError'
      throw te
    }
    throw e
  } finally {
    clearTimeout(t)
  }
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch (_) { data = null }
  if (!res.ok) throw httpError(engine, res.status, data || text)
  if (!data) throw httpError(engine, 502, 'response was not JSON')
  return data
}

const base = (engine, model) => ({
  engine, model, text: '', citedUrls: [], searchedUrls: [],
  truncated: false, truncReason: null, paused: false, resume: null, error: null,
})

/* ---- Claude: Messages API + web search tool ---- */

/** Read a Claude response's blocks. Kept separate from the call so a resumed
 *  turn can be read as one answer: the blocks from before the pause and the
 *  ones after it. */
export function readClaudeBlocks(blocks) {
  let text = ''
  const cited = []
  const searched = []
  for (const b of blocks || []) {
    if (!b) continue
    if (b.type === 'text') {
      text += b.text || ''
      // What the answer actually cited — not the same as what the search
      // returned. Until now "cited" meant the latter.
      for (const c of b.citations || []) {
        if (c && c.type === 'web_search_result_location' && c.url) cited.push(entry(c.url, c.title))
      }
    }
    // A server tool that fails returns HTTP 200 with an error object where
    // the result list would be, so branch on the shape before indexing it.
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r && r.url) searched.push(entry(r.url, r.title))
    }
  }
  return { text, cited: uniqueEntries(cited), searched: uniqueEntries(searched) }
}

/* 決めたモデル・ウェブ検索の版がそのアカウントで使えないとき（400/404）に
   順に試す控え。ここで一度通った組み合わせを覚えておき、以降はそれを使います
   （検索の続き＝pause_turn は、同じモデルで送らないと受け付けられないため）。
   取れないまま全回答が「失敗」になり、0% と表示されていたのを避けるためです。 */
const CLAUDE_MODELS = () => [...new Set([ENGINES.claude.model(), 'claude-sonnet-5', 'claude-opus-5-5'])]
const SEARCH_TOOLS = ['web_search_20260209', 'web_search_20250305']
let claudeWorking = null

/** 別のモデル・検索の版で掛け直す意味がある失敗か（速く返ってくる 400/404 だけ）。 */
function rejectedSetup(e) {
  const status = e && (e.status || e.statusCode)
  const msg = String((e && e.message) || '')
  if (status === 404) return 'model'
  if (status !== 400) return null
  if (/credit|balance|billing/i.test(msg)) return null
  if (/web.?search|server.?tool|tool.*type|tools\.\d/i.test(msg)) return 'tool'
  if (/model/i.test(msg)) return 'model'
  return null
}

/** テスト用: 覚えた組み合わせを忘れる。 */
export function resetClaudeSetup() { claudeWorking = null }

export async function askClaude(key, question, opts = {}) {
  // Retries are ours (one question at a time, from the browser); the SDK's
  // own three would add up past the time the function has.
  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  const prior = Array.isArray(opts.resume) ? opts.resume : null
  const messages = [{ role: 'user', content: question }]
  if (prior) messages.push({ role: 'assistant', content: prior })
  const send = (model, tool) => client.messages.create({
    model,
    // Room for the thinking that precedes the answer as well as the answer.
    max_tokens: 4000,
    // Low effort on purpose: the job is to search and report what is out
    // there, not to reason hard about it. It also keeps the call inside the
    // time an edge function has to answer in.
    output_config: { effort: 'low' },
    system: SYSTEM,
    // The same three searches on a retry as on the first try. Searching less
    // on a retry made a retried answer a different measurement.
    tools: [{ type: tool, name: 'web_search', max_uses: 3 }],
    messages,
  }, { timeout: opts.timeoutMs || 18000 })

  const tries = claudeWorking
    ? [claudeWorking]
    : CLAUDE_MODELS().flatMap((m) => SEARCH_TOOLS.map((t) => ({ model: m, tool: t })))
  let res = null
  let model = tries[0].model
  let lastErr = null
  for (let i = 0; i < tries.length; i++) {
    const t = tries[i]
    try {
      res = await send(t.model, t.tool)
      model = t.model
      claudeWorking = t
      break
    } catch (e) {
      lastErr = e
      const why = rejectedSetup(e)
      // 続き（prior）は同じモデルでしか送れない。時間切れ・キー・残高は、変えても通らない。
      if (!why || prior || claudeWorking) throw e
      // 検索の版が原因ならモデルはそのまま次の版へ、モデルが原因なら次のモデルへ。
      if (why === 'model') while (i + 1 < tries.length && tries[i + 1].model === t.model) i++
    }
  }
  if (!res) throw lastErr

  const all = [...(prior || []), ...(res.content || [])]
  const read = readClaudeBlocks(all)
  const out = base('claude', model)
  out.text = read.text.trim()
  out.citedUrls = read.cited
  out.searchedUrls = read.searched
  if (res.stop_reason === 'pause_turn') {
    // The server-side search loop stopped part way. Continuing means sending
    // the paused turn back unchanged; the caller decides whether to.
    out.paused = true
    out.resume = all
  } else if (res.stop_reason === 'max_tokens') {
    out.truncated = true
    out.truncReason = 'max_tokens'
  } else if (res.stop_reason === 'refusal') {
    out.error = 'refusal'
  }
  return out
}

/* ---- OpenAI: Responses API + web search tool ---- */

export function readOpenAI(data) {
  let text = ''
  const cited = []
  const searched = []
  let refusal = ''
  for (const item of (data && data.output) || []) {
    if (!item) continue
    if (item.type === 'web_search_call') {
      const src = item.action && Array.isArray(item.action.sources) ? item.action.sources : []
      for (const s of src) if (s && s.url) searched.push(entry(s.url, s.title))
    }
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (!c) continue
        if (c.type === 'output_text') {
          text += c.text || ''
          // In the order they appear in the text.
          const anns = (c.annotations || []).slice().sort((a, b) => (a.start_index || 0) - (b.start_index || 0))
          for (const a of anns) if (a && a.type === 'url_citation' && a.url) cited.push(entry(a.url, a.title))
        }
        if (c.type === 'refusal') refusal = c.refusal || 'refusal'
      }
    }
  }
  const out = base('openai', (data && data.model) || ENGINES.openai.model())
  out.text = text.trim()
  out.citedUrls = uniqueEntries(cited)
  // Older responses carry no source list; what was cited was at least read.
  out.searchedUrls = uniqueEntries(searched.length ? searched : cited)
  const inc = data && data.status === 'incomplete' && data.incomplete_details
  if (inc) {
    out.truncated = true
    out.truncReason = inc.reason || 'incomplete'
  }
  if (refusal && !out.text) out.error = 'refusal'
  if (data && data.error) out.error = String(data.error.message || data.error.code || 'error').slice(0, 200)
  return out
}

export async function askOpenAI(key, question, opts = {}) {
  const model = ENGINES.openai.model()
  const body = {
    model,
    instructions: SYSTEM,
    input: question,
    tools: [{ type: 'web_search' }],
    // Without this the response says which pages it cited but not which it
    // searched, and "検索で読まれた" would be empty for every answer.
    include: ['web_search_call.action.sources'],
    max_output_tokens: 4000,
  }
  // Reasoning models accept an effort; others reject the field outright.
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning = { effort: 'low' }
  const data = await postJson('openai', 'https://api.openai.com/v1/responses',
    { authorization: `Bearer ${key}` }, body, opts.timeoutMs)
  return readOpenAI(data)
}

/* ---- Perplexity: Sonar chat completions ---- */

export function readPerplexity(data) {
  const choice = (data && data.choices && data.choices[0]) || {}
  const text = String((choice.message && choice.message.content) || '')
  const results = Array.isArray(data && data.search_results) ? data.search_results : []
  const citations = Array.isArray(data && data.citations) ? data.citations : []
  const titleOf = (u) => {
    const r = results.find((x) => x && x.url === u)
    return r ? r.title : ''
  }
  // The answer marks its sources as [1], [2] … against the citations list.
  // The order those markers first appear is the order it cited them in.
  const pool = citations.length ? citations : results.map((r) => r && r.url)
  const cited = []
  const re = /\[(\d{1,2})\]/g
  let m
  while ((m = re.exec(text))) {
    const u = pool[Number(m[1]) - 1]
    if (u) cited.push(entry(u, titleOf(u)))
  }
  // No markers at all: the citation list is still what the answer drew on.
  if (!cited.length) for (const u of citations) if (u) cited.push(entry(u, titleOf(u)))
  const out = base('perplexity', (data && data.model) || ENGINES.perplexity.model())
  out.text = text.trim()
  out.citedUrls = uniqueEntries(cited)
  out.searchedUrls = uniqueEntries(results.filter((r) => r && r.url).map((r) => entry(r.url, r.title))
    .concat(citations.map((u) => entry(u, titleOf(u)))))
  if (choice.finish_reason === 'length') {
    out.truncated = true
    out.truncReason = 'max_tokens'
  }
  return out
}

export async function askPerplexity(key, question, opts = {}) {
  const data = await postJson('perplexity', 'https://api.perplexity.ai/chat/completions',
    { authorization: `Bearer ${key}` }, {
      model: ENGINES.perplexity.model(),
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: question }],
      max_tokens: 1500,
    }, opts.timeoutMs)
  return readPerplexity(data)
}

/* ---- Gemini: generateContent + Google Search grounding ---- */

const looksLikeHost = (s) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(s || '').trim())

/** Gemini's grounding links are redirects through Google, so the URL never
 *  names the site. The chunk's `domain` (newer responses) or its `title`
 *  (which Gemini sets to the site's domain) is what does. */
function geminiEntry(web) {
  const uri = String((web && web.uri) || '')
  const direct = hostOf(uri)
  const redirect = !direct || /(^|\.)vertexaisearch\.cloud\.google\.com$|(^|\.)google\.com$/.test(direct)
  const named = String((web && (web.domain || web.title)) || '').trim().toLowerCase().replace(/^www\./, '')
  const host = redirect ? (looksLikeHost(named) ? named : '') : direct
  return { url: uri, title: String((web && web.title) || '').slice(0, 200), host, redirect }
}

export function readGemini(data) {
  const out = base('gemini', (data && data.modelVersion) || ENGINES.gemini.model())
  const cand = (data && data.candidates && data.candidates[0]) || null
  const block = data && data.promptFeedback && data.promptFeedback.blockReason
  if (!cand) {
    out.error = block ? `blocked: ${block}` : 'no answer'
    return out
  }
  // Thought summaries, when present, are not the answer.
  out.text = ((cand.content && cand.content.parts) || [])
    .filter((p) => p && typeof p.text === 'string' && !p.thought)
    .map((p) => p.text).join('').trim()
  const gm = cand.groundingMetadata || {}
  const chunks = (gm.groundingChunks || []).map((c) => (c && c.web ? geminiEntry(c.web) : null))
  out.searchedUrls = uniqueEntries(chunks.filter(Boolean))
  // Cited: the chunks that the supports point at, in the order the supported
  // passages appear in the answer.
  const supports = (gm.groundingSupports || []).slice()
    .sort((a, b) => ((a.segment && a.segment.startIndex) || 0) - ((b.segment && b.segment.startIndex) || 0))
  const cited = []
  for (const s of supports) for (const i of (s && s.groundingChunkIndices) || []) if (chunks[i]) cited.push(chunks[i])
  out.citedUrls = uniqueEntries(cited)
  const fr = cand.finishReason
  if (fr === 'MAX_TOKENS') {
    out.truncated = true
    out.truncReason = 'max_tokens'
  } else if (fr && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(fr) && !out.text) {
    out.error = `blocked: ${fr}`
  }
  return out
}

export async function askGemini(key, question, opts = {}) {
  const model = ENGINES.gemini.model()
  const data = await postJson('gemini',
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': key }, {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 4000 },
    }, opts.timeoutMs)
  return readGemini(data)
}

const ADAPTERS = { claude: askClaude, openai: askOpenAI, perplexity: askPerplexity, gemini: askGemini }

/** Ask one engine one question. */
export function askEngine(engine, key, question, opts) {
  const fn = ADAPTERS[engine]
  if (!fn) throw new Error(`unknown engine: ${engine}`)
  return fn(key, question, opts)
}
