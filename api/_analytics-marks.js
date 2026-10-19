// アクセス解析のグラフに付ける「出来事の印」。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// 数字が動いた日に何をしたかが分からないと、増えた理由も減った理由も
// 推測になります。管理画面でしたこと（文章の保存・お知らせ・SNSの投稿・
// AIO計測）は記録が別々の場所に残っているので、それを日ごとに集めて
// グラフの下に並べます。チラシを配った・電話で取材を受けた、のような
// 画面の外の出来事は、自分でメモとして足せます（保存先に残ります）。
//
// ここにあるのは「集めたものを日ごとに並べる」と「メモの検査」だけで、
// 読み書きは api/analytics.js がします（テストで中身を確かめるため）。

export const MAX_NOTES = 200
export const NOTE_MAX = 80

/** 種類と、画面での呼び名。 */
export const MARK_KINDS = {
  note: 'メモ',
  copy: '文章を保存',
  news: 'お知らせ',
  sns: 'SNSに投稿',
  aio: 'AIO計測',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (d) => DATE_RE.test(String(d || '')) && !Number.isNaN(Date.parse(String(d) + 'T00:00:00Z')) &&
  new Date(String(d) + 'T00:00:00Z').toISOString().slice(0, 10) === d

/** 時刻（ISO）→ 日本時間の日付。 */
export const jstDay = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isNaN(t) ? '' : new Date(t + 9 * 3600000).toISOString().slice(0, 10)
}

const short = (t, n) => {
  const s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** メモの検査。日付は暦にある日、本文は1〜80字（改行や制御文字は空白に）。 */
export function cleanNote(input, now = Date.now()) {
  const date = String((input && input.date) || '').trim()
  const text = String((input && input.text) || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!validDate(date)) return { ok: false, message: '日付が正しくありません。' }
  // 先の日付も書けます（予定のメモ）。ただし1年先まで。
  if (date > jstDay(new Date(now + 366 * 86400000).toISOString())) return { ok: false, message: '1年より先の日付には付けられません。' }
  if (!text) return { ok: false, message: 'メモの文を書いてください。' }
  if (text.length > NOTE_MAX) return { ok: false, message: `メモは${NOTE_MAX}字までです（いま${text.length}字）。` }
  return { ok: true, note: { id: 'n' + now.toString(36) + Math.random().toString(36).slice(2, 6), date, text, at: new Date(now).toISOString() } }
}

/** メモの一覧を、保存できる形に（壊れたものを落とし、新しい日付から最大200件）。 */
export function tidyNotes(list) {
  return (Array.isArray(list) ? list : [])
    .filter((n) => n && typeof n.id === 'string' && validDate(n.date) && typeof n.text === 'string' && n.text)
    .sort((a, b) => (a.date === b.date ? (a.at < b.at ? 1 : -1) : a.date < b.date ? 1 : -1))
    .slice(0, MAX_NOTES)
}

/** 集めたものを、期間の中の日ごとにまとめます。
 *  同じ日の同じ種類（メモ以外）は1行にまとめて「3件」と数えます——
 *  1日に5回保存した日にグラフの下が5行になると、ほかの日が読めません。
 *    notes: [{id, date, text}]
 *    saves: [{at, message}]        文章の保存（GitHub の記録）
 *    news:  [{date, title}]        公開中のお知らせ
 *    posts: [{at, text, results}]  SNS の投稿（送れたものだけ数えます）
 *    runs:  [{id, at?}]            AIO計測（id の先頭が日付） */
export function buildMarks({ notes, saves, news, posts, runs } = {}, from, to) {
  const days = new Map()
  const inRange = (d) => d && d >= from && d <= to
  const add = (date, item) => {
    if (!inRange(date)) return
    if (!days.has(date)) days.set(date, [])
    days.get(date).push(item)
  }
  for (const n of tidyNotes(notes)) add(n.date, { kind: 'note', id: n.id, label: n.text })

  const group = (kind, date, label, nets) => {
    if (!inRange(date)) return
    const list = days.get(date) || []
    const same = list.find((x) => x.kind === kind)
    if (same) {
      same.count = (same.count || 1) + 1
      if (nets) same.nets = [...new Set([...(same.nets || []), ...nets])]
      return
    }
    add(date, nets ? { kind, label, count: 1, nets } : { kind, label, count: 1 })
  }
  for (const s of Array.isArray(saves) ? saves : []) {
    const reverted = /の時点に戻す/.test(String(s && s.message))
    group('copy', jstDay(s && s.at), reverted ? '文章を前の時点に戻した' : '文章を保存')
  }
  for (const n of Array.isArray(news) ? news : []) {
    if (!n || !validDate(n.date)) continue
    // お知らせは題名がそのまま手がかりになるので、まとめずに1件ずつ。
    add(n.date, { kind: 'news', label: short(n.title || 'お知らせ', 40) })
  }
  for (const p of Array.isArray(posts) ? posts : []) {
    const ok = ((p && p.results) || []).filter((r) => r && r.ok).map((r) => String(r.net || ''))
    if (!ok.length) continue
    group('sns', jstDay(p.at), short(p.text || 'SNSに投稿', 30), ok.filter(Boolean))
  }
  for (const r of Array.isArray(runs) ? runs : []) {
    const date = (r && r.at && jstDay(r.at)) || (/^(\d{4}-\d{2}-\d{2})-/.exec(String((r && r.id) || '')) || [])[1]
    group('aio', date, 'AIO出現率を計測')
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, items]) => ({ date, items }))
}
