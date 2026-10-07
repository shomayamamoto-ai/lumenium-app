// チャットで行ったAIO計測（scripts/aio-chat-*.json）を、管理画面が読む
// 計測の形（api/aio.js の finalize と同じ）にして api/_aio-chat-runs.js に書きます。
//
// Anthropic のAPI（残高）を使わずに、Claude のチャットがウェブ検索で各質問に
// 答えた結果です。1問1回・AIは Claude だけなので、幅（誤差）は広めに出ます。
//
//   node scripts/build-aio-chat-runs.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

Object.assign(process.env, { SITE_NAME: '', SITE_URL: '', SITE_NAME_KANA: '', SITE_LOOKALIKES: '' })

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const C = await import(new URL('../api/_aio-catalog.js', import.meta.url))
const { summarise, buildActions } = await import(new URL('../api/aio.js', import.meta.url))

const list = C.DEFAULT_QUESTIONS.map((q) => ({ ...q, branded: C.isBranded(q) }))
const byId = new Map(list.map((q) => [q.id, q]))
const MODEL = 'Claude（チャット・ウェブ検索）'

const files = fs.readdirSync(here).filter((f) => /^aio-chat-.*\.json$/.test(f)).sort()
const runs = files.map((f) => {
  const src = JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'))
  const results = src.answers.map((a) => {
    const item = byId.get(a.id)
    if (!item) throw new Error(`${f}: 質問 ${a.id} が既定の質問にありません`)
    const urls = (a.urls || []).filter(Boolean)
    const hosts = [...new Set(urls.map((u) => C.hostOf(u)).filter(Boolean))]
    const own = urls.filter((u) => C.isOwnHost(C.hostOf(u)))
    const hit = C.isHit(a.verdict)
    return {
      key: `${item.id}#claude#0`,
      id: item.id,
      cat: item.cat,
      q: item.q,
      branded: item.branded,
      engine: 'claude',
      model: MODEL,
      sample: 0,
      answer: a.answer,
      named: C.namesBrand(a.answer),
      verdict: a.verdict,
      cited: own.length > 0,
      citedRank: own.length ? urls.indexOf(own[0]) + 1 : null,
      citedUrls: urls.slice(0, 3).map((u) => ({ url: u, title: '', host: C.hostOf(u) })),
      searched: own.length > 0,
      searchCount: urls.length,
      sources: hosts,
      sourceUrls: urls.slice(0, 8),
      ownPages: own.map((u) => new URL(u).pathname || '/'),
      companies: a.companies || [],
      position: hit && Number.isInteger(a.position) ? a.position : null,
      sentiment: hit ? (a.sentiment || 'neutral') : null,
      missing: a.missing || '',
      truncated: false,
      truncReason: null,
      error: null,
    }
  })
  const settings = {
    samples: 1,
    engines: ['claude'],
    questionsHash: C.questionSetHash(list),
    questionCount: list.length,
    customQuestions: false,
    models: { claude: MODEL },
    judgeModel: MODEL,
  }
  const summary = summarise(results, false, settings)
  // 同じ日に何回か測っても別の計測になるよう、日本時間の時刻まで入れます。
  const day = src.measuredAt.slice(0, 10)
  const hm = src.measuredAt.slice(11, 16).replace(':', '')
  return {
    id: `${day}-${hm}-chat`,
    source: 'chat',
    site: 'lumenium.net',
    note: src.note,
    startedAt: new Date(src.measuredAt).toISOString(),
    finishedAt: new Date(src.measuredAt).toISOString(),
    settings,
    questions: list,
    results,
    summary,
    actions: buildActions(results, summary, null),
    social: null,
    companiesFailed: false,
    analysisFailures: [],
  }
})

const out = `// 自動生成（scripts/build-aio-chat-runs.mjs）。手で直さないでください。
// Claude のチャットがウェブ検索で行ったAIO計測。APIの残高を使わない計測で、
// lumenium.net のサイトでだけ、管理画面の計測履歴に並びます（api/aio.js）。
export const CHAT_RUNS = ${JSON.stringify(runs, null, 1)}
`
fs.writeFileSync(path.join(root, 'api/_aio-chat-runs.js'), out)
for (const r of runs) {
  const s = r.summary
  console.log(`${r.id}: 回答 ${s.asked}/${s.total} ・候補 ${Math.round(s.recommendRate * 100)}% ・名前が出た（非指名）${Math.round(s.openMentionRate * 100)}% ・全体 ${Math.round(s.mentionRate * 100)}% ・出典 ${Math.round(s.citeRate * 100)}%`)
  console.log('  verdicts', JSON.stringify(s.verdicts), ' actions', r.actions.map((a) => a.title).join(' / '))
}
