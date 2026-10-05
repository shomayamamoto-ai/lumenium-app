// 見積書・請求書の「計算」と「紙の形」。画面とサーバーの両方で同じものを使います。
//
// 何がここにあるか。
//   ・1行の金額（数量 × 単価）と、税率ごとの合計・消費税・総額
//   ・値引き（税率を選ぶ。「全体」のときは税率ごとの金額の割合で分けます）
//   ・登録番号（T＋13桁）の形と、検査用の数字（チェックデジット）
//   ・見積番号（Q-2026-0001）の次の番号
//   ・状態（下書き・送付済み・受注・失注、有効期限を過ぎたら「期限切れ」）
//   ・問い合わせ（サイトの概算見積り付き）から、宛先と品目を下書きする
//   ・サイトのサービス紹介の価格から、よく使う品目を作る
//   ・数字（今月の件数と金額・受注率・決まるまでの日数・どこから来たか）
//   ・A4 の紙の形（HTML。印刷・「PDFで保存」・お客様が開くページで同じもの）
//
// 消費税の決まり（インボイス制度）。
//   消費税は「1枚の書類につき、税率ごとに1回」端数を処理します。品目ごとに
//   税額を出して足し上げるのは認められていません（国税庁 消費税軽減税率制度の
//   手引き・インボイスQ&A 問57）。切り捨て・四捨五入・切り上げのどれにするかは
//   自由です。ここでは設定で選んだ1つを、税率ごとの合計に1回だけ使います。
//   見積書そのものは適格請求書（インボイス）である必要はありませんが、
//   請求書と同じ形（登録番号・税率ごとの合計と税額）で出すと、お客様が
//   あとで請求書と見比べやすくなります。
//
// このファイルは import を持ちません。scripts/test-quotes.mjs が export を外して
// public/quote-core.js（管理画面が読むファイル）を作ります。直すのはこのファイルだけ。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

/** 状態。「期限切れ」は保存しません（有効期限と今日から決まるため）。 */
export const QUOTE_STATUS = { draft: '下書き', sent: '送付済み', won: '受注', lost: '失注', expired: '期限切れ' }
export const INVOICE_STATUS = { draft: '下書き', sent: '送付済み', paid: '入金済み' }
/** 税率。0 は非課税（消費税がかからないもの）。 */
export const RATES = [10, 8, 0]
export const RATE_LABEL = { 10: '10%', 8: '8%（軽減）', 0: '非課税' }
export const ROUNDING = { floor: '切り捨て', round: '四捨五入', ceil: '切り上げ' }
export const TAX_MODE = { excl: '税抜の単価で書く', incl: '税込の単価で書く' }

/** 長さと件数の上限。画面の不具合や悪意のある送信で保存先を埋めないためです。 */
export const QCAPS = {
  items: 60, name: 80, unit: 8, text: 120, notes: 1500, memo: 1500, company: 80, person: 40,
  address: 160, number: 30, catalog: 80, records: 2000, history: 60, price: 999999999, qty: 999999,
}

export const DEFAULT_QUOTE_SETTINGS = {
  company: '', address: '', tel: '', email: '', person: '', regNo: '', bank: '',
  validDays: 30, rounding: 'floor', taxMode: 'excl', payTerms: '月末締め・翌月末までにお振込み', delivery: 'ご発注から2週間ほど',
  notes: '', logo: '', seal: '', prefix: 'Q', invoicePrefix: 'INV', linkDays: 60,
  mailSubject: '【お見積書】{件名}（{会社名}）',
  mailBody:
    '{宛名}\n\nいつもお世話になっております。{会社名}の{担当者}です。\n' +
    'ご依頼いただいた「{件名}」のお見積書をお送りします。\n\n' +
    '　お見積金額：{金額}（税込）\n　有効期限：{有効期限}\n\n' +
    '下のリンクから、お見積書をご覧いただけます（印刷・PDFでの保存もできます）。\n{リンク}\n\n' +
    'ご不明な点がございましたら、このメールにご返信ください。\nどうぞよろしくお願いいたします。\n\n{会社名}\n{担当者}',
}

/* ---------------------------------------------------------- 小さな道具 -- */

const isInt = (n) => typeof n === 'number' && isFinite(n) && Math.floor(n) === n
function clip(v, n) {
  return (v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n)
}
function line(v, n) { return clip(v, n).replace(/[\r\n\t]+/g, ' ').trim() }
/** 全角の数字・記号を半角に。お客様の多くは全角で打ちます。 */
export function toHalf(s) {
  return String(s == null ? '' : s)
    .replace(/[０-９Ａ-Ｚａ-ｚ．－，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ー―‐−–—]/g, '-')
}
/** 「1,200」「１２００」「1200円」を数に。読めなければ NaN。 */
export function num(v) {
  if (typeof v === 'number') return v
  const s = toHalf(v).replace(/[,\s円¥￥]/g, '')
  return s === '' ? NaN : Number(s)
}

/** n ÷ d を、選んだ方法で整数に（n, d は整数・d > 0・n ≥ 0）。
 *  割り算の小数を使わないので、0.1 の誤差で1円ずれることがありません。 */
export function divRound(n, d, mode) {
  const q = Math.floor(n / d)
  const rem = n - q * d
  if (mode === 'ceil') return rem > 0 ? q + 1 : q
  if (mode === 'round') return rem * 2 >= d ? q + 1 : q
  return q
}

/** 1行の金額。数量は小数2桁まで（1.5時間など）。端数は同じ方法で丸めます。 */
export function lineAmount(qty, price, mode) {
  const q = Math.round(Number(qty) * 100)
  const p = Math.round(Number(price))
  if (!isFinite(q) || !isFinite(p) || q < 0 || p < 0) return 0
  return divRound(q * p, 100, mode)
}

/** 3桁ごとのカンマ（toLocaleString は環境で形が変わるため自前で）。 */
export function comma(n) {
  const v = Math.round(Number(n) || 0)
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (v < 0 ? '-' : '') + s
}
export function yen(n) {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '−' : '') + '¥' + comma(Math.abs(v))
}
/** 数量の見せ方（1 → 1、1.5 → 1.5）。 */
export function qtyText(q) {
  const v = Math.round(Number(q) * 100) / 100
  return isFinite(v) ? String(v) : '0'
}

/* ---------------------------------------------------------------- 日付 -- */

/** 日本時間の「今日」（YYYY-MM-DD）。 */
export function jstToday(now) {
  return new Date((now == null ? Date.now() : now) + 9 * 3600000).toISOString().slice(0, 10)
}
export function validYmd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false
  const t = Date.parse(s + 'T00:00:00Z')
  return isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}
export function addDays(ymd, n) {
  const t = Date.parse(ymd + 'T00:00:00Z')
  return new Date(t + n * 86400000).toISOString().slice(0, 10)
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
}
/** 翌月末（請求書の支払期限の既定）。 */
export function endOfNextMonth(ymd) {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
}
/** 「2026年10月5日」 */
export function jpDate(ymd) {
  if (!validYmd(ymd)) return ''
  return Number(ymd.slice(0, 4)) + '年' + Number(ymd.slice(5, 7)) + '月' + Number(ymd.slice(8, 10)) + '日'
}

/* ----------------------------------------------------------- 登録番号 -- */

/** 「T1234-5678-90123」「ｔ１２３…」を「T1234567890123」に。数字が13桁でなければそのまま返します。 */
export function normalizeRegNo(s) {
  const t = toHalf(s).replace(/[\s-]/g, '').toUpperCase()
  if (/^\d{13}$/.test(t)) return 'T' + t
  return t
}

/** 検査用の数字（13桁の先頭の1桁）。法人番号と同じ計算です。
 *    9 − （基礎番号12桁の、下から n 桁目 × (n が奇数なら1・偶数なら2) の合計 を 9 で割った余り）
 *  （国税庁 法人番号公表サイト「チェックデジットの計算方法」）。 */
export function regCheckDigit(base12) {
  let sum = 0
  for (let n = 1; n <= 12; n++) {
    const p = Number(base12.charAt(12 - n))
    sum += p * (n % 2 === 1 ? 1 : 2)
  }
  return 9 - (sum % 9)
}

/** 登録番号を確かめる。
 *  { ok, value, state: 'empty' | 'format' | 'check' | 'ok', message }
 *  法人の登録番号は「T＋法人番号」なので検査用の数字が必ず合います。個人事業主の
 *  番号も同じ仕組みで振られていると考えられますが、公の資料で確かめきれて
 *  いないため、合わないときも「保存を止める」のではなく「もう一度確かめて
 *  ください」と出すだけにしています。 */
export function checkRegNo(s) {
  const value = normalizeRegNo(s)
  if (!value) return { ok: true, value: '', state: 'empty', message: '' }
  if (!/^T\d{13}$/.test(value)) {
    return { ok: false, value, state: 'format', message: '登録番号は「T」と13桁の数字です（例: T1234567890123）。' }
  }
  const d = value.slice(1)
  if (regCheckDigit(d.slice(1)) !== Number(d.charAt(0))) {
    return { ok: true, value, state: 'check', message: '番号の打ち間違いがあるかもしれません（13桁の検査用の数字が合いません）。通知書の番号ともう一度見比べてください。' }
  }
  return { ok: true, value, state: 'ok', message: '' }
}

/* ------------------------------------------------------------- 計算 -- */

/** 値引きを「全体」にしたとき、税率ごとの金額の割合で分けます。
 *  1円未満は切り捨てて、残りを金額の大きい税率から1円ずつ足します（合計が必ず元の額に戻る）。 */
export function allocate(amount, weights) {
  const total = weights.reduce((a, b) => a + b, 0)
  if (!total) return weights.map(() => 0)
  const out = weights.map((w) => Math.floor((amount * w) / total))
  let rest = amount - out.reduce((a, b) => a + b, 0)
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a] || a - b)
  for (let k = 0; rest > 0; k = (k + 1) % order.length) {
    if (weights[order[k]] > 0) { out[order[k]]++; rest-- }
  }
  return out
}

/** 書類1枚の計算。
 *  q.items: [{ kind:'item', name, qty, unit, price, rate } | { kind:'discount', name, price, rate: 10|8|0|'all' }]
 *  q.taxMode: 'excl'（単価は税抜）| 'incl'（単価は税込）
 *  返すもの: amounts（行ごとの金額。値引きは負）, groups（税率ごと）, subtotal（税抜の合計）,
 *            tax（消費税の合計）, total（税込の総額）, discount（値引きの合計）, errors */
export function computeTotals(q, rounding) {
  const mode = ROUNDING[rounding] ? rounding : 'floor'
  const taxMode = q && q.taxMode === 'incl' ? 'incl' : 'excl'
  const items = (q && Array.isArray(q.items)) ? q.items : []
  const sums = { 10: 0, 8: 0, 0: 0 }
  const disc = { 10: 0, 8: 0, 0: 0 }
  const amounts = []
  const errors = []
  const spread = []
  items.forEach((it, i) => {
    if (it.kind === 'discount') {
      const a = Math.max(0, Math.round(Number(it.price) || 0))
      amounts.push(-a)
      if (it.rate === 'all') spread.push(a)
      else disc[RATES.indexOf(Number(it.rate)) >= 0 ? Number(it.rate) : 10] += a
      return
    }
    const r = RATES.indexOf(Number(it.rate)) >= 0 ? Number(it.rate) : 10
    const a = lineAmount(it.qty, it.price, mode)
    amounts.push(a)
    sums[r] += a
  })
  // 「全体」の値引きは、税率ごとの（値引き前の）金額の割合で分けます。
  spread.forEach((a) => {
    const parts = allocate(a, RATES.map((r) => sums[r]))
    RATES.forEach((r, k) => { disc[r] += parts[k] })
    if (!RATES.some((r) => sums[r] > 0) && a > 0) errors.push('値引きを分ける品目がありません。先に品目を入れてください。')
  })
  const groups = []
  let subtotal = 0
  let tax = 0
  let total = 0
  RATES.forEach((r) => {
    if (!sums[r] && !disc[r]) return
    const net = sums[r] - disc[r]
    if (net < 0) {
      errors.push((r ? r + '%の' : '非課税の') + '品目より値引きが大きくなっています。値引きの額か税率を確かめてください。')
    }
    const base = Math.max(0, net)
    let t
    let excl
    let incl
    if (taxMode === 'incl') {
      t = r ? divRound(base * r, 100 + r, mode) : 0
      incl = base
      excl = base - t
    } else {
      t = r ? divRound(base * r, 100, mode) : 0
      excl = base
      incl = base + t
    }
    groups.push({ rate: r, items: sums[r], discount: disc[r], amount: base, excl, tax: t, incl })
    subtotal += excl
    tax += t
    total += incl
  })
  const discount = RATES.reduce((a, r) => a + disc[r], 0)
  return { amounts, groups, subtotal, tax, total, discount, errors, taxMode, rounding: mode }
}

/* -------------------------------------------------------------- 番号 -- */

export function formatNumber(prefix, year, seq) {
  return (prefix || 'Q') + '-' + year + '-' + String(seq).padStart(4, '0')
}

/** 次の番号。数え札（seq）と、すでにある番号の最大＋1 の大きい方。
 *  手で番号を直したものがあっても、同じ番号を2度出さないためです。 */
export function nextNumber(numbers, prefix, year, seq) {
  const head = (prefix || 'Q') + '-' + year + '-'
  let max = 0
  ;(numbers || []).forEach((n) => {
    const s = String(n || '')
    if (s.indexOf(head) === 0 && /^\d+$/.test(s.slice(head.length))) max = Math.max(max, Number(s.slice(head.length)))
  })
  const n = Math.max(Number(seq) || 0, max + 1)
  return { number: formatNumber(prefix, year, n), seq: n }
}

/* -------------------------------------------------------------- 状態 -- */

/** いまの状態。下書き・送付済みのまま有効期限を過ぎたら「期限切れ」。 */
export function effectiveStatus(q, today) {
  if (q.kind === 'invoice') return INVOICE_STATUS[q.status] ? q.status : 'draft'
  const s = QUOTE_STATUS[q.status] && q.status !== 'expired' ? q.status : 'draft'
  if ((s === 'draft' || s === 'sent') && validYmd(q.validUntil) && today > q.validUntil) return 'expired'
  return s
}
export function statusLabel(q, today) {
  const s = effectiveStatus(q, today)
  return (q.kind === 'invoice' ? INVOICE_STATUS : QUOTE_STATUS)[s]
}

/* ---------------------------------------------------- 入力のそろえ方 -- */

function cleanItem(it) {
  const x = it || {}
  if (x.kind === 'discount') {
    const p = num(x.price)
    const rate = x.rate === 'all' ? 'all' : RATES.indexOf(Number(x.rate)) >= 0 ? Number(x.rate) : 'all'
    return { kind: 'discount', name: line(x.name, QCAPS.name) || '値引き', price: isFinite(p) ? Math.min(QCAPS.price, Math.max(0, Math.round(Math.abs(p)))) : 0, rate }
  }
  const qty = num(x.qty)
  const price = num(x.price)
  return {
    kind: 'item',
    name: line(x.name, QCAPS.name),
    qty: isFinite(qty) ? Math.min(QCAPS.qty, Math.max(0, Math.round(qty * 100) / 100)) : 1,
    unit: line(x.unit, QCAPS.unit),
    price: isFinite(price) ? Math.min(QCAPS.price, Math.max(0, Math.round(price))) : 0,
    rate: RATES.indexOf(Number(x.rate)) >= 0 ? Number(x.rate) : 10,
  }
}

/** 画面から来た見積書（または請求書）を、保存できる形に。
 *  { ok, quote, message } — 保存を止めるのは、件名も品目も無いとき・日付が読めないとき・
 *  値引きが金額を超えるときだけです。 */
export function cleanQuote(input, prev, today) {
  const x = input || {}
  const p = prev || {}
  const items = (Array.isArray(x.items) ? x.items : []).slice(0, QCAPS.items).map(cleanItem)
    .filter((it) => it.kind === 'discount' ? it.price > 0 : (it.name || it.price > 0))
  const kind = (p.kind || x.kind) === 'invoice' ? 'invoice' : 'quote'
  const date = validYmd(x.date) ? x.date : (p.date || today)
  const q = {
    id: p.id || '',
    kind,
    number: line(x.number, QCAPS.number) || p.number || '',
    date,
    toCompany: line(x.toCompany, QCAPS.company),
    toPerson: line(x.toPerson, QCAPS.person),
    honor: x.honor === '御中' ? '御中' : '様',
    toEmail: line(x.toEmail, 100),
    subject: line(x.subject, QCAPS.text),
    items,
    taxMode: x.taxMode === 'incl' ? 'incl' : 'excl',
    validUntil: validYmd(x.validUntil) ? x.validUntil : '',
    delivery: line(x.delivery, QCAPS.text),
    payTerms: line(x.payTerms, QCAPS.text),
    dueDate: validYmd(x.dueDate) ? x.dueDate : '',
    notes: clip(x.notes, QCAPS.notes).trim(),
    memo: clip(x.memo, QCAPS.memo).trim(),
    status: p.status || 'draft',
    inquiryId: p.inquiryId || line(x.inquiryId, 40),
    source: p.source || line(x.source, 60),
    sourceKind: p.sourceKind || line(x.sourceKind, 20),
    fromQuote: p.fromQuote || line(x.fromQuote, 40),
    createdAt: p.createdAt || '',
    sentAt: p.sentAt || '',
    openedAt: p.openedAt || '',
    lastViewedAt: p.lastViewedAt || '',
    views: p.views || 0,
    decidedAt: p.decidedAt || '',
    sentTo: p.sentTo || '',
    history: Array.isArray(p.history) ? p.history.slice(-QCAPS.history) : [],
  }
  if (!q.subject && !items.length) return { ok: false, message: '件名か品目を1つ以上入れてください。' }
  if (x.validUntil && !q.validUntil) return { ok: false, message: '有効期限の日付が読めません。' }
  if (q.validUntil && q.validUntil < q.date) return { ok: false, message: '有効期限が発行日より前になっています。' }
  return { ok: true, quote: q }
}

/** 一覧用の要約。一覧・数字はこれだけで出します。 */
export function quoteSummary(q, rounding) {
  const t = computeTotals(q, rounding)
  return {
    id: q.id, kind: q.kind || 'quote', number: q.number, date: q.date, subject: q.subject,
    to: [q.toCompany, q.toPerson].filter(Boolean).join(' ') || '（宛先なし）',
    total: t.total, status: q.status, validUntil: q.validUntil, dueDate: q.dueDate || '',
    sentAt: q.sentAt || '', openedAt: q.openedAt || '', views: q.views || 0, decidedAt: q.decidedAt || '',
    inquiryId: q.inquiryId || '', source: q.source || '', sourceKind: q.sourceKind || '',
    fromQuote: q.fromQuote || '', createdAt: q.createdAt || '',
  }
}

/** 状態を変える。受注・失注には「決まった日」を残します（決まるまでの日数のため）。 */
export function applyStatus(q, status, nowIso) {
  const table = q.kind === 'invoice' ? INVOICE_STATUS : QUOTE_STATUS
  if (!table[status] || status === 'expired') return { ok: false, message: '状態の値が正しくありません。' }
  const before = q.status
  if (before === status) return { ok: true, quote: q, changed: false }
  const r = JSON.parse(JSON.stringify(q))
  r.status = status
  if (status === 'won' || status === 'lost' || status === 'paid') r.decidedAt = nowIso
  else r.decidedAt = ''
  if (status === 'sent' && !r.sentAt) r.sentAt = nowIso
  r.history = (r.history || []).concat([{ at: nowIso, what: 'status', text: (table[before] || '—') + ' → ' + table[status] }]).slice(-QCAPS.history)
  return { ok: true, quote: r, changed: true }
}

/** 複製。番号・状態・送った記録は持ち越しません。 */
export function duplicateQuote(q, today, validDays) {
  const r = JSON.parse(JSON.stringify(q))
  return Object.assign(r, {
    id: '', number: '', date: today, status: 'draft', validUntil: addDays(today, validDays || 30),
    sentAt: '', openedAt: '', lastViewedAt: '', views: 0, decidedAt: '', sentTo: '', createdAt: '',
    history: [], fromQuote: '',
  })
}

/** 受注した見積書から、請求書の下書き。 */
export function invoiceFromQuote(q, today, settings) {
  const r = duplicateQuote(q, today, 0)
  return Object.assign(r, {
    kind: 'invoice', validUntil: '', delivery: '', dueDate: endOfNextMonth(today),
    subject: q.subject, fromQuote: q.id, payTerms: '',
    notes: q.notes,
  })
}

/* ---------------------------------------------------------------- 数字 -- */

/** 見積書の数字。summaries は quoteSummary の一覧（請求書は数えません）。
 *  件数が少ないうちは割合が大きくぶれるので、少ないことを言葉で添えます。 */
export function quoteStats(summaries, today) {
  const list = (summaries || []).filter((s) => (s.kind || 'quote') === 'quote')
  const month = today.slice(0, 7)
  const thisMonth = list.filter((s) => String(s.date).slice(0, 7) === month)
  const won = list.filter((s) => s.status === 'won')
  const lost = list.filter((s) => s.status === 'lost')
  const decided = won.length + lost.length
  const days = []
  won.concat(lost).forEach((s) => {
    const d = String(s.decidedAt || '').slice(0, 10)
    if (validYmd(d) && validYmd(s.date)) days.push(Math.max(0, daysBetween(s.date, d)))
  })
  const waiting = list.filter((s) => effectiveStatus(s, today) === 'sent')
  const bySrc = {}
  list.forEach((s) => {
    const k = s.source || (s.inquiryId ? '問い合わせ（経路不明）' : '問い合わせ以外（直接作成）')
    const b = bySrc[k] || (bySrc[k] = { source: k, count: 0, won: 0, lost: 0, wonAmount: 0 })
    b.count++
    if (s.status === 'won') { b.won++; b.wonAmount += s.total }
    if (s.status === 'lost') b.lost++
  })
  const sources = Object.keys(bySrc).map((k) => {
    const b = bySrc[k]
    const n = b.won + b.lost
    return Object.assign(b, { rate: n ? b.won / n : null, decided: n })
  }).sort((a, b) => b.count - a.count || (a.source < b.source ? -1 : 1))
  return {
    month,
    monthCount: thisMonth.length,
    monthAmount: thisMonth.reduce((a, s) => a + s.total, 0),
    monthWonAmount: thisMonth.filter((s) => s.status === 'won').reduce((a, s) => a + s.total, 0),
    total: list.length,
    won: won.length,
    lost: lost.length,
    decided,
    winRate: decided ? won.length / decided : null,
    avgDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    daysN: days.length,
    waiting: waiting.length,
    waitingAmount: waiting.reduce((a, s) => a + s.total, 0),
    expired: list.filter((s) => effectiveStatus(s, today) === 'expired').length,
    few: decided < 5,
    sources,
  }
}

/** 割合の言い方。分母が小さいときは「何件中何件」を必ず添えます。 */
export function rateText(won, decided) {
  if (!decided) return 'まだ決まった見積書がありません'
  const pct = Math.round((won / decided) * 100)
  return pct + '%（' + decided + '件中 ' + won + '件）' + (decided < 5 ? '・件数が少ないので参考程度に' : '')
}

/* ---------------------------------------------- 問い合わせから下書き -- */

function yenNum(s) { return Number(String(s || '').replace(/[^\d]/g, '')) || 0 }

/** サイトの概算見積り（src/data/estimate.js の summarise）が本文に入っていれば読む。
 *  お客様が本文を書き換えていることもあるので、読めた分だけ返します。 */
export function parseEstimate(message) {
  const m = String(message || '')
  const head = /【([^】]{1,60})】の概算見積り/.exec(m)
  if (!head) return null
  const rest = m.slice(head.index + head[0].length)
  const picks = []
  const re = /^・([^:：\n]{1,30})[:：]\s*(.{1,80})$/gm
  let x
  const stop = rest.search(/概算[:：]/)
  const block = stop >= 0 ? rest.slice(0, stop) : rest
  while ((x = re.exec(block))) picks.push({ label: x[1].trim(), value: x[2].trim() })
  const money = /概算[:：]\s*([^\n]+)/.exec(rest)
  const out = { title: head[1].trim(), picks, low: 0, high: 0, monthly: 0, unitNote: '', text: money ? money[1].trim() : '' }
  if (money) {
    const t = money[1]
    const unit = /（([^）]{1,30})）\s*$/.exec(t)
    if (unit) out.unitNote = unit[1]
    const mo = /月額\s*¥\s*([\d,]+)/.exec(t)
    if (mo) out.monthly = yenNum(mo[1])
    const range = /¥\s*([\d,]+)\s*〜\s*¥\s*([\d,]+)/.exec(t)
    if (range) { out.low = yenNum(range[1]); out.high = yenNum(range[2]) }
  }
  return out
}

/** 問い合わせ1件（api/_inquiries.js の形）から、見積書の下書き。
 *  概算見積りがあれば品目に、無ければ宛先と件名だけ。金額は「概算の下限」を
 *  入れ、幅は社内メモ（印刷されません）に残します。 */
export function prefillFromInquiry(inq, settings, today) {
  const s = Object.assign({}, DEFAULT_QUOTE_SETTINGS, settings || {})
  const r = inq || {}
  const est = parseEstimate(r.message)
  const topics = Array.isArray(r.topics) ? r.topics.filter(Boolean) : []
  const items = []
  const memo = []
  if (est) {
    const detail = est.picks.map((p) => p.value).join('／')
    if (est.low) {
      items.push({ kind: 'item', name: line(est.title + (detail ? '（' + detail + '）' : ''), QCAPS.name), qty: 1, unit: '式', price: est.low, rate: 10 })
    }
    if (est.monthly) {
      items.push({ kind: 'item', name: line(est.title + ' 月額', QCAPS.name), qty: 1, unit: '月', price: est.monthly, rate: 10 })
    }
    memo.push('サイトの概算見積り: ' + (est.text || '（金額なし）') + '。単価には概算の下限を入れています。内容を確かめて直してください。')
    est.picks.forEach((p) => memo.push('・' + p.label + ': ' + p.value))
  }
  const company = line(r.company, QCAPS.company)
  const person = line(r.name, QCAPS.person)
  return {
    kind: 'quote',
    date: today,
    toCompany: company,
    toPerson: person,
    honor: person ? '様' : '御中',
    toEmail: line(r.email, 100),
    subject: est ? est.title + 'のお見積り' : topics.length ? topics.slice(0, 3).join('・') + 'のお見積り' : 'お見積り',
    items,
    taxMode: s.taxMode === 'incl' ? 'incl' : 'excl',
    validUntil: addDays(today, Number(s.validDays) || 30),
    delivery: s.delivery,
    payTerms: s.payTerms,
    notes: s.notes,
    memo: memo.join('\n'),
    inquiryId: r.id || '',
    source: r.source && r.source.short ? line(r.source.short, 60) : '問い合わせ（経路不明）',
    sourceKind: r.source && r.source.kind ? line(r.source.kind, 20) : '',
  }
}

/* -------------------------------------------- サービスの価格から品目 -- */

/** 「3万円〜」「5,000円」から円の数を取り出す（src/data/estimate.js の parseYen と同じ読み方）。 */
export function parseYenAll(text) {
  const out = []
  const re = /([\d,]+(?:\.\d+)?)\s*(万)?\s*円/g
  let m
  while ((m = re.exec(String(text || '')))) {
    const n = parseFloat(m[1].replace(/,/g, ''))
    if (isFinite(n)) out.push(Math.round(m[2] ? n * 10000 : n))
  }
  return out
}

/** サービス紹介の価格（例「LP 30万円〜 / サイト 60万円〜」）から、よく使う品目を作ります。
 *  「/」で区切った1つずつが1品目。金額が読めない区切り（「イベント企画別途」）は飛ばします。 */
export function catalogFromServices(services) {
  const out = []
  ;(services || []).forEach((svc) => {
    String(svc.price || '').split(/\s*[\/／]\s*/).forEach((seg) => {
      const yenList = parseYenAll(seg)
      if (!yenList.length) return
      const label = seg.replace(/[\d,]+(?:\.\d+)?\s*万?\s*円.*$/, '').replace(/[（(].*$/, '').trim()
      let unit = '式'
      if (/月額/.test(label)) unit = '月'
      else if (/1名|１名/.test(label)) unit = '名'
      else if (/1回|１回/.test(label)) unit = '回'
      out.push({ name: line(svc.title + (label ? '（' + label + '）' : ''), QCAPS.name), unit, price: yenList[0], rate: 10, from: 'site' })
    })
  })
  return out.slice(0, QCAPS.catalog)
}

export function cleanCatalog(list) {
  return (Array.isArray(list) ? list : []).slice(0, QCAPS.catalog).map((x) => {
    const c = cleanItem(Object.assign({}, x, { kind: 'item', qty: 1 }))
    return { name: c.name, unit: c.unit, price: c.price, rate: c.rate }
  }).filter((c) => c.name)
}

/* --------------------------------------------------------- メールの文 -- */

export const MAIL_VARS = ['宛名', '件名', '金額', '有効期限', 'リンク', '会社名', '担当者', '番号']

/** {宛名} などを入れ替える。知らない {…} はそのまま残します。 */
export function fillMail(text, vars) {
  return String(text || '').replace(/\{([^{}]{1,10})\}/g, (all, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : all))
}

export function addressee(q) {
  const lines = [q.toCompany, q.toPerson].filter(Boolean)
  if (!lines.length) return ''
  return lines.join(' ') + ' ' + (q.honor || '様')
}

export function mailVars(q, settings, link, rounding) {
  const s = settings || {}
  return {
    宛名: addressee(q), 件名: q.subject || 'お見積り', 金額: yen(computeTotals(q, rounding).total),
    有効期限: jpDate(q.validUntil) || '—', リンク: link || '', 会社名: s.company || '', 担当者: s.person || '', 番号: q.number || '',
  }
}

/* ---------------------------------------------------- A4 の紙（HTML） -- */

function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function nl(t) { return esc(t).replace(/\n/g, '<br>') }
/** 画像の URL は https か data:image だけ（ほかは入れません）。 */
function imgOk(u) { return /^(https:\/\/[^\s"'<>]+|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(String(u || '')) }

export const DOC_CSS =
  '@page{size:A4;margin:14mm 14mm 16mm}' +
  '*{box-sizing:border-box}' +
  '.qd{font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","YuGothic","Meiryo","Noto Sans JP",sans-serif;color:#1b1b1f;font-size:10.5pt;line-height:1.65;' +
  'font-feature-settings:"palt" 0;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff;width:100%;max-width:182mm;margin:0 auto}' +
  '.qd .num{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}' +
  '.qd h1{font-size:20pt;font-weight:700;letter-spacing:.6em;text-indent:.6em;text-align:center;margin:0 0 6mm;padding-bottom:2mm;border-bottom:2px solid #1b1b1f}' +
  '.qd .meta{text-align:right;font-size:9.5pt;margin-bottom:4mm}.qd .meta div{white-space:nowrap}' +
  '.qd .top{display:flex;justify-content:space-between;gap:8mm;align-items:flex-start}' +
  '.qd .to{flex:1 1 55%;min-width:0}.qd .to .nm{font-size:14pt;font-weight:700;border-bottom:1px solid #1b1b1f;padding-bottom:1mm;margin-bottom:3mm;overflow-wrap:anywhere}' +
  '.qd .to .nm small{font-size:11pt;font-weight:700;margin-left:.5em}' +
  '.qd .lead{margin:0 0 3mm}' +
  '.qd .kv{border-collapse:collapse;font-size:10pt}.qd .kv th{font-weight:400;color:#55555e;text-align:left;padding:.5mm 4mm .5mm 0;white-space:nowrap;vertical-align:top}.qd .kv td{padding:.5mm 0;overflow-wrap:anywhere}' +
  '.qd .from{flex:0 1 42%;min-width:0;position:relative;font-size:9.5pt;line-height:1.6;padding-right:2mm}' +
  '.qd .from .co{font-size:12pt;font-weight:700;margin:1mm 0;overflow-wrap:anywhere}' +
  '.qd .from .logo{max-width:46mm;max-height:14mm;display:block;margin-bottom:1mm}' +
  '.qd .from .seal{position:absolute;right:0;top:4mm;width:20mm;height:20mm;object-fit:contain;opacity:.92}' +
  '.qd .from .reg{margin-top:1mm;white-space:nowrap}' +
  '.qd .big{display:flex;justify-content:space-between;align-items:baseline;border:1.5px solid #1b1b1f;padding:2.5mm 4mm;margin:6mm 0 5mm;break-inside:avoid}' +
  '.qd .big .k{font-weight:700;font-size:11pt}.qd .big .v{font-size:17pt;font-weight:700}.qd .big .v small{font-size:9.5pt;font-weight:400;margin-left:.4em}' +
  '.qd table.it{width:100%;border-collapse:collapse;font-size:9.5pt}' +
  '.qd table.it thead{display:table-header-group}' +
  '.qd table.it th{background:#efede8;font-weight:700;border:1px solid #9a978f;padding:1.5mm 2mm;text-align:center;white-space:nowrap}' +
  '.qd table.it td{border:1px solid #9a978f;padding:1.5mm 2mm;vertical-align:top}' +
  '.qd table.it tr{break-inside:avoid}' +
  '.qd table.it td.nm{overflow-wrap:anywhere}.qd table.it td.c{text-align:center;white-space:nowrap}' +
  '.qd table.it tr.disc td{color:#7a2a20}' +
  '.qd .sum{display:flex;justify-content:flex-end;margin-top:3mm;break-inside:avoid}' +
  '.qd .sum table{border-collapse:collapse;font-size:9.5pt;min-width:88mm}' +
  '.qd .sum th{font-weight:400;text-align:left;padding:1mm 4mm 1mm 2mm;border-bottom:1px solid #d6d3cc;white-space:nowrap}' +
  '.qd .sum td{padding:1mm 2mm;border-bottom:1px solid #d6d3cc}' +
  '.qd .sum tr.tot th,.qd .sum tr.tot td{font-weight:700;font-size:11pt;border-bottom:2px solid #1b1b1f;border-top:1px solid #1b1b1f}' +
  '.qd .foot{font-size:8.5pt;color:#55555e;margin-top:1.5mm;text-align:right}' +
  '.qd .box{border:1px solid #9a978f;padding:2.5mm 3mm;margin-top:5mm;font-size:9.5pt;break-inside:avoid;overflow-wrap:anywhere}' +
  '.qd .box h2{font-size:9.5pt;font-weight:700;margin:0 0 1mm}' +
  '.qd .warn{border:1px dashed #b42318;color:#b42318;padding:2mm 3mm;margin:0 0 4mm;font-size:9pt}' +
  '@media screen{.qd{padding:14mm;box-shadow:0 1px 6px rgba(0,0,0,.12);margin:12px auto;max-width:210mm}}' +
  '@media screen and (max-width:640px){.qd{padding:16px 14px;font-size:13px}.qd .top{flex-direction:column;gap:12px}.qd .from,.qd .to{flex:1 1 auto;width:100%}' +
  '.qd h1{font-size:20px;letter-spacing:.3em;text-indent:.3em}.qd .big .v{font-size:20px}.qd .sum table{min-width:0;width:100%}' +
  '.qd table.it{font-size:12px}.qd table.it th,.qd table.it td{padding:4px 5px}.qd .col-u,.qd .col-r{display:none}}' +
  '@media print{.qd{max-width:none;padding:0;box-shadow:none;margin:0}.qd-noprint{display:none!important}}'

/** 書類1枚の HTML（<div class="qd">…</div>）。issuer は設定（会社名・住所…）。
 *  opts.draft: 「下書き」の注意を上に出す（画面の確認用。お客様に出すときは付けません） */
export function renderDoc(q, issuer, opts) {
  const s = Object.assign({}, DEFAULT_QUOTE_SETTINGS, issuer || {})
  const o = opts || {}
  const t = computeTotals(q, s.rounding)
  const inv = q.kind === 'invoice'
  const title = inv ? '請求書' : '御見積書'
  const rows = (q.items || []).map((it, i) => {
    const a = t.amounts[i]
    if (it.kind === 'discount') {
      const rl = it.rate === 'all' ? '—' : RATE_LABEL[it.rate]
      return '<tr class="disc"><td class="c">' + (i + 1) + '</td><td class="nm">' + esc(it.name || '値引き') + (it.rate === 'all' ? '（税率ごとに按分）' : '') +
        '</td><td class="num"></td><td class="c col-u"></td><td class="num"></td><td class="c col-r">' + esc(rl) + '</td><td class="num">' + yen(a) + '</td></tr>'
    }
    return '<tr><td class="c">' + (i + 1) + '</td><td class="nm">' + esc(it.name) + '</td><td class="num">' + qtyText(it.qty) + '</td><td class="c col-u">' + esc(it.unit) +
      '</td><td class="num">' + yen(it.price) + '</td><td class="c col-r">' + (it.rate === 8 ? '8%※' : it.rate === 0 ? '非課税' : '10%') + '</td><td class="num">' + yen(a) + '</td></tr>'
  }).join('')
  const incl = t.taxMode === 'incl'
  const sumRows = []
  sumRows.push('<tr><th>小計（税抜）</th><td class="num">' + yen(t.subtotal) + '</td></tr>')
  t.groups.forEach((g) => {
    if (!g.rate) { sumRows.push('<tr><th>非課税 対象</th><td class="num">' + yen(g.amount) + '</td></tr>'); return }
    const lb = g.rate === 8 ? '8%（軽減税率）' : '10%'
    sumRows.push('<tr><th>' + lb + ' 対象' + (incl ? '（税込）' : '（税抜）') + '</th><td class="num">' + yen(incl ? g.incl : g.excl) + '</td></tr>')
    sumRows.push('<tr><th>' + lb + ' 消費税' + (incl ? '（内税）' : '') + '</th><td class="num">' + yen(g.tax) + '</td></tr>')
  })
  sumRows.push('<tr class="tot"><th>合計（税込）</th><td class="num">' + yen(t.total) + '</td></tr>')
  const kv = []
  if (q.subject) kv.push(['件名', q.subject])
  if (inv) {
    if (q.dueDate) kv.push(['お支払期限', jpDate(q.dueDate)])
  } else {
    if (q.validUntil) kv.push(['有効期限', jpDate(q.validUntil)])
    if (q.delivery) kv.push(['納期', q.delivery])
    if (q.payTerms) kv.push(['お支払条件', q.payTerms])
  }
  const reg = checkRegNo(s.regNo)
  const warn = []
  if (o.draft && inv && (!reg.value || reg.state === 'format')) warn.push('請求書を適格請求書（インボイス）として出すには、設定に登録番号が必要です。')
  if (o.draft && t.errors.length) warn.push(t.errors.join(' '))
  if (o.draft) warn.unshift('この画面は確認用です（「下書き」の印はお客様に送るものには出ません）。')
  const to = [q.toCompany, q.toPerson].filter(Boolean)
  const toHtml = to.length
    ? to.map((v, i) => esc(v) + (i === to.length - 1 ? '<small>' + esc(q.honor || '様') + '</small>' : '')).join('<br>')
    : '<span style="color:#9a978f">（宛先）</span>'
  const has8 = (q.items || []).some((it) => it.kind !== 'discount' && it.rate === 8)
  return '<div class="qd">' +
    (warn.length ? '<div class="warn qd-noprint">' + warn.map(esc).join('<br>') + '</div>' : '') +
    '<h1>' + title + '</h1>' +
    '<div class="meta"><div>' + (inv ? '請求番号' : '見積番号') + '：' + esc(q.number || '（未採番）') + '</div><div>' + (inv ? '請求日' : '発行日') + '：' + esc(jpDate(q.date)) + '</div></div>' +
    '<div class="top"><div class="to"><div class="nm">' + toHtml + '</div>' +
    '<p class="lead">' + (inv ? '下記のとおりご請求申し上げます。' : '下記のとおりお見積り申し上げます。') + '</p>' +
    (kv.length ? '<table class="kv">' + kv.map((r) => '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' : '') +
    '</div><div class="from">' +
    (imgOk(s.logo) ? '<img class="logo" src="' + esc(s.logo) + '" alt="">' : '') +
    (imgOk(s.seal) ? '<img class="seal" src="' + esc(s.seal) + '" alt="印">' : '') +
    '<div class="co">' + esc(s.company || '（会社名）') + '</div>' +
    (s.address ? '<div>' + nl(s.address) + '</div>' : '') +
    (s.tel ? '<div>TEL ' + esc(s.tel) + '</div>' : '') +
    (s.email ? '<div>' + esc(s.email) + '</div>' : '') +
    (s.person ? '<div>担当：' + esc(s.person) + '</div>' : '') +
    (reg.value && reg.state !== 'format' ? '<div class="reg">登録番号：' + esc(reg.value) + '</div>' : '') +
    '</div></div>' +
    '<div class="big"><span class="k">' + (inv ? 'ご請求金額' : '御見積金額') + '</span><span class="v num">' + yen(t.total) + '<small>（税込）</small></span></div>' +
    '<table class="it"><thead><tr><th style="width:7%">No.</th><th>品目</th><th style="width:9%">数量</th><th class="col-u" style="width:8%">単位</th>' +
    '<th style="width:14%">単価' + (incl ? '（税込）' : '') + '</th><th class="col-r" style="width:9%">税率</th><th style="width:15%">金額' + (incl ? '（税込）' : '') + '</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="7" class="c" style="color:#9a978f">（品目なし）</td></tr>') + '</tbody></table>' +
    '<div class="sum"><table>' + sumRows.join('') + '</table></div>' +
    '<div class="foot">' + (has8 ? '※は軽減税率（8%）の対象です。' : '') + '消費税は税率ごとの合計から計算し、1円未満は' + ROUNDING[t.rounding] + 'にしています。</div>' +
    (inv && s.bank ? '<div class="box"><h2>お振込先</h2>' + nl(s.bank) + '<div style="margin-top:1mm">お振込手数料はご負担くださいますようお願いいたします。</div></div>' : '') +
    (q.notes ? '<div class="box"><h2>備考</h2>' + nl(q.notes) + '</div>' : '') +
    '</div>'
}

/** 1枚だけのページ（印刷用の窓・お客様が開くリンクの両方で使う）。 */
export function docPage(q, issuer, opts) {
  const o = opts || {}
  const name = (q.kind === 'invoice' ? '請求書 ' : '御見積書 ') + (q.number || '')
  const bar = o.toolbar
    ? '<div class="qd-noprint" style="max-width:210mm;margin:12px auto 0;padding:0 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-family:system-ui,sans-serif;font-size:13px">' +
      '<button type="button" onclick="window.print()" style="font:inherit;font-weight:700;padding:9px 16px;border-radius:10px;border:1px solid #1b1b1f;background:#1b1b1f;color:#fff;cursor:pointer">印刷・PDFで保存</button>' +
      '<span style="color:#55555e;line-height:1.6">' + esc(o.toolbar === true ? 'PDFにするときは、印刷の画面で「送信先（プリンタ）」を「PDFに保存」にしてください。' : o.toolbar) + '</span></div>'
    : ''
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(name) + '</title><style>html,body{margin:0;background:#f3f1ec}@media print{html,body{background:#fff}}' + DOC_CSS + '</style></head><body>' +
    bar + renderDoc(q, issuer, o) + '</body></html>'
}
