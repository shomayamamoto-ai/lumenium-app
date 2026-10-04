// 問い合わせ管理（管理者のみ）。
//
//   GET   /api/inquiries                    一覧（?status=new|doing|done|spam|all &q= &page=）と上の数字
//   GET   /api/inquiries?id=<id>            1件の全部（本文・メモ・履歴・メールの結果）
//   GET   /api/inquiries?view=badge         未読の数（タブとポータルの印）
//   GET   /api/inquiries?view=stats&days=30 集計（状態・ジャンル・どこから・キャンペーン）
//   GET   /api/inquiries?view=settings      設定と返信の文例
//   GET   /api/inquiries?view=export        CSV（?status= で絞れます）
//   PATCH /api/inquiries {ids|id, status?, spam?, note?, replied?, assignee?, read?}
//   POST  /api/inquiries {action: settings.save | template.save | template.delete | domain.block}
//
// 保存の形と計算は _inquiries.js にあります。保存先は環境変数のものだけを
// 見ます。フォームは訪問者の側で動くので、管理画面にだけ入れたキーで
// 一覧が出ても、新しい問い合わせは貯まらないためです。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import { BRAND } from './_brand.js'
import { setting } from './_settings.js'
import {
  NO_STORE_MSG, SANDBOX_MSG, CAPS, STATUS_LABEL, PROMISED_H, WARN_H, TEMPLATE_VARS, idOk,
  allSummaries, prune, metrics, stats, overdue, replyHours, getRecord, getRecords, putRecord, applyPatch, summary,
  loadSettings, saveSettings, loadTemplates, saveTemplates, cleanTemplate, toCsv, isSandboxSender, str,
} from './_inquiries.js'

const PAGE = 25
const H = 3600 * 1000

const NO_STORE = { ok: true, stored: false, message: NO_STORE_MSG }
const fail = (e) => json({ ok: false, message: `保存先から読めませんでした（${String((e && e.message) || e).slice(0, 100)}）。少し待ってから開き直してください。` }, 503)

/** 一覧の行に、画面がそのまま出せる数字を足す。 */
function row(s, now) {
  const h = replyHours(s)
  return Object.assign({}, s, {
    overdue: overdue(s, now),
    ageH: Math.round(((now - Date.parse(s.receivedAt)) / H) * 10) / 10,
    replyH: h == null ? null : Math.round(h * 10) / 10,
  })
}

function matches(s, status, q) {
  if (status === 'spam') { if (!s.spam) return false }
  else if (s.spam) { if (status !== 'all') return false }
  else if (STATUS_LABEL[status] && s.status !== status) return false
  if (!q) return true
  const hay = [s.name, s.company, s.email, s.snippet, s.source, s.campaign, s.assignee, (s.topics || []).join(' ')].join(' ').toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w))
}

async function sender() {
  const from = BRAND.from
  return { from, sandbox: isSandboxSender(from), sandboxNote: isSandboxSender(from) ? SANDBOX_MSG : '' }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  const u = new URL(req.url)
  const view = u.searchParams.get('view') || ''
  if (!cfg) {
    if (view === 'export') return new Response(NO_STORE_MSG, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
    return json(Object.assign({}, NO_STORE, { items: [], unread: 0, sender: await sender() }))
  }
  const now = Date.now()
  try {
    const id = u.searchParams.get('id')
    if (id) {
      const rec = await getRecord(cfg, id)
      if (!rec) return json({ ok: false, message: 'その問い合わせは見つかりませんでした（保存期間を過ぎて消えたか、削除されたかもしれません）。' }, 404)
      return json({ ok: true, stored: true, item: Object.assign(rec, { overdue: overdue(rec, now), replyH: replyHours(rec) }), sender: await sender() })
    }
    if (view === 'settings') {
      const [settings, templates] = await Promise.all([loadSettings(cfg), loadTemplates(cfg)])
      const lineToken = !!(await setting('LINE_CHANNEL_TOKEN', '', req))
      return json({ ok: true, stored: true, settings, templates, vars: TEMPLATE_VARS, sender: await sender(), lineToken, brand: BRAND.name })
    }
    const settings = await loadSettings(cfg)
    let list = await allSummaries(cfg)
    // 保存期間を過ぎたものは、ここで消します（定期実行を足さずに済むように）。
    const removed = await prune(cfg, list, settings.retentionDays, now)
    if (removed) {
      const c = now - settings.retentionDays * 24 * H
      list = list.filter((s) => Date.parse(s.receivedAt) >= c).slice(0, CAPS.records)
    }
    if (view === 'badge') {
      const m = metrics(list, now)
      return json({ ok: true, stored: true, unread: m.counts.unread, late: m.late })
    }
    if (view === 'stats') {
      const days = u.searchParams.get('days') === '90' ? 90 : 30
      return json({ ok: true, stored: true, stats: stats(list, days, now), retentionDays: settings.retentionDays })
    }
    const status = u.searchParams.get('status') || 'new'
    const q = str(u.searchParams.get('q'), 80).toLowerCase().trim()
    const hits = list.filter((s) => matches(s, status, q))
    if (view === 'export') {
      const recs = []
      const ids = hits.map((s) => s.id)
      for (let i = 0; i < ids.length; i += 200) recs.push(...(await getRecords(cfg, ids.slice(i, i + 200))))
      return new Response(toCsv(recs), {
        headers: {
          'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
          'content-disposition': `attachment; filename="inquiries-${new Date(now + 9 * H).toISOString().slice(0, 10)}.csv"`,
        },
      })
    }
    const pages = Math.max(1, Math.ceil(hits.length / PAGE))
    const page = Math.min(pages, Math.max(1, parseInt(u.searchParams.get('page'), 10) || 1))
    return json({
      ok: true, stored: true, status, q, total: hits.length, page, pages, per: PAGE,
      items: hits.slice((page - 1) * PAGE, page * PAGE).map((s) => row(s, now)),
      metrics: metrics(list, now), promised: PROMISED_H, warnH: WARN_H,
      retentionDays: settings.retentionDays, autoReply: settings.autoReply.on, lineOn: settings.lineOn,
      removed, sender: await sender(),
    })
  } catch (e) {
    return fail(e)
  }
}

async function body(req) {
  try { return await req.json() } catch (_) { return null }
}

export async function PATCH(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: NO_STORE_MSG }, 503)
  const b = await body(req)
  if (!b) return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400)
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : [b.id]).filter(idOk))]
  if (!ids.length) return json({ ok: false, message: 'どの問い合わせを変えるかが分かりませんでした。' }, 400)
  if (ids.length > CAPS.bulk) return json({ ok: false, message: `一度に変えられるのは${CAPS.bulk}件までです。` }, 400)
  const patch = {}
  ;['status', 'spam', 'note', 'replied', 'repliedAt', 'assignee', 'read'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k] })
  if (!Object.keys(patch).length) return json({ ok: false, message: '変える内容がありません。' }, 400)
  try {
    const recs = await getRecords(cfg, ids)
    const now = Date.now()
    const out = []
    for (const rec of recs) {
      const r = applyPatch(rec, patch, now)
      if (!r.ok) return json(r, 400)
      if (r.changed) await putRecord(cfg, r.rec)
      out.push(r.rec)
    }
    if (ids.length === 1) {
      const one = out[0]
      if (!one) return json({ ok: false, message: 'その問い合わせは見つかりませんでした。' }, 404)
      return json({ ok: true, item: Object.assign(one, { overdue: overdue(one, now), replyH: replyHours(one) }) })
    }
    return json({ ok: true, count: out.length, items: out.map(summary) })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: NO_STORE_MSG }, 503)
  const b = await body(req)
  if (!b || typeof b.action !== 'string') return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400)
  try {
    if (b.action === 'settings.save') {
      const r = await saveSettings(cfg, b.settings)
      return json(r, r.ok ? 200 : 400)
    }
    if (b.action === 'domain.block') {
      const d = String(b.domain || '').toLowerCase().trim().replace(/^.*@/, '')
      const cur = await loadSettings(cfg)
      const r = await saveSettings(cfg, Object.assign({}, cur, { blockedDomains: cur.blockedDomains.concat([d]) }))
      if (r.ok && r.settings.blockedDomains.indexOf(d) < 0) return json({ ok: false, message: 'ドメインの形になっていません。' }, 400)
      return json(r, r.ok ? 200 : 400)
    }
    if (b.action === 'template.save' || b.action === 'template.delete') {
      let list = await loadTemplates(cfg)
      if (b.action === 'template.delete') {
        list = list.filter((t) => t.id !== b.id)
      } else {
        const r = cleanTemplate(b.item)
        if (!r.ok) return json(r, 400)
        const i = list.findIndex((t) => t.id === r.item.id)
        if (i >= 0) list[i] = r.item
        else if (list.length >= CAPS.templates) return json({ ok: false, message: `文例は${CAPS.templates}件までです。使わないものを消してください。` }, 400)
        else list.push(r.item)
      }
      await saveTemplates(cfg, list)
      return json({ ok: true, templates: list })
    }
    return json({ ok: false, message: 'できない操作です。' }, 400)
  } catch (e) {
    return fail(e)
  }
}
