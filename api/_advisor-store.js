// AIアドバイザーの保存（会話と ToDo）。Upstash Redis の `${KV}adv:*` に置きます。
//
//   adv:convs      会話の一覧（JSON の配列・新しい順・最大20件。題名・日時・件数だけ）
//   adv:conv:<id>  会話の中身（180日で消えます）
//   adv:todos      ToDo（JSON の配列。まだのもの最大30件・済んだもの20件）
//
// 上限と形の決まりは _advisor-core.js（テストはそちらを直接確かめます）。
// cfg と pipeline を外から受け取るのは、テストで差し替えるためです。
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import {
  ADV, CONV_TTL, CONV_ID_RE, TODO_ID_RE, titleFor, cleanMessages, upsertIndex, removeFromIndex,
  addTodo, setTodoDone, newId,
} from './_advisor-core.js'

const parse = (raw, fallback) => { try { const v = raw ? JSON.parse(raw) : fallback; return v == null ? fallback : v } catch (_) { return fallback } }

export async function listConvs(cfg, pipeline) {
  const [raw] = await pipeline(cfg, [['GET', ADV.index]])
  const list = parse(raw, [])
  return Array.isArray(list) ? list : []
}

export async function readConv(cfg, pipeline, id) {
  if (!CONV_ID_RE.test(String(id || ''))) return null
  const [raw] = await pipeline(cfg, [['GET', ADV.conv(id)]])
  return parse(raw, null)
}

/** 会話を保存（新しければ作る）。→ { id, title, updatedAt, count } */
export async function saveConv(cfg, pipeline, { id, messages }, now = Date.now()) {
  const msgs = cleanMessages(messages)
  if (!msgs.length) return null
  const convId = CONV_ID_RE.test(String(id || '')) ? id : newId('c', now)
  const old = await readConv(cfg, pipeline, convId)
  const at = new Date(now).toISOString()
  const conv = { id: convId, title: (old && old.title) || titleFor(msgs), createdAt: (old && old.createdAt) || at, updatedAt: at, messages: msgs }
  const meta = { id: convId, title: conv.title, updatedAt: at, count: msgs.length }
  const { index, removed } = upsertIndex(await listConvs(cfg, pipeline), meta)
  const cmds = [
    ['SET', ADV.conv(convId), JSON.stringify(conv), 'EX', CONV_TTL],
    ['SET', ADV.index, JSON.stringify(index)],
    ...removed.map((r) => ['DEL', ADV.conv(r)]),
  ]
  await pipeline(cfg, cmds)
  return meta
}

export async function deleteConv(cfg, pipeline, id) {
  if (!CONV_ID_RE.test(String(id || ''))) return false
  const index = removeFromIndex(await listConvs(cfg, pipeline), id)
  await pipeline(cfg, [['DEL', ADV.conv(id)], ['SET', ADV.index, JSON.stringify(index)]])
  return true
}

export async function readTodos(cfg, pipeline) {
  const [raw] = await pipeline(cfg, [['GET', ADV.todos]])
  const list = parse(raw, [])
  return Array.isArray(list) ? list : []
}

export async function addTodoItem(cfg, pipeline, input, now = Date.now()) {
  const r = addTodo(await readTodos(cfg, pipeline), input, now)
  if (r.ok && !r.dup) await pipeline(cfg, [['SET', ADV.todos, JSON.stringify(r.list)]])
  return r
}

export async function markTodo(cfg, pipeline, id, done, now = Date.now()) {
  if (!TODO_ID_RE.test(String(id || ''))) return null
  const list = setTodoDone(await readTodos(cfg, pipeline), id, done, now)
  await pipeline(cfg, [['SET', ADV.todos, JSON.stringify(list)]])
  return list
}

export async function deleteTodo(cfg, pipeline, id) {
  if (!TODO_ID_RE.test(String(id || ''))) return null
  const list = (await readTodos(cfg, pipeline)).filter((t) => t.id !== id)
  await pipeline(cfg, [['SET', ADV.todos, JSON.stringify(list)]])
  return list
}
