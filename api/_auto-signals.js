// 自動改善の「観測」。各ツールが測っている最新の数字を、1日1枚の
// スナップショットにまとめます。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// 方針
//   ・読むだけです。どのツールの設定も記録も書き換えません。
//   ・1つの読み取りが失敗しても、残りは集めます。失敗したもの・まだ
//     使っていないものは「無い」とはっきり書き（sources に none / error）、
//     0 と区別します。「まだ誰も来ていない」と「数えていない」は別の答えです。
//   ・率には必ず「何人のうち何人か」と、ありうる幅（95%）を添えます。
//     件数が少ないものには「参考程度」「判断できません」を付けます。
//   ・1日1枚を `${KV}auto:snap:<日付>` に400日置きます。前の週・前の月と
//     比べられるようにするためです。
//
// 安く済ませるために
//   ・SEO点検はここで走らせません（1回20秒かかります）。管理画面で点検した
//     ときの結果の要約（site-audit.js が `${KV}auto:audit` に置く）を読みます。
//   ・AIO（AIでの見え方）も同じで、最後に測った回の要約を読むだけです。
//     AIへの問い合わせは1回もしません。

import { KV } from './_brand.js'
import { wilson, compareRates } from './_aio-stats.js'

export const SNAP_TTL = 400 * 24 * 3600
export const snapKey = (date) => `${KV}auto:snap:${date}`
export const AUDIT_KEY = `${KV}auto:audit`
/** 点検の結果がこれより古ければ「古い」と書きます。 */
export const AUDIT_STALE_DAYS = 30

/* ---------------- 数え方（どのツールからでも同じ言い方に） ---------------- */

/** k / n を、幅と信頼の目安つきで。n が 0 なら率は出しません。 */
export function rateOf(k, n) {
  k = Math.max(0, Math.floor(Number(k) || 0))
  n = Math.max(0, Math.floor(Number(n) || 0))
  if (k > n) k = n
  if (!n) return { k, n, p: null, lo: null, hi: null, label: '判断できません' }
  const { lo, hi } = wilson(k, n)
  return { k, n, p: k / n, lo, hi, label: sampleLabel(n, k) }
}

/** 件数から、その率をどこまで信じてよいか。
 *  30件未満は「判断できません」、100件未満か成果が5件未満は「参考程度」。 */
export function sampleLabel(n, k) {
  if (!(n >= 30)) return '判断できません'
  if (n < 100 || (k != null && k < 5)) return '参考程度'
  return ''
}

/** 2つの期間の率が、誤差を超えて違うか（2つの割合の差の検定、95%）。 */
export function changeOf(prev, cur) {
  if (!prev || !cur || !prev.n || !cur.n) return { change: 'na', diff: 0, z: 0 }
  const r = compareRates(prev, cur)
  return { change: r.change, diff: r.diff, z: Math.round(r.z * 100) / 100 }
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/* ---------------- 各ツールの数字を、同じ形にする（純粋な関数） ---------------- */

/** アクセス解析（buildReport の答え）。cur は直近30日、prev はその前の30日。 */
export function analyticsPart(cur, prev) {
  if (!cur || !cur.funnel) return null
  const f = cur.funnel
  const arrivals = num(f.arrivals)
  const main = (f.main || []).map((s) => ({ key: s.key, label: s.label, people: num(s.people), rate: arrivals ? num(s.people) / arrivals : null, drop: s.drop == null ? null : s.drop }))
  // いちばん人が減っている段。前の段が10人未満のところは、たまたまの
  // 減り方と区別できないので選びません。
  let drop = null
  main.forEach((s, i) => {
    const before = i === 0 ? arrivals : main[i - 1].people
    if (before < 10 || s.drop == null) return
    if (!drop || s.drop > drop.drop) drop = { key: s.key, label: s.label, from: i === 0 ? '訪問' : main[i - 1].label, before, after: s.people, drop: s.drop }
  })
  const people = (rep, key) => { const s = ((rep && rep.funnel && rep.funnel.main) || []).find((x) => x.key === key); return s ? num(s.people) : 0 }
  // 問い合わせ画面まで来た人のうち、送信した人。
  const formCur = rateOf(people(cur, 'contact_submit'), people(cur, 'contact_view'))
  const formPrev = prev ? rateOf(people(prev, 'contact_submit'), people(prev, 'contact_view')) : null
  const exits = (cur.exits || []).filter((e) => num(e.opened) >= 20).slice(0, 5)
    .map((e) => ({ path: e.name, exits: num(e.exits), opened: num(e.opened), rate: e.rate }))
  const lowRead = (cur.readByPath || []).filter((r) => num(r.opened) >= 30)
    .sort((a, b) => a.rate - b.rate).slice(0, 3)
    .map((r) => ({ path: r.name, opened: num(r.opened), ended: num(r.ended), rate: r.rate }))
  const aiKind = (cur.referrerKinds || []).find((k) => k.key === 'ai')
  const aiPrevKind = prev && (prev.referrerKinds || []).find((k) => k.key === 'ai')
  return {
    days: (cur.range && cur.range.days) || 30,
    visits: num(cur.summary && cur.summary.cur && cur.summary.cur.visits),
    prevVisits: prev ? num(prev.summary && prev.summary.cur && prev.summary.cur.visits) : null,
    arrivals,
    funnel: main,
    drop,
    form: { cur: formCur, prev: formPrev, ...changeOf(formPrev, formCur) },
    exits,
    lowRead,
    ai: {
      visits: aiKind ? num(aiKind.count) : 0,
      prevVisits: aiPrevKind ? num(aiPrevKind.count) : null,
      sources: (cur.aiSources || []).slice(0, 5).map((s) => ({ name: s.name, count: num(s.count) })),
    },
  }
}

/** SEO点検の要約（site-audit.js が保存したもの）。 */
export function seoPart(saved, now = Date.now()) {
  if (!saved || !saved.counts) return null
  const ageDays = saved.at ? Math.floor((now - Date.parse(saved.at)) / 86400000) : null
  return {
    at: saved.at || null,
    ageDays,
    stale: ageDays == null || ageDays > AUDIT_STALE_DAYS,
    must: num(saved.counts.must),
    should: num(saved.counts.should),
    items: (saved.items || []).slice(0, 8),
  }
}

/** 点検の結果（auditSite の findings）を、保存用に小さくします。 */
export function auditSummary(run, checks, now = Date.now()) {
  const by = new Map()
  for (const f of (run && run.findings) || []) {
    const row = by.get(f.check) || { check: f.check, level: f.level, problem: (checks[f.check] || {}).bad || f.check, fix: (checks[f.check] || {}).fix || '', pages: [] }
    if (f.page && row.pages.length < 3) row.pages.push(String(f.page).slice(0, 120))
    row.count = (row.count || 0) + 1
    by.set(f.check, row)
  }
  const items = [...by.values()].sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === 'must' ? -1 : 1)).slice(0, 10)
  return { at: new Date(now).toISOString(), counts: { must: num(run && run.counts && run.counts.must), should: num(run && run.counts && run.counts.should) }, items }
}

/** AIO の最後の回（aio.js の run）。 */
export function aioPart(run) {
  if (!run || !run.summary) return null
  const s = run.summary
  const pick = (x) => (x && x.n ? rateOf(x.k, x.n) : null)
  const st = s.stats || {}
  return {
    at: run.finishedAt || run.createdAt || run.at || null,
    asked: num(s.asked),
    mention: pick(st.mention),
    recommend: pick(st.recommend),
    cite: pick(st.cite),
    missing: (s.missingEvidence || []).slice(0, 5),
  }
}

/** SNS（文章）。posts は compactPost の形（outcome つき）、items は itemsOf の形。 */
export function snsPart({ posts, plan, cadenceRows, weekLeft, nets, today }) {
  if (!posts) return null
  const from = addDays(today, -90)
  const recent = posts.filter((p) => p && p.at && String(p.at).slice(0, 10) >= from)
  const names = {}
  for (const p of (plan && plan.pillars) || []) names[p.id] = p.name
  const by = new Map()
  for (const p of recent) {
    if (!p.outcome) continue
    const id = p.pillar || ''
    const row = by.get(id) || { id, name: id ? names[id] || id : '（柱なし）', posts: 0, visits: 0, inquiries: 0 }
    row.posts++
    row.visits += num(p.outcome.visits)
    row.inquiries += num(p.outcome.inquiries)
    by.set(id, row)
  }
  const pillars = [...by.values()].map((r) => ({
    ...r,
    perPost: { visits: r.posts ? r.visits / r.posts : 0, inquiries: r.posts ? r.inquiries / r.posts : 0 },
    // 投稿の本数で信頼を決めます（_social-plan-core.js の reliability と同じ線）。
    label: r.posts < 3 ? '判断できません' : r.posts < 6 ? '参考程度' : '',
  })).sort((a, b) => b.inquiries - a.inquiries || b.visits - a.visits)
  const netRows = Object.entries(nets || {}).map(([net, v]) => ({ net, posts: num(v.posts), visits: num(v.visits), inquiries: num(v.inquiries) }))
  return {
    days: 90,
    posts: recent.length,
    measured: recent.filter((p) => p.outcome).length,
    pillars,
    nets: netRows,
    cadence: { weekLeft: num(weekLeft), rows: (cadenceRows || []).map((r) => ({ net: r.net, per: r.per, n: r.n, left: r.left })) },
  }
}

/** 問い合わせ（_inquiries.js の metrics）。 */
export function inquiriesPart(m, settings) {
  if (!m) return null
  return {
    median30: m.median30 == null ? null : num(m.median30),
    replied30: num(m.replied30),
    open30: num(m.open30),
    late: num(m.late),
    warn: num(m.warn),
    promised: num(m.promised) || 48,
    autoReply: !!(settings && settings.autoReply && settings.autoReply.on),
    label: num(m.replied30) < 5 ? '参考程度' : '',
  }
}

/** 予約（_booking.js の rates）。 */
export function bookingPart(r) {
  if (!r || !r.all) return r && r.all === 0 ? { all: 0, cancel: null, noshow: null } : null
  const marked = num(r.visited) + num(r.noshow)
  return {
    all: num(r.all),
    cancel: rateOf(r.cancelled, r.all),
    noshow: marked ? rateOf(r.noshow, marked) : null,
  }
}

/** 会員（_members.js の growth）。 */
export function membersPart(g) {
  if (!g) return null
  const s = g.series || []
  return {
    total: num(g.total),
    subscribed: num(g.subscribed),
    unsubscribed: num(g.unsubscribed),
    thisMonth: num(g.thisMonth),
    lastMonth: s.length > 1 ? num(s[s.length - 2].added) : null,
  }
}

function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/* ---------------- まとめる ---------------- */

export const SOURCES = ['analytics', 'seo', 'aio', 'sns', 'inquiries', 'booking', 'members']

/** parts: { name: { status: 'ok'|'none'|'error', data } } → 1枚のスナップショット。
 *  足りないものがあっても、必ず同じ形で返します。 */
export function buildSnapshot(parts, date, now = Date.now()) {
  const snap = { date, at: new Date(now).toISOString(), sources: {} }
  for (const name of SOURCES) {
    const p = parts && parts[name]
    const ok = p && p.status === 'ok' && p.data != null
    snap.sources[name] = ok ? 'ok' : (p && p.status === 'error') ? 'error' : 'none'
    snap[name] = ok ? p.data : null
  }
  return snap
}

/** 1つの読み取りを、時間切れと失敗から守ります。 */
export async function safely(fn, ms = 6000) {
  let timer
  try {
    const out = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('timeout')), ms) }),
    ])
    return out == null ? { status: 'none', data: null } : { status: 'ok', data: out }
  } catch (e) {
    return { status: 'error', data: null, message: String((e && e.message) || e).slice(0, 120) }
  } finally {
    clearTimeout(timer)
  }
}

/** 実際に読む。readers は { name: async () => data|null }。テストでは差し替えます。 */
export async function gatherSignals(readers, date, { timeoutMs = 6000, now = Date.now() } = {}) {
  const names = SOURCES.filter((n) => readers && typeof readers[n] === 'function')
  const got = await Promise.all(names.map((n) => safely(readers[n], timeoutMs)))
  const parts = {}
  names.forEach((n, i) => { parts[n] = got[i] })
  return buildSnapshot(parts, date, now)
}

/** 本番の読み取り。どれも読むだけです。動的 import にしてあるのは、
 *  1つのモジュールが読み込めなくても、ほかの観測を止めないためです。 */
export function defaultReaders(cfg, pipeline, req) {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const getJson = async (key) => {
    const [raw] = await pipeline(cfg, [['GET', key]])
    if (!raw) return null
    try { return JSON.parse(raw) } catch (_) { return null }
  }
  return {
    analytics: async () => {
      const { buildReport } = await import('./_analytics-report.js')
      const [cur, prev] = await Promise.all([buildReport(cfg, { days: 30 }), buildReport(cfg, { days: 30, endOffset: 30 })])
      return analyticsPart(cur, prev)
    },
    seo: async () => seoPart(await getJson(AUDIT_KEY)),
    aio: async () => {
      const [ids] = await pipeline(cfg, [['LRANGE', `${KV}aio:index`, 0, 4]])
      if (!Array.isArray(ids) || !ids.length) return null
      const raws = await pipeline(cfg, ids.map((id) => ['GET', `${KV}aio:run:${id}`]))
      for (const raw of raws) {
        try { const r = JSON.parse(raw); if (r && r.summary) return aioPart(r) } catch (_) {}
      }
      return null
    },
    sns: async () => {
      const [{ recentPosts }, { socialInsights }, { readPlan, compactPost, compactQueued }, { listScheduled }, core] = await Promise.all([
        import('./_social.js'), import('./_social-insights.js'), import('./_social-plan.js'), import('./_social-queue.js'), import('./_social-plan-core.js'),
      ])
      const [plan, posts, queue] = await Promise.all([readPlan(req), recentPosts(200, req), listScheduled()])
      if (!posts || !posts.length) return null
      const ins = await socialInsights(posts, req).catch(() => null)
      const compact = posts.map((p) => compactPost(p, ins && ins.results))
      const items = core.itemsOf(compact, queue.map(compactQueued), plan.tags)
      const cad = core.cadence(items, plan.targets, today)
      return snsPart({ posts: compact, plan, cadenceRows: cad.rows, weekLeft: cad.weekLeft, nets: (ins && ins.summary && ins.summary.d30) || {}, today })
    },
    inquiries: async () => {
      const m = await import('./_inquiries.js')
      const [list, settings] = await Promise.all([m.allSummaries(cfg), m.loadSettings(cfg)])
      if (!list) return null
      return inquiriesPart(m.metrics(list), settings)
    },
    booking: async () => {
      const b = await import('./_booking.js')
      const list = await b.recentBookings(cfg, pipeline, 200)
      const since = Date.now() - 90 * 86400000
      return bookingPart(b.rates(list.filter((r) => !r.at || Date.parse(r.at) >= since)))
    },
    members: async () => {
      const [{ setting }, mm] = await Promise.all([import('./_settings.js'), import('./_members.js')])
      const key = await setting('RESEND_API_KEY', '', req)
      if (!key) return null
      const got = await mm.listMembers(key)
      if (!got || !got.members) return null
      return membersPart(mm.growth(got.members, null, null))
    },
  }
}

/** 保存と読み出し。 */
export async function saveSnapshot(cfg, pipeline, snap) {
  await pipeline(cfg, [['SET', snapKey(snap.date), JSON.stringify(snap), 'EX', SNAP_TTL]])
}

export async function readSnapshots(cfg, pipeline, dates) {
  if (!dates.length) return []
  const raws = await pipeline(cfg, dates.map((d) => ['GET', snapKey(d)]))
  return raws.map((r) => { try { return r ? JSON.parse(r) : null } catch (_) { return null } }).filter(Boolean)
}
