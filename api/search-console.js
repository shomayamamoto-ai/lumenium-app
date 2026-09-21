export const config = { runtime: 'edge' }

// Google 検索での見え方を、Search Console から読んでくる。
//
// この画面には「AIの回答に出てくるか」はあっても、「ふつうの検索でどう
// 見えているか」がありませんでした。何の言葉で表示され、何回押され、平均で
// 何番目に出ているか——これは推測では出せず、Search Console にしかありません。
//
// AIO計測と同じ切り方（指名 / 非指名）で分けて出します。社名を含む検索で
// 表示されるのは当たり前で、勝負は社名を知らない人の検索です。両方を同じ
// 物差しで並べておかないと、合計の数字だけを見て安心することになります。
//
// 認証は商談カレンダーと同じ接続を使い回します（読み取り専用の権限を1つ
// 足しただけ）。まだ接続していない、あるいは権限を足す前の接続のままなら、
// その旨を返します。

import { requireAdmin, json } from './_admin-auth.js'
import { creds, connected, accessToken } from './_google-cal.js'
import { BRAND } from './_aio-catalog.js'

const API = 'https://www.googleapis.com/webmasters/v3'
const DAYS = 28

/** 社名の入った検索かどうか。AIO計測の「指名 / 非指名」と同じ分け方です。 */
export function isBranded(query) {
  const q = String(query || '').toLowerCase()
  return q.includes('lumenium') || q.includes('ルメニウム') || q.includes('るめにうむ')
}

const day = (back) => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10)

async function call(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return data
}

/** 登録されているプロパティから、このサイトのものを選ぶ。
 *  ドメイン全体（sc-domain:）で登録されている場合と、URLの前方一致で登録
 *  されている場合があり、前者のほうが取れる範囲が広いので優先します。 */
export function pickSite(list) {
  const sites = (list || []).filter((s) => s.siteUrl)
  const domain = sites.find((s) => s.siteUrl === `sc-domain:${BRAND.domain}`)
  if (domain) return domain.siteUrl
  const url = sites.find((s) => s.siteUrl.includes(BRAND.domain))
  return url ? url.siteUrl : null
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const c = await creds(req)
  if (!connected(c)) {
    return json({
      ok: true, connected: false,
      message: 'Googleと接続していません。設定状況の「商談の自動予約」からGoogleカレンダーに接続すると、検索の数字も一緒に読めるようになります（読み取りのみ）。',
    })
  }

  let token
  try {
    token = await accessToken(c)
  } catch (e) {
    return json({ ok: true, connected: false, message: String(e.message || e).slice(0, 200) })
  }

  // どのプロパティが登録されているか
  let sites
  try {
    sites = await call(token, '/sites')
  } catch (e) {
    const needsScope = e.status === 403
    return json({
      ok: true, connected: true, authorised: false,
      message: needsScope
        ? 'Search Console を読む権限がありません。設定状況の「Googleカレンダーに接続」をもう一度押して、権限を付け直してください（読み取りのみ追加されます）。'
        : String(e.message || e).slice(0, 200),
    })
  }

  const siteUrl = pickSite(sites.siteEntry)
  if (!siteUrl) {
    return json({
      ok: true, connected: true, authorised: true, registered: false,
      message: 'Search Console に lumenium.net が登録されていません。search.google.com/search-console でプロパティを追加し、設定状況の「検索エンジンへの登録」に確認ファイル名を貼ってください。',
    })
  }

  const range = { startDate: day(DAYS + 2), endDate: day(2) }  // 直近2日は集計途中なので外す
  const q = (body) => call(token, `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, { ...range, ...body })

  let queries, pages
  try {
    ;[queries, pages] = await Promise.all([
      q({ dimensions: ['query'], rowLimit: 100 }),
      q({ dimensions: ['page'], rowLimit: 25 }),
    ])
  } catch (e) {
    return json({ ok: true, connected: true, authorised: true, registered: true, message: String(e.message || e).slice(0, 200) })
  }

  const rows = (queries.rows || []).map((r) => ({
    query: r.keys[0],
    branded: isBranded(r.keys[0]),
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    position: round(r.position || 0),
  }))

  const sum = (list, key) => list.reduce((n, r) => n + (r[key] || 0), 0)
  const part = (list) => {
    const impressions = sum(list, 'impressions')
    const clicks = sum(list, 'clicks')
    return {
      queries: list.length,
      impressions,
      clicks,
      ctr: impressions ? round((clicks / impressions) * 100, 1) : 0,
      // 表示回数で重みを付けた平均順位。単純平均だと、1回しか出ていない
      // 語が全体を引っぱります。
      position: impressions ? round(list.reduce((n, r) => n + r.position * r.impressions, 0) / impressions) : 0,
    }
  }

  const branded = rows.filter((r) => r.branded)
  const open = rows.filter((r) => !r.branded)

  return json({
    ok: true,
    connected: true,
    authorised: true,
    registered: true,
    siteUrl,
    days: DAYS,
    range,
    total: part(rows),
    branded: part(branded),
    open: part(open),
    // 非指名を上に。ここが動くかどうかが、やっていることの答えです。
    topOpen: open.sort((a, b) => b.impressions - a.impressions).slice(0, 15),
    topBranded: branded.sort((a, b) => b.impressions - a.impressions).slice(0, 8),
    topPages: (pages.rows || []).map((r) => ({
      page: r.keys[0].replace(`https://${BRAND.domain}`, ''),
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      position: round(r.position || 0),
    })).slice(0, 15),
  })
}
