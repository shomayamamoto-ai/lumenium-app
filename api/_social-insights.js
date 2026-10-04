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

/* ============================================================ いつ出すか ==
   2つの手がかりから出します。どちらも足りないときは、足りないものを言い、
   一般的な目安を「一般論」と書いて出します。
     (a) この画面から出した投稿の反応（いいね・コメント・共有）を、
         投稿した曜日と時間帯で比べる（10件以上あるとき）
     (b) 計測リンク（?ref=SNS名）から来た訪問が、何曜日・何時に多いか
         （直近90日で30件以上あるとき） */
export const MIN_POSTS = 10
export const MIN_VISITS = 30
const BANDS = [[6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]]
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 一般的な目安（このサイトの数字ではありません）。 */
export const GENERAL = {
  x: { hours: [[7, 9], [12, 13], [20, 22]], weekdays: [1, 2, 3, 4, 5], text: '平日の朝（7〜9時）・お昼（12時台）・夜（20〜22時）' },
  facebook: { hours: [[9, 12]], weekdays: [1, 2, 3, 4, 5], text: '平日の午前中（9〜12時）' },
  instagram: { hours: [[12, 13], [19, 22]], weekdays: [5, 6, 0], text: 'お昼（12時台）と夜（19〜22時）、金〜日' },
  threads: { hours: [[20, 23]], weekdays: [1, 2, 3, 4, 5], text: '夜（20〜23時）' },
  linkedin: { hours: [[8, 10]], weekdays: [2, 3, 4], text: '平日の朝（8〜10時）、火〜木' },
  line: { hours: [[11, 13], [18, 20]], weekdays: [1, 2, 3, 4, 5], text: 'お昼前後（11〜13時）か夕方（18〜20時）。早朝と深夜は避ける' },
  gbp: { hours: [[9, 12]], weekdays: [3, 4], text: '週末やイベントの2〜3日前（水・木）' },
  bluesky: { hours: [[20, 23]], weekdays: [1, 2, 3, 4, 5], text: '夜（20〜23時）' },
}

function jstParts(iso) {
  const d = new Date(Date.parse(iso) + 9 * 3600000)
  return { hour: d.getUTCHours(), weekday: d.getUTCDay() }
}

function bandOf(h) {
  return BANDS.findIndex(([a, b]) => h >= a && h < b)
}

function best(map, minN) {
  let top = null
  for (const [k, v] of Object.entries(map)) {
    if (v.n < minN) continue
    const avg = v.sum / v.n
    if (!top || avg > top.avg) top = { key: Number(k), avg, n: v.n }
  }
  return top
}

function topWeekdays(map, minN, count = 2) {
  return Object.entries(map).filter(([, v]) => v.n >= minN)
    .sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n).slice(0, count).map(([k]) => Number(k))
}

const score = (m) => (Number(m.likes) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0)

/** posts: 投稿の記録、hourly: { [日付]: { 'x\t9': n } }、today: JST の日付、nets: 対象の投稿先。 */
export function recommend(posts, hourly, today, nets) {
  const out = {}
  for (const net of nets) {
    const ref = REF_NAMES[net] || net
    // (a) 反応
    const rows = []
    for (const p of posts || []) {
      const r = (p.results || []).find((x) => x.net === net && x.ok && x.metrics && x.metrics.ok)
      if (r && p.at) rows.push({ ...jstParts(p.at), s: score(r.metrics) })
    }
    // (b) サイトへの訪問（直近90日）
    const since = addDays(today, -89)
    const byHour = {}
    const byDay = {}
    let visits = 0
    for (const [day, row] of Object.entries(hourly || {})) {
      if (day < since || day > today) continue
      const wd = new Date(day + 'T00:00:00Z').getUTCDay()
      for (const [k, n] of Object.entries(row || {})) {
        const [name, h] = k.split('\t')
        if (name !== ref) continue
        const b = bandOf(Number(h))
        if (b !== -1) { byHour[b] = byHour[b] || { sum: 0, n: 1 }; byHour[b].sum += Number(n) || 0 }
        byDay[wd] = byDay[wd] || { sum: 0, n: 1 }
        byDay[wd].sum += Number(n) || 0
        visits += Number(n) || 0
      }
    }
    const g = GENERAL[net] || { hours: [], weekdays: [], text: '' }
    const missing = []
    if (rows.length < MIN_POSTS) missing.push(`反応を取得した投稿が ${rows.length} 件です（${MIN_POSTS} 件で、反応から出せます）`)
    if (visits < MIN_VISITS) missing.push(`計測リンクから来た訪問が直近90日で ${visits} 件です（${MIN_VISITS} 件で、サイトの数字から出せます）`)
    if (rows.length >= MIN_POSTS) {
      const hb = {}
      const wb = {}
      for (const r of rows) {
        const b = bandOf(r.hour)
        if (b !== -1) { hb[b] = hb[b] || { sum: 0, n: 0 }; hb[b].sum += r.s; hb[b].n++ }
        wb[r.weekday] = wb[r.weekday] || { sum: 0, n: 0 }; wb[r.weekday].sum += r.s; wb[r.weekday].n++
      }
      const bh = best(hb, 2)
      const wds = topWeekdays(wb, 2)
      out[net] = {
        basis: 'posts', n: rows.length,
        hours: bh ? [BANDS[bh.key]] : g.hours,
        weekdays: wds.length ? wds : g.weekdays,
        text: (wds.length ? wds.map((w) => WEEKDAYS[w]).join('・') + '曜' : '') + (bh ? `の ${BANDS[bh.key][0]}〜${BANDS[bh.key][1]}時` : '') +
          `に出した投稿の反応がいちばん大きい（この画面から出した ${rows.length} 件の いいね・コメント・共有 の平均）`,
        missing: [],
      }
    } else if (visits >= MIN_VISITS) {
      // 訪問は「その時間に来た人の数」なので、平均ではなく合計で比べます。
      const bh = best(Object.fromEntries(Object.entries(byHour).map(([k, v]) => [k, { sum: v.sum, n: 1 }])), 1)
      const wds = topWeekdays(byDay, 1)
      out[net] = {
        basis: 'site', n: visits,
        hours: bh ? [BANDS[bh.key]] : g.hours,
        weekdays: wds.length ? wds : g.weekdays,
        text: `${ref} の計測リンクから来る人は ` + (wds.length ? wds.map((w) => WEEKDAYS[w]).join('・') + '曜' : '') +
          (bh ? `の ${BANDS[bh.key][0]}〜${BANDS[bh.key][1]}時` : '') + `に多い（直近90日の訪問 ${visits} 件）。少し前に出すと見てもらいやすくなります`,
        missing,
      }
    } else {
      out[net] = { basis: 'general', n: 0, hours: g.hours, weekdays: g.weekdays, text: g.text, missing }
    }
  }
  return out
}

/** 画面に出すもの一式。posts は recentPosts の結果（呼び出し側が渡します）。 */
export async function socialInsights(posts, req) {
  const cfg = await storeFor(req)
  const today = jstDate()
  const base = { ok: true, window: WINDOW_DAYS, today, stored: !!cfg }
  const nets = Object.keys(REF_NAMES)
  if (!cfg) return { ...base, results: {}, summary: { d30: {}, d90: {} }, recommend: recommend([], {}, today, nets) }
  const since = addDays(today, -(90 + WINDOW_DAYS))
  const first = (posts || []).reduce((m, p) => (p && p.at && jstDay(p.at) < m ? jstDay(p.at) : m), today)
  const days = daysBetween(first > since ? first : since, today)
  const cmds = []
  const hourDays = daysBetween(addDays(today, -89), today)
  for (const d of days) {
    cmds.push(['HGETALL', K.dayCampaigns(d)])
    for (const e of INQUIRY_EVENTS) cmds.push(['HGETALL', K.dayCampaignEvents(d, e)])
  }
  for (const d of hourDays) cmds.push(['HGETALL', K.dayRefHours(d)])
  const daily = {}
  const hourly = {}
  try {
    const res = await pipeline(cfg, cmds)
    const per = 1 + INQUIRY_EVENTS.length
    days.forEach((d, i) => {
      const at = i * per
      daily[d] = { visits: hashOf(res[at]) }
      INQUIRY_EVENTS.forEach((e, j) => { daily[d][e] = hashOf(res[at + 1 + j]) })
    })
    hourDays.forEach((d, i) => { hourly[d] = hashOf(res[days.length * per + i]) })
  } catch (_) {
    return { ...base, results: {}, summary: { d30: {}, d90: {} }, recommend: recommend(posts, {}, today, nets), message: 'アクセス解析の数字を読めませんでした。' }
  }
  return {
    ...base,
    results: attribute(posts, daily, today, BRAND.host),
    summary: {
      d30: summarizeByNet(posts, daily, today, 30, BRAND.host),
      d90: summarizeByNet(posts, daily, today, 90, BRAND.host),
    },
    recommend: recommend(posts, hourly, today, nets),
  }

}

/** HGETALL の答え（[k, v, k, v…]）を {k: 数} に。 */
export function hashOf(flat) {
  const o = {}
  const a = Array.isArray(flat) ? flat : []
  for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = Number(a[i + 1]) || 0
  return o
}
