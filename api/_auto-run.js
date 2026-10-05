// 自動改善の「動き」。実験を始める・止める・採用する・元に戻す、設定を
// 変える、SNSの下書きを承認待ちに入れる、そして毎朝の処理。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// 安全のための決まり（ここを通らない書き込みはありません）
//   ・文章を書き換えるのは EXP_KEYS の項目だけ。料金・法的なページ・
//     連絡先は keyBlocked で必ず断ります。
//   ・サイトの文章は、文章編集（api/content-save.js）と同じファイル
//     public/content.json に、同じ GitHub の仕組みで書きます。読んでから
//     その項目だけを書き換えるので、ほかの人の編集は消しません。1回の
//     書き込みが1つのコミットで、メッセージに何をしたかを書きます。
//   ・自動でしたことも、手でしたことも、すべて記録（${KV}auto:log）に
//     前と後・根拠・「元に戻す」の中身を残します。
//   ・SNS は承認待ちに入れるだけです。ここから投稿はしません。
//   ・「すべて止める」のときは、毎朝の処理は観測（読むだけ）しかしません。

import { BRAND } from './_brand.js'
import { setting } from './_settings.js'
import { ghFile, b64encodeUtf8, b64decodeUtf8, repoName, ghDetail } from './_github.js'
import { SECTION } from '../src/data/text.js'
import { bookingCopy } from '../src/components/bookingCopy.js'
import {
  EXP_KEYS, GOAL_LABELS, keyBlocked, textProblem, newExpId, evaluate, decideRunning, decideWatch,
  canAutoStart, allowed, rulesFor, mergeProposals, MIN, SWITCH_LABELS,
} from './_auto-core.js'
import {
  AK, readSettings, readProps, writeProps, saveProp, readExps, saveExp, publishLive, readCounts, addLog, markLog,
} from './_auto-store.js'
import { gatherSignals, defaultReaders, saveSnapshot } from './_auto-signals.js'
import { writeDrafts, needsDraft, DAILY_CALLS } from './_auto-ai.js'

const FILE_PATH = 'public/content.json'
const PATH_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/

/* ---------------- いまの文章（A） ---------------- */

/** 保存済みの上書き（content.json）。GitHub のトークンがあればそこから、
 *  無ければ公開中のサイトから読みます。読めなければ空（＝元の文章）。 */
export async function readOverrides(req) {
  const token = await setting('GITHUB_TOKEN', '', req)
  try {
    if (token) {
      const cur = await ghFile(token, repoName(), FILE_PATH)
      if (cur.status === 404) return {}
      if (cur.ok) {
        const j = await cur.json()
        const parsed = JSON.parse(b64decodeUtf8(j.content || ''))
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      }
    }
    const res = await fetch(`${BRAND.url}/content.json`, { cache: 'no-store' })
    if (res.ok) { const j = await res.json(); return j && typeof j === 'object' && !Array.isArray(j) ? j : {} }
  } catch (_) { /* 読めなければ元の文章 */ }
  return {}
}

function builtIn(key, bookingInfo) {
  if (key === 'booking.heading') return bookingCopy(bookingInfo || {}).heading
  if (!key.startsWith('text.')) return ''
  let node = SECTION
  for (const p of key.split('.').slice(1)) { if (node == null) return ''; node = node[p] }
  return typeof node === 'string' ? node : ''
}

/** 試してよい項目ごとの、いまの文章。 */
export function currentTexts(overrides, bookingInfo, pins) {
  const out = {}
  for (const key of Object.keys(EXP_KEYS)) {
    out[key] = (pins && pins[key]) || (typeof (overrides || {})[key] === 'string' ? overrides[key] : builtIn(key, bookingInfo))
  }
  return out
}

/* ---------------- サイトの文章を書く ---------------- */

/** content.json の項目を書き換えます（null は「元の文章に戻す」＝上書きを消す）。
 *  返り値 { ok, before: {項目: 前の上書き or null}, message } */
export async function writeCopy(req, changes, message) {
  for (const k of Object.keys(changes)) {
    if (keyBlocked(k) || !EXP_KEYS[k].registry || !PATH_RE.test(k)) return { ok: false, message: `この項目は自動では書き換えません: ${k}` }
    const v = changes[k]
    if (v !== null && (typeof v !== 'string' || v.length > 400)) return { ok: false, message: '文章の形が正しくありません。' }
  }
  const token = await setting('GITHUB_TOKEN', '', req)
  if (!token) return { ok: false, code: 'GITHUB_NOT_CONFIGURED', message: 'GITHUB_TOKEN が未設定のため、サイトの文章を書き換えられません（設定状況の画面で入れてください）。' }
  const repo = repoName()
  const cur = await ghFile(token, repo, FILE_PATH)
  if (!cur.ok && cur.status !== 404) return { ok: false, message: `文章ファイルを読み込めませんでした。${ghDetail(cur.status)}` }
  let sha
  let merged = {}
  if (cur.ok) {
    const j = await cur.json()
    sha = j.sha
    try { const p = JSON.parse(b64decodeUtf8(j.content || '')); if (p && typeof p === 'object' && !Array.isArray(p)) merged = p } catch (_) { merged = {} }
  }
  const before = {}
  let changed = 0
  for (const [k, v] of Object.entries(changes)) {
    before[k] = typeof merged[k] === 'string' ? merged[k] : null
    if (v === null) { if (k in merged) { delete merged[k]; changed++ } } else if (merged[k] !== v) { merged[k] = v; changed++ }
  }
  if (!changed) return { ok: true, before, changed: 0 }
  const sorted = {}
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k]
  const put = await ghFile(token, repo, FILE_PATH, {
    method: 'PUT',
    body: JSON.stringify({ message, content: b64encodeUtf8(JSON.stringify(sorted, null, 2) + '\n'), ...(sha ? { sha } : {}) }),
  })
  if (!put.ok) return { ok: false, message: put.status === 409 ? '他の編集と競合しました。少し待ってからもう一度お試しください。' : `保存に失敗しました（GitHub応答: ${put.status}）。` }
  const saved = await put.json().catch(() => ({}))
  return { ok: true, before, changed, sha: (saved.commit && saved.commit.sha) || null }
}

/* ---------------- 実験 ---------------- */

export async function startExperiment(ctx, { key, a, b, proposalId, by, evidence }) {
  const { cfg, pipeline, now = Date.now() } = ctx
  if (keyBlocked(key)) return { ok: false, message: 'この項目は実験の対象にできません（料金・法的なページ・連絡先などは触りません）。' }
  const bad = textProblem(a, b)
  if (bad) return { ok: false, message: bad }
  const exps = await readExps(cfg, pipeline)
  const page = EXP_KEYS[key].page
  if (exps.some((e) => (e.phase === 'running' || e.phase === 'watch') && EXP_KEYS[e.key] && EXP_KEYS[e.key].page === page)) {
    return { ok: false, message: '同じページで別の実験・見張りが動いています。終わってから始めてください（1ページに1つまで）。' }
  }
  const exp = {
    id: newExpId(now), key, label: EXP_KEYS[key].label, goal: EXP_KEYS[key].goal, goalLabel: GOAL_LABELS[EXP_KEYS[key].goal],
    a: String(a || ''), b: String(b), phase: 'running', startedAt: new Date(now).toISOString(), proposalId: proposalId || '', by: by || 'owner',
  }
  await saveExp(cfg, pipeline, exp)
  const settings = await readSettings(cfg, pipeline)
  await publishLive(cfg, pipeline, [exp, ...exps], settings)
  if (proposalId) {
    const props = await readProps(cfg, pipeline)
    if (props[proposalId]) await saveProp(cfg, pipeline, { ...props[proposalId], status: 'testing', expId: exp.id, decidedAt: new Date(now).toISOString() })
  }
  await addLog(cfg, pipeline, {
    kind: 'exp_start', by: exp.by, title: `実験を始めました：${exp.label}`, key, before: exp.a, after: exp.b,
    evidence: evidence || [], undo: { type: 'exp_stop', id: exp.id },
  }, now)
  return { ok: true, exp }
}

async function finishProposal(cfg, pipeline, exp, status, now) {
  if (!exp.proposalId) return
  const props = await readProps(cfg, pipeline)
  const p = props[exp.proposalId]
  if (p) await saveProp(cfg, pipeline, { ...p, status, decidedAt: new Date(now).toISOString() })
}

export async function stopExperiment(ctx, id, { by = 'owner', reason = '' } = {}) {
  const { cfg, pipeline, now = Date.now() } = ctx
  const exps = await readExps(cfg, pipeline)
  const exp = exps.find((e) => e.id === id)
  if (!exp) return { ok: false, message: 'その実験は見つかりませんでした。' }
  if (exp.phase !== 'running') return { ok: false, message: '動いている実験ではありません。' }
  const counts = await readCounts(cfg, pipeline, id)
  const result = evaluate(exp, counts, now)
  const next = { ...exp, phase: 'stopped', endedAt: new Date(now).toISOString(), result: slim(result), reason }
  await saveExp(cfg, pipeline, next)
  await publishLive(cfg, pipeline, exps.map((e) => (e.id === id ? next : e)), await readSettings(cfg, pipeline))
  await finishProposal(cfg, pipeline, exp, 'done', now)
  await addLog(cfg, pipeline, { kind: 'exp_stop', by, title: `実験を終えました（元の文章のまま）：${exp.label}`, key: exp.key, before: exp.b, after: exp.a, evidence: [result.text], reason }, now)
  return { ok: true, exp: next }
}

const slim = (r) => ({ a: r.a, b: r.b, days: r.days, prob: r.prob, pValue: r.pValue, verdict: r.verdict, text: r.text })

/** 採用。content.json の項目なら書き換え、予約欄の見出しなら固定で配ります。
 *  採用後14日間は見張ります（W の印で、見た人と成果を数え続ける）。 */
export async function adoptExperiment(ctx, id, { by = 'owner' } = {}) {
  const { cfg, pipeline, req, now = Date.now() } = ctx
  const exps = await readExps(cfg, pipeline)
  const exp = exps.find((e) => e.id === id)
  if (!exp) return { ok: false, message: 'その実験は見つかりませんでした。' }
  if (exp.phase !== 'running' && exp.phase !== 'stopped') return { ok: false, message: 'この実験は採用できる状態ではありません。' }
  if (keyBlocked(exp.key)) return { ok: false, message: 'この項目は書き換えられません。' }
  const counts = await readCounts(cfg, pipeline, id)
  const result = evaluate(exp, counts, now)
  let prevOverride = null
  if (EXP_KEYS[exp.key].registry) {
    const w = await writeCopy(req, { [exp.key]: exp.b }, `auto: 実験の勝ち案を採用（${exp.label}）`)
    if (!w.ok) return w
    prevOverride = w.before[exp.key]
  }
  const next = { ...exp, phase: 'watch', adoptedAt: new Date(now).toISOString(), baseline: result.a, result: slim(result), prevOverride, adoptedBy: by }
  await saveExp(cfg, pipeline, next)
  await publishLive(cfg, pipeline, exps.map((e) => (e.id === id ? next : e)), await readSettings(cfg, pipeline))
  await finishProposal(cfg, pipeline, exp, 'adopted', now)
  await addLog(cfg, pipeline, {
    kind: 'adopt', by, title: `新しい案を採用しました：${exp.label}`, key: exp.key, before: exp.a, after: exp.b,
    evidence: [result.text, `A ${pctTxt(result.a)}・B ${pctTxt(result.b)}`],
    note: `このあと${MIN.watchDays}日間、下がっていないかを見張ります。サイトへの反映は約1〜2分後です。`,
    undo: { type: 'revert', id },
  }, now)
  return { ok: true, exp: next }
}

const pctTxt = (r) => (r && r.n ? `${(r.p * 100).toFixed(1)}%（${r.k}/${r.n}人）` : '—')

/** 採用を取り消して、元の文章に戻します。 */
export async function revertExperiment(ctx, id, { by = 'owner', reason = '' } = {}) {
  const { cfg, pipeline, req, now = Date.now() } = ctx
  const exps = await readExps(cfg, pipeline)
  const exp = exps.find((e) => e.id === id)
  if (!exp) return { ok: false, message: 'その実験は見つかりませんでした。' }
  if (exp.phase !== 'watch' && exp.phase !== 'adopted') return { ok: false, message: '採用済みの案ではありません。' }
  if (EXP_KEYS[exp.key] && EXP_KEYS[exp.key].registry) {
    const w = await writeCopy(req, { [exp.key]: exp.prevOverride == null ? null : exp.prevOverride }, `auto: 採用した文章を元に戻す（${exp.label}）`)
    if (!w.ok) return w
  }
  const next = { ...exp, phase: 'reverted', revertedAt: new Date(now).toISOString(), revertReason: reason }
  await saveExp(cfg, pipeline, next)
  await publishLive(cfg, pipeline, exps.map((e) => (e.id === id ? next : e)), await readSettings(cfg, pipeline))
  await addLog(cfg, pipeline, { kind: 'revert', by, title: `元の文章に戻しました：${exp.label}`, key: exp.key, before: exp.b, after: exp.a, evidence: reason ? [reason] : [] }, now)
  return { ok: true, exp: next }
}

/* ---------------- 提案を採用する ---------------- */

export async function adoptProposal(ctx, id, { b } = {}) {
  const { cfg, pipeline, req, now = Date.now() } = ctx
  const props = await readProps(cfg, pipeline)
  const p = props[id]
  if (!p) return { ok: false, message: 'その提案は見つかりませんでした。' }
  const act = p.action || {}
  if (act.type === 'experiment') {
    const text = typeof b === 'string' && b.trim() ? b.trim() : (p.draft && p.draft.text) || ''
    return startExperiment(ctx, { key: act.key, a: act.a, b: text, proposalId: id, by: 'owner', evidence: p.evidence.map((e) => e.text) })
  }
  if (act.type === 'setting' && act.setting === 'inquiry.autoReply') {
    const r = await setAutoReply(cfg, true)
    if (!r.ok) return r
    await saveProp(cfg, pipeline, { ...p, status: 'adopted', decidedAt: new Date(now).toISOString() })
    await addLog(cfg, pipeline, { kind: 'setting', by: 'owner', title: '受付確認メール（自動返信）を入れました', before: 'なし', after: 'あり', evidence: p.evidence.map((e) => e.text), undo: { type: 'setting', setting: 'inquiry.autoReply', value: false } }, now)
    return { ok: true }
  }
  if (act.type === 'sns' && p.draft && p.draft.text) {
    const q = await queueSns(req, p)
    if (!q.ok) return q
    await saveProp(cfg, pipeline, { ...p, status: 'adopted', decidedAt: new Date(now).toISOString(), draft: { ...p.draft, queued: true } })
    await addLog(cfg, pipeline, { kind: 'sns', by: 'owner', title: 'SNSの下書きを承認待ちに入れました', after: p.draft.text, evidence: p.evidence.map((e) => e.text) }, now)
    return { ok: true, message: '承認待ちに入れました。「SNS（文章）」の承認の画面から確かめて出してください。' }
  }
  // 直し方を見るだけのもの・お知らせの下書き: 「済んだ」の印を付けます。
  await saveProp(cfg, pipeline, { ...p, status: 'done', decidedAt: new Date(now).toISOString() })
  return { ok: true }
}

export async function dismissProposal(ctx, id) {
  const { cfg, pipeline, now = Date.now() } = ctx
  const props = await readProps(cfg, pipeline)
  const p = props[id]
  if (!p) return { ok: false, message: 'その提案は見つかりませんでした。' }
  await saveProp(cfg, pipeline, { ...p, status: 'dismissed', decidedAt: new Date(now).toISOString() })
  return { ok: true }
}

async function setAutoReply(cfg, on) {
  const inq = await import('./_inquiries.js')
  const cur = await inq.loadSettings(cfg)
  const r = await inq.saveSettings(cfg, { ...cur, autoReply: { ...cur.autoReply, on: !!on } })
  return r && r.ok === false ? { ok: false, message: (r.problems || []).join(' ') || '設定を保存できませんでした。' } : { ok: true }
}

async function queueSns(req, p) {
  const [{ createApproval }, { readPlan }] = await Promise.all([import('./_social-approve.js'), import('./_social-plan.js')])
  const plan = await readPlan(req).catch(() => ({ targets: {} }))
  const targets = Object.entries(plan.targets || {}).filter(([, t]) => t && t.on).map(([net]) => net)
  return createApproval({ text: p.draft.text, targets, pillar: (p.action && p.action.pillar) || '' }, { note: `自動改善の下書き：${p.title}` })
}

/** 記録の「元に戻す」。 */
export async function undoLog(ctx, logId, entry) {
  const { cfg, pipeline, now = Date.now() } = ctx
  if (!entry || !entry.undo || entry.undone) return { ok: false, message: 'この記録は元に戻せません（すでに戻したか、戻すものがありません）。' }
  const u = entry.undo
  let r
  if (u.type === 'exp_stop') r = await stopExperiment(ctx, u.id, { by: 'owner', reason: '記録から元に戻しました' })
  else if (u.type === 'revert') r = await revertExperiment(ctx, u.id, { by: 'owner', reason: '記録から元に戻しました' })
  else if (u.type === 'setting' && u.setting === 'inquiry.autoReply') {
    r = await setAutoReply(cfg, u.value)
    if (r.ok) await addLog(cfg, pipeline, { kind: 'setting', by: 'owner', title: u.value ? '受付確認メールを入れ直しました' : '受付確認メールを切りました（元に戻す）', before: u.value ? 'なし' : 'あり', after: u.value ? 'あり' : 'なし' }, now)
  } else return { ok: false, message: 'この記録は元に戻せません。' }
  if (!r.ok) return r
  await markLog(cfg, pipeline, logId, { undone: new Date(now).toISOString() })
  return { ok: true }
}

/* ---------------- 毎朝の処理 ---------------- */

/** 観測 → 実験の判定 → 採用・停止・元に戻す（設定しだい）→ 提案。
 *  時間が足りなくなったら、残りは翌朝に回します。 */
export async function runDaily(ctx, { budgetMs = 15000, date, readers, ai } = {}) {
  const { cfg, pipeline, req, now = Date.now() } = ctx
  const started = Date.now()
  const left = () => budgetMs - (Date.now() - started)
  const day = date || new Date(now + 9 * 3600000).toISOString().slice(0, 10)
  const out = { date: day, at: new Date(now).toISOString(), steps: [] }
  const settings = await readSettings(cfg, pipeline)
  out.paused = settings.paused

  // 1. 観測（読むだけなので、止めていても行います）。
  const snap = await gatherSignals(readers || defaultReaders(cfg, pipeline, req), day, { timeoutMs: Math.max(2000, Math.min(7000, left() - 4000)) })
  try { await saveSnapshot(cfg, pipeline, snap) } catch (_) {}
  out.steps.push({ step: 'snapshot', ok: true, sources: snap.sources })
  if (settings.paused) {
    out.steps.push({ step: 'paused', ok: true, message: '「すべて止める」中のため、観測だけ行いました。' })
    return finish(cfg, pipeline, out)
  }

  // 2. 実験の判定。
  const exps = await readExps(cfg, pipeline)
  for (const exp of exps) {
    if (left() < 3000) { out.steps.push({ step: 'experiments', ok: false, message: '時間が足りないため、残りは明日にします。' }); break }
    try {
      if (exp.phase === 'running') {
        const result = evaluate(exp, await readCounts(cfg, pipeline, exp.id), now)
        const d = decideRunning(result, settings)
        if (d === 'adopt') {
          const r = await adoptExperiment(ctx, exp.id, { by: 'auto' })
          out.steps.push({ step: 'adopt', id: exp.id, ok: r.ok, message: r.message || '' })
        } else if (d === 'stop') {
          const r = await stopExperiment(ctx, exp.id, { by: 'auto', reason: result.text })
          out.steps.push({ step: 'stop', id: exp.id, ok: r.ok })
        } else if (d === 'won' && !exp.won) {
          await saveExp(cfg, pipeline, { ...exp, won: new Date(now).toISOString() })
          await addLog(cfg, pipeline, { kind: 'won', by: 'auto', title: `新しい案が良さそうです（採用は手で）：${exp.label}`, key: exp.key, before: exp.a, after: exp.b, evidence: [result.text] }, now)
          out.steps.push({ step: 'won', id: exp.id, ok: true })
        }
      } else if (exp.phase === 'watch') {
        const counts = await readCounts(cfg, pipeline, exp.id, ['W'])
        const w = decideWatch(exp, counts.W, now, settings)
        const lo = exp.baseline && exp.baseline.lo != null ? (exp.baseline.lo * 100).toFixed(1) + '%' : '—'
        const reason = `採用後の率 ${pctTxt(w.w)} が、採用前の元の文章の幅（下限 ${lo}）を下回りました。`
        if (w.action === 'revert') {
          const r = await revertExperiment(ctx, exp.id, { by: 'auto', reason })
          out.steps.push({ step: 'revert', id: exp.id, ok: r.ok, message: r.message || '' })
        } else if (w.action === 'suggest_revert' && !exp.fell) {
          await saveExp(cfg, pipeline, { ...exp, fell: new Date(now).toISOString() })
          await addLog(cfg, pipeline, { kind: 'warn', by: 'auto', title: `採用した案で数字が下がっています（戻すかは手で）：${exp.label}`, key: exp.key, evidence: [reason], undo: { type: 'revert', id: exp.id } }, now)
          out.steps.push({ step: 'suggest_revert', id: exp.id, ok: true })
        } else if (w.action === 'finish') {
          await saveExp(cfg, pipeline, { ...exp, phase: 'adopted', watchedUntil: new Date(now).toISOString(), watch: w.w })
          await publishLive(cfg, pipeline, (await readExps(cfg, pipeline)), settings)
          await addLog(cfg, pipeline, { kind: 'watched', by: 'auto', title: `見張りを終えました（そのまま採用）：${exp.label}`, key: exp.key, evidence: [w.thin ? '見張りの間の人数が少なく、下がったかどうかは判断できませんでした。' : `採用後の率 ${pctTxt(w.w)}。下がってはいません。`], undo: { type: 'revert', id: exp.id } }, now)
          out.steps.push({ step: 'watched', id: exp.id, ok: true })
        }
      }
    } catch (e) {
      out.steps.push({ step: 'experiment', id: exp.id, ok: false, message: String((e && e.message) || e).slice(0, 120) })
    }
  }

  // 3. 提案。
  if (left() > 2500) {
    try {
      const [overrides, rules] = await Promise.all([readOverrides(req), import('./_booking.js').then((b) => b.readRules(cfg, pipeline)).catch(() => null)])
      const live = await pipeline(cfg, [['GET', AK.live]]).then(([raw]) => JSON.parse(raw || '{}')).catch(() => ({}))
      const texts = currentTexts(overrides, rules ? { wording: rules.wording, online: rules.online, services: rules.services } : null, live.pins)
      const before = await readProps(cfg, pipeline)
      const merged = mergeProposals(before, rulesFor(snap, texts), now)
      // 下書き（AI）。キーが無い・上限を超えた・時間が無いときは作りません。
      if (allowed(settings, 'drafts') && left() > 9000 && Object.values(merged).some(needsDraft)) {
        const key = await setting('ANTHROPIC_API_KEY', '', req)
        const w = await (ai || writeDrafts)(Object.values(merged), {
          key, monthlyYen: settings.monthlyYen,
          guard: async () => { const { spendGuard } = await import('./_admin-auth.js'); return spendGuard('auto', DAILY_CALLS) },
        })
        for (const [id, d] of Object.entries(w.drafts || {})) if (merged[id]) merged[id] = { ...merged[id], draft: d }
        out.steps.push({ step: 'drafts', ok: w.ok, count: Object.keys(w.drafts || {}).length, message: w.reason || '' })
      }
      // SNS の下書きを承認待ちへ（設定で許したときだけ。投稿はしません）。
      if (allowed(settings, 'snsToQueue')) {
        for (const p of Object.values(merged)) {
          if (p.kind !== 'sns' || p.status !== 'open' || !p.draft || p.draft.queued || left() < 2000) continue
          const q = await queueSns(req, p).catch(() => ({ ok: false }))
          if (q.ok) {
            merged[p.id] = { ...p, draft: { ...p.draft, queued: true } }
            await addLog(cfg, pipeline, { kind: 'sns', by: 'auto', title: 'SNSの下書きを承認待ちに入れました（投稿はしていません）', after: p.draft.text, evidence: p.evidence.map((e) => e.text) }, now)
          }
        }
      }
      await writeProps(cfg, pipeline, merged, before)
      out.steps.push({ step: 'proposals', ok: true, open: Object.values(merged).filter((p) => p.status === 'open').length })

      // 4. 自動で実験を始める（設定で許したとき・低リスクの文章だけ・1つずつ）。
      if (allowed(settings, 'autoStart') && left() > 2000) {
        const running = await readExps(cfg, pipeline)
        for (const p of Object.values(merged)) {
          if (p.status !== 'open' || p.kind !== 'experiment') continue
          if (canAutoStart(p, running, settings)) continue
          const r = await startExperiment(ctx, { key: p.action.key, a: p.action.a, b: p.draft.text, proposalId: p.id, by: 'auto', evidence: p.evidence.map((e) => e.text) })
          out.steps.push({ step: 'auto_start', id: p.id, ok: r.ok, message: r.message || '' })
          break
        }
      }
    } catch (e) {
      out.steps.push({ step: 'proposals', ok: false, message: String((e && e.message) || e).slice(0, 120) })
    }
  } else {
    out.steps.push({ step: 'proposals', ok: false, message: '時間が足りないため、提案は明日にします。' })
  }
  return finish(cfg, pipeline, out)
}

/** 下書きだけを作ります（管理画面を開いたとき・毎朝の時間が足りなかったとき）。 */
export async function makeDrafts(ctx) {
  const { cfg, pipeline, req } = ctx
  const settings = await readSettings(cfg, pipeline)
  if (!allowed(settings, 'drafts')) return { ok: false, message: '「提案と下書きを作る」が切れているか、すべて止めています。' }
  const before = await readProps(cfg, pipeline)
  if (!Object.values(before).some(needsDraft)) return { ok: true, count: 0, message: '下書きが要る提案はありません。' }
  const key = await setting('ANTHROPIC_API_KEY', '', req)
  const { spendGuard } = await import('./_admin-auth.js')
  const w = await writeDrafts(Object.values(before), { key, monthlyYen: settings.monthlyYen, guard: () => spendGuard('auto', DAILY_CALLS) })
  const merged = { ...before }
  for (const [id, d] of Object.entries(w.drafts || {})) if (merged[id]) merged[id] = { ...merged[id], draft: d }
  await writeProps(cfg, pipeline, merged, before)
  return { ok: w.ok, count: Object.keys(w.drafts || {}).length, message: w.reason || `${Object.keys(w.drafts || {}).length}件の下書きを作りました。` }
}

/* ---------------- 週次メールの一節 ---------------- */

export async function weeklyAuto(cfg, pipeline, now = Date.now()) {
  const [settings, props, exps, log] = await Promise.all([
    readSettings(cfg, pipeline), readProps(cfg, pipeline), readExps(cfg, pipeline), import('./_auto-store.js').then((s) => s.readLog(cfg, pipeline, 100)),
  ])
  const since = now - 7 * 86400000
  const running = []
  for (const e of exps) {
    if (e.phase === 'running') running.push({ label: e.label, text: evaluate(e, await readCounts(cfg, pipeline, e.id), now).text })
    else if (e.phase === 'watch') running.push({ label: e.label, text: `採用後の見張り中（${Math.max(0, Math.floor((now - Date.parse(e.adoptedAt)) / 86400000))}日目／${MIN.watchDays}日）` })
  }
  return {
    paused: settings.paused,
    on: Object.keys(SWITCH_LABELS).filter((k) => allowed(settings, k)).map((k) => SWITCH_LABELS[k]),
    running,
    done: log.filter((e) => Date.parse(e.at) >= since && !['kill', 'resume'].includes(e.kind)).slice(0, 6).map((e) => ({ title: e.title, by: e.by })),
    open: Object.values(props).filter((p) => p.status === 'open').map((p) => p.title),
  }
}

export function weeklyAutoLines(w) {
  const lines = ['■ 今週の自動改善']
  if (!w) return lines.concat(['まだ動いていません。'])
  lines.push(w.paused ? '・いまは「すべて止める」中です（観測だけしています）。' : `・自動でしてよいこと: ${w.on.length ? w.on.join('、') : 'なし'}`)
  if (w.running.length) w.running.forEach((r) => lines.push(`・実験「${r.label}」: ${r.text}`))
  else lines.push('・動いている実験はありません。')
  if (w.done.length) {
    lines.push('・この1週間にしたこと:')
    w.done.forEach((d) => lines.push(`　- ${d.title}（${d.by === 'auto' ? '自動' : '手動'}）`))
  }
  lines.push(w.open.length ? `・まだ見ていない提案: ${w.open.length}件（例: ${w.open[0]}）` : '・まだ見ていない提案はありません。')
  lines.push('　自動でしたことは、管理画面の「自動改善」からいつでも元に戻せます。')
  return lines
}

async function finish(cfg, pipeline, out) {
  try { await pipeline(cfg, [['SET', AK.last, JSON.stringify(out), 'EX', 30 * 86400]]) } catch (_) {}
  return out
}
