export const config = { runtime: 'edge' }

// 管理画面の「自動改善」（public/admin-auto.js）の窓口。
//
//   GET                         -> 設定・提案・実験（いまの数字と判定）・記録・観測の表・最後の毎朝の処理
//   GET ?view=snapshots&days=N  -> 観測の1枚を N 日ぶん（最大120日）
//   POST { action, ... }
//     settings.save { settings }       設定（スイッチ・AIの月の上限）
//     kill / resume                    すべて止める / 再開する
//     proposal.adopt { id, b? }        採用する（実験の提案なら、B の文章で実験を始める）
//     proposal.dismiss { id }          見送る（30日は同じ提案を出しません）
//     exp.start { key, b }             手で実験を始める
//     exp.stop { id } / exp.adopt { id } / exp.revert { id }
//     log.undo { id }                  記録から元に戻す
//     run                              毎朝の処理をいま1回（観測と提案。AIは1日の回数の内で）
//
// Admin key only, by the header only.

import { requireAdmin, json } from './_admin-auth.js'
import { storeFor, pipeline, jstDate } from './_analytics-store.js'
import { setting } from './_settings.js'
import { DEFAULT_SETTINGS, cleanSettings, evaluate, decideWatch, EXP_KEYS, SWITCH_LABELS, AREA_LABELS, MIN, GOAL_LABELS } from './_auto-core.js'
import { AK, readSettings, saveSettings, readProps, readExps, publishLive, readCounts, readLog } from './_auto-store.js'
import { readSnapshots } from './_auto-signals.js'
import { monthUsage } from './_ai-pricing.js'
import { MODEL, USAGE_KIND } from './_auto-ai.js'
import {
  adoptProposal, dismissProposal, startExperiment, stopExperiment, adoptExperiment, revertExperiment, undoLog, runDaily,
  readOverrides, currentTexts,
} from './_auto-run.js'

const NO_STORE = { ok: false, code: 'NO_STORE', message: '自動改善には保存先（Upstash Redis）が必要です。設定状況の画面で接続してください。' }

function datesBack(n) {
  return Array.from({ length: n }, (_, i) => jstDate(i))
}

async function experimentsView(cfg, now = Date.now()) {
  const exps = await readExps(cfg, pipeline)
  const settings = await readSettings(cfg, pipeline)
  return Promise.all(exps.slice(0, 20).map(async (e) => {
    if (e.phase === 'running') return { ...e, live: evaluate(e, await readCounts(cfg, pipeline, e.id), now) }
    if (e.phase === 'watch') {
      const c = await readCounts(cfg, pipeline, e.id, ['W'])
      return { ...e, watchLive: decideWatch(e, c.W, now, settings) }
    }
    return e
  }))
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await storeFor(req)
  if (!cfg) return json(NO_STORE, 503)
  const url = new URL(req.url)
  if (url.searchParams.get('view') === 'snapshots') {
    const days = Math.max(1, Math.min(120, Number(url.searchParams.get('days')) || 30))
    return json({ ok: true, snapshots: await readSnapshots(cfg, pipeline, datesBack(days)) })
  }
  const [settings, props, exps, log, snaps, lastRaw, usage, gh, key] = await Promise.all([
    readSettings(cfg, pipeline), readProps(cfg, pipeline), experimentsView(cfg), readLog(cfg, pipeline, 50),
    readSnapshots(cfg, pipeline, datesBack(14)), pipeline(cfg, [['GET', AK.last]]).then(([r]) => r).catch(() => null),
    monthUsage(USAGE_KIND, MODEL), setting('GITHUB_TOKEN', '', req), setting('ANTHROPIC_API_KEY', '', req),
  ])
  let last = null
  try { last = lastRaw ? JSON.parse(lastRaw) : null } catch (_) { last = null }
  const order = { open: 0, testing: 1, adopted: 2, done: 3, dismissed: 4 }
  return json({
    ok: true,
    settings,
    defaults: DEFAULT_SETTINGS,
    switches: SWITCH_LABELS,
    areas: AREA_LABELS,
    keys: Object.fromEntries(Object.entries(EXP_KEYS).map(([k, v]) => [k, { label: v.label, goal: GOAL_LABELS[v.goal] }])),
    min: MIN,
    proposals: Object.values(props).sort((a, b) => (order[a.status] - order[b.status]) || String(b.updatedAt).localeCompare(String(a.updatedAt))),
    experiments: exps,
    log,
    snapshots: snaps,
    last,
    usage: { yen: usage.yen, calls: usage.usage.calls || 0, month: usage.month, cap: settings.monthlyYen },
    ready: { github: !!gh, ai: !!key, cron: !!(process.env.CRON_SECRET || '').trim() },
  })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await storeFor(req)
  if (!cfg) return json(NO_STORE, 503)
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  const action = String((body && body.action) || '')
  const ctx = { cfg, pipeline, req }
  const id = String(body.id || '').slice(0, 40)
  let r
  switch (action) {
    case 'settings.save': {
      const cur = await readSettings(cfg, pipeline)
      const next = cleanSettings(body.settings || {}, cur)
      await saveSettings(cfg, pipeline, next)
      await publishLive(cfg, pipeline, await readExps(cfg, pipeline), next)
      return json({ ok: true, settings: next, message: '設定を保存しました。' })
    }
    case 'kill':
    case 'resume': {
      const cur = await readSettings(cfg, pipeline)
      const next = { ...cur, paused: action === 'kill' }
      await saveSettings(cfg, pipeline, next)
      // 実験の配布もすぐ止めます（訪問者は1分ほどで全員が元の文章に）。
      await publishLive(cfg, pipeline, await readExps(cfg, pipeline), next)
      const { addLog } = await import('./_auto-store.js')
      await addLog(cfg, pipeline, { kind: action, by: 'owner', title: action === 'kill' ? 'すべて止めました' : '自動改善を再開しました' })
      return json({ ok: true, settings: next, message: action === 'kill' ? 'すべて止めました。実験中の文章も、1分ほどで全員が元の文章に戻ります。' : '再開しました。' })
    }
    case 'proposal.adopt': r = await adoptProposal(ctx, id, { b: typeof body.b === 'string' ? body.b.slice(0, 400) : undefined }); break
    case 'proposal.dismiss': r = await dismissProposal(ctx, id); break
    case 'exp.start': {
      const key = String(body.key || '')
      if (!EXP_KEYS[key]) return json({ ok: false, message: 'この項目は実験の対象にできません。' }, 400)
      const texts = currentTexts(await readOverrides(req), null, null)
      r = await startExperiment(ctx, { key, a: texts[key], b: String(body.b || '').slice(0, 400), by: 'owner' })
      break
    }
    case 'exp.stop': r = await stopExperiment(ctx, id, { by: 'owner', reason: '手で止めました' }); break
    case 'exp.adopt': r = await adoptExperiment(ctx, id, { by: 'owner' }); break
    case 'exp.revert': r = await revertExperiment(ctx, id, { by: 'owner', reason: '手で元に戻しました' }); break
    case 'log.undo': {
      const list = await readLog(cfg, pipeline, 200)
      r = await undoLog(ctx, id, list.find((e) => e.id === id))
      break
    }
    case 'run': {
      const { spendGuard } = await import('./_admin-auth.js')
      const capped = await spendGuard('auto-run', 6)
      if (capped) return capped
      r = { ok: true, result: await runDaily(ctx, { budgetMs: 20000 }) }
      break
    }
    default:
      return json({ ok: false, message: '知らない操作です。' }, 400)
  }
  return json(r, r && r.ok ? 200 : (r && r.code === 'GITHUB_NOT_CONFIGURED' ? 503 : 400))
}
