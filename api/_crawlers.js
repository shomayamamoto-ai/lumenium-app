// Which crawlers actually came, and when.
//
// Everything else on the SEO screen is inference. The AIO probe asks an
// answer engine a question and reads the reply; the site audit reads our own
// pages. Neither can tell the difference between 「読まれたが選ばれなかった」
// and 「そもそも読まれていない」, and those two have opposite instructions:
// the first is a content problem, the second is an indexing problem. The only
// place that difference is written down is the request log, and we had no
// access to ours.
//
// So the two files every crawler asks for before it reads anything — the
// robots file and the llms file — are served by a function instead of the
// CDN, and the function records who asked. It records the agent's name, the
// path and the time. No IP, no headers beyond the agent string, nothing that
// identifies a person: these are machines, and the question is only whether
// they came.
//
// A visit recorded here is not the same as a page being read, and the report
// says so. It is the difference between 0 and not 0.

import { pipeline, jstDate, lastDays } from './_analytics-store.js'

const TTL = 120 * 24 * 60 * 60
const DAY = (d) => `lum:bot:d:${d}`      // hash: agent -> visits that day
const LAST = 'lum:bot:last'              // hash: agent -> "<iso>|<path>"
const PATHS = (d) => `lum:bot:p:${d}`    // hash: path -> visits that day

/** The agents worth telling apart, most specific pattern first.
 *
 *  `kind` is what the row means, not who made it: an answer engine reading us
 *  is the thing the AIO score depends on, a search crawler is the thing the
 *  search ranking depends on, and a tool fetching a page because a person
 *  pasted the URL is neither — it is somebody already looking at us. */
export const BOTS = [
  // --- 回答エンジン系 ---
  { id: 'OAI-SearchBot', re: /OAI-SearchBot/i, kind: 'ai', note: 'ChatGPT の検索用。ここが来ていないと ChatGPT の回答には出ません' },
  { id: 'ChatGPT-User', re: /ChatGPT-User/i, kind: 'visit', note: 'ChatGPT が今まさにこのページを開いた（誰かが見ています）' },
  { id: 'GPTBot', re: /GPTBot/i, kind: 'ai', note: 'OpenAI の収集用クローラー' },
  { id: 'ClaudeBot', re: /ClaudeBot/i, kind: 'ai', note: 'Anthropic（Claude）の収集用クローラー' },
  { id: 'Claude-User', re: /Claude-User/i, kind: 'visit', note: 'Claude が今まさにこのページを開いた' },
  { id: 'Claude-SearchBot', re: /Claude-SearchBot/i, kind: 'ai', note: 'Claude の検索用' },
  { id: 'anthropic-ai', re: /anthropic-ai/i, kind: 'ai', note: 'Anthropic の旧エージェント名' },
  { id: 'PerplexityBot', re: /PerplexityBot/i, kind: 'ai', note: 'Perplexity の収集用クローラー' },
  { id: 'Perplexity-User', re: /Perplexity-User/i, kind: 'visit', note: 'Perplexity が今まさにこのページを開いた' },
  { id: 'Google-Extended', re: /Google-Extended/i, kind: 'ai', note: 'Gemini / AI Overview の学習対象としての読み取り' },
  { id: 'Applebot-Extended', re: /Applebot-Extended/i, kind: 'ai', note: 'Apple Intelligence 向け' },
  { id: 'meta-externalagent', re: /meta-externalagent|FacebookBot/i, kind: 'ai', note: 'Meta AI の収集用' },
  { id: 'Amazonbot', re: /Amazonbot/i, kind: 'ai', note: 'Alexa / Amazon の収集用' },
  { id: 'Bytespider', re: /Bytespider/i, kind: 'ai', note: 'ByteDance（TikTok）の収集用' },
  { id: 'CCBot', re: /CCBot/i, kind: 'ai', note: 'Common Crawl。多くの学習データの元になります' },
  { id: 'cohere-ai', re: /cohere-ai/i, kind: 'ai', note: 'Cohere の収集用' },
  { id: 'Diffbot', re: /Diffbot/i, kind: 'ai', note: 'Diffbot の収集用' },

  // --- 検索エンジン系 ---
  { id: 'Googlebot', re: /Googlebot/i, kind: 'search', note: 'Google 検索。AI Overview の材料もここ経由です' },
  { id: 'Bingbot', re: /bingbot|BingPreview/i, kind: 'search', note: 'Bing 検索。Copilot の材料でもあります' },
  { id: 'DuckDuckBot', re: /DuckDuckBot/i, kind: 'search', note: 'DuckDuckGo' },
  { id: 'Applebot', re: /Applebot/i, kind: 'search', note: 'Apple の検索（Siri / Spotlight）' },
  { id: 'YandexBot', re: /YandexBot/i, kind: 'search', note: 'Yandex' },
  { id: 'Baiduspider', re: /Baiduspider/i, kind: 'search', note: 'Baidu' },

  // --- SNS のリンク展開 ---
  { id: 'Twitterbot', re: /Twitterbot/i, kind: 'social', note: 'X（Twitter）でリンクが展開された' },
  { id: 'Slackbot', re: /Slackbot/i, kind: 'social', note: 'Slack でリンクが展開された' },
  { id: 'LINE', re: /line-poker|LINE\//i, kind: 'social', note: 'LINE でリンクが展開された' },

  // --- SEO ツール（robots.txt では断っている相手）---
  { id: 'AhrefsBot', re: /AhrefsBot/i, kind: 'tool', note: '競合調査ツール。誰かがこのサイトを調べています' },
  { id: 'SemrushBot', re: /SemrushBot/i, kind: 'tool', note: '競合調査ツール' },
]

export const KIND_LABEL = {
  ai: '回答エンジン',
  search: '検索エンジン',
  visit: 'AIが人の代わりに開いた',
  social: 'SNSのリンク展開',
  tool: '調査ツール',
}

/** The agent string, reduced to one of the names above. Anything unmatched is
 *  reported as 「その他のbot」 only if it calls itself a bot — a browser that
 *  happens to fetch the robots file is not a crawl. */
export function classify(ua) {
  const s = String(ua || '')
  if (!s) return null
  for (const b of BOTS) if (b.re.test(s)) return b
  if (/bot\b|crawler|spider|crawl/i.test(s)) return { id: 'other', kind: 'other', note: '名前が一覧に無いクローラー' }
  return null
}

/** Best effort, and never in the way. The file this is called from has to
 *  answer whether or not the store is reachable, so the write is raced
 *  against a short timer and a failure is dropped: a robots file that 500s
 *  because a database was slow would cost more than the measurement is
 *  worth. */
export async function recordCrawl(cfg, { ua, path }) {
  const bot = classify(ua)
  if (!cfg || !bot) return null
  const d = jstDate()
  const p = String(path || '/').slice(0, 80)
  const write = pipeline(cfg, [
    ['HINCRBY', DAY(d), bot.id, 1],
    ['EXPIRE', DAY(d), TTL],
    ['HSET', LAST, bot.id, `${new Date().toISOString()}|${p}`],
    ['HINCRBY', PATHS(d), p, 1],
    ['EXPIRE', PATHS(d), TTL],
  ]).then(() => true).catch(() => false)
  return Promise.race([write, new Promise((r) => setTimeout(() => r(false), 700))])
}

const pairs = (h) => (h && typeof h === 'object' ? Object.entries(h) : [])

/** Everything the panel shows about crawling, in one round trip. */
export async function readCrawls(cfg, days = 30) {
  if (!cfg) return null
  const dates = lastDays(days)
  const cmds = dates.map((d) => ['HGETALL', DAY(d)])
  cmds.push(['HGETALL', LAST], ['HGETALL', PATHS(jstDate())], ['HGETALL', PATHS(jstDate(1))])
  let out
  try { out = await pipeline(cfg, cmds) } catch (_) { return null }

  // Upstash returns a hash either as an object or as a flat [k,v,k,v] list
  // depending on the command; normalise before counting.
  const asObj = (v) => {
    if (!v) return {}
    if (Array.isArray(v)) {
      const o = {}
      for (let i = 0; i + 1 < v.length; i += 2) o[v[i]] = v[i + 1]
      return o
    }
    return v
  }

  const perDay = dates.map((d, i) => ({ date: d, hits: pairs(asObj(out[i])).reduce((a, [, n]) => a + (+n || 0), 0) }))
  const tally = new Map()
  dates.forEach((d, i) => {
    for (const [id, n] of pairs(asObj(out[i]))) tally.set(id, (tally.get(id) || 0) + (+n || 0))
  })
  const last = asObj(out[dates.length])
  const paths = new Map()
  for (const src of [asObj(out[dates.length + 1]), asObj(out[dates.length + 2])]) {
    for (const [p, n] of pairs(src)) paths.set(p, (paths.get(p) || 0) + (+n || 0))
  }

  const meta = (id) => BOTS.find((b) => b.id === id) || { id, kind: 'other', note: '' }
  const agents = [...tally.entries()]
    .map(([id, hits]) => {
      const m = meta(id)
      const seen = String(last[id] || '').split('|')
      return { id, hits, kind: m.kind, note: m.note, lastAt: seen[0] || null, lastPath: seen[1] || null }
    })
    .sort((a, b) => b.hits - a.hits)

  const sum = (kind) => agents.filter((a) => a.kind === kind).reduce((n, a) => n + a.hits, 0)
  return {
    days,
    total: agents.reduce((n, a) => n + a.hits, 0),
    ai: sum('ai'),
    search: sum('search'),
    visit: sum('visit'),
    agents: agents.slice(0, 20),
    perDay,
    // Which of the two files they asked for, today and yesterday. A crawler
    // that only ever reads the robots file is checking permission, not
    // reading the site.
    paths: [...paths.entries()].map(([path, hits]) => ({ path, hits })).sort((a, b) => b.hits - a.hits).slice(0, 8),
    // The agents we allow in robots.txt that have never once appeared.
    missing: BOTS.filter((b) => b.kind === 'ai' && !tally.has(b.id)).map((b) => b.id),
  }
}
