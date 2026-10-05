// AIアドバイザーの「計算だけ」の部分。ネットにも保存先にも出ません。
//
//   ・相談に渡す数字（各ツールの数字を、個人の情報を抜いた短い文章に）
//   ・数字から作る「最初に聞くとよい質問」
//   ・AIが出す「実行」ボタンの決まり（形・長さ・行き先の確かめ）
//   ・保存する会話と ToDo の上限
//   ・1回の相談の料金の目安
//
// scripts/test-advisor.mjs が Node で直接読んで確かめます。
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// 個人の情報について
//   お客様の名前・メール・電話・問い合わせの本文は、AIに渡しません。
//   問い合わせは「ジャンルごとの件数」、予約は「件数」、会員は「人数」だけを
//   ここで数え、元の一覧はこのファイルの外に出しません。数え方は
//   ジャンルの決まった選択肢（_form-options.js）に合うものだけを使い、
//   合わない値は「その他」にします（フォームに何を書かれても、名前が
//   ジャンルとして紛れ込まないように）。最後に、渡す文章全体から
//   メールアドレスと電話番号の形をしたものを消します。

import { KV } from './_brand.js'
import { TOPIC_LABELS } from './_form-options.js'
import { EXP_KEYS } from './_auto-core.js'
import { PRICES, YEN_PER_USD, WEB_SEARCH_USD, ADVISOR_MODELS } from './_ai-pricing.js'

const DAY = 86400000
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Math.round(Number(v) * 100) + '%')
const one = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
const jstDay = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10)

/* ---------------- 保存の決まり ---------------- */

export const ADV = {
  index: `${KV}adv:convs`,            // 会話の一覧（新しい順・最大 CONV_MAX 件）
  conv: (id) => `${KV}adv:conv:${id}`, // 会話の中身
  todos: `${KV}adv:todos`,             // ToDo
}
export const CONV_MAX = 20
export const CONV_TTL = 180 * 24 * 3600
export const MSGS_MAX = 40
export const MSG_CHARS = 8000
export const CONV_CHARS = 120000
export const TITLE_MAX = 30
export const TODO_OPEN_MAX = 30
export const TODO_DONE_KEEP = 20
export const ACTIONS_PER_ANSWER = 4
export const CONV_ID_RE = /^c[a-z0-9]{6,24}$/
export const TODO_ID_RE = /^t[a-z0-9]{6,24}$/

export function newId(prefix, now = Date.now()) {
  return prefix + now.toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 会話の題名。最初の質問の頭から。 */
export function titleFor(messages) {
  const first = (messages || []).find((m) => m && m.role === 'user' && String(m.content || '').trim())
  const t = one(first ? first.content : '', 200)
  if (!t) return '（題名なし）'
  return [...t].length > TITLE_MAX ? [...t].slice(0, TITLE_MAX - 1).join('') + '…' : t
}

/** 保存する会話の形にそろえます。長すぎる会話は古い方から落とします。 */
export function cleanMessages(list) {
  let out = (Array.isArray(list) ? list : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => {
      const row = { role: m.role, content: m.content.slice(0, MSG_CHARS) }
      if (m.role === 'assistant' && Array.isArray(m.actions)) {
        const acts = m.actions.map((a) => checkAction(a && a.kind, a && a.input)).filter((r) => r.ok).map((r) => r.action)
        if (acts.length) row.actions = acts.slice(0, ACTIONS_PER_ANSWER)
      }
      if (m.role === 'assistant' && Array.isArray(m.sources)) row.sources = m.sources.map((s) => one(s, 40)).filter(Boolean).slice(0, 8)
      return row
    })
    .slice(-MSGS_MAX)
  // 合計の長さ。古い方から落とし、先頭は質問から始まるようにします。
  while (out.length > 1 && out.reduce((n, m) => n + m.content.length, 0) > CONV_CHARS) out = out.slice(1)
  while (out.length && out[0].role !== 'user') out = out.slice(1)
  return out
}

/** 一覧に1件入れる（または更新する）。新しい順に CONV_MAX 件まで。
 *  → { index, removed: [あふれて消す会話の id] } */
export function upsertIndex(index, meta) {
  const rest = (Array.isArray(index) ? index : []).filter((x) => x && x.id && x.id !== meta.id)
  const all = [meta, ...rest].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return { index: all.slice(0, CONV_MAX), removed: all.slice(CONV_MAX).map((x) => x.id) }
}

export function removeFromIndex(index, id) {
  return (Array.isArray(index) ? index : []).filter((x) => x && x.id !== id)
}

/** ToDo を1件足す。同じ題名のまだのものがあれば足しません。 */
export function addTodo(list, input, now = Date.now()) {
  const r = checkAction('todo', input)
  if (!r.ok) return { ok: false, message: r.message, list }
  const cur = Array.isArray(list) ? list : []
  const a = r.action.input
  if (cur.some((t) => !t.done && t.title === a.title)) return { ok: true, list: cur, dup: true }
  const open = cur.filter((t) => !t.done)
  if (open.length >= TODO_OPEN_MAX) return { ok: false, message: `まだのToDoが${TODO_OPEN_MAX}件あります。済んだものに印を付けるか、消してから足してください。`, list: cur }
  const item = { id: newId('t', now), title: a.title, detail: a.detail, tab: a.tab, at: new Date(now).toISOString(), done: false }
  return { ok: true, list: pruneTodos([item, ...cur]), item }
}

/** 済んだものは新しい方から TODO_DONE_KEEP 件だけ残します。 */
export function pruneTodos(list) {
  const open = list.filter((t) => !t.done)
  const done = list.filter((t) => t.done).sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || ''))).slice(0, TODO_DONE_KEEP)
  return [...open, ...done]
}

export function setTodoDone(list, id, done, now = Date.now()) {
  return pruneTodos((list || []).map((t) => (t.id === id ? { ...t, done: !!done, doneAt: done ? new Date(now).toISOString() : '' } : t)))
}

/* ---------------- 「実行」ボタン ----------------
   AIは道具（tool）としてボタンを出します。どれも押すまで何も起きず、
   押しても「入力欄に入れる」か「一覧に1件足す」だけです。公開・投稿・
   実験の開始は、いつもの画面で、いつものボタンをオーナーが押します。 */

export const TABS = {
  'news-admin': 'お知らせ投稿', 'social-admin': 'SNS（文章）', 'video-admin': 'SNS（動画）', 'copy-admin': '文章編集',
  'auto-admin': '自動改善', 'seo-admin': 'SEO / AIO 分析', 'stats-admin': 'アクセス解析', 'inquiries-admin': '問い合わせ管理',
  'booking-admin': '予約管理', 'list-view': '会員リスト', 'health-admin': '設定状況',
}
export const VIDEO_METRICS = ['views', 'avg_watch_sec', 'retention_rate', 'avp', 'hold_3s', 'engagement_rate', 'save_rate', 'likes', 'saves', 'reach']

/** 文章編集で開ける項目。copyPaths は src/lib/content-registry.js の collectPaths() の path。
 *  渡されなければ「text.」「services.」で始まる形だけを確かめます。 */
let COPY_PATHS = null
export function setCopyPaths(paths) { COPY_PATHS = paths ? new Set(paths) : null }
const copyPathOk = (p) => (COPY_PATHS ? COPY_PATHS.has(p) : /^(text|services|site|faq|articles)\.[\w@.-]{1,80}$/.test(p))

const str = (o, k) => (o && typeof o[k] === 'string' ? o[k].trim() : '')

/* 何が起きるかを、ボタンの下にそのまま書く言葉。 */
export const ACTIONS = {
  news: {
    tool: 'draft_news', button: 'お知らせの入力欄に入れる', where: 'news-admin',
    does: '「お知らせ投稿」を開いて、題名と本文を入力欄に入れます。まだ公開しません。中身を確かめて「投稿する」を押すまで、サイトは変わりません。',
  },
  copy: {
    tool: 'prefill_copy', button: '文章編集で開く', where: 'copy-admin',
    does: '「文章編集」でこの項目を開き、案を入力欄に入れます。まだ保存しません。「変更を保存」を押すまで、サイトは変わりません。',
  },
  sns: {
    tool: 'draft_sns', button: 'SNSの入力欄に入れる', where: 'social-admin',
    does: '「SNS（文章）」を開いて、投稿の入力欄に本文を入れます。まだ投稿しません。出す先を選んで送るまで、どこにも出ません。',
  },
  experiment: {
    tool: 'draft_experiment', button: '自動改善の提案に入れる', where: 'auto-admin',
    does: '「自動改善」の提案の一覧に、この案を1件足します。実験はまだ始まりません。提案の画面で「実験する」を押したときに始まります。',
  },
  pdca: {
    tool: 'draft_video_pdca', button: '動画のPDCAに入れる', where: 'video-admin',
    does: '「SNS（動画）」の PDCA を開いて、仮説の入力欄に入れます。まだ保存しません。「保存」を押すまで残りません。',
  },
  todo: {
    tool: 'add_todo', button: 'ToDoに入れる', where: 'advisor-admin',
    does: 'このアドバイザーの ToDo に1件足します（ポータルの「今日やること」にも出ます）。ほかには何もしません。',
  },
}
export const TOOL_TO_KIND = Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [v.tool, k]))

/** ボタンの中身を確かめて、そろえた形で返します。
 *  → { ok: true, action: { kind, input, button, does, where } } か { ok: false, message } */
export function checkAction(kind, input) {
  const spec = ACTIONS[kind]
  if (!spec) return { ok: false, message: 'このボタンの種類はありません。' }
  const i = input && typeof input === 'object' ? input : {}
  const why = one(str(i, 'why'), 200)
  let clean
  const bad = (m) => ({ ok: false, message: m })
  if (kind === 'news') {
    const title = one(str(i, 'title'), 200)
    const body = str(i, 'body').replace(/\r/g, '')
    if (!title) return bad('お知らせの題名が空です。')
    if ([...title].length > 80) return bad('お知らせの題名は80文字までです。')
    if ([...body].length > 600) return bad('お知らせの本文は600文字までです。')
    clean = { title, body, why }
  } else if (kind === 'copy') {
    const path = str(i, 'path')
    const text = str(i, 'text').replace(/\r/g, '')
    if (!copyPathOk(path)) return bad(`「${path.slice(0, 60)}」は文章編集の項目にありません。渡した一覧の path をそのまま使ってください。`)
    if (!text) return bad('入れる文章が空です。')
    if ([...text].length > 1200) return bad('入れる文章は1200文字までです。')
    clean = { path, text, why }
  } else if (kind === 'sns') {
    const text = str(i, 'text').replace(/\r/g, '')
    if (!text) return bad('投稿の本文が空です。')
    if ([...text].length > 1000) return bad('投稿の本文は1000文字までです。')
    clean = { text, why }
  } else if (kind === 'experiment') {
    const key = str(i, 'key')
    const b = one(str(i, 'b'), 400)
    if (!EXP_KEYS[key]) return bad(`「${key.slice(0, 40)}」は実験できる項目ではありません。使えるのは ${Object.keys(EXP_KEYS).join(' / ')} です。`)
    if (!b) return bad('比べる案（B）が空です。')
    if ([...b].length > 200) return bad('比べる案（B）は200文字までです。')
    clean = { key, b, why, label: EXP_KEYS[key].label }
  } else if (kind === 'pdca') {
    const title = one(str(i, 'title'), 200)
    const hypothesis = str(i, 'hypothesis').replace(/\r/g, '').slice(0, 1000)
    const metric = VIDEO_METRICS.includes(str(i, 'metric')) ? str(i, 'metric') : 'views'
    const next = (Array.isArray(i.next_actions) ? i.next_actions : []).map((x) => one(x, 120)).filter(Boolean).slice(0, 5)
    if (!title) return bad('仮説の名前が空です。')
    if (!hypothesis.trim()) return bad('仮説の中身が空です。')
    clean = { title, hypothesis, metric, next_actions: next, why }
  } else if (kind === 'todo') {
    const title = one(str(i, 'title'), 200)
    const detail = str(i, 'detail').replace(/\r/g, '').slice(0, 300)
    const tab = TABS[str(i, 'tab')] ? str(i, 'tab') : ''
    if (!title) return bad('ToDoの題名が空です。')
    if ([...title].length > 60) return bad('ToDoの題名は60文字までです。')
    clean = { title, detail, tab, why }
  }
  return { ok: true, action: { kind, input: clean, button: spec.button, does: spec.does, where: spec.where } }
}

/** AIに渡す道具の定義。中身の確かめは checkAction が受け持ちます。 */
export function actionTools() {
  const s = (description, extra = {}) => ({ type: 'string', description, ...extra })
  const tool = (kind, description, properties, required) => ({
    name: ACTIONS[kind].tool,
    description,
    input_schema: { type: 'object', properties: { ...properties, why: s('このボタンを出す理由を一文で（オーナー向け・平易な日本語）') }, required: [...required, 'why'], additionalProperties: false },
    eager_input_streaming: true,
  })
  return [
    tool('news', 'お知らせ投稿の入力欄に入れる下書きをボタンとして出す。押されても公開はされない。', {
      title: s('題名（80文字まで）'), body: s('本文（600文字まで・記号で飾らない）'),
    }, ['title', 'body']),
    tool('copy', 'サイトの文章の1項目について、書き換え案をボタンとして出す。押すと文章編集でその項目を開いて案を入れるだけで、保存はされない。path は【文章編集で開ける項目】の一覧にあるものだけ。', {
      path: s('項目の path（一覧の左側をそのまま）'), text: s('入れる案の全文'),
    }, ['path', 'text']),
    tool('sns', 'SNS投稿の本文の下書きをボタンとして出す。押すと SNS（文章）の入力欄に入るだけで、投稿はされない。', {
      text: s('投稿の本文（1000文字まで）'),
    }, ['text']),
    tool('experiment', '自動改善で「元の文章（A）と新しい案（B）を半分ずつの人に見せて比べる」ための案をボタンとして出す。押すと提案の一覧に入るだけで、実験は始まらない。金額・連絡先・URL・「必ず」「最安」などは使えない。長さは元の±3割。', {
      key: s('実験できる項目', { enum: Object.keys(EXP_KEYS) }), b: s('比べる案（B）の全文'),
    }, ['key', 'b']),
    tool('pdca', 'ショート動画の PDCA の仮説をボタンとして出す。押すと SNS（動画）の PDCA の入力欄に入るだけで、保存はされない。', {
      title: s('仮説の名前（例：冒頭3秒を問いかけにする）'), hypothesis: s('仮説（なぜそうなると考えるか）'),
      metric: s('確かめる指標', { enum: VIDEO_METRICS }),
      next_actions: { type: 'array', items: { type: 'string' }, description: '次にやること（1つ120文字まで・5つまで）' },
    }, ['title', 'hypothesis', 'metric', 'next_actions']),
    tool('todo', 'オーナーが自分でやること（Googleビジネスプロフィールの更新、外部サイトへの掲載依頼など）を ToDo としてボタンで出す。押すと ToDo に1件足すだけ。', {
      title: s('やること（60文字まで・動詞で終える）'), detail: s('手順や補足（300文字まで）'),
      tab: s('関係する管理画面（無ければ空文字）', { enum: ['', ...Object.keys(TABS)] }),
    }, ['title', 'detail', 'tab']),
  ]
}

/** 前の回答で出したボタンを、AIに読める一文にして本文の後ろに付けます
 *  （次の相談で「さっきの案」と言われたときに分かるように）。 */
export function historyForModel(messages) {
  return (messages || []).map((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.actions) || !m.actions.length) return { role: m.role, content: m.content }
    const lines = m.actions.map((a) => {
      const i = a.input || {}
      const what = i.title || i.label || i.path || String(i.text || i.b || '').slice(0, 40)
      return `・${ACTIONS[a.kind] ? ACTIONS[a.kind].button : a.kind}: ${what}`
    })
    return { role: 'assistant', content: m.content + '\n\n［この回答で出したボタン］\n' + lines.join('\n') }
  })
}

/* ---------------- 個人の情報を抜く ---------------- */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// 日本の電話番号の形（0から始まる10〜11桁、区切りあり／なし、+81）。
const PHONE_RE = /(?:\+81[-\s]?|\b0)\d{1,4}[-\s(（]?\d{1,4}[-\s)）]?\d{3,4}\b/g

export function scrubPII(text) {
  return String(text == null ? '' : text).replace(EMAIL_RE, '［省略］').replace(PHONE_RE, '［省略］')
}
export function hasPII(text) {
  const t = String(text || '')
  return new RegExp(EMAIL_RE.source).test(t) || new RegExp(PHONE_RE.source).test(t)
}

/* ---------------- 各ツールの数字を、件数だけにする ---------------- */

const TOPICS = new Set([...Object.values(TOPIC_LABELS)])

/** 問い合わせの一覧（要約）→ ジャンル別の件数だけ。名前・メール・本文は読みません。 */
export function inquiryCounts(list, days = 30, now = Date.now()) {
  if (!Array.isArray(list)) return null
  const from = now - days * DAY
  const byTopic = {}
  let total = 0, open = 0
  for (const r of list) {
    if (!r || r.spam || !(Date.parse(r.receivedAt) >= from)) continue
    total++
    if (r.status === 'new') open++
    const ts = Array.isArray(r.topics) && r.topics.length ? r.topics : ['（選択なし）']
    for (const t of ts) {
      const k = TOPICS.has(t) ? t : t === '（選択なし）' ? t : 'その他'
      byTopic[k] = (byTopic[k] || 0) + 1
    }
  }
  return { days, total, open, byTopic: Object.entries(byTopic).sort((a, b) => b[1] - a[1]) }
}

/** 予約 → これからの件数だけ。 */
export function bookingCounts(list, now = Date.now()) {
  if (!Array.isArray(list)) return null
  let next7 = 0, next30 = 0
  for (const r of list) {
    if (!r) continue
    const st = r.status || (r.mode === 'google' ? 'confirmed' : 'tentative')
    if (st !== 'confirmed' && st !== 'tentative') continue
    const start = Number(r.start) || Date.parse(r.key)
    if (!(start > now)) continue
    if (start <= now + 7 * DAY) next7++
    if (start <= now + 30 * DAY) next30++
  }
  return { next7, next30 }
}

/** お知らせ（公開中の news.json）→ いつから止まっているか。題名は公開情報です。 */
export function newsInfo(items, now = Date.now()) {
  if (!Array.isArray(items)) return null
  const dated = items.filter((n) => n && n.date && (!n.status || n.status === 'published'))
    .map((n) => ({ date: String(n.date).slice(0, 10), title: one(n.title, 60) }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const last = dated[0]
  const since = last ? Math.max(0, Math.floor((now - Date.parse(last.date + 'T00:00:00+09:00')) / DAY)) : null
  const in90 = dated.filter((n) => Date.parse(n.date + 'T00:00:00+09:00') >= now - 90 * DAY).length
  return { count: dated.length, in90, lastDate: last ? last.date : null, daysSince: since, recent: dated.slice(0, 3).map((n) => `${n.date} ${n.title}`) }
}

/** 自動改善 → まだの提案と、実験中のもの。 */
export function autoInfo(props, exps) {
  if (!props && !exps) return null
  const open = Object.values(props || {}).filter((p) => p && p.status === 'open')
    .map((p) => ({ title: one(p.title, 80), area: p.area || '', evidence: (p.evidence || []).slice(0, 2).map((e) => one(e && e.text, 120)) }))
    .slice(0, 8)
  const running = (Array.isArray(exps) ? exps : Object.values(exps || {})).filter((e) => e && (e.phase === 'running' || e.phase === 'watch'))
    .map((e) => ({ label: (EXP_KEYS[e.key] || {}).label || e.key, phase: e.phase, since: String(e.startedAt || '').slice(0, 10), b: one(e.b, 80) }))
    .slice(0, 5)
  return { open, running }
}

/* ---------------- 相談に渡す文章 ---------------- */

export const SOURCE_LABELS = {
  analytics: 'アクセス解析：過去30日',
  seo: 'SEO点検：最後の点検',
  aio: 'AIでの見え方：最後の計測',
  crawl: 'クローラーの来訪：過去30日',
  sns: 'SNS（文章）：過去90日',
  inquiries: '問い合わせ：過去30日の件数',
  booking: '予約：件数と率',
  members: '会員：人数',
  news: 'お知らせ：公開中のもの',
  auto: '自動改善：提案と実験',
}

const r3 = (r) => (r && r.n ? `${r.k}/${r.n}（${pct(r.p)}、幅 ${pct(r.lo)}〜${pct(r.hi)}）${r.label ? '［' + r.label + '］' : ''}` : 'データなし')

function analyticsLines(a) {
  const out = [`訪問 ${a.visits}回${a.prevVisits != null ? `（その前の30日 ${a.prevVisits}回）` : ''}、延べ訪問者 ${a.arrivals}人`]
  if (a.arrivals < 30) out.push('［訪問者が30人未満のため、率から判断できません。数字の上下は誤差の範囲です］')
  if ((a.funnel || []).length) out.push('問い合わせまでの段（人数・訪問者に対する割合）: ' + a.funnel.map((s) => `${s.label} ${s.people}人（${pct(s.rate)}）`).join(' → '))
  if (a.drop) out.push(`いちばん減る段: 「${a.drop.from}」→「${a.drop.label}」 ${a.drop.before}人→${a.drop.after}人（−${pct(a.drop.drop)}）`)
  if (a.form && a.form.cur) out.push(`問い合わせ画面まで来た人の送信: ${r3(a.form.cur)}` + (a.form.change === 'down' ? '。前の30日より誤差を超えて下がった' : a.form.change === 'up' ? '。前の30日より誤差を超えて上がった' : ''))
  if ((a.exits || []).length) out.push('よく離れるページ: ' + a.exits.map((e) => `${e.path} ${pct(e.rate)}（${e.opened}回中）`).join(' / '))
  if ((a.lowRead || []).length) out.push('最後まで読まれにくいページ: ' + a.lowRead.map((e) => `${e.path} ${pct(e.rate)}（${e.opened}回中）`).join(' / '))
  if (a.ai) out.push(`AI（ChatGPTなど）から来た訪問: ${a.ai.visits}回` + ((a.ai.sources || []).length ? '（' + a.ai.sources.map((s) => `${s.name} ${s.count}`).join('・') + '）' : ''))
  return out
}

function seoLines(s) {
  return [
    `最後の点検 ${String(s.at || '').slice(0, 10) || '不明'}${s.stale ? '（30日より古い。いまの状態とずれている可能性あり）' : ''}: 「必ず直す」${s.must}件・「直すと良い」${s.should}件`,
    ...(s.items || []).slice(0, 6).map((i) => `・${one(i.problem, 80)}（${i.count || 1}件${(i.pages || []).length ? '、例 ' + i.pages.slice(0, 2).join(' ') : ''}）`),
  ]
}

function aioLines(a, detail) {
  const out = [`最後の計測 ${String(a.at || '').slice(0, 10) || '不明'}、判定できた回答 ${a.asked}回`]
  if (a.mention) out.push(`名前が出た: ${r3(a.mention)}`)
  if (a.recommend) out.push(`依頼先の候補に挙がった: ${r3(a.recommend)}`)
  if (a.cite) out.push(`自社サイトが情報源に使われた: ${r3(a.cite)}`)
  if ((a.missing || []).length) out.push('AIが「分からない」と言った情報: ' + a.missing.join('・'))
  if (detail) {
    if ((detail.missed || []).length) out.push('出てこなかった質問（理由）: ' + detail.missed.slice(0, 8).map((m) => `「${one(m.q, 60)}」（${m.why}）`).join(' / '))
    if ((detail.competitors || []).length) out.push('代わりに名前が挙がった会社: ' + detail.competitors.slice(0, 6).map((c) => `${one(c.name, 30)}(${c.count})`).join('、'))
  }
  return out
}

function crawlLines(c) {
  if (c.total === 0) return ['0件。どのクローラーも、ページ・robots.txt・llms.txt を取りに来ていません（＝まだ見つかっていない）。']
  return [
    `合計 ${c.total}回（名乗りによる数）`,
    (c.groups || []).filter((g) => g.hits).map((g) => `${g.label} ${g.hits}回`).join(' / '),
    (c.missing || []).length ? '一度も来ていない主なもの: ' + c.missing.slice(0, 6).map((m) => m.id).join('、') : '',
  ].filter(Boolean)
}

function snsLines(s, activity) {
  const out = [`投稿 ${s.posts}本（数字が取れたもの ${s.measured}本）`]
  if (s.posts < 6) out.push('［投稿が少なく、どの柱が効くかはまだ判断できません］')
  for (const p of (s.pillars || []).slice(0, 4)) out.push(`柱「${one(p.name, 30)}」 ${p.posts}本・サイトへの訪問 ${p.visits}・問い合わせ ${p.inquiries}${p.label ? '［' + p.label + '］' : ''}`)
  if (s.cadence && s.cadence.weekLeft) out.push(`今週の目標まで あと${s.cadence.weekLeft}本`)
  if (activity) out.push(`直近30日に管理画面から出した数: ${activity.posts || 0}回（失敗 ${activity.failed || 0}）。手で投稿した分は入っていません`)
  if (activity && Array.isArray(activity.ready)) out.push('管理画面から投稿できる先: ' + (activity.ready.length ? activity.ready.join('・') : 'なし（どのSNSも鍵が未入力）'))
  return out
}

/** g: { snap, crawl, aioDetail, social, inquiries, news, bookings, auto, pages, copyFields }
 *  → { text, sources: [{ id, label, ok, note }] }
 *  ここに入るのは、すでに件数・率・公開情報にしたものだけです。 */
export function groundingText(g = {}) {
  const snap = g.snap || {}
  const sec = []
  const sources = []
  const put = (id, lines, note = '') => {
    const ok = !!(lines && lines.length)
    sources.push({ id, label: SOURCE_LABELS[id], ok, note: ok ? '' : note })
    sec.push(`［${SOURCE_LABELS[id]}］`)
    sec.push(ok ? lines.join('\n') : `まだありません（${note || '記録なし'}）。この数字に頼った助言はしないこと。`)
    sec.push('')
  }
  put('analytics', snap.analytics ? analyticsLines(snap.analytics) : null, 'アクセス解析の記録がまだありません')
  put('seo', snap.seo ? seoLines(snap.seo) : null, 'SEO点検をまだ実行していません')
  put('aio', snap.aio ? aioLines(snap.aio, g.aioDetail) : null, 'AIでの見え方をまだ計測していません')
  put('crawl', g.crawl ? crawlLines(g.crawl) : null, '保存先が無いため来訪を記録していません')
  put('sns', snap.sns ? snsLines(snap.sns, g.social) : (g.social && g.social.posts ? [`直近30日に管理画面から出した数: ${g.social.posts}回`] : null), 'SNSの投稿記録がありません')
  const q = snap.inquiries, ic = g.inquiries
  put('inquiries', q || ic ? [
    ic ? `件数 ${ic.total}件（まだ返信していないもの ${ic.open}件）` + (ic.total < 5 ? '［少ないため、傾向は判断できません］' : '') : '',
    ic && ic.byTopic.length ? 'ジャンル別: ' + ic.byTopic.map(([k, n]) => `${k} ${n}`).join(' / ') : '',
    q ? `最初の返信までの時間（中央値）: ${q.median30 == null ? '記録なし' : Math.round(q.median30) + '時間'}（約束は${q.promised}時間以内）、期限切れ ${q.late}件、受付確認メール ${q.autoReply ? 'あり' : 'なし'}${q.label ? '［' + q.label + '］' : ''}` : '',
  ].filter(Boolean) : null, '問い合わせの記録がありません')
  const b = snap.booking, bc = g.bookings
  put('booking', b || bc ? [
    bc ? `これからの予約: 7日以内 ${bc.next7}件・30日以内 ${bc.next30}件` : '',
    b && b.all ? `過去90日 ${b.all}件、キャンセル ${r3(b.cancel)}、無断キャンセル ${b.noshow ? r3(b.noshow) : '記録なし'}` : '',
  ].filter(Boolean) : null, '予約の記録がありません')
  const m = snap.members
  put('members', m ? [`登録 ${m.total}人（配信を受ける ${m.subscribed}人・停止 ${m.unsubscribed}人）、今月 ${m.thisMonth}人増${m.lastMonth != null ? `（先月 ${m.lastMonth}人）` : ''}`] : null, '会員の記録を読めません')
  const n = g.news
  put('news', n ? [
    n.lastDate ? `最後のお知らせ ${n.lastDate}（${n.daysSince}日前）、過去90日に ${n.in90}件、全部で ${n.count}件` : 'お知らせはまだ1件もありません',
    ...(n.recent || []).map((r) => '・' + r),
  ] : null, 'お知らせの一覧を読めません')
  const au = g.auto
  put('auto', au && (au.open.length || au.running.length) ? [
    ...au.running.map((e) => `実験中: ${e.label}（${e.since}から、案「${e.b}」）`),
    ...au.open.map((p) => `まだの提案: ${p.title}${p.evidence.length ? '（根拠: ' + p.evidence.join(' ') + '）' : ''}`),
  ] : null, 'まだの提案も実験もありません')

  if (snap.date) sec.unshift(`（各ツールの数字は ${snap.date} 時点のまとめ${snap.fresh ? '（いま集めたもの）' : ''}です）`, '')
  // ここまでが記録から作った部分。念のためメールと電話の形を消します。
  // 下の項目の一覧は、コードとサイトの公開中の文章なので消しません
  // （「services.@web.title」がメールの形に見えて消えてしまうため）。
  const data = scrubPII(sec.join('\n'))
  sec.length = 0

  const copy = (g.copyFields || []).slice(0, 80)
  if (copy.length) {
    sec.push('【文章編集で開ける項目（path = いまの文章の頭）】')
    sec.push(copy.map((f) => `${f.path} = ${one(f.value, 40)}`).join('\n'))
    sec.push('')
  }
  sec.push('【自動改善で実験できる項目（key = 名前）】')
  sec.push(Object.entries(EXP_KEYS).map(([k, v]) => `${k} = ${v.label}`).join('\n'))

  return { text: data + '\n' + sec.join('\n'), sources }
}

/* ---------------- 最初に聞くとよい質問（数字から） ---------------- */

/** → [{ q, why }]（多くて6つ）。数字が少ないときは、そう言う質問を混ぜます。 */
export function starters(g = {}) {
  const snap = g.snap || {}
  const out = []
  const add = (q, why) => { if (out.length < 6 && !out.some((x) => x.q === q)) out.push({ q, why }) }
  const a = snap.analytics
  if (a && a.drop && a.drop.before >= 10) add(`「${a.drop.label}」の手前で人が減る理由は？`, `「${a.drop.from}」→「${a.drop.label}」で ${a.drop.before}人→${a.drop.after}人（${SOURCE_LABELS.analytics}）`)
  if (a && a.form && a.form.change === 'down') add('問い合わせの送信が減ったのはなぜ？', `送信率が前の30日より下がりました（${SOURCE_LABELS.analytics}）`)
  const s = snap.seo
  if (s && s.must > 0) add(`SEO点検の「必ず直す」${s.must}件、どれから？`, `${SOURCE_LABELS.seo}（${String(s.at || '').slice(0, 10)}）`)
  const o = snap.aio
  if (o && o.mention && o.mention.n && o.mention.p < 0.3) add('AIの答えに名前が出ないのはなぜ？', `名前が出たのは ${o.mention.k}/${o.mention.n}回（${SOURCE_LABELS.aio}）`)
  if (g.crawl && g.crawl.total === 0) add('AIや検索に見つけてもらうには？', `クローラーの来訪が0件（${SOURCE_LABELS.crawl}）`)
  const q = snap.inquiries
  if (q && q.late > 0) add(`返信が遅れた問い合わせ${q.late}件、どう防ぐ？`, `期限切れ ${q.late}件（${SOURCE_LABELS.inquiries}）`)
  const n = g.news
  if (n && (n.daysSince == null || n.daysSince > 30)) add(n.daysSince == null ? '最初のお知らせに何を書く？' : `お知らせが${n.daysSince}日止まっています。何を書く？`, SOURCE_LABELS.news)
  const sn = snap.sns
  if (sn && sn.cadence && sn.cadence.weekLeft > 0) add(`今週のSNS、あと${sn.cadence.weekLeft}本は何を出す？`, SOURCE_LABELS.sns)
  const b = snap.booking
  if (b && b.noshow && b.noshow.n >= 5 && b.noshow.p >= 0.1) add('無断キャンセルを減らすには？', `無断キャンセル ${b.noshow.k}/${b.noshow.n}件（${SOURCE_LABELS.booking}）`)
  const au = g.auto
  if (au && au.open.length) add('自動改善の提案、どれからやる？', `まだの提案 ${au.open.length}件（${SOURCE_LABELS.auto}）`)
  if (a && a.arrivals < 30) add('訪問が少ないうちに、まず何をする？', `延べ訪問者 ${a.arrivals}人（${SOURCE_LABELS.analytics}）。率から判断できる量ではありません`)
  if (!out.length) add('いま何がいちばん問題？', 'まだ数字が少ないため、一般的な質問から始めます')
  add('今週やることを3つ、順番に', 'いまの数字をまとめて優先順位をつけます')
  return out
}

/* ---------------- 料金の目安 ---------------- */

/** 日本語は1トークンがおよそ1.2文字。短めに見積もると安く見えるので、多めに数えます。 */
export const tokensOf = (chars) => Math.ceil(Math.max(0, num(chars)) / 1.2)

/** 1回の相談の目安（円）。lo = 前の相談から5分以内（指示文がキャッシュから読まれる）、
 *  hi = 久しぶり（キャッシュに書き込む）＋ウェブ検索2回。
 *  model は ADVISOR_MODELS のどちらか。 */
export function estimateMessage(model, { systemChars = 0, historyChars = 0, outTokens } = {}) {
  const p = PRICES[model]
  if (!p) return null
  const quick = model === ADVISOR_MODELS.quick
  const sys = tokensOf(systemChars) + 3000 // 道具の定義とウェブ検索の説明のぶん
  const hist = tokensOf(historyChars) + 200
  const out = outTokens || (quick ? 1500 : 3000) // 考える分を含めた答えの長さの目安
  const usd = (cw, cr, searches, o) => (cw * p.cacheWrite + cr * p.cacheRead + hist * p.input + o * p.output) / 1e6 + searches * WEB_SEARCH_USD
  const lo = usd(0, sys, 0, Math.round(out * 0.6))
  const hi = usd(sys, 0, quick ? 1 : 2, Math.round(out * 1.5))
  const yen = (v) => Math.max(1, Math.round(v * YEN_PER_USD))
  return { lo: yen(lo), hi: yen(hi) }
}

/** 実際の usage（API の答え）から、その1回の円。 */
export function usageYen(model, usage) {
  const p = PRICES[model]
  if (!p || !usage) return 0
  const n = (k) => num(usage[k])
  const st = usage.server_tool_use || {}
  const usd = (n('input_tokens') * p.input + n('output_tokens') * p.output + n('cache_creation_input_tokens') * p.cacheWrite + n('cache_read_input_tokens') * p.cacheRead) / 1e6 +
    num(st.web_search_requests) * WEB_SEARCH_USD
  return Math.round(usd * YEN_PER_USD * 10) / 10
}

/* ---------------- 答えの最後の2行 ----------------
   答えの最後に、使った数字の名前（SOURCES::）と次に押せる質問（NEXT::）が
   1行ずつ付きます。画面ではどちらも本文から外し、小さな印とボタンに変えます。 */

export function parseTail(text) {
  let body = String(text == null ? '' : text)
  const grab = (tag) => {
    const re = new RegExp('\\n?' + tag + '::([^\\n]*)', 'g')
    const items = []
    body = body.replace(re, (_, list) => { list.split('||').forEach((x) => { const v = one(x, 60); if (v) items.push(v) }); return '' })
    return items
  }
  const next = grab('NEXT').filter((q) => q.length <= 40).slice(0, 4)
  const sources = grab('SOURCES').filter((s) => s.length <= 40).slice(0, 8)
  return { body: body.replace(/\s+$/, ''), next, sources }
}

export { jstDay }
