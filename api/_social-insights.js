// SNS（文章）の「投稿したあと、どうなったか」。
//
// 投稿ごとの成果は、アクセス解析がすでに日ごとに数えている「計測用リンクの
// 名前」（cp:d:<日付> と cpe:d:<日付>:<成果>）を足すだけで出します。
// 投稿のときに自社サイトへのリンクへ ?ref=<SNS名>&utm_campaign=<名前> を
// 付けているので、アクセス解析では「x/-/秋のセール」のような名前で数えられて
// います（_visit.js の campaignOf と同じ形）。
//
// 正直に言っておくこと:
//   ・日ごとの数なので、投稿した日の「投稿より前」の訪問も入ります。
//   ・同じSNSに同じ印（キャンペーン名なし同士も含む）で7日以内に2回出すと、
//     その期間の訪問はどちらの投稿にも入ります。分けようがないので、
//     分けたふりをせず「重なっています」と出します。合計（SNSごとのまとめ）は
//     日を重複させずに数えます。
//   ・リンクを押さずに、検索して来た人は数えられません。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { campaignOf } from './_visit.js'
import { REF_NAMES, cleanCampaign, tagUrl } from './_social-text.js'
import { K, pipeline, storeFor, jstDate } from './_analytics-store.js'
import { BRAND } from './_brand.js'

/** 投稿のあと何日ぶんを、その投稿の成果として見るか（投稿した日を含めて8日分の日付）。 */
export const WINDOW_DAYS = 7
/** 成果として数える出来事。 */
export const INQUIRY_EVENTS = ['contact_submit', 'booking_confirm']

const DAY = 86400000

/** 日本時間の日付（YYYY-MM-DD）。 */
export function jstDay(iso) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso)
  return new Date(t + 9 * 3600000).toISOString().slice(0, 10)
}

export function addDays(day, n) {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
}

/** アクセス解析での名前（source/medium/campaign）。 */
export function fieldFor(net, campaign) {
  return campaignOf({ s: REF_NAMES[net] || net, c: cleanCampaign(campaign) })
}

/** その投稿先に、計測用の印つきの自社リンクが入っていたか。
 *  新しい記録は送ったときに refs を残しています。古い記録は、送った本文と
 *  リンクから判断します。 */
export function taggedField(entry, net, host) {
  if (entry.refs && typeof entry.refs === 'object') return entry.refs[net] || ''
  const ref = REF_NAMES[net] || net
  const sent = String((entry.texts && entry.texts[net]) || '')
  const inText = new RegExp('[?&]ref=' + ref + '(?:[&#\\s]|$)').test(sent)
  const link = String(entry.link || '')
  const inLink = !!link && !!host && tagUrl(link, net, '', host) !== link
  return inText || inLink ? fieldFor(net, entry.campaign) : ''
}

/** 1日ぶんの数を足します。daily[day] = { visits: {field:n}, contact_submit: {...}, booking_confirm: {...} } */
function sumDays(daily, field, days) {
  const out = { visits: 0, contact: 0, booking: 0 }
  for (const d of days) {
    const row = daily[d] || {}
    out.visits += Number((row.visits || {})[field]) || 0
    out.contact += Number((row.contact_submit || {})[field]) || 0
    out.booking += Number((row.booking_confirm || {})[field]) || 0
  }
  out.inquiries = out.contact + out.booking
  return out
}

function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** 投稿ごとの成果。
 *  posts: 投稿の記録（新しい順でも古い順でもよい）、daily: 上の形、today: JST の日付。
 *  戻り値: { [投稿id]: { [net]: { field, from, to, open, visits, contact, booking, inquiries, shared: [{ id, at }] } } } */
export function attribute(posts, daily, today, host) {
  const slots = []
  for (const p of posts || []) {
    if (!p || !p.at) continue
    for (const r of p.results || []) {
      if (!r.ok) continue
      const field = taggedField(p, r.net, host)
      const from = jstDay(p.at)
      const end = addDays(from, WINDOW_DAYS)
      slots.push({ id: p.id || p.at, at: p.at, net: r.net, field, from, to: end < today ? end : today, open: end > today, end })
    }
  }
  const out = {}
  for (const s of slots) {
    const row = out[s.id] || (out[s.id] = {})
    if (!s.field) { row[s.net] = { field: '', untagged: true }; continue }
    const shared = slots.filter((o) => o !== s && o.field === s.field && o.from <= s.end && s.from <= o.end)
      .map((o) => ({ id: o.id, at: o.at }))
    row[s.net] = { field: s.field, from: s.from, to: s.to, open: s.open, ...sumDays(daily, s.field, daysBetween(s.from, s.to)), shared }
  }
  return out
}

/** SNSごとのまとめ（直近 days 日に出した投稿）。訪問と問い合わせは、
 *  投稿の期間を重ねずに（同じ印・同じ日は1回だけ）数えます。 */
export function summarizeByNet(posts, daily, today, days, host) {
  const since = addDays(today, -(days - 1))
  const nets = {}
  for (const p of posts || []) {
    if (!p || !p.at || jstDay(p.at) < since) continue
    for (const r of p.results || []) {
      if (!r.ok) continue
      const n = nets[r.net] || (nets[r.net] = { posts: 0, tagged: 0, cover: new Map() })
      n.posts++
      const field = taggedField(p, r.net, host)
      if (!field) continue
      n.tagged++
      const from = jstDay(p.at)
      const end = addDays(from, WINDOW_DAYS)
      for (const d of daysBetween(from, end < today ? end : today)) {
        const set = n.cover.get(field) || new Set()
        set.add(d)
        n.cover.set(field, set)
      }
    }
  }
  const out = {}
  for (const [net, n] of Object.entries(nets)) {
    const t = { visits: 0, contact: 0, booking: 0, inquiries: 0 }
    for (const [field, set] of n.cover) {
      const s = sumDays(daily, field, [...set])
      t.visits += s.visits; t.contact += s.contact; t.booking += s.booking; t.inquiries += s.inquiries
    }
    out[net] = { posts: n.posts, tagged: n.tagged, ...t }
  }
  return out
}

/** 画面に出すもの一式。posts は recentPosts の結果（呼び出し側が渡します）。 */
export async function socialInsights(posts, req) {
  const cfg = await storeFor(req)
  const today = jstDate()
  const base = { ok: true, window: WINDOW_DAYS, today, stored: !!cfg }
  if (!cfg) return { ...base, results: {}, summary: { d30: {}, d90: {} } }
  const since = addDays(today, -(90 + WINDOW_DAYS))
  const first = (posts || []).reduce((m, p) => (p && p.at && jstDay(p.at) < m ? jstDay(p.at) : m), today)
  const days = daysBetween(first > since ? first : since, today)
  const cmds = []
  for (const d of days) {
    cmds.push(['HGETALL', K.dayCampaigns(d)])
    for (const e of INQUIRY_EVENTS) cmds.push(['HGETALL', K.dayCampaignEvents(d, e)])
  }
  const daily = {}
  try {
    const res = await pipeline(cfg, cmds)
    days.forEach((d, i) => {
      const at = i * (1 + INQUIRY_EVENTS.length)
      daily[d] = { visits: hashOf(res[at]) }
      INQUIRY_EVENTS.forEach((e, j) => { daily[d][e] = hashOf(res[at + 1 + j]) })
    })
  } catch (_) {
    return { ...base, results: {}, summary: { d30: {}, d90: {} }, message: 'アクセス解析の数字を読めませんでした。' }
  }
  return {
    ...base,
    results: attribute(posts, daily, today, BRAND.host),
    summary: {
      d30: summarizeByNet(posts, daily, today, 30, BRAND.host),
      d90: summarizeByNet(posts, daily, today, 90, BRAND.host),
    },
  }
}

/** HGETALL の答え（[k, v, k, v…]）を {k: 数} に。 */
export function hashOf(flat) {
  const o = {}
  const a = Array.isArray(flat) ? flat : []
  for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = Number(a[i + 1]) || 0
  return o
}
