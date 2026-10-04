// SNS（動画）のデータの置き場所（Upstash Redis）と、入ってくる値の検査。
//
// 置き方。プロジェクトごとに4つのハッシュ（競合の投稿・台本・投稿・PDCA）を
// 持ちます。1件＝1つの JSON。全部を1つの大きな JSON にすると、2つの画面で
// 同時に直したとき後から保存したほうが前の変更を丸ごと消すので、1件ずつ
// 書けるようにしています。
//
//   ${KV}video:projects               プロジェクト（ブランド設定を含む）
//   ${KV}video:p:<id>:posts|scripts|pubs|pdca
//   ${KV}video:accounts               連携アカウントの控え（トークンは持たない）
//   ${KV}video:queue                  予約（Instagram）
//   ${KV}video:processing             Instagram の「準備中」の投稿
//   ${KV}video:sent:<platform>        24時間の投稿数（自前の安全弁）
//
// 件数と長さには上限があります。画面の不具合や悪意のあるリクエストで、
// 保存先（無料枠は容量が小さい）を埋め尽くさないためです。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeFor, storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { HOOK_TYPES, RULES, PLATFORMS, MARKS, FORMAT_KEYS } from './_video-core.js'

export const VK = {
  projects: `${KV}video:projects`,
  items: (pid, kind) => `${KV}video:p:${pid}:${kind}`,
  accounts: `${KV}video:accounts`,
  queue: `${KV}video:queue`,
  processing: `${KV}video:processing`,
  sent: (net) => `${KV}video:sent:${net}`,
}

export const KINDS = ['posts', 'scripts', 'pubs', 'pdca']
export const CAPS = { projects: 20, posts: 300, scripts: 100, pubs: 300, pdca: 50, accounts: 20 }
export const KIND_LABEL = { posts: '競合の投稿', scripts: '台本', pubs: '投稿', pdca: 'PDCA' }

export const NO_STORE = {
  ok: false, code: 'NO_STORE',
  message: '保存先（Upstash Redis）が未接続です。「設定状況 › キーの入力」で保存先のURLとトークンを入れると、プロジェクトや台本を保存できるようになります（出荷前チェックと無音カットは保存先なしで使えます）。',
}

/* ---------------- 値の検査 ---------------- */

export const str = (v, n) => (v == null ? '' : String(v)).replace(/\u0000/g, '').slice(0, n || 500)
export const num = (v, lo, hi) => {
  if (v == null || v === '' || !isFinite(Number(v))) return null
  let x = Number(v)
  if (lo != null && x < lo) x = lo
  if (hi != null && x > hi) x = hi
  return x
}
const iso = (v) => {
  const s = str(v, 40)
  return s && !isNaN(Date.parse(s)) ? new Date(Date.parse(s)).toISOString() : ''
}
const list = (v, n, each) => (Array.isArray(v) ? v.slice(0, n).map(each) : [])
const words = (v, n, len) => list(v, n, (w) => str(w, len).trim()).filter(Boolean)
const idOk = (v) => /^[A-Za-z0-9_-]{1,64}$/.test(String(v || ''))

export function newId(prefix) {
  const b = crypto.getRandomValues(new Uint8Array(8))
  return `${prefix}-${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

export function validId(v) { return idOk(v) }

const NET = (v) => (PLATFORMS[v] ? v : 'instagram')

export function cleanProject(p) {
  const b = (p && p.brand) || {}
  const notation = {}
  const src = b.notation && typeof b.notation === 'object' && !Array.isArray(b.notation) ? b.notation : {}
  Object.keys(src).slice(0, 100).forEach((k) => {
    const from = str(k, 60).trim()
    const to = str(src[k], 60).trim()
    if (from && to && from !== to) notation[from] = to
  })
  return {
    id: idOk(p && p.id) ? p.id : newId('prj'),
    name: str(p && p.name, 80).trim() || '名前のないプロジェクト',
    description: str(p && p.description, 500),
    brand: {
      persona: str(b.persona, 300), tone: str(b.tone, 300),
      banned_words: words(b.banned_words, 100, 60),
      notation,
      notation_exceptions: words(b.notation_exceptions, 100, 60),
      style: str(b.style, 300),
    },
    research: list(p && p.research, 20, (r) => ({ keyword: str(r && r.keyword, 100), platform: str(r && r.platform, 20), at: iso(r && r.at) })),
    imported_from: str(p && p.imported_from, 20),
    created_at: iso(p && p.created_at) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function cleanAnalysis(a) {
  if (!a || typeof a !== 'object') return null
  return {
    hook_text: str(a.hook_text, 300),
    hook_type: HOOK_TYPES.indexOf(a.hook_type) >= 0 ? a.hook_type : 'other',
    beats: list(a.beats, 12, (x) => ({
      label: ['hook', 'context', 'body', 'cta'].indexOf(x && x.label) >= 0 ? x.label : 'body',
      start: num(x && x.start, 0, 3600), end: num(x && x.end, 0, 3600), purpose: str(x && x.purpose, 300), text: str(x && x.text, 300),
    })),
    caption: a.caption && typeof a.caption === 'object' ? {
      line_count: num(a.caption.line_count, 0, 1000), avg_chars: num(a.caption.avg_chars, 0, 10000),
      max_chars: num(a.caption.max_chars, 0, 10000), chars_per_sec: num(a.caption.chars_per_sec, 0, 10000),
    } : null,
    hashtags: words(a.hashtags, 30, 60),
    cta: str(a.cta, 300),
    takeaways: words(a.takeaways, 8, 300),
    onscreen_note: '画面内テロップは動画ファイルが無いので未測定',
    model: str(a.model, 40),
    at: iso(a.at) || new Date().toISOString(),
  }
}

export function cleanPost(p) {
  return {
    id: idOk(p && p.id) ? p.id : newId('post'),
    platform: NET(p && p.platform),
    url: /^https?:\/\//.test(str(p && p.url, 500)) ? str(p.url, 500) : '',
    title: str(p && p.title, 300), caption: str(p && p.caption, 2200), author: str(p && p.author, 100),
    published_at: iso(p && p.published_at),
    duration_sec: num(p && p.duration_sec, 0, 3600),
    views: num(p && p.views, 0, 1e12), likes: num(p && p.likes, 0, 1e12), comments: num(p && p.comments, 0, 1e12), shares: num(p && p.shares, 0, 1e12),
    source: str(p && p.source, 20) || 'manual',
    analysis: cleanAnalysis(p && p.analysis),
    // 企画の型（競争・対決など）と、誰が付けたか（ai / manual / guess）
    format: FORMAT_KEYS.indexOf(p && p.format) >= 0 ? p.format : '',
    format_source: ['ai', 'manual', 'guess'].indexOf(p && p.format_source) >= 0 ? p.format_source : '',
    added_at: iso(p && p.added_at) || new Date().toISOString(),
  }
}

function cleanLine(l) {
  return {
    start: num(l && l.start, 0, 3600) || 0, end: num(l && l.end, 0, 3600) || 0,
    narration: str(l && l.narration, 300), telop: str(l && l.telop, 120), visual: str(l && l.visual, 300),
    // 切り替え（新しい画・音・問い）か山場（ルール変更・トラブル・発表・どんでん返し）
    mark: MARKS.indexOf(l && l.mark) >= 0 ? l.mark : '',
  }
}

export function cleanScript(s) {
  return {
    id: idOk(s && s.id) ? s.id : newId('scr'),
    title: str(s && s.title, 200), platform: NET(s && s.platform),
    // 長さの種類。前からある台本（指定なし）はショートです。
    length_mode: s && s.length_mode === 'long' ? 'long' : 'short',
    target_duration_sec: num(s && s.target_duration_sec, 1, 3600),
    // パッケージ（先に決める約束）。タイトルは title をそのまま使います。
    thumb_text: str(s && s.thumb_text, 60), promise: str(s && s.promise, 300),
    promise_keywords: words(s && s.promise_keywords, 8, 30), wow: str(s && s.wow, 300),
    // 最後: ショートはループにするか、長尺は終了画面のメモ
    loop: !!(s && s.loop), end_screen: str(s && s.end_screen, 300),
    format: FORMAT_KEYS.indexOf(s && s.format) >= 0 ? s.format : '',
    hook: str(s && s.hook, 300), body: str(s && s.body, 2000), cta: str(s && s.cta, 300),
    lines: list(s && s.lines, 200, cleanLine),
    hashtags: words(s && s.hashtags, RULES.post.MAX_HASHTAGS, 60).map((t) => t.replace(/^#/, '')),
    rationale: str(s && s.rationale, 1500),
    hook_type: HOOK_TYPES.indexOf(s && s.hook_type) >= 0 ? s.hook_type : '',
    style: str(s && s.style, 300),
    shots: list(s && s.shots, 300, (x, i) => ({
      index: i, start: num(x && x.start, 0, 3600) || 0, end: num(x && x.end, 0, 3600) || 0,
      narration: str(x && x.narration, 300), telop: str(x && x.telop, 120), visual_prompt: str(x && x.visual_prompt, 600),
      camera: str(x && x.camera, 80), transition: str(x && x.transition, 40),
      // カット割りで分けたとき: 元の行の番号・a/b/c・寄り/引きなど
      parent: num(x && x.parent, 0, 1000), part: str(x && x.part, 4), angle: str(x && x.angle, 20),
      mark: MARKS.indexOf(x && x.mark) >= 0 ? x.mark : '',
    })),
    originality: s && s.originality && typeof s.originality === 'object' ? {
      clean: !!s.originality.clean, attempts: num(s.originality.attempts, 0, 10),
      findings: list(s.originality.findings, 20, (f) => ({ line: str(f && f.line, 300), shared: str(f && f.shared, 120), shared_length: num(f && f.shared_length, 0, 1000), source: str(f && f.source, 120) })),
    } : null,
    created_at: iso(s && s.created_at) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export const PUB_STATUS = ['draft', 'uploading', 'scheduled', 'processing', 'published', 'inbox', 'failed']

function cleanSnapshot(m) {
  const o = { captured_at: iso(m && m.captured_at) || new Date().toISOString(), source: str(m && m.source, 20) }
  for (const k of ['views', 'likes', 'comments', 'shares', 'saves', 'reach', 'avg_watch_sec', 'retention_rate', 'skip_rate']) o[k] = num(m && m[k], 0, 1e12)
  return o
}

export function cleanPub(u) {
  return {
    id: idOk(u && u.id) ? u.id : newId('pub'),
    platform: NET(u && u.platform),
    status: PUB_STATUS.indexOf(u && u.status) >= 0 ? u.status : 'draft',
    script_id: idOk(u && u.script_id) ? u.script_id : '',
    title: str(u && u.title, 100),
    caption: str(u && u.caption, 2200),
    hashtags: words(u && u.hashtags, 30, 60).map((t) => t.replace(/^#/, '')),
    video_url: /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(str(u && u.video_url, 600)) ? str(u.video_url, 600) : '',
    video_size: num(u && u.video_size, 0, 5e9),
    duration_sec: num(u && u.duration_sec, 0, 3600),
    hook_type: HOOK_TYPES.indexOf(u && u.hook_type) >= 0 ? u.hook_type : '',
    privacy: ['public', 'unlisted', 'private'].indexOf(u && u.privacy) >= 0 ? u.privacy : 'public',
    scheduled_for: str(u && u.scheduled_for, 30),
    published_at: iso(u && u.published_at),
    external_id: str(u && u.external_id, 100), external_url: /^https:\/\//.test(str(u && u.external_url, 500)) ? str(u.external_url, 500) : '',
    container_id: str(u && u.container_id, 100), publish_id: str(u && u.publish_id, 120),
    error: str(u && u.error, 400),
    attempts: num(u && u.attempts, 0, 100) || 0,
    snapshots: list(u && u.snapshots, 60, cleanSnapshot),
    created_at: iso(u && u.created_at) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function cleanPdca(c) {
  const t = (c && c.target) || {}
  return {
    id: idOk(c && c.id) ? c.id : newId('pdca'),
    title: str(c && c.title, 200).trim() || '名前のない仮説',
    stage: ['plan', 'do', 'check', 'act'].indexOf(c && c.stage) >= 0 ? c.stage : 'plan',
    hypothesis: str(c && c.hypothesis, 1000),
    target: { metric: str(t.metric, 40), target: num(t.target), baseline: num(t.baseline) },
    publication_ids: list(c && c.publication_ids, 50, (x) => str(x, 64)).filter(idOk),
    learnings: str(c && c.learnings, 2000),
    next_actions: words(c && c.next_actions, 10, 300),
    created_at: iso(c && c.created_at) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export const CLEAN = { posts: cleanPost, scripts: cleanScript, pubs: cleanPub, pdca: cleanPdca }

export function cleanAccount(a) {
  return {
    id: idOk(a && a.id) ? a.id : newId('acc'),
    platform: str(a && a.platform, 20), username: str(a && a.username, 100), display_name: str(a && a.display_name, 100),
    status: 'relink', status_label: '再連携が必要', project_id: idOk(a && a.project_id) ? a.project_id : '',
  }
}

/* ---------------- 読み書き ---------------- */

function parseAll(flat) {
  const out = []
  const a = Array.isArray(flat) ? flat : []
  for (let i = 0; i + 1 < a.length; i += 2) {
    try { out.push(JSON.parse(a[i + 1])) } catch (_) {}
  }
  return out
}

export async function videoStore(req) {
  return req ? await storeFor(req) : storeConfig()
}

export async function listProjects(cfg) {
  const [flat] = await pipeline(cfg, [['HGETALL', VK.projects]])
  return parseAll(flat).sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1))
}

export async function getProject(cfg, pid) {
  if (!idOk(pid)) return null
  const [v] = await pipeline(cfg, [['HGET', VK.projects, pid]])
  try { return v ? JSON.parse(v) : null } catch (_) { return null }
}

export async function saveProject(cfg, raw) {
  const p = cleanProject(raw)
  const [exists, count] = await pipeline(cfg, [['HEXISTS', VK.projects, p.id], ['HLEN', VK.projects]])
  if (!Number(exists) && Number(count) >= CAPS.projects) {
    return { ok: false, message: `プロジェクトは${CAPS.projects}件までです。使っていないものを削除してください。` }
  }
  const prev = Number(exists) ? await getProject(cfg, p.id) : null
  if (prev && prev.created_at) p.created_at = prev.created_at
  await pipeline(cfg, [['HSET', VK.projects, p.id, JSON.stringify(p)]])
  return { ok: true, project: p }
}

export async function deleteProject(cfg, pid) {
  if (!idOk(pid)) return { ok: false, message: 'プロジェクトの指定が正しくありません。' }
  await pipeline(cfg, [['HDEL', VK.projects, pid], ...KINDS.map((k) => ['DEL', VK.items(pid, k)])])
  return { ok: true }
}

export async function listItems(cfg, pid, kind) {
  const [flat] = await pipeline(cfg, [['HGETALL', VK.items(pid, kind)]])
  return parseAll(flat)
}

export async function getItem(cfg, pid, kind, id) {
  if (!idOk(id)) return null
  const [v] = await pipeline(cfg, [['HGET', VK.items(pid, kind), id]])
  try { return v ? JSON.parse(v) : null } catch (_) { return null }
}

/** 何件かまとめて上書き保存します（無ければ追加）。上限を超える分は断ります。 */
export async function putItems(cfg, pid, kind, raws) {
  const clean = CLEAN[kind]
  if (!clean) return { ok: false, message: '保存できない種類です。' }
  const items = (raws || []).slice(0, 60).map(clean)
  if (!items.length) return { ok: true, items: [] }
  const key = VK.items(pid, kind)
  const res = await pipeline(cfg, [['HLEN', key], ...items.map((x) => ['HEXISTS', key, x.id])])
  const fresh = res.slice(1).filter((v) => !Number(v)).length
  if (Number(res[0]) + fresh > CAPS[kind]) {
    return { ok: false, message: `${KIND_LABEL[kind]}は1つのプロジェクトに${CAPS[kind]}件までです（今 ${res[0]}件）。古いものを削除してから追加してください。` }
  }
  await pipeline(cfg, [['HSET', key, ...items.flatMap((x) => [x.id, JSON.stringify(x)])]])
  return { ok: true, items }
}

export async function deleteItems(cfg, pid, kind, ids) {
  const ok = (ids || []).filter(idOk).slice(0, 300)
  if (!ok.length) return { ok: true, removed: 0 }
  const [n] = await pipeline(cfg, [['HDEL', VK.items(pid, kind), ...ok]])
  return { ok: true, removed: Number(n) || 0 }
}

export async function listAccounts(cfg) {
  const [flat] = await pipeline(cfg, [['HGETALL', VK.accounts]])
  return parseAll(flat)
}

/* ---------------- 24時間の投稿数 ---------------- */

/** 上限（自前の安全弁）に達しているか。上限の無い投稿先は常に通します。 */
export async function capLeft(cfg, net) {
  const cap = RULES.post.DAILY_POST_CAP[net]
  if (!cap) return { ok: true, cap: null, used: 0 }
  const now = Date.now()
  try {
    const [, used] = await pipeline(cfg, [['ZREMRANGEBYSCORE', VK.sent(net), 0, now - 86400000], ['ZCARD', VK.sent(net)]])
    const u = Number(used) || 0
    return { ok: u < cap, cap, used: u }
  } catch (_) { return { ok: true, cap, used: 0 } }
}

export async function capRecord(cfg, net, id) {
  if (!RULES.post.DAILY_POST_CAP[net]) return
  const now = Date.now()
  try { await pipeline(cfg, [['ZADD', VK.sent(net), now, `${now}:${id}`], ['EXPIRE', VK.sent(net), 2 * 86400]]) } catch (_) {}
}
