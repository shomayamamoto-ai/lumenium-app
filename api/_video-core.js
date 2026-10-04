// SNS（動画）の「判定と計算」。画面とサーバーとテストで同じものを使います。
//
// なぜ1か所なのか。台本の禁止ワード・表記の統一・流用の判定は、画面で
// 「問題なし」と出たものをサーバーが断る（またはその逆）と、どちらを
// 信じればいいのか分からなくなります。音量や無音の計算も、テストで
// 確かめた式と画面で動く式が別物では、テストが何も保証しません。
//
// このファイルは import を持ちません。ビルドのとき scripts/build-video-core.mjs
// が export を外して public/video-core.js（管理画面が読むファイル）を作ります。
// 直すのはこのファイルだけにしてください。
//
// 基準値は、移行元のツール（snsauto）が rules.json で公開している値と同じに
// しています。数字だけでなく「なぜその値か」も一緒に置き、画面にも出します。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

export const RULES = {
  silence: {
    MIN_GAP_SEC: 0.3, // これ未満の間は切らない（促音・子音の閉鎖区間）
    HANDLE_SEC: 0.1, // 切る場合も発話の前後に残す余白（語頭・語尾）
    CONSONANT_MARGIN_DB: 8, // 高域(4-8kHz)がファイル自身の高域床からこれ以上出ていれば無声子音として残す
    NOISE_FLOOR_DB: -35, // 無音の候補に挙げる音量
    FRAME_SEC: 0.01,
  },
  stats: { BOOTSTRAP_SEED: 20260101, ITERATIONS: 2000, BANDS: [[3, 'insufficient'], [6, 'weak'], [12, 'usable']] },
  learn: { MIN_POSTS: 6, MIN_PER_VALUE: 3 },
  ship: { TARGET_LUFS: -14, SAFE_TOP_MARGIN: 220, FRAME_H: 1920, BOTTOM_UI: 320 },
  originality: { RUN_THRESHOLD: 10, MAX_REGENERATIONS: 2 },
  post: { DAILY_POST_CAP: { instagram: 25, tiktok: 25, youtube: null }, MAX_GIVEBACK: 0.25, MAX_HASHTAGS: 5 },
  telop: { MAX_CPS: 8 },
  hook: { SEC: 3 },
}

/* 投稿先ごとの長さ。秒は各社の公開している上限（2026年時点）。
   Instagram のリールは 5〜90秒が「リール」として扱われ、それより長いと
   通常の動画扱いになることがあります。TikTok は API から送れる長さが
   アカウントごとに違う（max_video_post_duration_sec）ので、ここでは
   ふつうの上限だけを見て、実際の値は投稿時に TikTok が返す値で判断します。 */
export const PLATFORMS = {
  instagram: { label: 'Instagram リール', minSec: 5, maxSec: 90, caption: 2200, maxTags: 30 },
  youtube: { label: 'YouTube ショート', minSec: 1, maxSec: 180, caption: 5000, title: 100 },
  tiktok: { label: 'TikTok', minSec: 3, maxSec: 600, caption: 2200 },
}

export const HOOK_TYPES = ['question', 'statement', 'number', 'negation', 'story', 'other']
export const HOOK_LABELS = { question: '問いかけ', statement: '言い切り', number: '数字', negation: '否定・意外性', story: '物語', other: 'その他' }
export const BEAT_LABELS = ['hook', 'context', 'body', 'cta']

/* ---------------- 文字列 ---------------- */

/** 文字数（サロゲートペアや絵文字を1文字として数える）。 */
export function charLen(s) {
  return Array.from(String(s == null ? '' : s)).length
}

function normSpace(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '')
}

/** 2つの文字列の最長共通部分文字列（空白は無視）。流用の判定に使います。
 *  O(n·m) の動的計画法を1行ぶんの配列で回します。台本の1行と競合の
 *  キャプション（数百字）なら一瞬です。 */
export function longestCommon(a, b) {
  const x = Array.from(normSpace(a))
  const y = Array.from(normSpace(b))
  if (!x.length || !y.length) return { length: 0, text: '' }
  let prev = new Array(y.length + 1).fill(0)
  let best = 0
  let end = 0
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array(y.length + 1).fill(0)
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        cur[j] = prev[j - 1] + 1
        if (cur[j] > best) { best = cur[j]; end = i }
      }
    }
    prev = cur
  }
  return { length: best, text: x.slice(end - best, end).join('') }
}

/** 台本の各行と、競合のタイトル・キャプションを突き合わせます。
 *  連続して threshold 文字以上同じなら「流用の疑い」として返します。 */
export function originality(lines, sources, threshold = RULES.originality.RUN_THRESHOLD) {
  const findings = []
  const srcs = (sources || []).map((s) => String(s || '')).filter((s) => charLen(s) >= threshold)
  for (const line of lines || []) {
    const text = String(line || '')
    if (charLen(text) < threshold) continue
    let top = null
    for (const src of srcs) {
      const m = longestCommon(text, src)
      if (m.length >= threshold && (!top || m.length > top.shared_length)) {
        top = { line: text, shared: m.text, shared_length: m.length, coverage: Math.round((m.length / charLen(normSpace(text))) * 1000) / 1000, source: src.slice(0, 80) }
      }
    }
    if (top) findings.push(top)
  }
  return { checked: true, clean: findings.length === 0, findings, threshold }
}

/** 禁止ワード。見つかった語と、どの文に入っていたか。 */
export function findBanned(texts, words) {
  const out = []
  const list = (words || []).map((w) => String(w || '').trim()).filter(Boolean)
  ;(Array.isArray(texts) ? texts : [texts]).forEach((t, i) => {
    const s = String(t || '')
    for (const w of list) if (s.indexOf(w) >= 0) out.push({ word: w, index: i, text: s })
  })
  return out
}

/** 表記の統一（例: プレミア → Premiere）。例外（プレミアリーグ）に含まれる
 *  箇所は置き換えません。長い語から先に当てるので「プレミアプロ」は
 *  「プレミア」より先に Premiere Pro になります。 */
export function normalizeNotation(text, map, exceptions) {
  const src = String(text == null ? '' : text)
  const pairs = Object.keys(map || {}).filter((k) => k && map[k] != null && k !== map[k])
    .sort((a, b) => b.length - a.length)
  if (!pairs.length) return { text: src, changes: [] }
  // 例外の位置を先に押さえておきます（その範囲は触らない）。
  const guard = new Array(src.length).fill(false)
  for (const ex of exceptions || []) {
    if (!ex) continue
    let i = src.indexOf(ex)
    while (i >= 0) {
      for (let k = i; k < i + ex.length; k++) guard[k] = true
      i = src.indexOf(ex, i + ex.length)
    }
  }
  let out = ''
  const changes = []
  let i = 0
  while (i < src.length) {
    let hit = null
    if (!guard[i]) {
      for (const from of pairs) {
        if (src.startsWith(from, i)) {
          let blocked = false
          for (let k = i; k < i + from.length; k++) if (guard[k]) { blocked = true; break }
          if (!blocked) { hit = from; break }
        }
      }
    }
    if (hit) {
      out += map[hit]
      changes.push({ from: hit, to: String(map[hit]), at: i })
      i += hit.length
    } else {
      out += src[i]
      i++
    }
  }
  return { text: out, changes }
}

/** テロップの読む速さ。1秒あたりの文字数が上限を超える行を返します。 */
export function telopSpeed(lines, maxCps = RULES.telop.MAX_CPS) {
  const out = []
  ;(lines || []).forEach((l, i) => {
    const dur = Number(l.end) - Number(l.start)
    const n = charLen(String(l.telop || '').replace(/\s/g, ''))
    if (!(dur > 0) || !n) return
    const cps = Math.round((n / dur) * 10) / 10
    if (cps > maxCps) out.push({ index: i, cps, chars: n, sec: Math.round(dur * 100) / 100 })
  })
  return out
}

/** 台本の決まった確認をまとめて行います（画面の即時チェックとサーバーで同じ）。
 *  返す script は表記を統一したもの。禁止ワードが残っていれば ok=false。 */
export function checkScript(script, brand, sources) {
  const b = brand || {}
  const s = JSON.parse(JSON.stringify(script || {}))
  const notation = []
  const fix = (v, where) => {
    const r = normalizeNotation(v, b.notation, b.notation_exceptions)
    if (r.changes.length) notation.push({ where, before: String(v), after: r.text, changes: r.changes })
    return r.text
  }
  for (const k of ['title', 'hook', 'body', 'cta']) if (s[k]) s[k] = fix(s[k], k)
  s.lines = (s.lines || []).map((l, i) => ({ ...l, narration: fix(l.narration || '', `行${i + 1}のナレーション`), telop: fix(l.telop || '', `行${i + 1}のテロップ`) }))
  const texts = [s.title, s.hook, s.body, s.cta].concat(s.lines.map((l) => l.narration), s.lines.map((l) => l.telop))
  const banned = findBanned(texts, b.banned_words)
  const own = [s.title, s.hook, s.body, s.cta].concat(s.lines.map((l) => l.narration), s.lines.map((l) => l.telop)).filter(Boolean)
  const orig = originality(own, sources)
  const speed = telopSpeed(s.lines)
  const tags = (s.hashtags || []).length > RULES.post.MAX_HASHTAGS
  return { script: s, ok: banned.length === 0, banned, notation, originality: orig, speed, tooManyTags: tags }
}

/* ---------------- 競合の数字 ---------------- */

/** 1投稿の反応率と伸びる速さ。views が 0 や不明のときは null（0 ではない）。 */
export function postMetrics(p, nowMs) {
  const views = Number(p.views)
  const inter = (Number(p.likes) || 0) + (Number(p.comments) || 0) + (Number(p.shares) || 0)
  const engagement_rate = views > 0 ? inter / views : null
  const t = Date.parse(p.published_at || '')
  const hours = isNaN(t) ? null : Math.max(1, ((nowMs == null ? Date.now() : nowMs) - t) / 3600000)
  const velocity = views > 0 && hours ? views / hours : null
  return { engagement_rate, velocity }
}

/** 並び順の割合（0〜1、同点は平均順位）。値の無いものは null のまま。 */
function rankNorm(values) {
  const idx = values.map((v, i) => [v, i]).filter((x) => x[0] != null && isFinite(x[0])).sort((a, b) => a[0] - b[0])
  const out = values.map(() => null)
  if (!idx.length) return out
  if (idx.length === 1) { out[idx[0][1]] = 1; return out }
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const r = ((i + j) / 2) / (idx.length - 1)
    for (let k = i; k <= j; k++) out[idx[k][1]] = r
    i = j + 1
  }
  return out
}

/* 総合点の配分。再生数だけで並べると「昔からある大きなアカウント」が
   上に来続けるので、伸びる速さと反応率を重くしています。値の種類が
   違うもの（再生数と割合）を足すため、生の値ではなく順位の割合を混ぜます。 */
export const SCORE_WEIGHTS = { velocity: 0.4, engagement_rate: 0.35, views: 0.25 }

export function scorePosts(posts, nowMs) {
  const rows = (posts || []).map((p) => ({ ...p, ...postMetrics(p, nowMs) }))
  const rv = rankNorm(rows.map((r) => (Number(r.views) > 0 ? Number(r.views) : null)))
  const re = rankNorm(rows.map((r) => r.engagement_rate))
  const rl = rankNorm(rows.map((r) => r.velocity))
  rows.forEach((r, i) => {
    let s = 0
    let w = 0
    if (rl[i] != null) { s += SCORE_WEIGHTS.velocity * rl[i]; w += SCORE_WEIGHTS.velocity }
    if (re[i] != null) { s += SCORE_WEIGHTS.engagement_rate * re[i]; w += SCORE_WEIGHTS.engagement_rate }
    if (rv[i] != null) { s += SCORE_WEIGHTS.views * rv[i]; w += SCORE_WEIGHTS.views }
    r.score = w ? Math.round((s / w) * 1000) / 1000 : null
  })
  rows.sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score))
  rows.forEach((r, i) => { r.rank = i + 1 })
  return rows
}

export function quantile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** 上位の投稿の長さ（中央値と、真ん中半分の幅）。3本未満なら出しません。 */
export function durationBand(scored) {
  const withDur = (scored || []).filter((p) => Number(p.duration_sec) > 0 && p.score != null)
  if (withDur.length < 3) return { ok: false, n: withDur.length, message: `長さの分かる投稿が${withDur.length}本です。3本以上でまだ判断できます（今はまだ判断できません）。` }
  const top = withDur.slice().sort((a, b) => b.score - a.score).slice(0, Math.max(3, Math.ceil(withDur.length / 3)))
  const d = top.map((p) => Number(p.duration_sec)).sort((a, b) => a - b)
  const r = (v) => Math.round(v * 10) / 10
  return { ok: true, n: top.length, median: r(quantile(d, 0.5)), q1: r(quantile(d, 0.25)), q3: r(quantile(d, 0.75)) }
}

/** キャプションの統計（行数・1行の平均と最大・1秒あたりの文字数）。 */
export function captionStats(caption, durationSec) {
  const text = String(caption || '')
  const tags = (text.match(/#[^\s#]+/g) || []).map((t) => t.slice(1))
  const body = text.replace(/#[^\s#]+/g, '').trim()
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const lens = lines.map(charLen)
  const total = lens.reduce((a, b) => a + b, 0)
  return {
    hashtags: tags,
    line_count: lines.length,
    avg_chars: lines.length ? Math.round((total / lines.length) * 10) / 10 : 0,
    max_chars: lens.length ? Math.max.apply(null, lens) : 0,
    chars_per_sec: Number(durationSec) > 0 ? Math.round((total / Number(durationSec)) * 100) / 100 : null,
  }
}

/* ---------------- 投稿文 ---------------- */

/** 本文とハッシュタグを上限に収めます。タグを守るために本文を削るのは
 *  MAX_GIVEBACK（25%）まで。それ以上削らないと入らないときは、タグを
 *  後ろから外します。本文の意味が崩れるほど削るより、タグを減らすほうが
 *  ましだからです。 */
export function fitCaption(body, hashtags, limit, maxGiveback = RULES.post.MAX_GIVEBACK) {
  const b = String(body || '').trim()
  let tags = (hashtags || []).map((t) => String(t || '').replace(/^#/, '').trim()).filter(Boolean)
  const seen = {}
  tags = tags.filter((t) => (seen[t] ? false : (seen[t] = true)))
  const join = (bb, tt) => (tt.length ? (bb ? bb + '\n\n' : '') + tt.map((t) => '#' + t).join(' ') : bb)
  const blen = charLen(b)
  const allowed = Math.floor(blen * maxGiveback)
  const dropped = []
  while (true) {
    const full = join(b, tags)
    const over = charLen(full) - limit
    if (over <= 0) return { text: full, body: b, hashtags: tags, trimmed: 0, dropped }
    if (over + 1 <= allowed && tags.length) {
      const keep = Array.from(b).slice(0, blen - over - 1).join('') + '…'
      return { text: join(keep, tags), body: keep, hashtags: tags, trimmed: over + 1, dropped }
    }
    if (!tags.length) {
      const keep = Array.from(b).slice(0, Math.max(0, limit - 1)).join('') + '…'
      return { text: keep, body: keep, hashtags: [], trimmed: blen - charLen(keep) + 1, dropped }
    }
    dropped.unshift(tags.pop())
  }
}

/* ---------------- 統計（小さい標本） ---------------- */

/** 再現できる乱数（mulberry32）。同じ種なら同じ結果になります。 */
export function rng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length

/** 平均の 95% 区間（ブートストラップ、種は固定）。 */
export function bootstrapCI(values, opts) {
  const o = opts || {}
  const v = (values || []).map(Number).filter((x) => isFinite(x))
  if (!v.length) return null
  const it = o.iterations || RULES.stats.ITERATIONS
  const r = rng(o.seed == null ? RULES.stats.BOOTSTRAP_SEED : o.seed)
  const stats = new Array(it)
  for (let k = 0; k < it; k++) {
    let s = 0
    for (let j = 0; j < v.length; j++) s += v[Math.floor(r() * v.length)]
    stats[k] = s / v.length
  }
  stats.sort((a, b) => a - b)
  return { mean: mean(v), low: quantile(stats, 0.025), high: quantile(stats, 0.975), n: v.length }
}

export const RELIABILITY_LABELS = {
  insufficient: 'まだ判断できません',
  weak: '参考程度',
  usable: '使える',
  strong: '十分',
}

export function reliability(n) {
  for (const [lim, name] of RULES.stats.BANDS) if (n < lim) return { band: name, label: RELIABILITY_LABELS[name], n }
  return { band: 'strong', label: RELIABILITY_LABELS.strong, n }
}

/** 計測の値を1つ取り出します。割合の指標は、生の数から計算し直します。 */
export const METRICS = {
  views: { label: '再生数', fmt: 'int' },
  avg_watch_sec: { label: '平均視聴秒数', fmt: 'sec' },
  retention_rate: { label: '視聴維持率', fmt: 'pct' },
  engagement_rate: { label: '反応率（いいね・コメント・シェア÷再生）', fmt: 'pct' },
  save_rate: { label: '保存率（保存÷再生）', fmt: 'pct' },
  likes: { label: 'いいね', fmt: 'int' },
  saves: { label: '保存', fmt: 'int' },
  reach: { label: 'リーチ', fmt: 'int' },
}

export function metricValue(snap, metric) {
  if (!snap) return null
  const v = Number(snap.views)
  if (metric === 'engagement_rate') return v > 0 ? ((Number(snap.likes) || 0) + (Number(snap.comments) || 0) + (Number(snap.shares) || 0)) / v : null
  if (metric === 'save_rate') return v > 0 && snap.saves != null ? Number(snap.saves) / v : null
  const x = snap[metric]
  return x == null || x === '' || !isFinite(Number(x)) ? null : Number(x)
}

/** 投稿ごとの最新の計測。 */
export function latestSnapshot(pub) {
  const s = (pub && pub.snapshots) || []
  let best = null
  for (const x of s) if (!best || String(x.captured_at) > String(best.captured_at)) best = x
  return best
}

/** PDCA の判定。紐づけた投稿の値の平均の区間が、基準値の上か下か。 */
export function pdcaVerdict(cycle, pubs) {
  const metric = cycle && cycle.target && cycle.target.metric
  const baseline = Number(cycle && cycle.target && cycle.target.baseline)
  const ids = (cycle && cycle.publication_ids) || []
  const vals = (pubs || []).filter((p) => ids.indexOf(p.id) >= 0)
    .map((p) => metricValue(latestSnapshot(p), metric)).filter((v) => v != null)
  const rel = reliability(vals.length)
  if (!metric) return { verdict: 'none', label: '目標の指標が未設定です。', reliability: rel, n: vals.length }
  if (vals.length < RULES.stats.BANDS[0][0]) {
    return { verdict: 'insufficient', label: `まだ判断できません（計測済みの投稿が${vals.length}本。3本以上必要です）`, reliability: rel, n: vals.length }
  }
  const ci = bootstrapCI(vals)
  if (!isFinite(baseline)) return { verdict: 'none', label: '基準値が未設定です。', ci, reliability: rel, n: vals.length }
  let verdict = 'unclear'
  let label = '基準値との差は、ばらつきの範囲内です（差があるとは言えません）。'
  if (ci.low > baseline) { verdict = 'improved'; label = '基準値より良くなっています。' }
  else if (ci.high < baseline) { verdict = 'worse'; label = '基準値より下がっています。' }
  return { verdict, label, ci, reliability: rel, n: vals.length, baseline }
}

/** 自社の投稿を「属性ごと」に比べます（フックの型・長さの帯・時刻・曜日）。
 *  条件（全体6本以上、比べる値ごとに3本以上、それが2種類以上）を満たさない
 *  ときは、何が足りないかだけを返します。 */
export function attributeInsight(rows, attr, metric) {
  const L = RULES.learn
  const usable = (rows || []).filter((r) => r[attr] != null && r[attr] !== '' && r.value != null)
  if (usable.length < L.MIN_POSTS) {
    return { ok: false, attr, metric, n: usable.length, message: `計測済みの投稿が${usable.length}本です。あと${L.MIN_POSTS - usable.length}本で比べ始められます。` }
  }
  const groups = {}
  for (const r of usable) (groups[r[attr]] = groups[r[attr]] || []).push(r.value)
  const keys = Object.keys(groups)
  const ok = keys.filter((k) => groups[k].length >= L.MIN_PER_VALUE)
  if (ok.length < 2) {
    const short = keys.map((k) => `${k}: ${groups[k].length}本`).join('、')
    return { ok: false, attr, metric, n: usable.length, message: `比べるには、値ごとに${L.MIN_PER_VALUE}本以上が2種類以上要ります（今は ${short || 'なし'}）。` }
  }
  const values = ok.map((k, i) => {
    const ci = bootstrapCI(groups[k], { seed: RULES.stats.BOOTSTRAP_SEED + i })
    return { value: k, n: groups[k].length, mean: ci.mean, low: ci.low, high: ci.high, reliability: reliability(groups[k].length) }
  }).sort((a, b) => b.mean - a.mean)
  // 一番上の区間が二番目の区間と重ならないときだけ「差がある」と言います。
  const clear = values.length > 1 && values[0].low > values[1].high
  return { ok: true, attr, metric, n: usable.length, values, clear, skipped: keys.filter((k) => ok.indexOf(k) < 0) }
}

export function durationBucket(sec) {
  const s = Number(sec)
  if (!(s > 0)) return null
  if (s < 15) return '15秒未満'
  if (s < 30) return '15〜30秒'
  if (s < 60) return '30〜60秒'
  return '60秒以上'
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
/** 日本時間の時台と曜日。 */
export function jstParts(iso) {
  const t = Date.parse(iso || '')
  if (isNaN(t)) return { hour: null, weekday: null }
  const d = new Date(t + 9 * 3600000)
  return { hour: `${d.getUTCHours()}時台`, weekday: WEEK[d.getUTCDay()] + '曜' }
}

/* ---------------- 絵コンテ ---------------- */

export const NO_TEXT = 'No text, no letters, no logos, no watermark.'

/** 台本の行から絵コンテのカットを作ります。カメラは単調にならないよう
 *  決まった順で回し、最初（フック）は寄り、最後（CTA）は落ち着いた画にします。 */
export function shotsFromLines(lines, style) {
  const cams = ['medium shot, slow push-in', 'close-up, handheld', 'wide shot, static', 'over-the-shoulder, static']
  const st = String(style || '').trim()
  return (lines || []).map((l, i, all) => {
    const visual = String(l.visual || l.narration || '').trim().replace(/[.。]\s*$/, '')
    const prompt = [visual, st].filter(Boolean).join(', ') + '. ' + NO_TEXT
    return {
      index: i,
      start: Number(l.start) || 0,
      end: Number(l.end) || 0,
      narration: l.narration || '',
      telop: l.telop || '',
      visual_prompt: prompt,
      camera: i === 0 ? 'close-up, static' : i === all.length - 1 ? 'medium shot, static' : cams[(i - 1) % cams.length],
      transition: i === 0 ? 'cut' : (i % 3 === 0 ? 'whip pan' : 'cut'),
    }
  })
}

/* ---------------- 書き出し ---------------- */

export function csv(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** CSV を読みます（引用符・改行入りのセルに対応）。1行目は見出し。 */
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '')
  const rows = []
  let row = []
  let cell = ''
  let q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',' || c === '\t') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const data = rows.filter((r) => r.some((x) => String(x).trim() !== ''))
  if (!data.length) return []
  const head = data[0].map((h) => String(h).trim().toLowerCase())
  return data.slice(1).map((r) => {
    const o = {}
    head.forEach((h, i) => { o[h] = r[i] == null ? '' : String(r[i]).trim() })
    return o
  })
}

function pad(n, w) { return String(n).padStart(w || 2, '0') }

export function srtTime(sec) {
  const ms = Math.max(0, Math.round(Number(sec) * 1000))
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

export function toSrt(lines) {
  return (lines || []).filter((l) => String(l.telop || '').trim()).map((l, i) =>
    `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${String(l.telop).trim()}\n`).join('\n')
}

export function timecode(sec, fps) {
  const f = Math.max(0, Math.round(Number(sec) * fps))
  const ff = f % fps
  const s = Math.floor(f / fps)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(ff)}`
}

/** CMX3600 形式の EDL。残す区間を順に並べ、録画側は詰めた時間で置きます。 */
export function toEdl(keeps, opts) {
  const o = opts || {}
  const fps = Math.round(Number(o.fps) || 30)
  const name = String(o.clip || 'clip').replace(/[\r\n]/g, ' ')
  const out = [`TITLE: ${String(o.title || 'SILENCE CUT').slice(0, 60)}`, 'FCM: NON-DROP FRAME', '']
  let rec = 0
  ;(keeps || []).forEach((k, i) => {
    const len = k.end - k.start
    out.push(`${pad(i + 1, 3)}  AX       B     C        ${timecode(k.start, fps)} ${timecode(k.end, fps)} ${timecode(rec, fps)} ${timecode(rec + len, fps)}`)
    out.push(`* FROM CLIP NAME: ${name}`)
    out.push('')
    rec += len
  })
  return out.join('\r\n')
}

/* ---------------- 音量（ITU-R BS.1770） ---------------- */

/** K特性フィルタの係数（どの標本化周波数でも同じ特性になるよう計算）。
 *  48kHz では規格書の表の値と一致します（テストで確かめています）。 */
export function kWeighting(fs) {
  // 1段目: 頭部の影響を模した高域シェルフ
  let G = 3.99984385397
  let Q = 0.7071752369554193
  let fc = 1681.9744509555319
  let K = Math.tan(Math.PI * fc / fs)
  const Vh = Math.pow(10, G / 20)
  const Vb = Math.pow(Vh, 0.4996667741545416)
  let a0 = 1 + K / Q + K * K
  const shelf = {
    b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
    a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0],
  }
  // 2段目: 低域を落とすハイパス（RLB）
  Q = 0.5003270373253953
  fc = 38.13547087613982
  K = Math.tan(Math.PI * fc / fs)
  a0 = 1 + K / Q + K * K
  const hp = { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] }
  return [shelf, hp]
}

function biquadInPlace(x, c) {
  const [b0, b1, b2] = c.b
  const [, a1, a2] = c.a
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
    x[i] = y0
  }
  return x
}

/** 統合ラウドネス（LUFS）。channels は Float32Array の配列。
 *  400ms の区間を 100ms ずつずらして測り、−70 LUFS の絶対ゲートと、
 *  そこから −10 LU の相対ゲートを通った区間だけを平均します。 */
export function integratedLoudness(channels, fs) {
  const chs = (channels || []).slice(0, 5)
  if (!chs.length || !chs[0].length) return { lufs: null, blocks: 0 }
  const filt = kWeighting(fs)
  const z = chs.map((ch) => {
    const y = Float64Array.from(ch)
    biquadInPlace(y, filt[0])
    biquadInPlace(y, filt[1])
    return y
  })
  const block = Math.round(0.4 * fs)
  const hop = Math.round(0.1 * fs)
  const n = z[0].length
  if (n < block) return { lufs: null, blocks: 0, message: '0.4秒より短い音声は測れません。' }
  // 累積和で区間ごとの二乗平均を速く求めます。
  const sums = z.map((y) => {
    const c = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) c[i + 1] = c[i] + y[i] * y[i]
    return c
  })
  const G = [1, 1, 1, 1.41, 1.41]
  const powers = []
  for (let s = 0; s + block <= n; s += hop) {
    let p = 0
    for (let c = 0; c < z.length; c++) p += G[c] * (sums[c][s + block] - sums[c][s]) / block
    powers.push(p)
  }
  const L = (p) => -0.691 + 10 * Math.log10(p)
  const abs = powers.filter((p) => p > 0 && L(p) > -70)
  if (!abs.length) return { lufs: -Infinity, blocks: 0 }
  const rel = L(mean(abs)) - 10
  const gated = abs.filter((p) => L(p) > rel)
  return { lufs: Math.round(L(mean(gated)) * 10) / 10, blocks: gated.length }
}

/** 目標（−14 LUFS）との差を、やさしい言葉で。 */
export function loudnessAdvice(lufs, target = RULES.ship.TARGET_LUFS) {
  if (lufs == null || !isFinite(lufs)) return { level: 'warn', text: '音がほとんど入っていません。音声トラックがあるか確かめてください。' }
  const d = Math.round((lufs - target) * 10) / 10
  if (Math.abs(d) <= 1) return { level: 'ok', text: `ちょうど良い音量です（目標との差 ${d >= 0 ? '+' : ''}${d} dB）。` }
  if (d < 0) return { level: 'warn', text: `少し小さめです。編集ソフトで全体を約 ${Math.abs(d)} dB 上げると、他の動画と並んでも聞き取りやすくなります（各SNSは大きすぎる音を下げますが、小さい音は上げてくれません）。` }
  return { level: 'warn', text: `大きめです。約 ${d} dB 下げると、SNS側で自動的に下げられて音が潰れるのを防げます。` }
}

/* ---------------- 無音カット ---------------- */

function bq(type, f, q, fs) {
  const w = 2 * Math.PI * f / fs
  const cs = Math.cos(w)
  const al = Math.sin(w) / (2 * q)
  const a0 = 1 + al
  const b = type === 'hp' ? [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2] : [(1 - cs) / 2, 1 - cs, (1 - cs) / 2]
  return { b: b.map((v) => v / a0), a: [1, (-2 * cs) / a0, (1 - al) / a0] }
}

/** 区切りごとに処理できる「フレーム音量」の計算機。長いファイルでも画面が
 *  固まらないよう、呼ぶ側が少しずつ push します（チャンク処理）。
 *  1フレーム 10ms ごとに、全体の音量と高域(4-8kHz)の音量を dB で残します。 */
export function frameMeter(fs, frameSec = RULES.silence.FRAME_SEC) {
  const size = Math.max(1, Math.round(fs * frameSec))
  const hp = bq('hp', 4000, Math.SQRT1_2, fs)
  const lp = fs / 2 > 8800 ? bq('lp', 8000, Math.SQRT1_2, fs) : null
  const st = [[0, 0, 0, 0], [0, 0, 0, 0]]
  const step = (c, s, x) => {
    const y = c.b[0] * x + c.b[1] * s[0] + c.b[2] * s[1] - c.a[1] * s[2] - c.a[2] * s[3]
    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y
    return y
  }
  const full = []
  const high = []
  let accF = 0, accH = 0, cnt = 0
  const db = (ms) => (ms > 1e-12 ? 10 * Math.log10(ms) : -120)
  return {
    frameSec: size / fs,
    push(samples) {
      for (let i = 0; i < samples.length; i++) {
        const x = samples[i]
        let h = step(hp, st[0], x)
        if (lp) h = step(lp, st[1], h)
        accF += x * x; accH += h * h; cnt++
        if (cnt === size) {
          full.push(db(accF / size)); high.push(db(accH / size))
          accF = 0; accH = 0; cnt = 0
        }
      }
    },
    done() {
      if (cnt) { full.push(db(accF / cnt)); high.push(db(accH / cnt)); cnt = 0 }
      return { full, high, frameSec: size / fs }
    },
  }
}

/** フレーム音量から、切る区間と残す区間を決めます。
 *  1. NOISE_FLOOR_DB 未満が続く区間を候補にする
 *  2. 候補の中で、高域がファイル自身の高域床より CONSONANT_MARGIN_DB 以上
 *     大きいところは「し」「つ」などの無声子音なので残す
 *  3. 残った無音のうち MIN_GAP_SEC 以上のものだけを、前後に HANDLE_SEC
 *     ずつ余白を残して切る */
export function silenceCuts(meter, durationSec, opts) {
  const R = { ...RULES.silence, ...(opts || {}) }
  const { full, high, frameSec } = meter
  const n = full.length
  const total = durationSec == null ? n * frameSec : durationSec
  const sortedHigh = high.slice().sort((a, b) => a - b)
  const floor = sortedHigh.length ? quantile(sortedHigh, 0.1) : -120
  /* 子音とみなすのは、高域が床より CONSONANT_MARGIN_DB 以上大きく、それが
     20ms 以上続くところ。1フレームだけ飛び出すのは、音が途切れた瞬間の
     フィルタの余韻で、声ではありません。完全な無音（デジタルの0）の
     ファイルでは床が −120dB になり、どんな余韻も「子音」に見えてしまうので、
     −70dBFS より小さい高域は数えません（人の耳にも聞こえない大きさです）。 */
  const ABS_MIN_DB = -70
  const voiced = full.map((f) => f >= R.NOISE_FLOOR_DB)
  const raw = high.map((h, i) => !voiced[i] && h >= floor + R.CONSONANT_MARGIN_DB && h >= ABS_MIN_DB)
  const consonant = raw.map((c, i) => c && (raw[i - 1] || raw[i + 1]))
  // 子音のフレームは前後 HANDLE ぶん「音あり」に広げます（語頭・語尾を守る）。
  const pad = Math.round(R.HANDLE_SEC / frameSec)
  const keepCons = new Array(n).fill(false)
  for (let i = 0; i < n; i++) {
    if (!voiced[i] && consonant[i]) for (let k = Math.max(0, i - pad); k <= Math.min(n - 1, i + pad); k++) keepCons[k] = true
  }
  const silent = full.map((f, i) => f < R.NOISE_FLOOR_DB && !keepCons[i])
  const cuts = []
  let consonantKept = 0
  let i = 0
  while (i < n) {
    if (!silent[i]) { i++; continue }
    let j = i
    while (j + 1 < n && silent[j + 1]) j++
    const s = i * frameSec
    const e = Math.min(total, (j + 1) * frameSec)
    if (e - s >= R.MIN_GAP_SEC) {
      const cs = i === 0 ? 0 : s + R.HANDLE_SEC
      const ce = j === n - 1 ? total : e - R.HANDLE_SEC
      if (ce - cs > 0.001) cuts.push({ start: round3(cs), end: round3(ce) })
    }
    i = j + 1
  }
  for (let k = 0; k < n; k++) if (keepCons[k] && !voiced[k] && (k === 0 || !keepCons[k - 1])) consonantKept++
  const keeps = []
  let t = 0
  for (const c of cuts) {
    if (c.start > t) keeps.push({ start: round3(t), end: c.start })
    t = c.end
  }
  if (total - t > 0.001) keeps.push({ start: round3(t), end: round3(total) })
  const saved = cuts.reduce((a, c) => a + (c.end - c.start), 0)
  return { cuts, keeps, saved: round3(saved), total: round3(total), highFloorDb: Math.round(floor * 10) / 10, consonantKept }
}

function round3(v) { return Math.round(v * 1000) / 1000 }

/* ---------------- 出荷前チェック（形） ---------------- */

/** 長さと縦横比から、投稿先ごとに出せるかを判定します。 */
export function shipChecks(meta) {
  const out = []
  const w = Number(meta.width), h = Number(meta.height), d = Number(meta.duration)
  if (w && h) {
    const r = w / h
    const ok = Math.abs(r - 9 / 16) < 0.02
    out.push({ key: 'aspect', ok, text: ok ? `縦長 9:16 です（${w}×${h}）。` : `縦横比が 9:16 ではありません（${w}×${h}）。上下や左右に黒い帯が付くか、切り取られます。` })
    if (ok && h < 1280) out.push({ key: 'res', ok: false, text: `解像度が低めです（${w}×${h}）。1080×1920 で書き出すときれいに見えます。` })
  }
  if (d > 0) {
    for (const id of Object.keys(PLATFORMS)) {
      const p = PLATFORMS[id]
      const ok = d >= p.minSec && d <= p.maxSec
      out.push({ key: id, ok, text: `${p.label}: ${ok ? '長さは範囲内です' : `${p.minSec}〜${p.maxSec}秒の範囲外です`}（${Math.round(d * 10) / 10}秒）` })
    }
  }
  return out
}

/* ---------------- zip（移行ファイル） ---------------- */

let CRC_TABLE = null
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** zip の目次（中央ディレクトリ）を読みます。中身の展開は readZip で。 */
export function zipEntries(bytes) {
  const b = bytes
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip ファイルではないようです（終わりの印が見つかりません）。')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  if (p === 0xffffffff || count === 0xffff) throw new Error('この zip は大きすぎる形式（ZIP64）です。動画を同梱しない形で書き出してください。')
  const dec = new TextDecoder('utf-8')
  const out = []
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip の目次が壊れています。')
    const flags = dv.getUint16(p + 8, true)
    const method = dv.getUint16(p + 10, true)
    const crc = dv.getUint32(p + 16, true)
    const compSize = dv.getUint32(p + 20, true)
    const size = dv.getUint32(p + 24, true)
    const nl = dv.getUint16(p + 28, true)
    const el = dv.getUint16(p + 30, true)
    const cl = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl))
    if (dv.getUint32(local, true) !== 0x04034b50) throw new Error(`zip の中の ${name} が読めません。`)
    const lnl = dv.getUint16(local + 26, true)
    const lel = dv.getUint16(local + 28, true)
    out.push({ name, method, flags, crc, compSize, size, dataStart: local + 30 + lnl + lel })
    p += 46 + nl + el + cl
  }
  return out
}

async function inflateRaw(data) {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** zip を展開して { 名前: Uint8Array } を返します。only に名前の条件を渡すと
 *  それだけを展開します（動画を同梱した大きな zip でも JSON だけ読むため）。 */
export async function readZip(bytes, only) {
  const files = {}
  for (const e of zipEntries(bytes)) {
    if (e.name.endsWith('/')) continue
    if (only && !only(e.name)) continue
    if (e.flags & 1) throw new Error('パスワード付きの zip は読めません。')
    const raw = bytes.subarray(e.dataStart, e.dataStart + e.compSize)
    let data
    if (e.method === 0) data = raw.slice()
    else if (e.method === 8) data = await inflateRaw(raw)
    else throw new Error(`${e.name} の圧縮方式（${e.method}）には対応していません。`)
    if (crc32(data) !== e.crc) throw new Error(`${e.name} の中身が壊れています（検査値が一致しません）。`)
    files[e.name] = data
  }
  return files
}

/* ---------------- snsauto からの移行 ---------------- */

export const SNSAUTO_TABLES = ['projects', 'social_accounts', 'research_runs', 'competitor_posts', 'structure_analyses',
  'scripts', 'storyboards', 'shots', 'publications', 'metric_snapshots', 'pdca_cycles']

/** zip の中身（manifest.json と data/*.json）を表ごとの行に。 */
export function snsautoTables(files) {
  const dec = new TextDecoder('utf-8')
  const read = (n) => (files[n] ? JSON.parse(dec.decode(files[n])) : null)
  const manifest = read('manifest.json')
  if (!manifest || manifest.format !== 'snsauto-migration') throw new Error('snsauto の移行ファイルではありません（manifest.json の形式が違います）。')
  if (Number(manifest.format_version) !== 1) throw new Error(`この移行ファイルの版（${manifest.format_version}）には対応していません。対応しているのは版 1 です。`)
  const tables = {}
  for (const t of SNSAUTO_TABLES) {
    const rows = read(`data/${t}.json`)
    tables[t] = Array.isArray(rows) ? rows : []
  }
  return { manifest, tables }
}

const str = (v, n) => (v == null ? '' : String(v)).slice(0, n || 2000)
const num = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v))

/** snsauto の表を、この管理画面の形に変えます。id は「元の表名と番号」から
 *  決まった形で作るので、同じファイルを2回取り込んでも重複せず上書きになります。
 *  連携アカウントはトークンを持ってこない（持ち出されていない）ので、
 *  「再連携が必要」として入れます。 */
export function mapSnsauto(tables) {
  const T = tables || {}
  const id = (t, v) => `sa-${t}-${v}`
  const runProject = {}
  for (const r of T.research_runs || []) runProject[r.id] = r.project_id
  const analysisByPost = {}
  for (const a of T.structure_analyses || []) analysisByPost[a.post_id] = a
  const shotsByBoard = {}
  for (const s of T.shots || []) (shotsByBoard[s.storyboard_id] = shotsByBoard[s.storyboard_id] || []).push(s)
  const boardsByScript = {}
  for (const b of T.storyboards || []) (boardsByScript[b.script_id] = boardsByScript[b.script_id] || []).push(b)
  const snapsByPub = {}
  for (const m of T.metric_snapshots || []) (snapsByPub[m.publication_id] = snapsByPub[m.publication_id] || []).push(m)

  const projects = (T.projects || []).map((p) => {
    const bp = p.brand_profile || {}
    const pid = id('project', p.id)
    const research = (T.research_runs || []).filter((r) => r.project_id === p.id)
    return {
      project: {
        id: pid,
        name: str(p.name, 80) || '取り込んだプロジェクト',
        description: str(p.description, 500),
        brand: {
          persona: str(bp.persona, 300), tone: str(bp.tone, 300),
          banned_words: (bp.banned_words || []).map((w) => str(w, 60)).filter(Boolean),
          notation: Object.fromEntries(Object.entries(bp.notation || {}).map(([k, v]) => [str(k, 60), str(v, 60)])),
          notation_exceptions: (bp.notation_exceptions || []).map((w) => str(w, 60)).filter(Boolean),
        },
        research: research.map((r) => ({ keyword: str(r.keyword, 100), platform: str(r.platform, 20), at: r.created_at })),
        imported_from: 'snsauto',
        created_at: p.created_at,
      },
      posts: (T.competitor_posts || []).filter((c) => runProject[c.run_id] === p.id).map((c) => {
        const a = analysisByPost[c.id]
        return {
          id: id('post', c.id), platform: str(c.platform, 20) || 'instagram', url: str(c.url, 500), title: str(c.title, 300),
          caption: str(c.caption, 2200), author: str(c.author, 100), published_at: c.published_at || '',
          duration_sec: num(c.duration_sec), views: num(c.views), likes: num(c.likes), comments: num(c.comments), shares: num(c.shares),
          source: 'snsauto',
          analysis: a ? {
            hook_text: str(a.hook_text, 300), hook_type: HOOK_TYPES.indexOf(a.hook_type) >= 0 ? a.hook_type : 'other',
            beats: (a.beats || []).map((x) => ({ label: str(x.label, 20), start: num(x.start), end: num(x.end), purpose: str(x.purpose, 300), text: str(x.text, 300) })),
            caption: (a.telop && a.telop.caption) || null,
            hashtags: (a.telop && a.telop.hashtags) || [],
            onscreen_note: '画面内テロップは動画ファイルが無いので未測定',
          } : null,
        }
      }),
      scripts: (T.scripts || []).filter((s) => s.project_id === p.id).map((s) => {
        const board = (boardsByScript[s.id] || [])[0]
        const shots = board ? (shotsByBoard[board.id] || []).slice().sort((x, y) => x.index - y.index) : []
        return {
          id: id('script', s.id), title: str(s.title, 200), platform: str(s.platform, 20), target_duration_sec: num(s.target_duration_sec),
          hook: str(s.hook, 300), body: str(s.body, 2000), cta: str(s.cta, 300),
          lines: (s.lines || []).map((l) => ({ start: num(l.start) || 0, end: num(l.end) || 0, narration: str(l.narration, 300), telop: str(l.telop, 120), visual: str(l.visual, 300) })),
          hashtags: (s.hashtags || []).map((t) => str(t, 60)),
          rationale: str(s.rationale, 1000),
          style: board ? str(board.style, 300) : '',
          shots: shots.map((x) => ({ index: x.index, start: num(x.start) || 0, end: num(x.end) || 0, narration: str(x.narration, 300), telop: str(x.telop, 120), visual_prompt: str(x.visual_prompt, 600), camera: str(x.camera, 80), transition: str(x.transition, 40) })),
          created_at: s.created_at,
        }
      }),
      pubs: (T.publications || []).filter((u) => u.project_id === p.id).map((u) => ({
        id: id('pub', u.id), platform: str(u.platform, 20), status: str(u.status, 20) || 'draft',
        script_id: u.script_id != null ? id('script', u.script_id) : '', caption: str(u.caption, 2200),
        hashtags: (u.hashtags || []).map((t) => str(t, 60)), scheduled_for: u.scheduled_for || '', published_at: u.published_at || '',
        external_id: str(u.external_id, 100), external_url: str(u.external_url, 500), error: str(u.error, 300),
        snapshots: (snapsByPub[u.id] || []).map((m) => ({
          captured_at: m.captured_at, views: num(m.views), likes: num(m.likes), comments: num(m.comments), shares: num(m.shares),
          saves: num(m.saves), avg_watch_sec: num(m.avg_watch_sec), retention_rate: num(m.retention_rate), skip_rate: num(m.skip_rate), reach: num(m.reach), source: 'snsauto',
        })),
      })),
      pdca: (T.pdca_cycles || []).filter((c) => c.project_id === p.id).map((c) => ({
        id: id('pdca', c.id), title: str(c.title, 200), stage: ['plan', 'do', 'check', 'act'].indexOf(c.stage) >= 0 ? c.stage : 'plan',
        hypothesis: str(c.hypothesis, 1000),
        target: { metric: str(c.target && c.target.metric, 40), target: num(c.target && c.target.target), baseline: num(c.target && c.target.baseline) },
        publication_ids: (c.publication_ids || []).map((x) => id('pub', x)),
        learnings: str(c.learnings, 2000), next_actions: (c.next_actions || []).map((x) => str(typeof x === 'string' ? x : JSON.stringify(x), 300)),
        created_at: c.created_at,
      })),
    }
  })
  const accounts = (T.social_accounts || []).map((a) => ({
    id: id('account', a.id), platform: str(a.platform, 20), username: str(a.username, 100), display_name: str(a.display_name, 100),
    status: 'relink', status_label: '再連携が必要', project_id: a.project_id != null ? id('project', a.project_id) : '',
  }))
  return { projects, accounts }
}

/** 取り込み前の件数（画面の確認用）。 */
export function snsautoCounts(tables) {
  const T = tables || {}
  const out = {}
  for (const t of SNSAUTO_TABLES) out[t] = (T[t] || []).length
  return out
}
