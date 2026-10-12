// アクセス解析の「要対応」。タブの横の数と、画面の上の帯に使います。
//
//   notFound … 前回「確認しました」を押したあとに、新しく見つからなかったURL（404）
//   formFail … 前回「確認しました」を押したあとに、問い合わせフォームの送信が失敗した回数
//              （迷惑送信の遮断 blocked は、フォームが守られているだけなので数えません）
//
// 「確認しました」を押した時点の、その日の数を控えておき（snapshot）、それより
// 増えた分だけを数えます。日ごとの数しか持っていないので、同じ日の中で
// 「押す前」と「押した後」を分けるには、この控えが要ります。
// このファイルは import を持たず、テストからそのまま読みます。

export const LOOKBACK_DAYS = 14

/** 404 のURLの数え方（同じ日に何度あっても、URLは1つ）。 */
function add(map, k, n) { if (n > 0) map[k] = (map[k] || 0) + n }

/**
 * days: [{ date, notFound: { path: n }, contact: { ok, fail, blocked, … } }]（古い順・新しい順どちらでも）
 * seen: { at, day, nf: { path: n }, cf: n } | null
 * lastError: { at, reason } | null
 */
export function analyticsAttention(days, seen, lastError) {
  const out = { total: 0, notFound: [], formFail: 0, lastError: null }
  if (!seen || !seen.day) return out
  const nf = {}
  let fail = 0
  for (const d of Array.isArray(days) ? days : []) {
    if (!d || !d.date || d.date < seen.day) continue
    const same = d.date === seen.day
    for (const [path, n] of Object.entries(d.notFound || {})) {
      add(nf, path, (Number(n) || 0) - (same ? Number((seen.nf || {})[path]) || 0 : 0))
    }
    fail += Math.max(0, failsOf(d.contact) - (same ? Number(seen.cf) || 0 : 0))
  }
  out.notFound = Object.entries(nf).map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : 1))
  out.formFail = fail
  const errAt = lastError && Date.parse(lastError.at)
  if (fail && errAt && errAt > (Number(seen.at) || 0)) out.lastError = { at: lastError.at, reason: String(lastError.reason || '').slice(0, 200) }
  out.total = out.notFound.length + out.formFail
  return out
}

/** 送信の失敗の回数（ok と blocked 以外）。 */
export function failsOf(contact) {
  let n = 0
  for (const [k, v] of Object.entries(contact || {})) if (k !== 'ok' && k !== 'blocked') n += Number(v) || 0
  return n
}

/** 「確認しました」を押したときの控え。today はその日（JST）の記録。 */
export function seenSnapshot(now, todayDate, today) {
  const t = today || {}
  return { at: now, day: todayDate, nf: { ...(t.notFound || {}) }, cf: failsOf(t.contact) }
}

/** 内訳の文（タブの数の読み上げ・説明用）。 */
export function analyticsParts(a) {
  const x = a || {}
  const nf = Array.isArray(x.notFound) ? x.notFound.length : Number(x.notFound) || 0
  return [
    x.formFail ? `問い合わせフォームの送信の失敗 ${x.formFail}回` : '',
    nf ? `新しく見つからなかったURL ${nf}件` : '',
  ].filter(Boolean)
}
