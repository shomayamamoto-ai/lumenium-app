// Reads the counters back and turns them into the report.
//
// Shared by the admin screen (api/analytics.js) and the weekly mail
// (api/weekly-report.js), so the mail can never say something the screen does
// not. Every number here is a sum of daily counters; nothing per visitor or per
// visit is stored, so nothing per visitor or per visit can be read back.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { pipeline, jstDate, K, KEEP_DAYS } from './_analytics-store.js'
import { REF_KINDS, refKind } from './_referrers.js'

// The enquiry path, and the things that are measured but are not steps on it.
// 見積り and メニュー used to be listed here; the screens that sent them are
// gone, so they could only ever show 0 and were removed rather than left to
// look like a step nobody takes.
export const MAIN = [
  ['service_view', 'サービスを見た'],
  ['contact_view', '問い合わせ画面'],
  ['contact_start', '入力を始めた'],
  ['contact_submit', '送信した'],
  // 送信で終わりにしない。送った人のうち何人がその場で日程まで決めたかが、
  // この導線がうまくいっているかどうかの本当の答えです。
  ['booking_confirm', '商談を予約した'],
]
export const SIDE = [
  ['booking_view', '日程候補を見た'],
]
// 読まれた深さは導線の段ではありません。どのページでも起きるので、同じ列に
// 混ぜると段として読めない並びになります。
export const ENGAGE = [
  ['read_half', '半分まで読んだ'],
  ['read_end', '終わりまで読んだ'],
]
export const STEP_KEYS = [...MAIN, ...SIDE, ...ENGAGE].map(([k]) => k)

/** The ranges the screen offers. Anything in between is accepted too. */
export const RANGES = [7, 30, 90, 180, 365]
export const MAX_RANGE = 365

/** 直帰の基準。これより短く、1ページだけで、操作も無かった訪問が直帰です。 */
export const BOUNCE_MS = 10000

/** `days` dates ending `endOffset` days before today (0 = up to today). */
export function datesEnding(days, endOffset = 0) {
  return Array.from({ length: days }, (_, i) => jstDate(endOffset + days - 1 - i))
}

/** A long range is thousands of commands. One request per few hundred keeps
 *  each request small, and a few at a time keeps it quick without opening
 *  dozens of connections at once. */
export async function pipelineChunked(cfg, commands, size = 250, parallel = 4) {
  const chunks = []
  for (let i = 0; i < commands.length; i += size) chunks.push(commands.slice(i, i + size))
  const out = new Array(chunks.length)
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const n = next++
      out[n] = await pipeline(cfg, chunks[n])
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, chunks.length) }, worker))
  return out.flat()
}

/** Upstash returns hashes as a flat [field, value, ...] array. */
export function toPairs(flat) {
  const out = []
  if (!Array.isArray(flat)) return out
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ name: String(flat[i]), count: Number(flat[i + 1]) || 0 })
  }
  return out
}

export function merge(lists, limit) {
  const totals = new Map()
  for (const list of lists) {
    for (const { name, count } of list) totals.set(name, (totals.get(name) || 0) + count)
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

const asMap = (lists) => Object.fromEntries(merge(lists, Infinity).map((p) => [p.name, p.count]))
const sum = (a) => a.reduce((x, y) => x + y, 0)

/* ---- the numbers every day needs, cheap enough to read for both periods ---- */
const DAY_CMDS = (d) => [
  ['GET', K.dayViews(d)],
  ['PFCOUNT', K.dayVisitors(d)],
  ['GET', K.daySessions(d)],
  ['GET', K.dayEngaged(d)],
  ['HMGET', K.dayTime(d), 'sum', 'n'],
  ['HMGET', K.dayEvents(d), 'contact_submit', 'booking_confirm'],
]
function readDay(date, r) {
  const arr = (v) => (Array.isArray(v) ? v : [])
  const [timeSum, timeN] = arr(r[4]).map((v) => Number(v) || 0)
  const [submits, bookings] = arr(r[5]).map((v) => Number(v) || 0)
  return {
    date,
    views: Number(r[0]) || 0,
    visitors: Number(r[1]) || 0,
    visits: Number(r[2]) || 0,
    engaged: Number(r[3]) || 0,
    timeSum: timeSum || 0,
    timeN: timeN || 0,
    submits: submits || 0,
    bookings: bookings || 0,
  }
}

/** The headline numbers for a list of days. Rates are null, not 0, when there
 *  is nothing to divide by — 「直帰率 0%」 and 「まだ訪問がない」 are different
 *  things and the screen has to be able to tell them apart. */
export function summarize(days) {
  const visits = sum(days.map((d) => d.visits))
  // A visit that starts just before midnight and is engaged just after lands
  // its two halves on different days, so the engaged count can very slightly
  // exceed the visits. Clamped rather than shown as a negative bounce.
  const engaged = Math.min(visits, sum(days.map((d) => d.engaged)))
  const timeSum = sum(days.map((d) => d.timeSum))
  const timeN = sum(days.map((d) => d.timeN))
  return {
    views: sum(days.map((d) => d.views)),
    visitorDays: sum(days.map((d) => d.visitors)),
    visits,
    engaged,
    bounces: visits - engaged,
    bounceRate: visits ? (visits - engaged) / visits : null,
    timeSum,
    timeN,
    avgTimeMs: timeN ? Math.round(timeSum / timeN) : null,
    submits: sum(days.map((d) => d.submits)),
    bookings: sum(days.map((d) => d.bookings)),
  }
}

/* ---- the per-day lists, read only for the period being shown ---- */
const LISTS = [
  ['paths', K.dayPaths],
  ['refs', K.dayRefs],
  ['devices', K.dayDevices],
  ['events', K.dayEvents],
  ['hours', K.dayHours],
  // ページごとの「終わりまで読まれた」「最後に離れた」、見つからなかったURL。
  ['readEnd', (d) => K.dayEventPaths(d, 'read_end')],
  ['exit', (d) => K.dayEventPaths(d, 'exit')],
  ['notFound', (d) => K.dayEventPaths(d, 'not_found')],
  ['links', K.dayLinks],
  // 訪問の入口、そのうち直帰しなかったぶん、ページごとの見ていた時間。
  ['landing', K.dayLanding],
  ['landingEngaged', K.dayLandingEngaged],
  ['pathTime', K.dayPathTime],
  ['pathTimeN', K.dayPathTimeN],
  // 成果ごとの流入元と、計測用リンクの名前。
  ['srcSubmit', (d) => K.dayEventSources(d, 'contact_submit')],
  ['srcBooking', (d) => K.dayEventSources(d, 'booking_confirm')],
  ['srcTel', (d) => K.dayEventSources(d, 'click_tel')],
  ['srcLine', (d) => K.dayEventSources(d, 'click_line')],
  ['srcMail', (d) => K.dayEventSources(d, 'click_mail')],
  ['campaigns', K.dayCampaigns],
  ['campaignSubmit', (d) => K.dayCampaignEvents(d, 'contact_submit')],
]

/**
 * The whole report for `days` days ending `endOffset` days ago, plus the same
 * headline numbers for the equal-length period just before it.
 *
 * The 7- and 30-day cards are read separately, always from today backwards: a
 * card labelled 過去30日 used to be computed inside the selected range, so with
 * 7 days selected it showed 7 days under a 30-day label.
 */
export async function buildReport(cfg, { days = 30, endOffset = 0 } = {}) {
  days = Math.min(Math.max(parseInt(days, 10) || 30, 1), MAX_RANGE)
  const dates = datesEnding(days, endOffset)
  const prevDates = datesEnding(days, endOffset + days)
  const cardDates = datesEnding(30, 0)
  // One read per date, whichever of the three lists it belongs to.
  const allDates = [...new Set([...prevDates, ...dates, ...cardDates])]

  const cmds = [
    ['GET', K.totalViews],
    ...allDates.flatMap(DAY_CMDS),
    ...dates.flatMap((d) => LISTS.map(([, key]) => ['HGETALL', key(d)])),
    // One union per step. PFCOUNT over many keys returns the cardinality of
    // their union, so this is one command per step rather than one per day.
    ['PFCOUNT', ...dates.map((d) => K.dayVisitors(d))],
    ...STEP_KEYS.map((ev) => ['PFCOUNT', ...dates.map((d) => K.dayEventUsers(d, ev))]),
  ]
  const raw = await pipelineChunked(cfg, cmds)

  let i = 0
  const totalAllTime = Number(raw[i++]) || 0
  const dayRow = {}
  for (const d of allDates) {
    dayRow[d] = readDay(d, raw.slice(i, i + DAY_CMDS(d).length))
    i += DAY_CMDS(d).length
  }
  const lists = Object.fromEntries(LISTS.map(([name]) => [name, []]))
  for (let n = 0; n < dates.length; n++) {
    for (const [name] of LISTS) lists[name].push(toPairs(raw[i++]))
  }
  const arrivals = Number(raw[i++]) || 0
  const people = {}
  for (const ev of STEP_KEYS) people[ev] = Number(raw[i++]) || 0

  const rows = dates.map((d) => dayRow[d])
  const prevRows = prevDates.map((d) => dayRow[d])
  const cur = summarize(rows)
  const prev = summarize(prevRows)

  /* ---- the funnel, in people ---- */
  const evTotals = asMap(lists.events)
  // Two numbers per step, because they answer different questions and only one
  // of them can be turned into a rate: `count` is how many times it happened,
  // `people` is how many visitors did it at least once that day. `rate` is
  // always people ÷ arrivals — the same unit on both sides.
  const step = ([key, label]) => ({
    key, label,
    count: evTotals[key] || 0,
    people: people[key] || 0,
    rate: arrivals ? (people[key] || 0) / arrivals : 0,
  })
  const main = MAIN.map(step)
  // Step-over-step loss, and only when it is a loss. A step larger than the one
  // above it means visitors arrived straight into it — a real and useful thing
  // to see, but it is not a negative drop.
  main.forEach((s, n) => {
    const before = n === 0 ? arrivals : main[n - 1].people
    s.drop = before > 0 && s.people <= before ? 1 - s.people / before : null
    s.direct = before > 0 && s.people > before
  })

  const opened = asMap(lists.paths)
  const refsAll = merge(lists.refs, Infinity)

  /* ---- 問い合わせにつながった流入元 ----
     訪問の数は「その流入元から始まった訪問」。成果の数は、その訪問の中で
     起きた回数です。率は画面の側で、訪問が十分にあるときだけ出します。 */
  const visitsBySrc = Object.fromEntries(refsAll.map((r) => [r.name, r.count]))
  const sub = asMap(lists.srcSubmit)
  const book = asMap(lists.srcBooking)
  const tel = asMap(lists.srcTel)
  const line = asMap(lists.srcLine)
  const mail = asMap(lists.srcMail)
  const convNames = new Set([...Object.keys(sub), ...Object.keys(book), ...Object.keys(tel), ...Object.keys(line), ...Object.keys(mail)])
  const convSources = [...convNames]
    .map((name) => ({
      name,
      kind: refKind(name),
      visits: visitsBySrc[name] || 0,
      submits: sub[name] || 0,
      bookings: book[name] || 0,
      contacts: (tel[name] || 0) + (line[name] || 0) + (mail[name] || 0),
    }))
    .sort((a, b) => (b.submits - a.submits) || (b.contacts - a.contacts) || (b.visits - a.visits))
    .slice(0, 12)

  /* ---- 最初に見られたページ ---- */
  const landEng = asMap(lists.landingEngaged)
  const landings = merge(lists.landing, Infinity)
    .map(({ name, count }) => {
      const engaged = Math.min(count, landEng[name] || 0)
      return { name, visits: count, engaged, bounceRate: count ? (count - engaged) / count : null }
    })
    .slice(0, 12)

  /* ---- ページごとの平均滞在 ---- */
  const timeN = asMap(lists.pathTimeN)
  const pageTimes = merge(lists.pathTime, Infinity)
    .map(({ name, count }) => ({ name, samples: timeN[name] || 0, avgMs: timeN[name] ? Math.round(count / timeN[name]) : null }))
    .filter((r) => r.samples > 0)
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 12)

  /* ---- 計測用リンク・広告 ---- */
  const campSub = asMap(lists.campaignSubmit)
  const campNames = new Set([...merge(lists.campaigns, Infinity).map((c) => c.name), ...Object.keys(campSub)])
  const campVisits = asMap(lists.campaigns)
  const campaigns = [...campNames]
    .map((name) => ({ name, visits: campVisits[name] || 0, submits: campSub[name] || 0 }))
    .sort((a, b) => (b.visits - a.visits) || (b.submits - a.submits))
    .slice(0, 15)

  const today = dayRow[jstDate(0)] || readDay(jstDate(0), [])
  const views30 = cardDates.map((d) => dayRow[d].views)
  // The first day in the range that has visit counts at all. Visits, bounces
  // and time are counted from the day this was deployed; a range reaching
  // further back has views for those days but no visits, and saying so beats
  // a bounce rate quietly computed over part of the range.
  const firstVisitDay = (rows.find((r) => r.visits > 0) || {}).date || null

  return {
    range: { days, from: dates[0], to: dates[dates.length - 1] },
    previous: {
      from: prevDates[0], to: prevDates[prevDates.length - 1],
      // Part of the previous period is older than what is kept.
      partial: endOffset + days * 2 > KEEP_DAYS,
    },
    sessionsFrom: firstVisitDay,
    summary: { cur, prev },
    funnel: {
      // Visitor-days: the id is re-salted daily on purpose, so someone returning
      // on a second day counts twice. Both sides of every rate share that, so
      // the ratio is right even though the total is not a headcount.
      arrivals,
      unit: 'visitor-days',
      main,
      side: SIDE.map(step),
      engagement: ENGAGE.map(step),
    },
    totals: {
      allTime: totalAllTime,
      today: today.views,
      todayVisitors: today.visitors,
      todayVisits: today.visits,
      last7: sum(views30.slice(-7)),
      last30: sum(views30),
      rangeViews: cur.views,
      // Per-day uniques cannot be added into a period unique — a returning
      // visitor is counted once a day. Labelled as such in the UI.
      rangeVisitorDays: cur.visitorDays,
    },
    series: rows.map((r) => ({
      date: r.date,
      views: r.views,
      visitors: r.visitors,
      visits: r.visits,
      engaged: Math.min(r.engaged, r.visits),
      bounceRate: r.visits ? Math.max(0, r.visits - r.engaged) / r.visits : null,
      avgTimeMs: r.timeN ? Math.round(r.timeSum / r.timeN) : null,
      submits: r.submits,
    })),
    topPaths: merge(lists.paths, 20),
    topReferrers: refsAll.slice(0, 12),
    /* 紹介元を種類でまとめたもの。来ていない種類も 0 のまま並べます——
       「AI検索から 0」は空欄ではなく結果で、対策が効き始めたかどうかは
       その行が動くかで分かるからです。保存してあるホスト名を読み直して
       分類します（上限なし。表示は12件でも、集計は全部）。 */
    referrerKinds: (() => {
      const byKind = {}
      for (const { name, count } of refsAll) {
        const k = refKind(name)
        byKind[k] = (byKind[k] || 0) + count
      }
      const total = sum(Object.values(byKind))
      return REF_KINDS.map((k) => ({
        ...k,
        count: byKind[k.key] || 0,
        share: total ? (byKind[k.key] || 0) / total : 0,
      }))
    })(),
    devices: merge(lists.devices, 5),
    /* いつ見られているか。0時から23時まで、来ていない時間も 0 で残します
       ——穴が空いている時間帯こそ読みたいものだからです。 */
    hours: (() => {
      const got = asMap(lists.hours)
      return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: got[h] || 0 }))
    })(),
    /* ページごとの読了率。開かれた回数のうち、終わりまで来た回数。 */
    readByPath: (() => {
      const ended = asMap(lists.readEnd)
      return Object.keys(opened)
        .map((name) => ({
          name,
          opened: opened[name],
          ended: ended[name] || 0,
          rate: opened[name] ? (ended[name] || 0) / opened[name] : 0,
        }))
        .sort((a, b) => b.opened - a.opened)
        .slice(0, 12)
    })(),
    /* 出ていったリンク。電話・LINE・メールは固定の名前、外部リンクは
       相手のホスト名です。フォームを通らない連絡はここにしか出ません。 */
    links: merge(lists.links, 15),
    /* 離脱ページ。そのページを最後にサイトを離れた回数と、開かれた回数に
       対する割合。ページを本当に離れたとき（pagehide）だけを数え、サイト内
       リンクを押して移った場合は除いています。 */
    exits: merge(lists.exit, Infinity)
      .map((e) => ({
        name: e.name,
        exits: e.count,
        opened: opened[e.name] || 0,
        rate: opened[e.name] ? e.count / opened[e.name] : 0,
      }))
      .sort((a, b) => b.exits - a.exits)
      .slice(0, 10),
    /* 見つからなかったURL。リンク切れ、消したページ、打ち間違い、
       よそのサイトからの古いリンク。多いものから直せます。 */
    notFound: merge(lists.notFound, 12),
    landings,
    pageTimes,
    convSources,
    campaigns,
  }
}
