export const config = { runtime: 'edge' }

// 見積書・請求書の窓口（管理者のみ）。中身は _quotes.js と _quote-core.js。
//
//   GET                              -> 一覧（要約）・設定・よく使う品目・メールの状態・今日
//   GET ?id=<id>                     -> 1件の全部
//   GET ?view=inquiries              -> 見積書のもとにできる問い合わせ（新しい順・迷惑は除く）
//   POST { action:'save', quote }            -> 作る・直す（番号が空なら自動で振ります）
//   POST { action:'status', id, status }     -> 下書き・送付済み・受注・失注（請求書は入金済み）
//   POST { action:'duplicate', id }          -> 複製（番号・状態・送った記録は持ち越さない）
//   POST { action:'delete', id }             -> 消す
//   POST { action:'from-inquiry', inquiryId } -> 問い合わせから下書き（まだ保存しません）
//   POST { action:'invoice', id }            -> 受注した見積書から請求書の下書き（保存します）
//   POST { action:'link', id }               -> お客様に渡す「見るだけのリンク」を作る
//   POST { action:'send', id, to, subject, body } -> リンク入りのメールを送り、送付済みにする
//   POST { action:'settings', settings }     -> 発行元・端数処理・メールの文など
//   POST { action:'catalog', items }         -> よく使う品目

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig } from './_analytics-store.js'
import {
  loadQuoteSettings, saveQuoteSettings, loadCatalog, saveCatalog, getQuote, saveQuote, allQuoteSummaries, setQuoteStatus,
  deleteQuote, viewLink, sendQuote, mailState,
} from './_quotes.js'
import { jstToday, prefillFromInquiry, duplicateQuote, invoiceFromQuote, checkRegNo } from './_quote-core.js'

const NO_STORE = '保存先（Upstash Redis）が無いため、見積書を保存できません。「設定状況」で保存先をつないでください。'

async function state(req, cfg) {
  const [settings, catalog, list, mail] = await Promise.all([loadQuoteSettings(cfg), loadCatalog(cfg), allQuoteSummaries(cfg), mailState(req)])
  return {
    ok: true, stored: true, today: jstToday(), settings, regNo: checkRegNo(settings.regNo),
    catalog: catalog.items, catalogSeeded: catalog.seeded, list, mail,
  }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, stored: false, message: NO_STORE, list: [] }, 503)
  const u = new URL(req.url)
  try {
    const id = u.searchParams.get('id')
    if (id) {
      const q = await getQuote(cfg, id)
      return q ? json({ ok: true, quote: q }) : json({ ok: false, message: 'その見積書は見つかりませんでした（消されたかもしれません）。' }, 404)
    }
    if (u.searchParams.get('view') === 'inquiries') {
      const { allSummaries } = await import('./_inquiries.js')
      const items = (await allSummaries(cfg)).filter((s) => !s.spam).slice(0, 40).map((s) => ({
        id: s.id, receivedAt: s.receivedAt, name: s.name, company: s.company, topics: s.topics || [],
        estimate: !!s.estimate, source: s.source || '', snippet: String(s.snippet || '').slice(0, 80), status: s.status,
      }))
      return json({ ok: true, items })
    }
    return json(await state(req, cfg))
  } catch (e) {
    return json({ ok: false, message: '読み込めませんでした（' + String((e && e.message) || e).slice(0, 100) + '）。' }, 502)
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let b
  try { b = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: NO_STORE }, 503)
  const action = String((b && b.action) || '')
  const id = String((b && b.id) || '')
  const reply = (r) => json(r, r.ok ? 200 : 400)
  try {
    if (action === 'save') return reply(await saveQuote(cfg, b.quote || {}))
    if (action === 'status') return reply(await setQuoteStatus(cfg, id, String(b.status || '')))
    if (action === 'delete') return reply(await deleteQuote(cfg, id))
    if (action === 'duplicate' || action === 'invoice') {
      const q = await getQuote(cfg, id)
      if (!q) return reply({ ok: false, message: 'その見積書は見つかりませんでした。' })
      const s = await loadQuoteSettings(cfg)
      const today = jstToday()
      if (action === 'invoice' && (q.kind === 'invoice' || q.status !== 'won')) {
        return reply({ ok: false, message: '請求書にできるのは「受注」の見積書だけです。' })
      }
      const draft = action === 'invoice' ? invoiceFromQuote(q, today) : duplicateQuote(q, today, s.validDays)
      const r = await saveQuote(cfg, Object.assign(draft, { id: '' }))
      return reply(Object.assign(r, r.ok ? { message: action === 'invoice' ? `請求書 ${r.quote.number} の下書きを作りました。` : `複製して ${r.quote.number} を作りました。` } : {}))
    }
    if (action === 'from-inquiry') {
      const { getRecord } = await import('./_inquiries.js')
      const inq = await getRecord(cfg, String(b.inquiryId || ''))
      if (!inq) return reply({ ok: false, message: 'その問い合わせは見つかりませんでした（保存期間を過ぎて消えたかもしれません）。' })
      return reply({ ok: true, draft: prefillFromInquiry(inq, await loadQuoteSettings(cfg), jstToday()) })
    }
    if (action === 'link') {
      const q = await getQuote(cfg, id)
      if (!q) return reply({ ok: false, message: 'その見積書は見つかりませんでした。' })
      const url = await viewLink(req, q, await loadQuoteSettings(cfg))
      if (!url) return reply({ ok: false, message: 'リンクを作れません（SESSION_SECRET か ADMIN_KEY が必要です）。' })
      return reply({ ok: true, url })
    }
    if (action === 'send') return reply(await sendQuote(req, cfg, b))
    if (action === 'settings') {
      const r = await saveQuoteSettings(cfg, b.settings || {})
      return reply(r.ok ? { ok: true, settings: r.settings, regNo: checkRegNo(r.settings.regNo), message: '設定を保存しました。' } : r)
    }
    if (action === 'catalog') return reply({ ok: true, catalog: await saveCatalog(cfg, b.items), message: 'よく使う品目を保存しました。' })
  } catch (e) {
    return json({ ok: false, message: 'うまくいきませんでした（' + String((e && e.message) || e).slice(0, 100) + '）。時間をおいてもう一度お試しください。' }, 502)
  }
  return json({ ok: false, message: '知らない操作です。' }, 400)
}
