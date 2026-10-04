// SNS（動画）のデータと AI（管理者のみ）。
//
//   GET  /api/video                 プロジェクトの一覧と、何が使えるか
//   GET  /api/video?project=<id>    1プロジェクトの全部（競合・台本・投稿・PDCA）
//   POST /api/video {action, …}     保存・削除・AI（構成分析・台本づくり）
//   PUT  /api/video {kind, …}       まとめて書き込み（snsauto からの取り込み）
//
// Node の関数にしているのは、台本づくりで「流用の疑い → 作り直し」を
// 最大2回くり返すと、Edge の「25秒以内に返事を始める」に収まらないことが
// あるためです（vercel.json で最大60秒にしています）。
//
// 重い処理（動画・音声の解析）はここではしません。ブラウザで行います。
// 関数に動画を送ると、4.5MB の上限とお金の両方に引っかかるからです。

import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, json, apiKey, NO_AI, spendGuard } from './_admin-auth.js'
import {
  VK, NO_STORE, videoStore, listProjects, getProject, saveProject, deleteProject, listItems, putItems,
  deleteItems, listAccounts, cleanAccount, cleanPost, str, KINDS, CAPS,
} from './_video-store.js'
import { pipeline } from './_analytics-store.js'
import { scorePosts, durationBand, captionStats, checkScript, HOOK_TYPES, RULES, PLATFORMS, shotsFromLines, promiseCheck, STRONG_HOOKS, MARKS } from './_video-core.js'
import { readiness, igDiscover } from './_video-platforms.js'

const MODEL = 'claude-opus-5-5'
const AI_DAILY = 60
const BUDGET_MS = 50000

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await videoStore(req)
  const ready = await readiness(req)
  if (!cfg) return json({ ...NO_STORE, ok: true, stored: false, projects: [], accounts: [], ready, rules: RULES })
  const pid = new URL(req.url).searchParams.get('project')
  try {
    if (!pid) {
      const [projects, accounts] = await Promise.all([listProjects(cfg), listAccounts(cfg)])
      return json({ ok: true, stored: true, projects, accounts, ready, rules: RULES })
    }
    const project = await getProject(cfg, pid)
    if (!project) return json({ ok: false, message: 'そのプロジェクトは見つかりませんでした（削除されたかもしれません）。' }, 404)
    const [posts, scripts, pubs, pdca] = await Promise.all(KINDS.map((k) => listItems(cfg, pid, k)))
    const scored = scorePosts(posts)
    const byDate = (a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1)
    return json({
      ok: true, stored: true, project, ready, rules: RULES, caps: CAPS,
      posts: scored, band: durationBand(scored),
      scripts: scripts.sort(byDate), pubs: pubs.sort(byDate), pdca: pdca.sort(byDate),
    })
  } catch (e) {
    return json({ ok: false, message: `保存先から読めませんでした（${String((e && e.message) || e).slice(0, 100)}）。少し待ってから開き直してください。` }, 503)
  }
}

async function body(req) {
  try { return await req.json() } catch (_) { return null }
}

export async function PUT(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = await videoStore(req)
  if (!cfg) return json(NO_STORE, 503)
  const b = await body(req)
  if (!b) return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400)
  try {
    if (b.kind === 'project') return json(await saveProject(cfg, b.project))
    if (b.kind === 'accounts') {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, CAPS.accounts).map(cleanAccount)
      if (items.length) await pipeline(cfg, [['HSET', VK.accounts, ...items.flatMap((a) => [a.id, JSON.stringify(a)])]])
      return json({ ok: true, count: items.length })
    }
    if (KINDS.indexOf(b.kind) < 0) return json({ ok: false, message: '保存できない種類です。' }, 400)
    if (!(await getProject(cfg, b.project))) return json({ ok: false, message: '先にプロジェクトを保存してください。' }, 400)
    const r = await putItems(cfg, b.project, b.kind, b.items)
    return json(r.ok ? { ok: true, count: r.items.length } : r, r.ok ? 200 : 400)
  } catch (e) {
    return json({ ok: false, message: `保存できませんでした（${String((e && e.message) || e).slice(0, 100)}）。` }, 503)
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const b = await body(req)
  if (!b || typeof b.action !== 'string') return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400)
  const cfg = await videoStore(req)
  if (!cfg) return json(NO_STORE, 503)
  const a = b.action
  try {
    if (a === 'project.save') return json(await saveProject(cfg, b.project))
    if (a === 'project.delete') return json(await deleteProject(cfg, b.id))

    const project = await getProject(cfg, b.project)
    if (!project) return json({ ok: false, message: 'プロジェクトを選んでください（見つかりませんでした）。' }, 400)
    const pid = project.id

    if (a === 'posts.add') {
      const r = await putItems(cfg, pid, 'posts', (Array.isArray(b.posts) ? b.posts : []).map((p) => ({ ...p, analysis: null })))
      return json(r.ok ? { ok: true, added: r.items.length } : r, r.ok ? 200 : 400)
    }
    if (a === 'ig.discover') return json(await discover(req, cfg, pid, b.username))
    for (const kind of KINDS) {
      const one = { posts: 'post', scripts: 'script', pubs: 'pub', pdca: 'pdca' }[kind]
      if (a === `${one}.save`) {
        const r = await putItems(cfg, pid, kind, [b.item])
        return json(r.ok ? { ok: true, item: r.items[0] } : r, r.ok ? 200 : 400)
      }
      if (a === `${one}.delete` || a === `${kind}.delete`) return json(await deleteItems(cfg, pid, kind, b.ids || [b.id]))
    }
    if (a === 'analyze') return await analyze(req, cfg, project, b.ids)
    if (a === 'script.generate') return await generate(req, cfg, project, b)
    if (a === 'hook.suggest') return await suggestHooks(req, project, b.script)
    return json({ ok: false, message: 'その操作には対応していません。' }, 400)
  } catch (e) {
    return json({ ok: false, message: `処理できませんでした（${String((e && e.message) || e).slice(0, 120)}）。` }, 503)
  }
}

/* ---------------- 競合を Instagram から集める ---------------- */

async function discover(req, cfg, pid, username) {
  const name = str(username, 60).replace(/^@/, '').trim()
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) return { ok: false, message: 'Instagram のユーザー名（英数字・ドット・アンダーバー）を入れてください。' }
  const r = await igDiscover(req, name)
  if (!r.ok) return r
  const saved = await putItems(cfg, pid, 'posts', r.posts)
  if (!saved.ok) return saved
  return { ok: true, added: saved.items.length, note: r.note }
}

/* ---------------- AI ---------------- */

async function claude(req, { system, user, schema, maxTokens }) {
  const key = await apiKey(req)
  if (!key) return { error: json(NO_AI, 503) }
  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  let out
  try {
    out = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens || 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    }, { signal: AbortSignal.timeout(40000) })
  } catch (e) {
    const m = String((e && e.message) || e)
    return { error: json({ ok: false, message: /abort|timeout/i.test(m) ? 'AIの返事が時間内に来ませんでした。もう一度お試しください。' : `AIに頼めませんでした（${m.slice(0, 120)}）` }, 502) }
  }
  if (out.stop_reason === 'refusal') return { error: json({ ok: false, message: 'この内容ではAIが作業できませんでした。言い方を変えてお試しください。' }, 422) }
  try {
    return { data: JSON.parse((out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')) }
  } catch (_) {
    return { error: json({ ok: false, message: 'AIの返事の形が想定と違いました。もう一度お試しください。' }, 502) }
  }
}

const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['analyses'],
  properties: {
    analyses: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['post_id', 'hook_text', 'hook_type', 'beats', 'cta', 'takeaways'],
        properties: {
          post_id: { type: 'string' },
          hook_text: { type: 'string' },
          hook_type: { type: 'string', enum: HOOK_TYPES },
          beats: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['label', 'start', 'end', 'purpose'],
              properties: { label: { type: 'string', enum: ['hook', 'context', 'body', 'cta'] }, start: { type: 'number' }, end: { type: 'number' }, purpose: { type: 'string' } },
            },
          },
          cta: { type: 'string' },
          takeaways: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

/** 競合の構成分析。手元にあるのはタイトル・キャプション・長さ・数字だけなので、
 *  画面の中のテロップや映像は「見ていない」と結果にも書きます。 */
async function analyze(req, cfg, project, ids) {
  const posts = scorePosts(await listItems(cfg, project.id, 'posts'))
  const want = Array.isArray(ids) && ids.length ? posts.filter((p) => ids.indexOf(p.id) >= 0) : posts.filter((p) => !p.analysis)
  const pick = want.slice(0, 8)
  if (!pick.length) return json({ ok: false, message: '分析する投稿がありません（すべて分析済みです）。' }, 400)
  const guard = await spendGuard('video-ai', AI_DAILY)
  if (guard) return guard
  const user = [
    '次のショート動画（競合）の構成を推定してください。手元にあるのはタイトル・キャプション・長さ・数字だけで、映像と画面内の文字は見られません。',
    '分かることだけを書き、映像の中身を想像で断定しないでください。beats の秒数は長さに収め、hook はおおむね最初の3秒です。',
    'takeaways は「自社がまねしてよい型」を日本語で短く2〜3個（文言のコピーではなく構成の工夫）。',
    '',
    ...pick.map((p) => `post_id: ${p.id}\nタイトル: ${p.title}\nキャプション: ${p.caption.slice(0, 600)}\n長さ: ${p.duration_sec || '不明'}秒\n再生: ${p.views ?? '不明'} / 反応率: ${p.engagement_rate != null ? (p.engagement_rate * 100).toFixed(1) + '%' : '不明'}\n`),
  ].join('\n')
  const r = await claude(req, { system: 'あなたはショート動画の構成を分析する編集者です。出力は日本語。', user, schema: ANALYSIS_SCHEMA })
  if (r.error) return r.error
  const by = {}
  for (const x of (r.data && r.data.analyses) || []) by[x.post_id] = x
  const updated = pick.filter((p) => by[p.id]).map((p) => {
    const x = by[p.id]
    const raw = { ...p }
    delete raw.engagement_rate; delete raw.velocity; delete raw.score; delete raw.rank
    return cleanPost({ ...raw, analysis: { ...x, caption: captionStats(p.caption, p.duration_sec), hashtags: captionStats(p.caption).hashtags, model: MODEL } })
  })
  const saved = await putItems(cfg, project.id, 'posts', updated)
  if (!saved.ok) return json(saved, 400)
  return json({ ok: true, analyzed: updated.length, left: Math.max(0, want.length - pick.length) })
}

// パッケージ（タイトル・サムネの文字・約束・wow要素）を先に書かせるため、
// 出力の最初に置いています（AIは決まった順に書きます）。
const SCRIPT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'thumb_text', 'promise', 'wow', 'hook', 'hook_type', 'body', 'cta', 'target_duration_sec', 'lines', 'hashtags', 'rationale'],
  properties: {
    title: { type: 'string' }, thumb_text: { type: 'string' }, promise: { type: 'string' }, wow: { type: 'string' },
    hook: { type: 'string' }, hook_type: { type: 'string', enum: HOOK_TYPES },
    body: { type: 'string' }, cta: { type: 'string' }, target_duration_sec: { type: 'number' },
    lines: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['start', 'end', 'narration', 'telop', 'visual', 'mark'],
        properties: { start: { type: 'number' }, end: { type: 'number' }, narration: { type: 'string' }, telop: { type: 'string' }, visual: { type: 'string' }, mark: { type: 'string', enum: MARKS } },
      },
    },
    hashtags: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
}

const HOOK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['hooks'],
  properties: {
    hooks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'narration', 'telop', 'why'],
        properties: { type: { type: 'string', enum: STRONG_HOOKS }, narration: { type: 'string' }, telop: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
}

/** 冒頭（フック）の別案を3つ。保存はせず、画面で選んだものだけを台本に入れます。 */
async function suggestHooks(req, project, raw) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const mode = s.length_mode === 'long' ? 'long' : 'short'
  const M = RULES.modes[mode]
  const lines = Array.isArray(s.lines) ? s.lines.slice(0, 6) : []
  if (!str(s.promise, 300).trim() && !lines.length) return json({ ok: false, message: '約束か台本の行を入れてから頼んでください。' }, 400)
  const guard = await spendGuard('video-ai', AI_DAILY)
  if (guard) return guard
  const brand = project.brand || {}
  const user = [
    `動画のタイトル: ${str(s.title, 200)}`,
    `約束（見た人が得られること）: ${str(s.promise, 300) || '未記入'}`,
    s.wow ? `この店にしか見せられないもの: ${str(s.wow, 300)}` : '',
    `長さの種類: ${mode === 'long' ? '長尺（冒頭10秒で約束を見せる）' : 'ショート（フックは3秒以内）'}`,
    brand.persona ? `話し手: ${brand.persona}` : '',
    brand.tone ? `口調: ${brand.tone}` : '',
    (brand.banned_words || []).length ? `使ってはいけない言葉: ${brand.banned_words.join('、')}` : '',
    '今の冒頭:',
    ...lines.map((l) => `${l.start}〜${l.end}秒: ${str(l.narration, 300)}（テロップ: ${str(l.telop, 120)}）`),
    '',
    `冒頭の別案を3つ、それぞれ違う型で（${STRONG_HOOKS.join(', ')} から選ぶ）。`,
    `- narration は${M.HOOK_SEC}秒で言える長さ（${M.HOOK_SEC * RULES.telop.MAX_CPS}文字まで）。telop は短く。約束の言葉をそのまま入れる。`,
    '- あいさつ・自己紹介から始めない。事実（価格・実績・数字）を作らない。why は日本語で1文。',
  ].filter(Boolean).join('\n')
  const r = await claude(req, { system: 'あなたは日本の小さなお店の動画の冒頭（フック）を考える編集者です。出力は日本語。', user, schema: HOOK_SCHEMA, maxTokens: 2000 })
  if (r.error) return r.error
  const hooks = ((r.data && r.data.hooks) || []).slice(0, 3).map((h) => ({ type: STRONG_HOOKS.indexOf(h.type) >= 0 ? h.type : 'other', narration: str(h.narration, 300), telop: str(h.telop, 120), why: str(h.why, 300) }))
  return json({ ok: true, hooks })
}

/** 台本づくり。決まった確認（禁止ワード・表記・流用・テロップの速さ）は
 *  AI に任せず、ここで機械的に行います。流用の疑いがあれば、どこが同じだったかを
 *  伝えて最大2回作り直し、それでも残れば結果と一緒に見せます。 */
async function generate(req, cfg, project, b) {
  const started = Date.now()
  const topic = str(b.topic, 1500).trim()
  if (!topic) return json({ ok: false, message: '何についての動画か（テーマ）を入れてください。' }, 400)
  // 長尺（3分以上）は YouTube の通常の動画として作ります。
  const mode = b.length_mode === 'long' ? 'long' : 'short'
  const loop = mode === 'short' && b.loop !== false
  const platform = mode === 'long' ? 'youtube' : PLATFORMS[b.platform] ? b.platform : 'instagram'
  const posts = scorePosts(await listItems(cfg, project.id, 'posts'))
  const band = durationBand(posts)
  const P = mode === 'long' ? { label: 'YouTube（長尺）', minSec: RULES.modes.long.MIN_SEC, maxSec: 900 } : PLATFORMS[platform]
  let target = Number(b.duration) > 0 ? Number(b.duration) : mode === 'long' ? 300 : band.ok ? band.median : 30
  target = Math.max(P.minSec, Math.min(mode === 'short' ? Math.min(P.maxSec, RULES.modes.short.MAX_SEC) : P.maxSec, Math.round(target)))
  const sources = posts.flatMap((p) => [p.title, p.caption]).filter(Boolean)
  const brand = project.brand || {}
  const top = posts.slice(0, 6)
  const M = RULES.modes[mode]
  const base = [
    `テーマ: ${topic}`,
    `投稿先: ${P.label}`,
    `目標の長さ: ${target}秒（${band.ok ? `競合の上位は中央値${band.median}秒、真ん中半分が${band.q1}〜${band.q3}秒` : '競合の長さはまだ判断できないため既定値'}）`,
    brand.persona ? `話し手: ${brand.persona}` : '',
    brand.tone ? `口調: ${brand.tone}` : '',
    (brand.banned_words || []).length ? `使ってはいけない言葉: ${brand.banned_words.join('、')}` : '',
    '',
    '参考にする競合（構成の型だけを参考にし、言い回しはまねしないこと）:',
    ...top.map((p, i) => `${i + 1}. ${p.title}${p.analysis ? `（フック: ${p.analysis.hook_type}「${p.analysis.hook_text}」、構成: ${(p.analysis.beats || []).map((x) => x.label).join('→')}）` : ''}`),
    '',
    '作り方（順番を守ること）:',
    '1. 先にパッケージを決める。title（タイトル）、thumb_text（サムネ＝表紙の文字。10文字前後）、promise（見た人が得られることを1文で）、wow（この店・会社にしか見せられないもの。職人の手元・工程・道具・常連さんとのやりとりなど、お金をかけた派手さではなく「ここでしか見られない」こと）。',
    `2. 次に、その約束を果たす台本を書く。最初の${M.PROMISE_SEC}秒で約束の中身を見せ、promise の名詞（例: 商品名・悩み・数字）を冒頭のテロップかナレーションにそのまま入れる。約束していないことで引っぱらない（釣りにしない）。`,
    mode === 'short'
      ? '- 1行目（3秒以内）がフック。型は「問いかけ」「数字の約束」「意外な主張」「結果を先に見せる」「呼びかけ」「途中から始める」のどれか。あいさつや自己紹介から始めない。'
      : `- 0〜${M.HOOK_SEC}秒がフック（約束を見せる）。${M.WHY_WATCH_SEC}秒までに「最後まで見ると何が分かるか」を言う。1〜3分は引き込み、3〜6分で一段上げ、後半も約3分ごとに山場（ルール変更・トラブル・発表・どんでん返し）を置く。`,
    mode === 'short'
      ? `- lines は時間順に隙間なく並べ、最後の end を目標の長さに合わせる。1行は2〜3秒（同じ画は${M.SHOT_MAX_SEC}秒まで）。約${M.INTERRUPT_TARGET_SEC}秒ごとに新しい画・音・問いを入れる。`
      : `- lines は時間順に隙間なく並べ、最後の end を目標の長さに合わせる。1行は5〜10秒（同じ画は${M.SHOT_MAX_SEC}秒まで）。`,
    `- 各行の mark: 新しい画・音・問いで注意を戻す行は switch_visual / switch_sound / switch_question、話が一段動く山場は peak_rule（ルール変更）/ peak_trouble（トラブル）/ peak_reveal（発表）/ peak_twist（どんでん返し）。それ以外は空文字。${mode === 'short' ? `約${M.INTERRUPT_TARGET_SEC}秒ごとに切り替えを置く。` : `約${M.PEAK_TARGET_SEC / 60}分ごとに山場を置く。`}`,
    `- telop（画面の文字）は1秒あたり${RULES.telop.MAX_CPS}文字以内で読める長さに。narration は話す言葉、visual は映す画（英語で具体的に。文字やロゴは入れない）。`,
    mode === 'short' && loop
      ? '- 最後はループにする: CTA（保存・フォローなど行動を1つだけ）は最後から2行目に短く1回。最後の行は1行目につながる言葉で終える（1行目の言葉をくり返す、「答えは…」と言いかけて1行目へ戻るなど）。「以上です」「またね」で締めない。'
      : '- 行動のお願い（CTA）は途中に入れず、最後の行に1回だけ（保存・フォロー・予約など、行動を1つだけ）。',
    mode === 'long' ? '- 最後の5〜20秒は YouTube の終了画面に使うので、次に見てほしい動画へつなぐ一言で終える。' : '',
    `- hashtags は${RULES.post.MAX_HASHTAGS}個以内、# は付けない。`,
    '- 事実（価格・実績・数字）を作らない。テーマに書かれていないことは一般論にとどめる。',
    '- rationale に、なぜこの構成にしたかを日本語で2〜3文。',
  ].filter((l) => l !== '').join('\n')

  const guard = await spendGuard('video-ai', AI_DAILY)
  if (guard) return guard
  let attempt = 0
  let avoid = []
  let promiseMiss = []
  let result = null
  let checks = null
  while (attempt <= RULES.originality.MAX_REGENERATIONS) {
    if (attempt > 0) {
      // 約束が冒頭に入っていないだけのときも、時間が許せば作り直します。
      // 作り直しも1回として数えます。時間が足りないときは、ここで止めて見せます。
      if (Date.now() - started > BUDGET_MS - 20000) break
      const g = await spendGuard('video-ai', AI_DAILY)
      if (g) break
    }
    const user = attempt === 0 ? base : base + (avoid.length ? '\n\n前の案は競合と同じ言い回しが含まれていました。次の部分は使わず、別の言い方にしてください:\n' + avoid.map((x) => `- 「${x}」`).join('\n') : '') +
      (promiseMiss.length ? `\n\n前の案は、約束の言葉（${promiseMiss.join('・')}）が最初の${M.PROMISE_SEC}秒に入っていませんでした。冒頭のテロップかナレーションに入れてください。` : '')
    const r = await claude(req, { system: 'あなたは日本の小さなお店・会社の動画の台本を書く構成作家です。パッケージ（タイトルとサムネ）を先に決め、その約束を冒頭で必ず果たします。出力は日本語（visual だけ英語）。', user, schema: SCRIPT_SCHEMA, maxTokens: 12000 })
    if (r.error) { if (result) break; return r.error }
    attempt++
    result = r.data
    checks = checkScript({ ...result, hashtags: (result.hashtags || []).slice(0, RULES.post.MAX_HASHTAGS) }, brand, sources)
    const pc = promiseCheck({ ...checks.script, length_mode: mode })
    promiseMiss = pc.status === 'ng' ? pc.missing : []
    if (checks.originality.clean && !promiseMiss.length) break
    avoid = checks.originality.findings.map((f) => f.shared)
  }
  const s = checks.script
  const draft = {
    ...s,
    platform,
    length_mode: mode,
    loop,
    end_screen: mode === 'long' ? '次に見てほしい動画を終了画面に置く（最後の5〜20秒）' : '',
    target_duration_sec: target,
    hashtags: (s.hashtags || []).map((t) => String(t).replace(/^#/, '')).slice(0, RULES.post.MAX_HASHTAGS),
    style: brand.style || '',
    shots: shotsFromLines(s.lines, brand.style || ''),
    originality: { ...checks.originality, attempts: attempt },
  }
  // 禁止ワードが残っている台本は保存はしますが、書き出しと投稿は画面で止めます。
  const saved = await putItems(cfg, project.id, 'scripts', [draft])
  if (!saved.ok) return json(saved, 400)
  return json({
    ok: true, script: saved.items[0], checks: { banned: checks.banned, notation: checks.notation, originality: checks.originality, speed: checks.speed },
    attempts: attempt, band,
    message: checks.originality.clean
      ? (attempt > 1 ? `競合と同じ言い回し、または冒頭に約束の言葉が無かったため${attempt - 1}回作り直しました。` : '台本を作りました。読んで直してから使ってください。') +
        (promiseMiss.length ? `（最初の${M.PROMISE_SEC}秒に「${promiseMiss.join('」「')}」がまだありません。「約束を守る」を見て直してください）` : '')
      : `作り直しても競合と同じ言い回しが残りました（${checks.originality.findings.length}か所）。下の「流用の疑い」を見て、手で書き換えてください。`,
  })
}

