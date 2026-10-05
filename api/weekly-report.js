export const config = { runtime: 'edge' }

// 毎週月曜の朝に、先週のアクセスのまとめをメールで送ります。
//
// 管理画面は、開かなければ何も伝えません。忙しい時期ほど開かれず、
// 「問い合わせが急に減っていた」に気づくのが1か月後、が起こります。
// 数字の読み方に慣れていない人でも読めるよう、表やグラフではなく、
// 文章で「先週はこうでした、前の週と比べてこうです」を届けます。
//
// 呼び方は3つあります。
//   GET  Authorization: Bearer <CRON_SECRET>  … Vercel の定期実行（vercel.json の crons）
//   GET  Authorization: Bearer <ADMIN_KEY>    … 管理画面: いまの設定と、最後に送った結果
//   POST Authorization: Bearer <ADMIN_KEY>    … 管理画面: { action: 'test' } 今すぐテスト送信
//                                               { action: 'toggle', on } 毎週の送信を止める／再開
//
// CRON_SECRET が無いときは、定期実行からの呼び出しを断ります。合言葉なしで
// 受け付けると、このURLを知った誰でも、好きなだけメールを送らせられるからです。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig, storeFor, pipeline, jstDate, K } from './_analytics-store.js'
import { buildReport } from './_analytics-report.js'
import { REF_KINDS, refKind, SOURCES } from './_referrers.js'
import { setting } from './_settings.js'
import { BRAND, KV } from './_brand.js'
import { recentPosts, NETWORKS } from './_social.js'
import { socialInsights, jstDay } from './_social-insights.js'
import { listScheduled } from './_social-queue.js'
import { listApprovals } from './_social-approve.js'

const enc = new TextEncoder()
const TEST_PER_DAY = 5

/** 長さも中身も、時間の差から漏れないように比べます。 */
async function same(a, b) {
  const h = async (v) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(v))))
  const [x, y] = await Promise.all([h(a), h(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

const bearer = (req) => {
  const a = req.headers.get('authorization') || ''
  return a.startsWith('Bearer ') ? a.slice(7).trim() : ''
}

export async function GET(req) {
  const secret = (process.env.CRON_SECRET || '').trim()
  const given = bearer(req)
  if (secret && given && (await same(given, secret))) return weekly()

  // Vercel の定期実行は User-Agent に vercel-cron と名乗ります。合言葉が
  // 設定されていなければ、Vercel は Authorization を付けてきません。
  if (/vercel-cron/i.test(req.headers.get('user-agent') || '')) {
    return json({
      ok: false, code: secret ? 'UNAUTHORIZED' : 'CRON_SECRET_MISSING',
      message: secret
        ? '合言葉が一致しません。'
        : 'CRON_SECRET が未設定のため、定期実行からの呼び出しを受け付けていません。',
    }, 401)
  }

  const denied = await requireAdmin(req)
  if (denied) return denied
  return json({ ok: true, ...(await status(req)) })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body = {}
  try { body = await req.json() } catch (_) {}
  const cfg = await storeFor(req)

  if (body.action === 'toggle') {
    if (!cfg) return json({ ok: false, code: 'STORE_NOT_CONFIGURED', message: '保存先（Upstash Redis）が未接続のため、切り替えを覚えておけません。' }, 503)
    await pipeline(cfg, body.on ? [['DEL', K.weeklyOff]] : [['SET', K.weeklyOff, '1']])
    return json({ ok: true, ...(await status(req)) })
  }

  if (body.action === 'test') {
    if (!cfg) return json({ ok: false, code: 'STORE_NOT_CONFIGURED', message: 'アクセス解析の保存先が未接続のため、まとめる数字がありません。' }, 503)
    // 押しすぎてメールの送信枠を使い切らないように。
    const key = `${KV}wr:test:${jstDate()}`
    const [n] = await pipeline(cfg, [['INCR', key], ['EXPIRE', key, 2 * 86400, 'NX']])
    if (Number(n) > TEST_PER_DAY) {
      return json({ ok: false, code: 'DAILY_LIMIT', message: `テスト送信は1日${TEST_PER_DAY}回までです。明日また試せます。` }, 429)
    }
    const out = await send(cfg, req, { test: true })
    return json({ ...out, ...(await status(req)) }, out.ok ? 200 : (out.status || 502))
  }

  return json({ ok: false, code: 'BAD_REQUEST', message: '操作が指定されていません。' }, 400)
}

/** 定期実行の本体。止めてあれば何もせず、同じ週に二度は送りません。 */
async function weekly() {
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, code: 'STORE_NOT_CONFIGURED', message: '保存先が未接続です。' }, 503)
  const [off] = await pipeline(cfg, [['GET', K.weeklyOff]])
  if (off === '1') return json({ ok: true, skipped: 'off' })
  // 再実行やリトライで同じ週のまとめが二通届かないように。
  const [first] = await pipeline(cfg, [['SET', K.weeklySent(jstDate()), '1', 'NX', 'EX', 6 * 86400]])
  if (first !== 'OK') return json({ ok: true, skipped: 'already-sent' })
  const out = await send(cfg, null, { test: false })
  return json(out, out.ok ? 200 : (out.status || 502))
}

async function status(req) {
  const cfg = await storeFor(req)
  const key = await setting('RESEND_API_KEY', '', req)
  const to = await setting('CONTACT_TO_EMAIL', BRAND.owner, req)
  let off = null, last = null
  if (cfg) {
    try {
      const [o, l] = await pipeline(cfg, [['GET', K.weeklyOff], ['GET', K.weeklyLast]])
      off = o === '1'
      try { last = l ? JSON.parse(l) : null } catch (_) { last = null }
    } catch (_) { /* the status is still useful without these */ }
  }
  return {
    configured: { resend: !!key, store: !!storeConfig(), cron: !!(process.env.CRON_SECRET || '').trim() },
    enabled: off === null ? null : !off,
    to,
    schedule: '毎週月曜 9:00（日本時間）',
    last,
  }
}

async function send(cfg, req, { test }) {
  const key = await setting('RESEND_API_KEY', '', req || undefined)
  if (!key) return { ok: false, status: 503, code: 'RESEND_NOT_CONFIGURED', message: 'RESEND_API_KEY が未設定のため、メールを送れません。' }
  const to = await setting('CONTACT_TO_EMAIL', BRAND.owner, req || undefined)
  let rep
  try {
    rep = await buildReport(cfg, { days: 7, endOffset: 1 })
  } catch (_) {
    return { ok: false, status: 502, code: 'STORE_ERROR', message: 'アクセス解析データを読み込めませんでした。' }
  }
  // SNS（文章）の一節。読めなくてもメールは送ります（その節を省くだけ）。
  let sns = null
  try { sns = await snsSummary(rep.range) } catch (_) { sns = null }
  // 自動改善の一節。読めなくてもメールは送ります。
  let auto = null
  try { const a = await import('./_auto-run.js'); auto = a.weeklyAutoLines(await a.weeklyAuto(cfg, pipeline)) } catch (_) { auto = null }
  const { subject, text } = compose(rep, { test, sns, auto })
  let res
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: BRAND.from, to: [to], subject, text }),
    })
  } catch (_) {
    res = null
  }
  const ok = !!(res && res.ok)
  const last = {
    at: new Date().toISOString(), ok, test: !!test, to,
    message: ok ? '送信しました。' : `送信できませんでした（${res ? 'Resend が ' + res.status + ' を返しました' : '通信エラー'}）。`,
  }
  try { await pipeline(cfg, [['SET', K.weeklyLast, JSON.stringify(last)]]) } catch (_) {}
  return ok ? { ok: true, message: `${to} に送信しました。`, preview: text } : { ok: false, status: 502, code: 'SEND_FAILED', message: last.message }
}

/* ---- SNS（文章）の一節 ----
   先週（rep.range の7日）に出した投稿の数、サイトにいちばん人を連れてきた
   投稿（投稿ごとの成果＝計測リンクから7日間の訪問）、承認待ちと予約の数。 */
export async function snsSummary(range) {
  const all = await recentPosts(200)
  const posts = all.filter((p) => {
    if (!p || !p.at || !(p.results || []).some((r) => r.ok)) return false
    const d = jstDay(p.at)
    return d >= range.from && d <= range.to
  })
  const byNet = {}
  for (const p of posts) for (const r of p.results || []) if (r.ok) byNet[r.net] = (byNet[r.net] || 0) + 1
  let top = null
  if (posts.length) {
    const ins = await socialInsights(posts)
    for (const p of posts) {
      const res = (ins.results || {})[p.id || p.at] || {}
      const visits = Object.values(res).reduce((a, x) => a + (Number(x && x.visits) || 0), 0)
      const inquiries = Object.values(res).reduce((a, x) => a + (Number(x && x.inquiries) || 0), 0)
      if (visits > 0 && (!top || visits > top.visits)) top = { text: String(p.text || ''), at: p.at, visits, inquiries, nets: Object.keys(res).filter((k) => Number(res[k] && res[k].visits) > 0) }
    }
  }
  const approvals = await listApprovals()
  return {
    posts: posts.length, byNet, top,
    scheduled: (await listScheduled()).length,
    pending: approvals.filter((a) => a.status === 'pending' && !a.expired).length,
    approved: approvals.filter((a) => a.status === 'approved').length,
    returned: approvals.filter((a) => a.status === 'returned').length,
  }
}

const netLabel = (id) => { const n = NETWORKS.find((x) => x.id === id); return n ? n.label : id }

/** メールの「■ SNS」の行。 */
export function snsLines(s) {
  const lines = ['■ SNS（この管理画面から出した投稿）']
  if (!s.posts) lines.push('先週は、この管理画面からの投稿はありませんでした。')
  else {
    const nets = Object.entries(s.byNet).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${netLabel(k)} ${v}`).join('・')
    lines.push(`・投稿: ${num(s.posts)}件（${nets}）`)
    if (s.top) {
      const t = s.top.text.replace(/\s+/g, ' ').trim()
      lines.push(`・いちばんサイトに人を連れてきた投稿: 「${t.length > 40 ? t.slice(0, 39) + '…' : t}」（${md(jstDay(s.top.at))}、${s.top.nets.map(netLabel).join('・')}）— サイトへの訪問 ${num(s.top.visits)}回${s.top.inquiries ? `、問い合わせ ${num(s.top.inquiries)}件` : ''}`)
    } else {
      lines.push('・計測用の印つきリンクから、サイトに来た人はまだいません（自社サイトへのリンクを付けると数えられます）。')
    }
  }
  const waits = []
  if (s.pending) waits.push(`承認待ち ${num(s.pending)}件`)
  if (s.approved) waits.push(`承認済みで未投稿 ${num(s.approved)}件`)
  if (s.returned) waits.push(`差し戻し ${num(s.returned)}件`)
  lines.push(`・予約中: ${num(s.scheduled)}件${waits.length ? '　' + waits.join('・') : ''}`)
  return lines
}

/* ---- 文面 ---- */

const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const num = (v) => Number(v || 0).toLocaleString('ja-JP')

/** 「前の週より 12% 増」。前の週が少なすぎるときは、割合を出しません——
 *  2件が3件になっただけで「50% 増」と書くと、大きな変化に読めてしまいます。 */
export function changeText(cur, prev, unit = '') {
  if (prev === null || prev === undefined) return ''
  if (prev < 10) return `（前の週 ${num(prev)}${unit}）`
  const p = Math.round(((cur - prev) / prev) * 100)
  if (p === 0) return '（前の週と同じ）'
  return `（前の週より ${Math.abs(p)}% ${p > 0 ? '増' : '減'}）`
}

/** 流入元の名前を、読める言葉に。 */
export function sourceLabel(name) {
  if (!name || name === 'direct') return '直接・不明（ブックマーク、QR、アプリ内のリンクなど）'
  if (name === 'other') return 'そのほか'
  if (name.startsWith('src:')) {
    const s = SOURCES[name.slice(4)]
    return `${s ? s[0] : name.slice(4)}（計測用リンク）`
  }
  const kind = REF_KINDS.find((k) => k.key === refKind(name))
  return `${name}（${kind ? kind.label : '他のサイトから'}）`
}

function secs(ms) {
  if (ms === null || ms === undefined) return '—'
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}分${s % 60}秒` : `${s}秒`
}

/** いちばん大きく動いた数字から、ひとことだけ。 */
export function advice(rep) {
  const c = rep.summary.cur, p = rep.summary.prev
  if (c.visits < 10 && c.views < 30) {
    return 'まだ訪問が少ないため、増えた・減ったよりも、まず見てもらう機会を増やすのが先です。SNSのプロフィールやGoogleビジネスプロフィールに、サイトへのリンクを載せましょう。'
  }
  const topSrc = (rep.topReferrers[0] || {}).name
  const topConv = (rep.convSources.find((s) => s.submits > 0) || {}).name
  const moves = [
    { key: 'submits', cur: c.submits, prev: p.submits, min: 3 },
    { key: 'visits', cur: c.visits, prev: p.visits, min: 10 },
    { key: 'views', cur: c.views, prev: p.views, min: 10 },
  ]
    .filter((m) => m.prev >= m.min)
    .map((m) => ({ ...m, pct: (m.cur - m.prev) / m.prev }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  const big = moves[0]
  if (big && Math.abs(big.pct) >= 0.15) {
    const n = Math.round(Math.abs(big.pct) * 100)
    if (big.key === 'submits') {
      return big.pct > 0
        ? `問い合わせが前の週より ${n}% 増えました。${topConv ? `${sourceLabel(topConv)}から来た人の問い合わせが多かったので、そこでの発信を続けましょう。` : 'いまの発信を続けましょう。'}`
        : `問い合わせが前の週より ${n}% 減りました。訪問の数が保たれているなら、問い合わせ欄までの道のり（ボタンの位置や文言）を見直す合図です。`
    }
    const what = big.key === 'visits' ? '訪問' : '閲覧'
    return big.pct > 0
      ? `${what}が前の週より ${n}% 増えました。いちばん多かった流入元は ${sourceLabel(topSrc)} です。増えた理由になった投稿や掲載があれば、同じことをもう一度試す価値があります。`
      : `${what}が前の週より ${n}% 減りました。お知らせやSNSの更新が止まっていないか、検索での見え方が変わっていないかを確認してみてください。`
  }
  if (c.bounceRate !== null && c.visits >= 20 && c.bounceRate >= 0.7) {
    const land = (rep.landings[0] || {}).name || '/'
    return `最初のページだけで帰る人が ${Math.round(c.bounceRate * 100)}% います。いちばん多い入口「${land}」の最初の画面に、次に見てほしいページへのボタンがあるか確認してみてください。`
  }
  return '大きな変化はありませんでした。いまのペースで発信を続けましょう。'
}

export function compose(rep, { test, sns, auto } = {}) {
  const c = rep.summary.cur, p = rep.summary.prev
  const span = `${md(rep.range.from)}〜${md(rep.range.to)}`
  const subject = `${test ? '【テスト送信】' : ''}【${BRAND.name}】先週のアクセスのまとめ（${span}）`
  const lines = []
  lines.push(`${BRAND.name} のサイトの、先週（${span}）のまとめです。カッコ内は、その前の週（${md(rep.previous.from)}〜${md(rep.previous.to)}）との比較です。`)
  lines.push('')
  lines.push('■ 数字')
  lines.push(`・閲覧数（ページが開かれた回数）: ${num(c.views)}回 ${changeText(c.views, p.views, '回')}`)
  lines.push(`・訪問者（日ごとの人数の合計）: ${num(c.visitorDays)}人 ${changeText(c.visitorDays, p.visitorDays, '人')}`)
  lines.push(`・訪問数（サイトに来た回数）: ${num(c.visits)}回 ${changeText(c.visits, p.visits, '回')}`)
  lines.push(`・問い合わせ（フォームの送信・予約）: ${num(c.submits)}件 ${changeText(c.submits, p.submits, '件')}`)
  if (c.bounceRate !== null) lines.push(`・直帰率（1ページだけ見てすぐ帰った訪問の割合）: ${Math.round(c.bounceRate * 100)}%`)
  if (c.avgTimeMs !== null) lines.push(`・1ページあたりの平均滞在: ${secs(c.avgTimeMs)}`)
  lines.push('')
  lines.push('■ どこから来たか（多い順に3つ）')
  const refs = rep.topReferrers.slice(0, 3)
  if (refs.length) refs.forEach((r, i) => lines.push(`${i + 1}. ${sourceLabel(r.name)}: ${num(r.count)}回`))
  else lines.push('まだ記録がありません。')
  lines.push('')
  lines.push('■ よく見られたページ（多い順に3つ）')
  const pages = rep.topPaths.slice(0, 3)
  if (pages.length) pages.forEach((r, i) => lines.push(`${i + 1}. ${BRAND.url}${r.name === '/' ? '/' : r.name}: ${num(r.count)}回`))
  else lines.push('まだ記録がありません。')
  lines.push('')
  lines.push('■ 問い合わせにつながった流入元')
  const conv = rep.convSources.filter((s) => s.submits > 0).slice(0, 5)
  if (conv.length) conv.forEach((s) => lines.push(`・${sourceLabel(s.name)}: ${num(s.submits)}件`))
  else lines.push('先週は、フォームからの問い合わせ・予約はありませんでした。')
  const calls = rep.convSources.reduce((a, s) => a + s.contacts, 0)
  if (calls) lines.push(`（ほかに、電話・LINE・メールのボタンが ${num(calls)}回 押されています）`)
  lines.push('')
  if (sns) {
    lines.push(...snsLines(sns))
    lines.push('')
  }
  if (auto && auto.length) {
    lines.push(...auto)
    lines.push('')
  }
  lines.push('■ ひとこと')
  lines.push(advice(rep))
  lines.push('')
  lines.push('—')
  lines.push('数字について: Cookie を使わずに数えています。人数は日ごとに数えるため、同じ人が2日来れば2人です。広告ブロッカーを使っている方の一部は数えられません。')
  lines.push(`詳しい数字: ${BRAND.url}/admin-members.html（アクセス解析）`)
  lines.push('このメールを止めるには、管理画面の「アクセス解析」にある「週次メール」から切り替えてください。')
  return { subject, text: lines.join('\n') }
}
