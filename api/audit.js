export const config = { runtime: 'edge' }

// 操作の記録を見る（管理者以上）。
//
//   GET ?by=&area=&from=YYYY-MM-DD&to=YYYY-MM-DD   -> { items（新しい順・最大500件）, total, people, areas }
//   GET ?format=csv&…                              -> 同じ絞り込みの CSV（全件・Excel で開ける形）
//
// 書き込みの側と保存の形は api/_audit.js にあります。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import { AREA_LABEL, ROLE_LABEL } from './_permissions.js'
import { readAll, filter, toCsv, RESULT_LABEL, AUDIT_DAYS, AUDIT_MAX } from './_audit.js'

const SHOW = 500
const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '')

export async function GET(req) {
  const url = new URL(req.url)
  const csv = url.searchParams.get('format') === 'csv'
  const denied = await requireAdmin(req, csv ? { as: 'text' } : undefined)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) {
    const msg = '操作の記録には、保存先（Upstash Redis）を Vercel の環境変数につなぐ必要があります。'
    return csv
      ? new Response(msg, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
      : json({ ok: true, stored: false, items: [], total: 0, message: msg })
  }
  let all
  try { all = await readAll(cfg) } catch (_) {
    return json({ ok: false, message: '保存先から読めませんでした。少し待ってから開き直してください。' }, 503)
  }
  const q = {
    by: String(url.searchParams.get('by') || '').slice(0, 40),
    area: AREA_LABEL[url.searchParams.get('area')] ? url.searchParams.get('area') : '',
    from: day(url.searchParams.get('from')), to: day(url.searchParams.get('to')),
  }
  const hit = filter(all, q)
  if (csv) {
    return new Response(toCsv(hit), {
      headers: {
        'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }
  // 「だれ」の選択肢は記録に出てくる人から（消した担当者も、記録の上では残ります）。
  const people = new Map()
  for (const e of all) if (e.by && !people.has(e.by)) people.set(e.by, { id: e.by, name: e.name, role: e.role })
  return json({
    ok: true, stored: true, items: hit.slice(0, SHOW), total: hit.length, shown: Math.min(SHOW, hit.length),
    people: [...people.values()], areas: AREA_LABEL, roles: ROLE_LABEL, results: RESULT_LABEL,
    keepDays: AUDIT_DAYS, max: AUDIT_MAX,
  })
}
