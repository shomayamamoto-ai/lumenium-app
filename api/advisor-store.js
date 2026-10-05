export const config = { runtime: 'edge' }

// AIアドバイザーの保存と「実行」ボタンの窓口（管理者のみ）。相談そのもの
// （AIへの問い合わせ）は /api/advisor です。ここは AI を呼びません。
//
//   GET  ?view=state            画面を開いたときにまとめて読むもの
//                               （保存した会話の一覧・ToDo・今月の額と上限・
//                               1回の目安・数字から作った最初の質問・渡している数字）
//   GET  ?view=conv&id=c…       保存した会話を1つ
//   GET  ?view=todos            ToDo だけ（ポータルの「今日やること」が読みます）
//   POST { action: 'conv.delete', id }
//   POST { action: 'todo.add', input: { title, detail, tab } }    ← 「ToDoに入れる」
//   POST { action: 'todo.done' | 'todo.undo' | 'todo.delete', id }
//   POST { action: 'proposal.add', input: { key, b, why } }      ← 「自動改善の提案に入れる」
//
// 「実行」ボタンのうち、ここに来るのは「一覧に1件足す」2つだけです。
// お知らせ・文章・SNS・動画のボタンは、画面の入力欄に入れるだけで、
// サーバーには何も送りません（保存はいつもの画面のいつものボタンで）。

import { requireAdmin, json } from './_admin-auth.js'
import { storeFor, pipeline } from './_analytics-store.js'
import { setting } from './_settings.js'
import { advisorMonth, monthlyCap, ADVISOR_MODELS } from './_ai-pricing.js'
import { checkAction, estimateMessage, CONV_MAX } from './_advisor-core.js'
import { listConvs, readConv, deleteConv, readTodos, addTodoItem, markTodo, deleteTodo } from './_advisor-store.js'
import { loadGrounding, groundingText, starters } from './_advisor-data.js'
import { STATIC_PROMPT_CHARS } from './advisor.js'

const NO_STORE = {
  ok: false, code: 'NO_STORE', stored: false,
  message: '保存先（Upstash Redis）が無いため、会話と ToDo を残せません。「設定状況 › キーの入力」で保存先を入れると使えるようになります。相談はこのままでもできます。',
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'state'
  const cfg = await storeFor(req)

  if (view === 'todos') {
    if (!cfg) return json(NO_STORE, 503)
    return json({ ok: true, todos: await readTodos(cfg, pipeline) })
  }
  if (view === 'conv') {
    if (!cfg) return json(NO_STORE, 503)
    const conv = await readConv(cfg, pipeline, url.searchParams.get('id'))
    return conv ? json({ ok: true, conv }) : json({ ok: false, message: 'その会話は見つかりませんでした（180日たつと消えます）。' }, 404)
  }

  // state
  const [g, convs, todos, month, capRaw] = await Promise.all([
    loadGrounding(cfg, req),
    cfg ? listConvs(cfg, pipeline).catch(() => []) : [],
    cfg ? readTodos(cfg, pipeline).catch(() => []) : [],
    advisorMonth(),
    setting('ADVISOR_MONTHLY_YEN', '', req),
  ])
  const ground = groundingText(g)
  const sys = STATIC_PROMPT_CHARS + ground.text.length
  return json({
    ok: true,
    stored: !!cfg,
    conversations: convs,
    convMax: CONV_MAX,
    todos,
    usage: { month: month.month, yen: month.yen, calls: month.calls, recorded: month.recorded, cap: monthlyCap(capRaw) },
    estimate: {
      deep: estimateMessage(ADVISOR_MODELS.deep, { systemChars: sys, historyChars: 1500 }),
      quick: estimateMessage(ADVISOR_MODELS.quick, { systemChars: sys, historyChars: 1500 }),
    },
    starters: starters(g),
    sources: ground.sources,
  })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  const cfg = await storeFor(req)
  if (!cfg) return json(NO_STORE, 503)
  const action = String((body && body.action) || '')
  const id = String(body.id || '').slice(0, 40)

  switch (action) {
    case 'conv.delete':
      if (!(await deleteConv(cfg, pipeline, id))) return json({ ok: false, message: 'その会話は見つかりませんでした。' }, 400)
      return json({ ok: true, conversations: await listConvs(cfg, pipeline), message: '会話を消しました。' })
    case 'todo.add': {
      const r = await addTodoItem(cfg, pipeline, body.input)
      if (!r.ok) return json({ ok: false, message: r.message }, 400)
      return json({ ok: true, todos: r.list, message: r.dup ? '同じ ToDo がもう入っています。' : 'ToDo に入れました。ポータルの「今日やること」にも出ます。' })
    }
    case 'todo.done':
    case 'todo.undo': {
      const list = await markTodo(cfg, pipeline, id, action === 'todo.done')
      return list ? json({ ok: true, todos: list }) : json({ ok: false, message: 'その ToDo は見つかりませんでした。' }, 400)
    }
    case 'todo.delete': {
      const list = await deleteTodo(cfg, pipeline, id)
      return list ? json({ ok: true, todos: list }) : json({ ok: false, message: 'その ToDo は見つかりませんでした。' }, 400)
    }
    case 'proposal.add': return json(...(await addProposal(cfg, req, body.input)))
  }
  return json({ ok: false, message: 'この操作はできません。' }, 400)
}

/** 自動改善の提案に1件足します。実験は始めません（提案の画面の「実験する」で始まります）。 */
async function addProposal(cfg, req, input) {
  const r = checkAction('experiment', input)
  if (!r.ok) return [{ ok: false, message: r.message }, 400]
  const a = r.action.input
  const [{ readOverrides, currentTexts }, core, store] = await Promise.all([
    import('./_auto-run.js'), import('./_auto-core.js'), import('./_auto-store.js'),
  ])
  const current = currentTexts(await readOverrides(req), null, null)[a.key] || ''
  const problem = core.textProblem(current, a.b)
  if (problem) return [{ ok: false, message: `この案は自動改善の決まりに合いません：${problem}` }, 400]
  const pid = 'adv-' + core.hash32(a.key + '|' + a.b).toString(36)
  const now = new Date().toISOString()
  await store.saveProp(cfg, pipeline, {
    id: pid, rule: 'advisor', area: 'site', kind: 'experiment', risk: '低',
    title: `${a.label}を、AIアドバイザーの案と比べる`,
    evidence: [{ text: a.why || 'AIアドバイザーとの相談から出た案です。', label: '' }],
    effect: '良くなるとは限りません。元の文章と新しい案を半分ずつの人に見せて比べ、はっきり良い方だけを残します。差が出なければ元のままです。',
    why: a.why, action: { type: 'experiment', key: a.key, a: current, b: '' },
    draft: { by: 'ai', text: a.b, why: a.why }, status: 'open', createdAt: now, updatedAt: now,
  })
  return [{ ok: true, id: pid, message: '「自動改善」の提案に入れました。実験はまだ始まっていません。提案の画面で中身を確かめ、「実験する」を押すと始まります。' }]
}

