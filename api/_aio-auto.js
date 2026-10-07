// AIO出現率の自動計測。
//
// 管理画面の「AIO出現率を計測」は、ブラウザが1回ずつ質問を投げて進める
// 作りです（エッジ関数は1回の呼び出しに使える時間が短く、ウェブ検索つきの
// 回答は1回に10〜30秒かかるため）。画面を開いて押さないと測れないので、
// 測り忘れた週の数字が抜け、推移が読めなくなっていました。
//
// ここでは同じ手順を、サーバーだけで少しずつ進めます。
//
//   1. 毎朝の自動処理（social-cron.js）が、計測の日が来ていれば計測を始める。
//   2. /api/aio-cron が1回に50秒ほどぶんだけ進め（質問を3つずつ並べて聞く／
//      判定を3まとまりずつ読む）、終わっていなければ自分自身をもう一度呼ぶ。
//   3. すべての回答を読み終えたら、手で計測したときと同じ形で集計して保存する。
//      SEO / AIO 分析の画面とホームには、そのまま最新の計測として出ます。
//
// 途中で止まっても（呼び出しの連鎖が切れても）、回答は1件ずつ保存してあり、
// 翌朝の自動処理か、管理画面を開いたときに、続きから再開します。
// 費用の上限（1日の回数）は、手で計測するときと同じものを数えます。

import Anthropic from '@anthropic-ai/sdk'
import { storeConfig, pipeline } from './_analytics-store.js'
import { spendGuard } from './_admin-auth.js'
import { engineKeys, ENGINES } from './_engines.js'
import { JUDGE_BATCH } from './_aio-catalog.js'
import { KV } from './_brand.js'
import {
  startRun, askOnce, finalizeRun, readRun, readAnswers, storable, analyseBatch, describeError,
  RES, RUN_TTL, SAMPLE_OPTIONS, DEFAULT_SAMPLES, ASK_TIMEOUT_MS, ASK_PER_DAY, JUDGE_PER_DAY,
} from './aio.js'

const SET_KEY = `${KV}aio:auto`
const STATE_KEY = `${KV}aio:auto:state`
const LOCK_KEY = `${KV}aio:auto:lock`
const PEND = (id) => `${KV}aio:pend:${id}`
const TRIES = (id) => `${KV}aio:tries:${id}`

/** 計測の間隔（日）。毎朝の自動処理が1日1回なので、1日より細かくはしません。 */
export const EVERY_OPTIONS = [7, 14, 30]
export const AUTO_DEFAULTS = { on: true, every: 7, samples: DEFAULT_SAMPLES, engines: ['claude'] }

const DAY = 24 * 60 * 60 * 1000
/* 1回の呼び出しで進める時間の既定。/api/aio-cron（最長60秒の関数）は
   これより長く渡します。 */
const STEP_BUDGET_MS = 24000
const PARALLEL = 3
const MAX_TRIES = 3
const MAX_STEPS = 80
// この時間、何も進んでいなければ「止まった」とみなして続きを呼び直します。
export const STALE_MS = 3 * 60 * 1000

/* サーバー側の計測の呼び出しに付ける合言葉。CRON_SECRET があればそれを、
   無ければ管理キー（ADMIN_KEY）から作った値を使います。CRON_SECRET が
   未設定のサイトでも「今すぐ自動で計測」と画面を開いたときの再開が動くように。
   管理キーそのものは送りません（そこから一方向に作った値だけ）。 */
export async function stepToken() {
  const cron = (process.env.CRON_SECRET || '').trim()
  if (cron) return cron
  const admin = (process.env.ADMIN_KEY || '').trim()
  if (!admin) return ''
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(admin), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode('aio-cron-step')))
  return 'aio-' + [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* サーバーで回すときの1回の回答の待ち時間。ブラウザから回すとき（18秒）より
   長く待てるので、混み合う時間帯の「時間切れ」がほとんど無くなります。 */
export const SERVER_ASK_TIMEOUT_MS = 30000

const parse = (raw, dflt) => { try { return raw ? JSON.parse(raw) : dflt } catch (_) { return dflt } }

export function cleanSettings(x) {
  const s = x && typeof x === 'object' ? x : {}
  const engines = Array.isArray(s.engines) ? s.engines.filter((e) => ENGINES[e]) : []
  return {
    on: s.on === undefined ? AUTO_DEFAULTS.on : s.on === true,
    every: EVERY_OPTIONS.includes(Number(s.every)) ? Number(s.every) : AUTO_DEFAULTS.every,
    samples: SAMPLE_OPTIONS.includes(Number(s.samples)) ? Number(s.samples) : AUTO_DEFAULTS.samples,
    engines: engines.length ? engines : AUTO_DEFAULTS.engines,
  }
}

export async function readAuto(cfg) {
  if (!cfg) return { settings: cleanSettings(null), state: {} }
  try {
    const [a, b] = await pipeline(cfg, [['GET', SET_KEY], ['GET', STATE_KEY]])
    return { settings: cleanSettings(parse(a, null)), state: parse(b, {}) || {} }
  } catch (_) {
    return { settings: cleanSettings(null), state: {} }
  }
}

export async function saveSettings(cfg, patch) {
  const { settings } = await readAuto(cfg)
  const next = cleanSettings({ ...settings, ...(patch || {}) })
  await pipeline(cfg, [['SET', SET_KEY, JSON.stringify(next)]])
  return next
}

async function writeState(cfg, state) {
  state.updatedAt = new Date().toISOString()
  await pipeline(cfg, [['SET', STATE_KEY, JSON.stringify(state), 'EX', 400 * 24 * 3600]])
}

/** いちばん新しい計測（手でも自動でも）が始まった時刻。 */
async function lastStarted(cfg, state) {
  let t = Date.parse(state.lastStartedAt || '') || 0
  try {
    const [ids] = await pipeline(cfg, [['LRANGE', `${KV}aio:index`, 0, 0]])
    if (Array.isArray(ids) && ids[0]) {
      const run = await readRun(cfg, ids[0])
      const s = run && !run.unreachable ? Date.parse(run.startedAt || '') || 0 : 0
      if (s > t) t = s
    }
  } catch (_) { /* 読めなければ自分の記録だけで決める */ }
  return t
}

/** 次に自動で測る日時（ミリ秒）。設定がオフなら null。 */
export async function nextDue(cfg, settings, state) {
  if (!settings.on) return null
  const last = await lastStarted(cfg, state)
  return last ? last + settings.every * DAY : Date.now()
}

/** 画面に出す状態。 */
export async function autoStatus(cfg) {
  const { settings, state } = await readAuto(cfg)
  const due = cfg ? await nextDue(cfg, settings, state) : null
  let progress = null
  if (state.runId && cfg) {
    const run = await readRun(cfg, state.runId)
    if (run && !run.unreachable) {
      const total = (run.questions || []).length * run.settings.samples * run.settings.engines.length
      const answers = await readAnswers(cfg, state.runId)
      progress = {
        total,
        answered: answers.filter((r) => r && (r.answer || r.error)).length,
        judged: answers.filter((r) => r && r.verdict).length,
        phase: state.phase || 'ask',
      }
    }
  }
  const stale = !!state.runId && Date.now() - (Date.parse(state.updatedAt || '') || 0) > STALE_MS
  return {
    settings,
    running: !!state.runId,
    stale,
    progress,
    nextAt: due ? new Date(due).toISOString() : null,
    lastRunId: state.lastRunId || null,
    lastFinishedAt: state.lastFinishedAt || null,
    lastResult: state.lastResult || null,
    lastError: state.lastError || null,
    // 毎朝の自動処理が動くか（CRON_SECRET）。無くても「今すぐ」と、画面を開いたときの開始・再開は動きます。
    cronReady: !!(process.env.CRON_SECRET || '').trim(),
    stepReady: !!(process.env.CRON_SECRET || process.env.ADMIN_KEY || '').trim(),
  }
}

/** 計測を始める（自動の日が来たとき・「今すぐ」を押したとき）。 */
export async function startAuto(cfg, reason) {
  const { settings, state } = await readAuto(cfg)
  if (state.runId) return { ok: true, already: true, runId: state.runId }
  const keys = await engineKeys()
  if (!keys.claude) {
    state.lastError = { at: new Date().toISOString(), message: 'Claude のAPIキーが、サーバーから読める場所にありません。設定状況の「キーの入力」で「この画面で保存」してください（この端末だけに保存したキーは、自動の計測からは使えません）。' }
    await writeState(cfg, state)
    return { ok: false, message: state.lastError.message }
  }
  const r = await startRun(cfg, keys, { samples: settings.samples, engines: settings.engines, auto: true })
  if (r.error) {
    state.lastError = { at: new Date().toISOString(), message: r.error.message || '計測を始められませんでした。' }
    await writeState(cfg, state)
    return { ok: false, message: state.lastError.message }
  }
  Object.assign(state, {
    runId: r.run.id,
    phase: 'ask',
    reason: reason || 'schedule',
    lastStartedAt: r.run.startedAt,
    steps: 0,
    failures: [],
    lastError: null,
  })
  await writeState(cfg, state)
  return { ok: true, runId: r.run.id, plan: r.plan }
}

async function lock(cfg) {
  const token = Math.random().toString(36).slice(2)
  try {
    const [ok] = await pipeline(cfg, [['SET', LOCK_KEY, token, 'NX', 'EX', 75]])
    return ok === 'OK' ? token : null
  } catch (_) { return null }
}
async function unlock(cfg, token) {
  try {
    const [cur] = await pipeline(cfg, [['GET', LOCK_KEY]])
    if (cur === token) await pipeline(cfg, [['DEL', LOCK_KEY]])
  } catch (_) {}
}

async function pool(items, size, fn) {
  let next = 0
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i) } }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

/** 計測を少し進める。戻り値の more が true なら、続きがあります。 */
export async function stepAuto(cfg, budgetMs = STEP_BUDGET_MS) {
  const t0 = Date.now()
  const left = () => budgetMs - (Date.now() - t0)
  const token = await lock(cfg)
  if (!token) return { ok: true, busy: true, more: false }
  try {
    const { state } = await readAuto(cfg)
    if (!state.runId) return { ok: true, idle: true, more: false }
    const run = await readRun(cfg, state.runId)
    if (!run || run.unreachable) {
      state.lastError = { at: new Date().toISOString(), message: '計測の記録が読めませんでした。次の計測からやり直します。' }
      state.runId = null
      await writeState(cfg, state)
      return { ok: false, more: false }
    }
    state.steps = (state.steps || 0) + 1
    const keys = await engineKeys()
    if (!keys.claude) {
      state.lastError = { at: new Date().toISOString(), message: 'Claude のAPIキーが読めなくなりました。設定状況でキーを確かめてください。' }
      await writeState(cfg, state)
      return { ok: false, more: false }
    }

    const answers = await readAnswers(cfg, run.id)
    const byKey = new Map(answers.map((r) => [r.key, r]))
    let tries = {}
    let pend = {}
    try {
      const [t, p] = await pipeline(cfg, [['HGETALL', TRIES(run.id)], ['HGETALL', PEND(run.id)]])
      for (let i = 1; Array.isArray(t) && i < t.length; i += 2) tries[t[i - 1]] = Number(t[i]) || 0
      for (let i = 1; Array.isArray(p) && i < p.length; i += 2) pend[p[i - 1]] = parse(p[i], null)
    } catch (_) { tries = {}; pend = {} }

    let capped = null
    // ---- 聞く ----
    const jobs = []
    for (let s = 0; s < run.settings.samples; s++) {
      run.questions.forEach((item, index) => {
        for (const engine of run.settings.engines) {
          const key = `${item.id}#${engine}#${s}`
          const have = byKey.get(key)
          const p = pend[key]
          if (p) jobs.push({ item, index, sample: s, engine, key, order: 0, p })
          else if (!have) jobs.push({ item, index, sample: s, engine, key, order: 1 })
          else if (have.error && (tries[key] || 0) < MAX_TRIES) jobs.push({ item, index, sample: s, engine, key, order: 2 })
        }
      })
    }
    jobs.sort((a, b) => a.order - b.order)
    if (jobs.length) {
      state.phase = 'ask'
      const doing = jobs.slice(0, PARALLEL * Math.max(1, Math.floor(budgetMs / 12000)))
      await pool(doing, PARALLEL, async (job) => {
        const wait = Math.min(SERVER_ASK_TIMEOUT_MS, Math.max(ASK_TIMEOUT_MS, budgetMs - 15000))
        if (capped || left() < wait + 1500) return
        const over = await spendGuard('aio-ask', ASK_PER_DAY)
        if (over) { capped = '本日の上限に達したため、続きは明日の朝に再開します。'; return }
        const cont = job.p ? job.p.continuation : 0
        const r = await askOnce(keys, job.item, job.engine, job.sample, cont, job.p ? job.p.resume : null, wait)
        const cmds = []
        if (r.paused) {
          cmds.push(['HSET', PEND(run.id), job.key, JSON.stringify({ continuation: cont + 1, resume: r.resume })], ['EXPIRE', PEND(run.id), 3 * 24 * 3600])
        } else {
          cmds.push(['HDEL', PEND(run.id), job.key])
          // 失敗は、うまくいった回答を上書きしない。
          if (!r.error || !(byKey.get(job.key) && !byKey.get(job.key).error)) {
            cmds.push(['HSET', RES(run.id), job.key, JSON.stringify(storable(r))], ['EXPIRE', RES(run.id), RUN_TTL])
          }
          if (r.error) cmds.push(['HINCRBY', TRIES(run.id), job.key, 1], ['EXPIRE', TRIES(run.id), 3 * 24 * 3600])
        }
        try { await pipeline(cfg, cmds) } catch (_) { /* 次の回で聞き直します */ }
      })
    } else {
      // ---- 読む（判定） ----
      const todo = answers.filter((r) => r && r.answer && !r.error && !r.truncated && !r.verdict && !r.judgeFailed)
      if (todo.length) {
        state.phase = 'judge'
        const batches = []
        for (let i = 0; i < todo.length; i += JUDGE_BATCH) batches.push(todo.slice(i, i + JUDGE_BATCH))
        const client = new Anthropic({ apiKey: keys.claude, maxRetries: 0 })
        await pool(batches.slice(0, PARALLEL * Math.max(1, Math.floor(budgetMs / 20000))), PARALLEL, async (batch) => {
          if (capped || left() < 23000) return
          const over = await spendGuard('aio-judge', JUDGE_PER_DAY)
          if (over) { capped = '本日の上限に達したため、続きは明日の朝に再開します。'; return }
          const items = batch.map((r) => ({ key: r.key, q: r.q, answer: String(r.answer).slice(0, 4000) }))
          let verdicts = null
          let failure = null
          const t1 = Date.now()
          try { verdicts = await analyseBatch(client, items) } catch (e) {
            failure = { keys: items.map((x) => x.key), ...describeError(e, Date.now() - t1) }
          }
          const cmds = []
          for (const r of batch) {
            const v = verdicts && verdicts[r.key]
            if (v) {
              Object.assign(r, { verdict: v.verdict, companies: v.companies || [], missing: v.missing || '', position: v.position == null ? null : v.position, sentiment: v.sentiment || null })
            } else {
              r.judgeTries = (r.judgeTries || 0) + 1
              if (r.judgeTries >= 2) r.judgeFailed = true
            }
            cmds.push(['HSET', RES(run.id), r.key, JSON.stringify(storable(r))])
          }
          if (failure && batch.some((r) => r.judgeFailed)) state.failures = (state.failures || []).concat([failure]).slice(-50)
          try { await pipeline(cfg, cmds) } catch (_) {}
        })
      } else {
        // ---- まとめる ----
        state.phase = 'final'
        const r = await finalizeRun(cfg, run, [], state.failures || [])
        try { await pipeline(cfg, [['DEL', PEND(run.id)], ['DEL', TRIES(run.id)]]) } catch (_) {}
        const s = r.run && r.run.summary
        Object.assign(state, {
          runId: null,
          phase: null,
          lastRunId: run.id,
          lastFinishedAt: new Date().toISOString(),
          lastResult: s ? {
            openMentionRate: s.openMentionRate == null ? null : s.openMentionRate,
            recommendRate: s.recommendRate == null ? null : s.recommendRate,
            citeRate: s.citeRate == null ? null : s.citeRate,
            asked: s.asked || 0,
            total: s.total || 0,
          } : null,
          lastError: r.error ? { at: new Date().toISOString(), message: r.error.message } : null,
        })
        await writeState(cfg, state)
        return { ok: !r.error, done: true, more: false, runId: run.id }
      }
    }

    if (capped) {
      state.lastError = { at: new Date().toISOString(), message: capped }
      await writeState(cfg, state)
      return { ok: true, capped: true, more: false }
    }
    // 終わらない計測をいつまでも回さないための歯止め。取れた分でまとめます。
    if (state.steps > MAX_STEPS) {
      const r = await finalizeRun(cfg, run, [], state.failures || [])
      Object.assign(state, {
        runId: null, phase: null, lastRunId: run.id, lastFinishedAt: new Date().toISOString(),
        lastError: { at: new Date().toISOString(), message: '回答が取れないまま時間がかかったため、取れた分だけで集計しました。' + (r.error ? r.error.message : '') },
      })
      await writeState(cfg, state)
      return { ok: true, done: true, more: false }
    }
    await writeState(cfg, state)
    return { ok: true, more: true, phase: state.phase }
  } finally {
    await unlock(cfg, token)
  }
}

/** 続きを、別の呼び出しとして始める（自分の持ち時間を越えないように）。
 *  呼ばれた側はすぐに 202 を返して、応答のあとで進めます。 */
export async function kick(origin) {
  const secret = await stepToken()
  if (!secret || !origin) return false
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(`${origin}/api/aio-cron`, { headers: { authorization: `Bearer ${secret}` }, signal: ctl.signal })
    return res.status === 202 || res.ok
  } catch (_) {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** 毎朝の自動処理から。計測の日が来ていれば始め、止まっている計測があれば続きを呼びます。 */
export async function runAioDaily(req) {
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: '保存先がありません。' }
  const origin = new URL(req.url).origin
  try {
    const { settings, state } = await readAuto(cfg)
    if (state.runId) {
      const k = await kick(origin)
      return { ok: true, resumed: true, kicked: k }
    }
    const due = await nextDue(cfg, settings, state)
    // 毎朝ほぼ同じ時刻に呼ばれるので、2時間の幅を見ます（前回より少し早く呼ばれても、その日に測る）。
    if (due == null || due - 2 * 60 * 60 * 1000 > Date.now()) return { ok: true, due: due ? new Date(due).toISOString() : null }
    const s = await startAuto(cfg, 'schedule')
    if (!s.ok || s.already) return s
    return { ...s, kicked: await kick(origin) }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e).slice(0, 160) }
  }
}
