// SNS（文章）の「要対応」。管理画面のタブの横の数と、画面の上の帯に使います。
// ホームの「今日やること」（public/admin-portal.js の socialRows）と同じ決まりで数えます。
//
//   failed   … ここ7日で、どこかのSNSに送れなかった投稿（あとで「送り直し」したものは除く）
//   unknown  … ここ7日で、結果が分からないSNSがある投稿（先に各SNSで確かめる）
//   approved … 承認されたのに、まだ出していない
//   returned … 差し戻された（直して、もう一度お願いする）
//   today    … 今日の予約で、送る時刻を過ぎてもまだ残っているもの（または送れない設定のもの）
//
// 1件の投稿は1つにしか数えません（失敗と結果不明の両方があれば「失敗」）。
// このファイルは import を持たず、テストからそのまま読みます。

const DAY = 86400000
const JST = 9 * 3600000

export function jstDay(ms) {
  return new Date(ms + JST).toISOString().slice(0, 10)
}

export function socialAttention(src, now = Date.now()) {
  const s = src || {}
  const out = { total: 0, failed: 0, unknown: 0, approved: 0, returned: 0, today: 0 }
  const since = now - 7 * DAY
  const recent = Array.isArray(s.recent) ? s.recent : []
  // 送り直しで出し直した投稿（retryOf が指す元の投稿）は、もう要対応ではありません。
  const retried = new Set(recent.map((p) => p && p.retryOf).filter(Boolean))
  for (const p of recent) {
    if (!p || !(Date.parse(p.at) >= since) || retried.has(p.id)) continue
    const rs = Array.isArray(p.results) ? p.results : []
    if (rs.some((r) => r && !r.ok && !r.unknown)) out.failed++
    else if (rs.some((r) => r && r.unknown)) out.unknown++
  }
  for (const a of Array.isArray(s.approvals) ? s.approvals : []) {
    if (!a || a.expired) continue
    if (a.status === 'approved' && !a.scheduledId) out.approved++
    if (a.status === 'returned') out.returned++
  }
  const today = jstDay(now)
  const hour = Number(s.jstHour) || 9
  const nowH = new Date(now + JST).getUTCHours()
  const todays = (Array.isArray(s.items) ? s.items : []).filter((i) => i && i.date === today).length
  if (todays && (s.ready === false || nowH > hour)) out.today = todays
  out.total = out.failed + out.unknown + out.approved + out.returned + out.today
  return out
}

/** 内訳の文（タブの数の読み上げ・説明用）。 */
export function socialParts(a) {
  const x = a || {}
  return [
    x.failed ? `送れなかった投稿 ${x.failed}件` : '',
    x.unknown ? `結果が分からない投稿 ${x.unknown}件` : '',
    x.approved ? `承認済みでまだ出していない ${x.approved}件` : '',
    x.returned ? `差し戻し ${x.returned}件` : '',
    x.today ? `今日の予約が残っている ${x.today}件` : '',
  ].filter(Boolean)
}

/** 送り直す先: 失敗したSNSだけ（結果が分からないものは、二重に出さないよう含めません）。 */
export function retryTargets(entry) {
  const rs = entry && Array.isArray(entry.results) ? entry.results : []
  return [...new Set(rs.filter((r) => r && !r.ok && !r.unknown && r.net).map((r) => r.net))]
}

/** 記録に残す投稿の中身（送り直し・「もう一度使う」用）。大きすぎるときは SNS ごとの本文を外します。 */
export function payloadForLog(payload) {
  const p = payload || {}
  const out = {
    text: String(p.text || '').slice(0, 5000), link: p.link || '', campaign: p.campaign || '',
    images: (p.images || []).map((i) => ({ url: i.url, preview: i.preview || '', alt: i.alt || '' })),
    targets: Array.isArray(p.targets) ? p.targets.slice() : [],
    variants: p.variants || {}, gbp: p.gbp || null,
  }
  if (p.firstComment) out.firstComment = String(p.firstComment).slice(0, 2200)
  if (p.thread) out.thread = p.thread
  if (JSON.stringify(out).length > 20000) out.variants = {}
  return out
}
