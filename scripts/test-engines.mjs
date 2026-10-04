// The AIO engine adapters, against canned responses.
//
// Each provider answers in its own shape, and each adapter's job is to turn
// that into the same five things: the answer text, the URLs the answer cited
// (in order), the URLs the search returned, whether it was cut off, and
// whether it was refused. A parser that reads the wrong field fails quietly —
// "cited" just comes back empty, and the report says 0% — so every adapter is
// run here against a response in the provider's documented shape, plus the
// awkward cases (paused turns, truncation, blocked answers, HTTP errors).
//
// Offline: fetch is replaced, nothing leaves the process.
//
//   node scripts/test-engines.mjs

import assert from 'node:assert/strict'

Object.assign(process.env, {
  SITE_NAME: '', SITE_URL: '', AIO_OPENAI_MODEL: '', AIO_PERPLEXITY_MODEL: '', AIO_GEMINI_MODEL: '',
})

const calls = []
let reply = null
globalThis.fetch = async (input, init = {}) => {
  const url = String(input && input.url ? input.url : input)
  const body = init.body ? JSON.parse(init.body) : null
  const headers = Object.fromEntries(new Headers(init.headers || (input && input.headers) || {}).entries())
  calls.push({ url, body, headers })
  const r = typeof reply === 'function' ? reply(url, body) : reply
  return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'content-type': 'application/json' } })
}

const E = await import(new URL('../api/_engines.js', import.meta.url))
const { scoreAnswer } = await import(new URL('../api/aio.js', import.meta.url))

let failed = 0
let passed = 0
async function test(name, fn) {
  calls.length = 0
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`✗ ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`)
  }
}

const Q = '東京で採用動画の制作を依頼できる会社を教えてください。'
const ITEM = { id: 'video-hire', cat: '動画制作', q: Q }

/* ---- Claude ---- */

const claudeMsg = (content, stop = 'end_turn') => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: stop,
  content, usage: { input_tokens: 1, output_tokens: 1 },
})
const search = (urls) => ({
  type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1',
  content: urls.map(([url, title]) => ({ type: 'web_search_result', url, title, encrypted_content: 'x', page_age: null })),
})
const cite = (url, title) => ({ type: 'web_search_result_location', url, title, encrypted_index: 'e', cited_text: '…' })

await test('Claude: cited URLs come from the text citations, in order; searched from the results', async () => {
  reply = { body: claudeMsg([
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: '採用動画 東京' } },
    search([['https://dir.example.jp/video', '一覧'], ['https://lumenium.net/services/video.html', 'Lumenium 動画'], ['https://other.example.com/', 'Other']]),
    { type: 'text', text: '候補は次のとおりです。' },
    { type: 'text', text: 'サンプル映像社', citations: [cite('https://dir.example.jp/video?utm_source=x', '一覧')] },
    { type: 'text', text: 'と Lumenium', citations: [cite('https://lumenium.net/services/video.html', 'Lumenium 動画')] },
  ]) }
  const a = await E.askClaude('sk-test', Q)
  assert.equal(a.engine, 'claude')
  assert.equal(a.text, '候補は次のとおりです。サンプル映像社と Lumenium')
  assert.deepEqual(a.citedUrls.map((c) => c.url), ['https://dir.example.jp/video', 'https://lumenium.net/services/video.html'])
  assert.equal(a.searchedUrls.length, 3)
  assert.equal(a.truncated, false)
  assert.equal(a.paused, false)
  // The request: current web search tool, same max_uses on every attempt.
  const sent = calls[0].body
  assert.equal(sent.tools[0].type, 'web_search_20260209')
  assert.equal(sent.tools[0].max_uses, 3)
  assert.equal(sent.model, 'claude-sonnet-5-5')
  // Scored: cited, rank 2, searched.
  const r = scoreAnswer(ITEM, a, 1)
  assert.equal(r.cited, true)
  assert.equal(r.citedRank, 2)
  assert.equal(r.searched, true)
  assert.equal(r.key, 'video-hire#claude#1')
  assert.deepEqual(r.ownPages, ['/services/video.html'])
})

await test('Claude: searched-but-not-cited is "searched", not "cited"', async () => {
  reply = { body: claudeMsg([
    search([['https://lumenium.net/', 'Lumenium']]),
    { type: 'text', text: 'サンプル映像社がおすすめです。', citations: [cite('https://dir.example.jp/video', '一覧')] },
  ]) }
  const r = scoreAnswer(ITEM, await E.askClaude('sk-test', Q), 0)
  assert.equal(r.cited, false)
  assert.equal(r.citedRank, null)
  assert.equal(r.searched, true)
})

await test('Claude: a failed search (error object in place of the list) does not throw', async () => {
  reply = { body: claudeMsg([
    { type: 'web_search_tool_result', tool_use_id: 's', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
    { type: 'text', text: '検索できませんでした。' },
  ]) }
  const a = await E.askClaude('sk-test', Q)
  assert.equal(a.searchedUrls.length, 0)
  assert.equal(a.text, '検索できませんでした。')
})

await test('Claude: pause_turn returns the turn to resume; the resumed call appends it and merges', async () => {
  const first = [
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'q' } },
    search([['https://a.example.com/', 'A']]),
  ]
  reply = { body: claudeMsg(first, 'pause_turn') }
  const a = await E.askClaude('sk-test', Q)
  assert.equal(a.paused, true)
  assert.equal(a.resume.length, 2)
  reply = { body: claudeMsg([{ type: 'text', text: '答え', citations: [cite('https://a.example.com/', 'A')] }]) }
  const b = await E.askClaude('sk-test', Q, { resume: a.resume })
  const sent = calls[calls.length - 1].body
  assert.equal(sent.messages.length, 2)
  assert.equal(sent.messages[1].role, 'assistant')
  assert.deepEqual(sent.messages[1].content, first)
  assert.equal(b.paused, false)
  assert.equal(b.text, '答え')
  assert.equal(b.searchedUrls.length, 1)
  assert.equal(b.citedUrls.length, 1)
})

await test('Claude: max_tokens marks the answer truncated; refusal is an in-band error', async () => {
  reply = { body: claudeMsg([{ type: 'text', text: '途中まで' }], 'max_tokens') }
  const a = await E.askClaude('sk-test', Q)
  assert.equal(a.truncated, true)
  assert.equal(a.truncReason, 'max_tokens')
  assert.equal(scoreAnswer(ITEM, a, 0).truncated, true)
  reply = { body: claudeMsg([], 'refusal') }
  const b = await E.askClaude('sk-test', Q)
  assert.equal(b.error, 'refusal')
})

await test('Claude: an HTTP error throws with its status', async () => {
  reply = { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }
  await assert.rejects(E.askClaude('sk-bad', Q), (e) => e.status === 401)
})

/* ---- OpenAI ---- */

const openaiBody = (extra = {}) => ({
  id: 'resp_1', object: 'response', status: 'completed', model: 'gpt-5-mini',
  output: [
    { type: 'reasoning', id: 'rs_1', summary: [] },
    { type: 'web_search_call', id: 'ws_1', status: 'completed',
      action: { type: 'search', query: '採用動画 東京', sources: [
        { type: 'url', url: 'https://dir.example.jp/video' },
        { type: 'url', url: 'https://lumenium.net/about.html' },
      ] } },
    { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{
      type: 'output_text',
      text: 'Lumenium と サンプル映像社 が候補です。',
      annotations: [
        { type: 'url_citation', start_index: 14, end_index: 30, url: 'https://dir.example.jp/video?utm_source=openai', title: '一覧' },
        { type: 'url_citation', start_index: 0, end_index: 8, url: 'https://lumenium.net/about.html?utm_source=openai', title: 'About' },
      ],
    }] },
  ],
  ...extra,
})

await test('OpenAI: url_citation annotations in text order; sources from web_search_call', async () => {
  reply = { body: openaiBody() }
  const a = await E.askOpenAI('sk-oa', Q)
  assert.equal(a.engine, 'openai')
  assert.equal(a.text, 'Lumenium と サンプル映像社 が候補です。')
  assert.deepEqual(a.citedUrls.map((c) => c.url), ['https://lumenium.net/about.html', 'https://dir.example.jp/video'])
  assert.equal(a.searchedUrls.length, 2)
  const sent = calls[0]
  assert.equal(sent.url, 'https://api.openai.com/v1/responses')
  assert.equal(sent.headers.authorization, 'Bearer sk-oa')
  assert.equal(sent.body.tools[0].type, 'web_search')
  assert.ok(sent.body.include.includes('web_search_call.action.sources'))
  assert.deepEqual(sent.body.reasoning, { effort: 'low' })
  const r = scoreAnswer(ITEM, a, 0)
  assert.equal(r.cited, true)
  assert.equal(r.citedRank, 1)
})

await test('OpenAI: incomplete (max_output_tokens) is truncated; a refusal part is an error', async () => {
  reply = { body: openaiBody({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) }
  const a = await E.askOpenAI('sk-oa', Q)
  assert.equal(a.truncated, true)
  assert.equal(a.truncReason, 'max_output_tokens')
  reply = { body: { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'できません' }] }] } }
  const b = await E.askOpenAI('sk-oa', Q)
  assert.equal(b.error, 'refusal')
})

await test('OpenAI: no sources list — what was cited counts as searched', async () => {
  const body = openaiBody()
  body.output[1].action = { type: 'search', query: 'q' }
  reply = { body }
  const a = await E.askOpenAI('sk-oa', Q)
  assert.equal(a.searchedUrls.length, 2)
})

await test('OpenAI: HTTP 429 throws with status', async () => {
  reply = { status: 429, body: { error: { message: 'Rate limit reached', type: 'requests' } } }
  await assert.rejects(E.askOpenAI('sk-oa', Q), (e) => e.status === 429 && /Rate limit/.test(e.message))
})

/* ---- Perplexity ---- */

const pplxBody = (text, extra = {}) => ({
  id: 'p1', model: 'sonar', object: 'chat.completion',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }],
  citations: ['https://dir.example.jp/video', 'https://lumenium.net/', 'https://other.example.com/'],
  search_results: [
    { title: '一覧', url: 'https://dir.example.jp/video', date: '2026-09-01' },
    { title: 'Lumenium', url: 'https://lumenium.net/', date: null },
    { title: 'Other', url: 'https://other.example.com/' },
    { title: 'Unused', url: 'https://unused.example.org/' },
  ],
  ...extra,
})

await test('Perplexity: cited in order of [n] markers; searched from search_results', async () => {
  reply = { body: pplxBody('Lumenium[2] とサンプル映像社[1][2] が候補です。') }
  const a = await E.askPerplexity('pplx', Q)
  assert.deepEqual(a.citedUrls.map((c) => c.url), ['https://lumenium.net/', 'https://dir.example.jp/video'])
  assert.equal(a.citedUrls[0].title, 'Lumenium')
  assert.equal(a.searchedUrls.length, 4)
  assert.equal(calls[0].url, 'https://api.perplexity.ai/chat/completions')
  assert.equal(calls[0].body.model, 'sonar')
  assert.equal(scoreAnswer(ITEM, a, 0).citedRank, 1)
})

await test('Perplexity: no markers — the citations list is what it drew on; length is truncated', async () => {
  reply = { body: pplxBody('候補はサンプル映像社です。', { choices: [{ finish_reason: 'length', message: { content: '候補は' } }] }) }
  const a = await E.askPerplexity('pplx', Q)
  assert.equal(a.citedUrls.length, 3)
  assert.equal(a.truncated, true)
})

/* ---- Gemini ---- */

const R = (n) => `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${n}`
const geminiBody = (extra = {}) => ({
  candidates: [{
    finishReason: 'STOP',
    content: { role: 'model', parts: [{ text: '考え中', thought: true }, { text: 'サンプル映像社と' }, { text: 'Lumenium が候補です。' }] },
    groundingMetadata: {
      webSearchQueries: ['採用動画 東京'],
      groundingChunks: [
        { web: { uri: R('aaa'), title: 'dir.example.jp' } },
        { web: { uri: R('bbb'), title: 'lumenium.net' } },
        { web: { uri: R('ccc'), title: 'other.example.com' } },
      ],
      groundingSupports: [
        { segment: { startIndex: 8, endIndex: 30, text: 'Lumenium が候補です。' }, groundingChunkIndices: [1] },
        { segment: { startIndex: 0, endIndex: 8, text: 'サンプル映像社と' }, groundingChunkIndices: [0, 1] },
      ],
    },
  }],
  modelVersion: 'gemini-3.6-flash',
  ...extra,
})

await test('Gemini: our host is read from the chunk title (the URI is a redirect)', async () => {
  reply = { body: geminiBody() }
  const a = await E.askGemini('g-key', Q)
  assert.equal(a.text, 'サンプル映像社とLumenium が候補です。')
  assert.deepEqual(a.citedUrls.map((c) => c.host), ['dir.example.jp', 'lumenium.net'])
  assert.equal(a.searchedUrls.length, 3)
  assert.ok(a.citedUrls.every((c) => c.redirect))
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.6-flash:generateContent$/)
  assert.equal(calls[0].headers['x-goog-api-key'], 'g-key')
  assert.deepEqual(calls[0].body.tools, [{ google_search: {} }])
  const r = scoreAnswer(ITEM, a, 0)
  assert.equal(r.cited, true)
  assert.equal(r.citedRank, 2)
  // Redirect links are not pages: they must not be listed as "the page read".
  assert.equal(r.sourceUrls.length, 0)
  assert.deepEqual(r.sources.sort(), ['dir.example.jp', 'lumenium.net', 'other.example.com'])
})

await test('Gemini: MAX_TOKENS is truncated; a blocked prompt is an error; no grounding is not a crash', async () => {
  reply = { body: geminiBody({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '途中' }] } }] }) }
  const a = await E.askGemini('g', Q)
  assert.equal(a.truncated, true)
  assert.equal(a.citedUrls.length, 0)
  reply = { body: { promptFeedback: { blockReason: 'SAFETY' } } }
  const b = await E.askGemini('g', Q)
  assert.match(b.error, /SAFETY/)
})

await test('Gemini: HTTP 400 throws with status', async () => {
  reply = { status: 400, body: { error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT' } } }
  await assert.rejects(E.askGemini('g', Q), (e) => e.status === 400)
})

/* ---- shared ---- */

await test('askEngine routes by id and refuses an unknown engine', async () => {
  reply = { body: pplxBody('x[1]') }
  const a = await E.askEngine('perplexity', 'k', Q)
  assert.equal(a.engine, 'perplexity')
  assert.throws(() => E.askEngine('nope', 'k', Q), /unknown engine/)
})

await test('a non-JSON reply is an error with a status, not a crash', async () => {
  globalThis.fetch = async () => new Response('<html>gateway</html>', { status: 200 })
  await assert.rejects(E.askPerplexity('k', Q), (e) => e.status === 502)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
