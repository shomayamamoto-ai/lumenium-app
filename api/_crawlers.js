// Which crawlers actually came, when, and what they read.
//
// Everything else on the SEO screen is inference. The AIO probe asks an
// answer engine a question and reads the reply; the site audit reads our own
// pages. Neither can tell the difference between 「読まれたが選ばれなかった」
// and 「そもそも読まれていない」, and those two have opposite instructions:
// the first is a content problem, the second is an indexing problem. The only
// place that difference is written down is the request log, and we had no
// access to ours.
//
// It used to be recorded only for robots.txt and llms.txt, which are served by
// a function for that reason. That answered 「来たかどうか」 but not 「何を
// 読んだか」: a crawler that only ever asks for robots.txt is checking
// permission, not reading the site. So the root middleware.js now records
// every request whose agent names itself as one of the crawlers below — the
// pages, the sitemaps, and robots.txt / llms.txt too. The two functions behind
// those files no longer record anything themselves, so nothing is counted
// twice.
//
// What is recorded: the agent's name, the path and the time. No IP, no
// headers beyond the agent string, nothing that identifies a person — these
// are machines, and the question is only whether they came and what they read.
//
// What is NOT checked: whether the agent is who it says it is. Anyone can send
// "GPTBot" in a header. Checking for real means a reverse DNS lookup or the
// provider's published IP list per request, neither of which fits in a
// middleware that must never slow a page down. Vercel does keep a verified-bot
// directory, but it reaches application code only through BotID's
// checkBotId() (isVerifiedBot / verifiedBotName — a separate package with a
// client-side challenge; https://vercel.com/docs/botid/verified-bots), not as
// a request header a middleware could read for free. So every count is
// reported as 「名乗っているアクセス数（なりすましを含む可能性あり）」 and
// the screen says so.

import { pipeline, jstDate, lastDays } from './_analytics-store.js'
import { KV } from './_brand.js'

const TTL = 120 * 24 * 60 * 60
const DAY = (d) => `${KV}bot:d:${d}`      // hash: agent -> visits that day
const LAST = `${KV}bot:last`              // hash: agent -> "<iso>|<path>"
const PATHS = (d) => `${KV}bot:p:${d}`    // hash: path -> visits that day
// hash: "<agent>\t<path>" -> visits that day. One hash per day rather than one
// per agent, so the report reads 30 keys, not 30 × the number of agents.
const AGENT_PATHS = (d) => `${KV}bot:ap:${d}`

// How many distinct paths one day may hold, the same bound api/track.js uses.
// A site this size has a few dozen pages; the cap only matters when something
// probes thousands of made-up URLs, and then the excess folds into "(other)"
// instead of growing the store.
export const MAX_FIELDS = 300

/** The groups, in the order the screen shows them. `note` is what the group
 *  means for the client; `ifMissing` is what to do when an important member
 *  of it has never appeared. */
export const GROUPS = [
  {
    key: 'ai-search', label: 'AI検索のための読み取り',
    note: 'ChatGPT・Claude・Perplexity などが「検索して答える」ときの材料を集めに来ています。ここに来ていないAIの回答には、このサイトは出てきません。',
    ifMissing: 'robots.txt でこの名前を断っていないか確認してください。断っていなければ、外部サイトからのリンクやサイトマップの送信で見つけてもらうのが先です。',
  },
  {
    key: 'ai-user', label: 'ユーザーの依頼で読みに来たAI',
    note: '誰かがAIに「このページを読んで」「この会社について調べて」と頼み、その場で開きに来たものです。その先には、このサイトに関心のある人がいます。',
    ifMissing: '来ていなくても異常ではありません。AIとの会話でこのサイトが話題に出たときにだけ来ます。',
  },
  {
    key: 'ai-train', label: 'AIの学習用',
    note: 'AIの学習データを集めるためのものです。来ても、すぐに回答に出るわけではありません。',
    ifMissing: '急ぐものではありません。学習に使われたくない場合は、robots.txt で断ることもできます。',
  },
  {
    key: 'search', label: '検索エンジン',
    note: 'Google・Bing などの検索結果のための読み取りです。GoogleのAIによる概要や Copilot の材料も、ここを経由します。',
    ifMissing: 'Search Console・Bing Webmaster Tools にサイトマップを送ってください。何日経っても来ない場合は robots.txt とサイトの公開設定を確認します。',
  },
  {
    key: 'social', label: 'SNSのリンク展開',
    note: 'SNSやチャットにこのサイトのURLが貼られ、プレビューを作るために読みに来たものです。',
    ifMissing: '',
  },
  {
    key: 'tool', label: '調査ツール',
    note: 'SEOの調査ツール。誰かがこのサイトを調べています（robots.txt では断っています）。',
    ifMissing: '',
  },
  {
    key: 'other', label: 'その他のbot',
    note: '名前が一覧に無いクローラーです。',
    ifMissing: '',
  },
]

/** The agents worth telling apart, most specific pattern first.
 *
 *  `key: true` marks the ones whose absence is worth saying out loud — the
 *  answer engines and search engines a client's customers actually use.
 *  Names follow what each operator documents for its User-Agent string. */
export const BOTS = [
  // --- AI検索のための読み取り ---
  { id: 'OAI-SearchBot', re: /OAI-SearchBot/i, group: 'ai-search', owner: 'OpenAI', key: true, note: 'ChatGPT の検索用。ここが来ていないと ChatGPT の検索回答には出ません' },
  { id: 'Claude-SearchBot', re: /Claude-SearchBot/i, group: 'ai-search', owner: 'Anthropic', key: true, note: 'Claude の検索用' },
  { id: 'PerplexityBot', re: /PerplexityBot/i, group: 'ai-search', owner: 'Perplexity', key: true, note: 'Perplexity の検索用' },
  { id: 'DuckAssistBot', re: /DuckAssistBot/i, group: 'ai-search', owner: 'DuckDuckGo', note: 'DuckDuckGo のAI回答用' },
  { id: 'Amzn-SearchBot', re: /Amzn-SearchBot/i, group: 'ai-search', owner: 'Amazon', note: 'Amazon（Alexa・Rufus）の検索用' },
  { id: 'MistralAI-Index', re: /MistralAI-Index/i, group: 'ai-search', owner: 'Mistral AI', note: 'Mistral（Le Chat）の検索用' },
  { id: 'YouBot', re: /YouBot/i, group: 'ai-search', owner: 'You.com', note: 'You.com の検索とAI回答用' },

  // --- ユーザーの依頼で読みに来たAI ---
  { id: 'ChatGPT-User', re: /ChatGPT-User/i, group: 'ai-user', owner: 'OpenAI', key: true, note: 'ChatGPT の利用者に頼まれて開いた' },
  { id: 'ChatGPT Agent', re: /ChatGPT Agent/i, group: 'ai-user', owner: 'OpenAI', note: 'ChatGPT のエージェントが操作のために開いた' },
  { id: 'Claude-User', re: /Claude-User/i, group: 'ai-user', owner: 'Anthropic', key: true, note: 'Claude の利用者に頼まれて開いた' },
  { id: 'Perplexity-User', re: /Perplexity-User/i, group: 'ai-user', owner: 'Perplexity', key: true, note: 'Perplexity の利用者に頼まれて開いた' },
  { id: 'MistralAI-User', re: /MistralAI-User/i, group: 'ai-user', owner: 'Mistral AI', note: 'Le Chat の利用者に頼まれて開いた' },
  { id: 'Meta-ExternalFetcher', re: /meta-externalfetcher/i, group: 'ai-user', owner: 'Meta', note: 'Meta AI の利用者に頼まれて開いた' },
  { id: 'Amzn-User', re: /Amzn-User/i, group: 'ai-user', owner: 'Amazon', note: 'Alexa などの利用者に頼まれて開いた' },
  { id: 'cohere-ai', re: /cohere-ai/i, group: 'ai-user', owner: 'Cohere', note: 'Cohere の利用者に頼まれて開いた' },
  { id: 'Google-NotebookLM', re: /Google-NotebookLM/i, group: 'ai-user', owner: 'Google', note: 'NotebookLM の利用者が資料として読み込んだ' },

  // --- AIの学習用 ---
  { id: 'GPTBot', re: /GPTBot/i, group: 'ai-train', owner: 'OpenAI', key: true, note: 'OpenAI の学習用' },
  { id: 'ClaudeBot', re: /ClaudeBot/i, group: 'ai-train', owner: 'Anthropic', key: true, note: 'Anthropic（Claude）の学習用' },
  { id: 'anthropic-ai', re: /anthropic-ai/i, group: 'ai-train', owner: 'Anthropic', note: 'Anthropic の旧エージェント名' },
  { id: 'Claude-Web', re: /Claude-Web/i, group: 'ai-train', owner: 'Anthropic', note: 'Anthropic の旧エージェント名' },
  { id: 'Google-CloudVertexBot', re: /Google-CloudVertexBot/i, group: 'ai-train', owner: 'Google', note: '企業が Google Cloud で自社用のAIを作るときの読み取り' },
  { id: 'GoogleOther', re: /GoogleOther/i, group: 'ai-train', owner: 'Google', note: 'Google の研究開発用（検索順位には関係しません）' },
  { id: 'Meta-ExternalAgent', re: /meta-externalagent/i, group: 'ai-train', owner: 'Meta', note: 'Meta AI の学習用' },
  { id: 'FacebookBot', re: /FacebookBot/i, group: 'ai-train', owner: 'Meta', note: 'Meta の旧学習用クローラー' },
  { id: 'Amazonbot', re: /Amazonbot/i, group: 'ai-train', owner: 'Amazon', note: 'Alexa / Amazon のサービス改善用' },
  { id: 'Bytespider', re: /Bytespider/i, group: 'ai-train', owner: 'ByteDance', note: 'ByteDance（TikTok）の学習用' },
  { id: 'CCBot', re: /CCBot/i, group: 'ai-train', owner: 'Common Crawl', note: '公開データセット。多くのAIの学習データの元になります' },
  { id: 'cohere-training-data-crawler', re: /cohere-training-data-crawler/i, group: 'ai-train', owner: 'Cohere', note: 'Cohere の学習用' },
  { id: 'DeepSeekBot', re: /DeepSeekBot/i, group: 'ai-train', owner: 'DeepSeek', note: 'DeepSeek の学習用' },
  { id: 'AI2Bot', re: /AI2Bot/i, group: 'ai-train', owner: 'Ai2', note: '研究用の公開モデルの学習用' },
  { id: 'Diffbot', re: /Diffbot/i, group: 'ai-train', owner: 'Diffbot', note: 'AI向けデータ提供会社の収集用' },

  // --- 検索エンジン ---
  // Google-InspectionTool is Search Console's own 「URL検査」; it comes when
  // somebody presses the button, not on Google's schedule, so it is told apart
  // from Googlebot rather than inflating it.
  { id: 'Google-InspectionTool', re: /Google-InspectionTool/i, group: 'search', owner: 'Google', note: 'Search Console の「URL検査」で読み込まれた' },
  { id: 'Googlebot', re: /Googlebot/i, group: 'search', owner: 'Google', key: true, note: 'Google 検索。AIによる概要の材料もここ経由です' },
  { id: 'Bingbot', re: /bingbot|BingPreview/i, group: 'search', owner: 'Microsoft', key: true, note: 'Bing 検索。Copilot の材料でもあります' },
  { id: 'Applebot', re: /Applebot/i, group: 'search', owner: 'Apple', note: 'Apple の検索（Siri / Spotlight）' },
  { id: 'DuckDuckBot', re: /DuckDuckBot/i, group: 'search', owner: 'DuckDuckGo', note: 'DuckDuckGo' },
  { id: 'YandexBot', re: /YandexBot/i, group: 'search', owner: 'Yandex', note: 'Yandex' },
  { id: 'Baiduspider', re: /Baiduspider/i, group: 'search', owner: 'Baidu', note: 'Baidu' },
  { id: 'PetalBot', re: /PetalBot/i, group: 'search', owner: 'Huawei', note: 'Huawei の検索' },

  // --- SNS のリンク展開 ---
  { id: 'Twitterbot', re: /Twitterbot/i, group: 'social', owner: 'X', note: 'X（Twitter）でリンクが展開された' },
  { id: 'Slackbot', re: /Slackbot/i, group: 'social', owner: 'Slack', note: 'Slack でリンクが展開された' },
  // LINE's preview fetcher only. The LINE in-app browser also says "Line/…"
  // in its agent, and that is a person reading the page, not a bot.
  { id: 'LINE', re: /line-poker/i, group: 'social', owner: 'LINE', note: 'LINE でリンクが展開された' },
  { id: 'facebookexternalhit', re: /facebookexternalhit/i, group: 'social', owner: 'Meta', note: 'Facebook・Instagram でリンクが展開された' },
  { id: 'Discordbot', re: /Discordbot/i, group: 'social', owner: 'Discord', note: 'Discord でリンクが展開された' },

  // --- SEO ツール（robots.txt では断っている相手）---
  { id: 'AhrefsBot', re: /AhrefsBot/i, group: 'tool', owner: 'Ahrefs', note: '競合調査ツール' },
  { id: 'SemrushBot', re: /SemrushBot/i, group: 'tool', owner: 'Semrush', note: '競合調査ツール' },
]

/** Names that only ever appear in robots.txt. They are switches the operator
 *  reads to decide what to do with pages its ordinary crawler already fetched
 *  — Google-Extended is read by Googlebot, Applebot-Extended by Applebot — so
 *  no request ever arrives under these names. Listing them under 「まだ一度も
 *  来ていない」 suggested a problem that cannot exist. */
export const ROBOTS_TOKENS = [
  { id: 'Google-Extended', note: 'Gemini などの学習・回答に使ってよいか（読み取り自体は Googlebot が行います）' },
  { id: 'Applebot-Extended', note: 'Apple Intelligence の学習に使ってよいか（読み取り自体は Applebot が行います）' },
  { id: 'Webzio-Extended', note: 'Webz.io がAI向けに提供してよいか' },
]

// The old ids, as they may still be stored in the last 30 days of hashes.
const RENAMED = { 'meta-externalagent': 'Meta-ExternalAgent' }

/** Is this agent string a crawler that names a page-reading purpose? A single
 *  test the middleware runs before anything else, so an ordinary visitor
 *  costs one regular expression and nothing more. */
const ANY = new RegExp(BOTS.map((b) => b.re.source).join('|') + '|bot|crawl|spider', 'i')
export const looksLikeBot = (ua) => ANY.test(String(ua || ''))

/** The agent string, reduced to one of the names above. Anything unmatched is
 *  reported as 「その他のbot」 only when it calls itself a bot AND gives a
 *  contact address, which is the convention every real crawler follows. The
 *  second half matters now that every page is checked: a phone whose model
 *  name ends in "bot" (there is one) must not turn its owner into a crawler. */
export function classify(ua) {
  const s = String(ua || '')
  if (!s) return null
  for (const b of BOTS) if (b.re.test(s)) return b
  if (/(bot|crawler|spider)\b/i.test(s) && /https?:\/\/|@/.test(s)) {
    return { id: 'other', group: 'other', owner: '', note: '名前が一覧に無いクローラー' }
  }
  return null
}

/** The path as it is stored: no query, no trailing slash, URL characters only
 *  (it is shown in the admin), and short. */
export function crawlPath(raw) {
  let p = String(raw || '/').split(/[?#]/)[0]
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/{2,}/g, '/')
  if (p.length > 1) p = p.replace(/\/$/, '')
  p = p.slice(0, 80) || '/'
  return /^\/[A-Za-z0-9/_\-.~%]*$/.test(p) ? p : '/(other)'
}

/* The capped part of the write, done inside Redis so the whole visit is one
   round trip. A field already in the hash is always counted; a new one is
   folded into the "(other)" field once the hash holds MAX_FIELDS. track.js
   does the same check with a read before its write; here there is no second
   round trip to spare, because this runs on crawler requests for every page.
   If the store refuses the script, only the per-page counts are lost — the
   commands around it in the same pipeline still run. */
const BUMP = `
local function bump(k, f, other)
  if redis.call('HEXISTS', k, f) == 0 and redis.call('HLEN', k) >= tonumber(ARGV[1]) then f = other end
  redis.call('HINCRBY', k, f, 1)
  redis.call('EXPIRE', k, tonumber(ARGV[2]))
end
bump(KEYS[1], ARGV[3], ARGV[4])
bump(KEYS[2], ARGV[5], ARGV[6])
return 1`

/** The commands for one crawler visit. Separate from the write so the test
 *  can read them. */
export function crawlCommands(b, path, d = jstDate()) {
  const p = crawlPath(path)
  return [
    ['HINCRBY', DAY(d), b.id, 1],
    ['EXPIRE', DAY(d), TTL],
    ['HSET', LAST, b.id, `${new Date().toISOString()}|${p}`],
    ['EVAL', BUMP, 2, PATHS(d), AGENT_PATHS(d), MAX_FIELDS, TTL, p, '/(other)', `${b.id}\t${p}`, `${b.id}\t/(other)`],
  ]
}

/** Best effort, and never in the way: one pipeline, one round trip. The
 *  caller decides how long to wait — the middleware hands it to waitUntil
 *  and answers the page before it. */
export async function recordCrawl(cfg, { ua, path, bot }) {
  const b = bot || classify(ua)
  if (!cfg || !b) return null
  await pipeline(cfg, crawlCommands(b, path))
  return true
}

const pairs = (h) => (h && typeof h === 'object' ? Object.entries(h) : [])

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

/** Everything the panel shows about crawling, in one round trip. */
export async function readCrawls(cfg, days = 30) {
  if (!cfg) return null
  const dates = lastDays(days)
  const cmds = [
    ...dates.map((d) => ['HGETALL', DAY(d)]),
    ['HGETALL', LAST],
    ...dates.map((d) => ['HGETALL', PATHS(d)]),
    ...dates.map((d) => ['HGETALL', AGENT_PATHS(d)]),
  ]
  let out
  try { out = await pipeline(cfg, cmds) } catch (_) { return null }

  const n = dates.length
  const dayHashes = out.slice(0, n).map(asObj)
  const last = asObj(out[n])
  const pathHashes = out.slice(n + 1, 2 * n + 1).map(asObj)
  const apHashes = out.slice(2 * n + 1, 3 * n + 1).map(asObj)
  const canon = (id) => RENAMED[id] || id

  const perDay = dates.map((d, i) => ({ date: d, hits: pairs(dayHashes[i]).reduce((a, [, v]) => a + (+v || 0), 0) }))
  const tally = new Map()
  for (const h of dayHashes) {
    for (const [id, v] of pairs(h)) tally.set(canon(id), (tally.get(canon(id)) || 0) + (+v || 0))
  }

  const paths = new Map()
  for (const h of pathHashes) for (const [p, v] of pairs(h)) paths.set(p, (paths.get(p) || 0) + (+v || 0))

  // agent -> path -> hits, over the whole period.
  const byAgent = new Map()
  for (const h of apHashes) {
    for (const [field, v] of pairs(h)) {
      const tab = field.indexOf('\t')
      if (tab < 0) continue
      const id = canon(field.slice(0, tab))
      const p = field.slice(tab + 1)
      if (!byAgent.has(id)) byAgent.set(id, new Map())
      const m = byAgent.get(id)
      m.set(p, (m.get(p) || 0) + (+v || 0))
    }
  }

  const groupOf = (key) => GROUPS.find((g) => g.key === key) || GROUPS[GROUPS.length - 1]
  const meta = (id) => BOTS.find((b) => b.id === id) || { id, group: 'other', owner: '', note: '' }
  const lastOf = (id) => {
    const raw = last[id] || Object.keys(RENAMED).filter((k) => RENAMED[k] === id).map((k) => last[k]).find(Boolean)
    return String(raw || '').split('|')
  }
  const agents = [...tally.entries()]
    .map(([id, hits]) => {
      const m = meta(id)
      const seen = lastOf(id)
      const read = byAgent.get(id) || new Map()
      return {
        id, hits,
        group: m.group,
        groupLabel: groupOf(m.group).label,
        owner: m.owner || '',
        note: m.note,
        lastAt: seen[0] || null,
        lastPath: seen[1] || null,
        // Pages this agent read most. Only counted from the day page-level
        // recording began; before that only robots.txt and llms.txt exist.
        topPaths: [...read.entries()].map(([path, h]) => ({ path, hits: h }))
          .sort((a, b) => b.hits - a.hits).slice(0, 5),
      }
    })
    .sort((a, b) => b.hits - a.hits)

  const sum = (g) => agents.filter((a) => a.group === g).reduce((x, a) => x + a.hits, 0)
  const groups = GROUPS.map((g) => ({
    key: g.key, label: g.label, note: g.note, ifMissing: g.ifMissing,
    hits: sum(g.key),
    agents: agents.filter((a) => a.group === g.key).length,
  }))

  return {
    days,
    // Nothing here is verified; see the header of this file.
    verified: false,
    total: agents.reduce((x, a) => x + a.hits, 0),
    // Kept for the advisor's summary, which reads these three by name.
    ai: sum('ai-search') + sum('ai-train'),
    search: sum('search'),
    visit: sum('ai-user'),
    groups,
    agents: agents.slice(0, 30),
    perDay,
    // The pages crawlers read most, all agents together.
    paths: [...paths.entries()].map(([path, hits]) => ({ path, hits })).sort((a, b) => b.hits - a.hits).slice(0, 10),
    // The important agents that have not appeared once in the period, with
    // the group they belong to, so the screen can say what to do about each.
    missing: BOTS.filter((b) => b.key && !tally.has(b.id))
      .map((b) => ({ id: b.id, owner: b.owner, group: b.group, groupLabel: groupOf(b.group).label, note: b.note })),
    tokens: ROBOTS_TOKENS,
  }
}
