// 見積書のテスト。外には一切出ません（保存先・メールは偽物）。
//
//   node scripts/test-quotes.mjs
//
// はじめに api/_quote-core.js から public/quote-core.js（管理画面が読むファイル）を
// 作り直します。計算と紙の形が、画面とサーバー（お客様が開くリンク）で1つであるためです。
//
// 確かめること。
//   ・消費税は「税率ごとに1回」の端数処理（切り捨て・四捨五入・切り上げ）。品目ごとに丸めて足さない
//   ・税込の単価で書いたとき（内税）の税額
//   ・値引き（税率を選ぶ・「全体」は割合で分けて合計が必ず元に戻る・金額を超えたら知らせる）
//   ・数量の小数（1.5時間）、非課税
//   ・番号の振り方（年ごと・手で直した番号を飛び越える）
//   ・有効期限を過ぎたら「期限切れ」（受注・失注はそのまま）
//   ・登録番号（T＋13桁・全角やハイフン・検査用の数字）
//   ・見るだけのリンクの署名（正しい・書き換え・別の鍵・期限切れ）
//   ・問い合わせ（サイトの概算見積りの文）から、宛先と品目の下書き
//   ・サービスの価格から、よく使う品目
//   ・数字（受注率・決まるまでの日数・件数が少ないときの言い方・どこから）
//   ・紙の形（登録番号・税率ごとの行・HTML を埋め込ませない）
//   ・窓口を偽の保存先とメールで通す（保存・番号・状態・複製・請求書・送付・開いた記録）

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

/* ---- 画面用のファイルを作る ---- */
const SRC = new URL('../api/_quote-core.js', import.meta.url)
const OUT = new URL('../public/quote-core.js', import.meta.url)
{
  const src = readFileSync(SRC, 'utf8')
  if (/^\s*import\s/m.test(src)) throw new Error('_quote-core.js は import を持てません（画面でも読むため）')
  const names = []
  const body = src.replace(/^export\s+(const|var|let|function)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { names.push(name); return `${kind} ${name}` })
  if (/^export\s/m.test(body)) throw new Error('_quote-core.js に、画面用に外せない export があります')
  const out = '/* 自動生成: scripts/test-quotes.mjs が api/_quote-core.js から作ります。直接は直さないでください。 */\n' +
    '(function () {\n' + body + '\nwindow.lumQuoteCore = { ' + names.join(', ') + ' };\n})();\n'
  let prev = ''
  try { prev = readFileSync(OUT, 'utf8') } catch (_) {}
  if (prev !== out) writeFileSync(OUT, out)
  const win = {}
  vm.runInNewContext(out, { window: win, Date, Math, JSON, Array, String, Number, Object, isFinite })
  assert.equal(typeof win.lumQuoteCore.computeTotals, 'function', '画面用のファイルに computeTotals がある')
  assert.equal(typeof win.lumQuoteCore.renderDoc, 'function', '画面用のファイルに renderDoc がある')
}

const C = await import('../api/_quote-core.js')

let passed = 0
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++ }, (e) => { console.error('✗ ' + name); throw e })
}
const item = (price, rate = 10, qty = 1) => ({ kind: 'item', name: '品目', qty, unit: '式', price, rate })
const tot = (items, rounding = 'floor', taxMode = 'excl') => C.computeTotals({ items, taxMode }, rounding)

/* ------------------------------------------------------------ 消費税 -- */
await test('税率ごとの端数処理: 3つの方法', () => {
  // 10% 対象 1,005円 → 100.5円、8% 対象 1,006円 → 80.48円
  const items = [item(1005, 10), item(1006, 8)]
  const f = tot(items, 'floor'); const r = tot(items, 'round'); const c = tot(items, 'ceil')
  assert.deepEqual(f.groups.map((g) => g.tax), [100, 80])
  assert.deepEqual(r.groups.map((g) => g.tax), [101, 80])
  assert.deepEqual(c.groups.map((g) => g.tax), [101, 81])
  assert.equal(f.subtotal, 2011)
  assert.equal(f.total, 2011 + 180)
  assert.equal(c.total, 2011 + 182)
})
await test('品目ごとに丸めて足さない（1枚につき税率ごとに1回）', () => {
  // 105円×2行。行ごとに切り捨てると 10+10=20円、正しくは 210円の10% = 21円
  const t = tot([item(105), item(105)], 'floor')
  assert.equal(t.tax, 21)
  assert.equal(t.groups.length, 1)
})
await test('税込の単価で書いたとき（内税）', () => {
  assert.equal(tot([item(1100)], 'floor', 'incl').tax, 100)
  const t = tot([item(1000)], 'floor', 'incl') // 1000×10/110 = 90.90…
  assert.equal(t.tax, 90)
  assert.equal(t.total, 1000)
  assert.equal(t.subtotal, 910)
  assert.equal(tot([item(1000)], 'round', 'incl').tax, 91)
  assert.equal(tot([item(1000)], 'ceil', 'incl').tax, 91)
  assert.equal(tot([item(1080, 8)], 'floor', 'incl').tax, 80)
})
await test('非課税は税額0・合計にそのまま入る', () => {
  const t = tot([item(10000, 10), item(3000, 0)])
  assert.deepEqual(t.groups.map((g) => [g.rate, g.tax]), [[10, 1000], [0, 0]])
  assert.equal(t.total, 14000)
})
await test('数量の小数（1.5時間）と、行の金額の丸め', () => {
  assert.equal(C.lineAmount(1.5, 1001, 'floor'), 1501)
  assert.equal(C.lineAmount(1.5, 1001, 'round'), 1502)
  assert.equal(C.lineAmount(0.1, 3, 'ceil'), 1)
  assert.equal(C.lineAmount(3, 333, 'floor'), 999)
  assert.equal(C.lineAmount('２', '1,200', 'floor'), 0, '画面で数に直してから渡す（cleanQuote）')
  const q = C.cleanQuote({ subject: 'x', items: [{ name: 'a', qty: '２', price: '1,200円' }] }, null, '2026-10-05').quote
  assert.equal(q.items[0].qty, 2)
  assert.equal(q.items[0].price, 1200)
})
await test('浮動小数の誤差で1円ずれない', () => {
  // 0.1 + 0.2 のような誤差が出る組み合わせ
  assert.equal(tot([item(29)], 'ceil').tax, 3)
  assert.equal(tot([item(30)], 'ceil').tax, 3)
  assert.equal(tot([item(1150)], 'round', 'incl').tax, 105) // 1150×10/110 = 104.54…
  assert.equal(C.divRound(150, 100, 'round'), 2)
  assert.equal(C.divRound(149, 100, 'round'), 1)
})

/* -------------------------------------------------------------- 値引き -- */
await test('値引き: 税率を選んだもの', () => {
  const t = tot([item(10000, 10), item(5000, 8), { kind: 'discount', name: '値引き', price: 1000, rate: 10 }])
  assert.deepEqual(t.amounts, [10000, 5000, -1000])
  assert.deepEqual(t.groups.map((g) => [g.rate, g.amount, g.tax]), [[10, 9000, 900], [8, 5000, 400]])
  assert.equal(t.discount, 1000)
  assert.equal(t.total, 15300)
  assert.equal(t.itemsTotal, 15000, '値引き前の合計')
})
await test('値引き: 「全体」は税率ごとの割合で分け、合計は必ず元の額', () => {
  const t = tot([item(1234, 10), item(999, 8), { kind: 'discount', price: 100, rate: 'all' }])
  const d = t.groups.map((g) => g.discount)
  assert.equal(d[0] + d[1], 100)
  assert.deepEqual(d, [56, 44])
  assert.deepEqual(C.allocate(10, [1, 1, 1]), [4, 3, 3])
  assert.deepEqual(C.allocate(0, [5, 5]), [0, 0])
  assert.deepEqual(C.allocate(7, [0, 3]), [0, 7])
})
await test('値引きが品目を超えたら知らせる', () => {
  const t = tot([item(1000, 10), { kind: 'discount', price: 2000, rate: 10 }])
  assert.equal(t.errors.length, 1)
  assert.equal(t.total, 0)
  const t2 = tot([{ kind: 'discount', price: 500, rate: 'all' }])
  assert.ok(t2.errors.length >= 1)
})

/* ---------------------------------------------------------------- 番号 -- */
await test('番号: 年ごと・4桁・手で直した番号を飛び越える', () => {
  assert.equal(C.formatNumber('Q', '2026', 1), 'Q-2026-0001')
  assert.equal(C.formatNumber('Q', '2026', 12345), 'Q-2026-12345')
  const have = ['Q-2026-0001', 'Q-2026-0007', 'Q-2025-0100', 'X-2026-0050', 'Q-2026-abc']
  assert.equal(C.nextNumber(have, 'Q', '2026', 3).number, 'Q-2026-0008')
  assert.equal(C.nextNumber(have, 'Q', '2026', 9).number, 'Q-2026-0009')
  assert.equal(C.nextNumber([], 'Q', '2027', 1).number, 'Q-2027-0001')
  assert.equal(C.nextNumber(have, 'X', '2026', 1).number, 'X-2026-0051')
})

/* ---------------------------------------------------------------- 状態 -- */
await test('有効期限を過ぎたら「期限切れ」（下書き・送付済みだけ）', () => {
  const q = (status, validUntil) => ({ kind: 'quote', status, validUntil })
  assert.equal(C.effectiveStatus(q('sent', '2026-10-04'), '2026-10-05'), 'expired')
  assert.equal(C.effectiveStatus(q('draft', '2026-10-04'), '2026-10-05'), 'expired')
  assert.equal(C.effectiveStatus(q('sent', '2026-10-05'), '2026-10-05'), 'sent', '当日まで有効')
  assert.equal(C.effectiveStatus(q('won', '2026-01-01'), '2026-10-05'), 'won')
  assert.equal(C.effectiveStatus(q('lost', '2026-01-01'), '2026-10-05'), 'lost')
  assert.equal(C.effectiveStatus(q('sent', ''), '2026-10-05'), 'sent', '期限なしは切れない')
  assert.equal(C.statusLabel(q('sent', '2026-10-01'), '2026-10-05'), '期限切れ')
  const r = C.applyStatus({ kind: 'quote', status: 'sent', history: [] }, 'won', '2026-10-05T01:00:00Z')
  assert.equal(r.quote.decidedAt, '2026-10-05T01:00:00Z')
  assert.equal(C.applyStatus({ status: 'sent' }, 'expired', 'x').ok, false, '「期限切れ」は手で選べない')
})
await test('入力の確かめ: 有効期限が発行日より前・空の見積書', () => {
  assert.equal(C.cleanQuote({ date: '2026-10-05', validUntil: '2026-10-01', subject: 'x' }, null, '2026-10-05').ok, false)
  assert.equal(C.cleanQuote({ date: '2026-10-05' }, null, '2026-10-05').ok, false)
  assert.equal(C.cleanQuote({ date: '2026-02-30', subject: 'x' }, null, '2026-10-05').quote.date, '2026-10-05', '読めない日付は今日')
  const q = C.cleanQuote({ subject: 'x', honor: '御中', items: [{ kind: 'discount', price: -300, rate: 'all' }, { name: '' }] }, null, '2026-10-05').quote
  assert.equal(q.honor, '御中')
  assert.deepEqual(q.items, [{ kind: 'discount', name: '値引き', price: 300, rate: 'all' }])
})

/* ------------------------------------------------------------ 登録番号 -- */
await test('登録番号: 形と検査用の数字', () => {
  // 国税庁の法人番号（7000012050002）は検査用の数字が合う実在の番号です。
  assert.equal(C.checkRegNo('T7000012050002').state, 'ok')
  assert.equal(C.checkRegNo('7000012050002').value, 'T7000012050002', 'T が無ければ足す')
  assert.equal(C.checkRegNo('Ｔ７０００－０１２０－５０００２').state, 'ok', '全角・ハイフン')
  assert.equal(C.checkRegNo('t 1180301018771').state, 'ok')
  const bad = C.checkRegNo('T7000012050003')
  assert.equal(bad.state, 'check')
  assert.equal(bad.ok, true, '検査用の数字が合わなくても止めはしない（知らせるだけ）')
  assert.equal(C.checkRegNo('T123').ok, false)
  assert.equal(C.checkRegNo('X7000012050002').ok, false)
  assert.equal(C.checkRegNo('').state, 'empty')
  assert.equal(C.regCheckDigit('000012050002'), 7)
})

/* ------------------------------------------------- 問い合わせから下書き -- */
const E = await import('../src/data/estimate.js')
await test('問い合わせ（概算見積り付き）から: 宛先・件名・品目・社内メモ', () => {
  const picks = { kind: 'pr', shoot: 'half', vol: '1' }
  const res = E.calculate('video', picks)
  const message = '採用ページに載せたいです。\n\n' + E.summarise('video', picks, res)
  const inq = { id: 'qabc123', name: '山田 花子', company: '株式会社サンプル', email: 'h@example.com', topics: ['動画制作'], message, source: { short: 'Instagram（計測リンク）', kind: 'social' } }
  const d = C.prefillFromInquiry(inq, { validDays: 14, taxMode: 'excl' }, '2026-10-05')
  assert.equal(d.toCompany, '株式会社サンプル')
  assert.equal(d.toPerson, '山田 花子')
  assert.equal(d.honor, '様')
  assert.equal(d.toEmail, 'h@example.com')
  assert.equal(d.subject, '動画制作・映像編集のお見積り')
  assert.equal(d.items.length, 1)
  assert.equal(d.items[0].price, res.low)
  assert.match(d.items[0].name, /会社紹介・PR動画/)
  assert.equal(d.validUntil, '2026-10-19')
  assert.equal(d.inquiryId, 'qabc123')
  assert.equal(d.source, 'Instagram（計測リンク）')
  assert.match(d.memo, /概算の下限/)
  assert.ok(d.memo.includes(E.yen(res.high)), '幅は社内メモに残す')
})
await test('問い合わせ（初期＋月額）から: 2行', () => {
  const picks = { kind: 'line', freq: 'w1', prod: 'plan' }
  const res = E.calculate('sns', picks)
  const d = C.prefillFromInquiry({ id: 'q1', name: '中村', message: E.summarise('sns', picks, res) }, {}, '2026-10-05')
  assert.deepEqual(d.items.map((i) => [i.unit, i.price]), [['式', res.low], ['月', res.monthly]])
  assert.equal(d.toCompany, '')
  assert.equal(d.source, '問い合わせ（経路不明）')
})
await test('問い合わせ（概算なし）から: 宛先と件名だけ', () => {
  const d = C.prefillFromInquiry({ id: 'q2', company: 'みどり工房', name: '', topics: ['Web制作・システム', 'ロゴ・バナー'], message: 'ホームページを新しくしたいです。' }, {}, '2026-10-05')
  assert.equal(d.items.length, 0)
  assert.equal(d.honor, '御中')
  assert.equal(d.subject, 'Web制作・システム・ロゴ・バナーのお見積り')
  assert.equal(C.parseEstimate('ただの文です'), null)
})

/* ------------------------------------------------- サービスの価格から -- */
await test('よく使う品目: サイトのサービス紹介の価格から', async () => {
  const { SERVICES } = await import('../src/data/services.js')
  const cat = C.catalogFromServices(SERVICES)
  assert.ok(cat.length >= SERVICES.length, '各サービスから1つ以上')
  for (const c of cat) assert.ok(c.name && c.price > 0)
  const two = C.catalogFromServices([{ title: 'Web', price: 'LP 30万円〜 / サイト 60万円〜' }, { title: 'キャスト', price: 'キャスト1名 5,000円〜 / イベント企画別途' }])
  assert.deepEqual(two.map((c) => [c.name, c.price, c.unit]), [['Web（LP）', 300000, '式'], ['Web（サイト）', 600000, '式'], ['キャスト（キャスト1名）', 5000, '名']])
})

/* ---------------------------------------------------------------- 数字 -- */
await test('数字: 今月・受注率・決まるまでの日数・どこから', () => {
  const s = (id, date, status, total, extra) => Object.assign({ id, kind: 'quote', date, status, total, validUntil: '2026-12-31' }, extra || {})
  const list = [
    s('a', '2026-10-01', 'won', 100000, { decidedAt: '2026-10-04T03:00:00Z', source: 'Instagram（計測リンク）', inquiryId: 'q1' }),
    s('b', '2026-10-02', 'lost', 50000, { decidedAt: '2026-10-03T03:00:00Z', source: 'Instagram（計測リンク）', inquiryId: 'q2' }),
    s('c', '2026-09-10', 'won', 30000, { decidedAt: '2026-09-20T03:00:00Z' }),
    s('d', '2026-10-03', 'sent', 20000),
    s('e', '2026-08-01', 'sent', 999, { validUntil: '2026-08-31' }),
    s('i', '2026-10-03', 'draft', 77777, { kind: 'invoice' }),
  ]
  const st = C.quoteStats(list, '2026-10-05')
  assert.equal(st.monthCount, 3)
  assert.equal(st.monthAmount, 170000)
  assert.equal(st.won, 2)
  assert.equal(st.lost, 1)
  assert.equal(Math.round(st.winRate * 100), 67)
  assert.equal(st.avgDays, Math.round(((3 + 1 + 10) / 3) * 10) / 10)
  assert.equal(st.waiting, 1)
  assert.equal(st.waitingAmount, 20000)
  assert.equal(st.expired, 1)
  assert.equal(st.few, true)
  assert.deepEqual(st.sources.map((x) => [x.source, x.count, x.rate]), [['問い合わせ以外（直接作成）', 3, 1], ['Instagram（計測リンク）', 2, 0.5]])
  assert.match(C.rateText(2, 3), /67%（3件中 2件）・件数が少ないので参考程度/)
  assert.equal(C.rateText(0, 0), 'まだ決まった見積書がありません')
  assert.doesNotMatch(C.rateText(6, 10), /参考程度/)
})

/* -------------------------------------------------------------- 紙の形 -- */
await test('紙の形: 登録番号・税率ごとの行・軽減税率の印・埋め込ませない', () => {
  const q = {
    kind: 'quote', number: 'Q-2026-0001', date: '2026-10-05', validUntil: '2026-11-04', toCompany: '<b>株式会社</b>', toPerson: '', honor: '御中',
    subject: '件名', items: [item(10000, 10), { kind: 'item', name: '<script>alert(1)</script>', qty: 2, unit: '個', price: 500, rate: 8 }], notes: '備考です',
  }
  const h = C.renderDoc(q, { company: '見本商店', regNo: 'T7000012050002', rounding: 'floor' })
  assert.ok(h.includes('登録番号：T7000012050002'))
  assert.ok(h.includes('御見積書'))
  assert.ok(h.includes('8%（軽減税率） 対象（税抜）'))
  assert.ok(h.includes('10% 消費税'))
  assert.ok(h.includes('8%※'))
  assert.ok(!h.includes('<script>'))
  assert.ok(h.includes('&lt;b&gt;株式会社&lt;/b&gt;<small>御中</small>'))
  assert.ok(h.includes('¥12,080'), '10000+1000 + 1000+80')
  const bad = C.renderDoc(q, { company: 'x', regNo: 'T12', logo: 'javascript:alert(1)', seal: 'http://x/y.png' })
  assert.ok(!bad.includes('登録番号'), '形の合わない番号は出さない')
  assert.ok(!bad.includes('javascript:') && !bad.includes('http://x'), 'https と data:image 以外の画像は入れない')
  const inv = C.renderDoc(Object.assign({}, q, { kind: 'invoice', dueDate: '2026-11-30' }), { bank: '見本銀行 本店 普通 1234567' }, { draft: true })
  assert.ok(inv.includes('請求書') && inv.includes('お振込先') && inv.includes('2026年11月30日'))
  assert.ok(inv.includes('登録番号が必要'), '請求書で登録番号が無いと知らせる（確認用の画面だけ）')
  assert.ok(inv.includes('取引の年月日'), '請求書で取引日が無いと知らせる')
  const inv2 = C.renderDoc(Object.assign({}, q, { kind: 'invoice', delivery: '2026年9月20日' }), { regNo: 'T7000012050002' }, { draft: true })
  assert.ok(inv2.includes('お取引日') && !inv2.includes('取引の年月日'))
  assert.equal(C.invoiceFromQuote(Object.assign({}, q, { id: 'qtx1', status: 'won' }), '2026-10-05').notes, '', '見積書の備考は持ち越さない')
  assert.ok(h.includes('値引き前の合計') === false, '値引きが無ければ値引きの行は出さない')
  assert.ok(C.docPage(q, {}, { toolbar: true }).includes('印刷・PDFで保存'))
  assert.equal(C.endOfNextMonth('2026-01-31'), '2026-02-28')
  assert.equal(C.endOfNextMonth('2026-12-05'), '2027-01-31')
})
await test('メールの文: 差し込み', () => {
  const v = C.mailVars({ toCompany: 'A社', toPerson: '山田', honor: '様', subject: 'HP', number: 'Q-1', validUntil: '2026-11-04', items: [item(1000)] }, { company: '見本', person: '佐藤' }, 'https://x/y', 'floor')
  assert.equal(v['宛名'], 'A社 山田 様')
  assert.equal(v['金額'], '¥1,100')
  assert.equal(C.fillMail('{宛名}へ {リンク} {知らない}', v), 'A社 山田 様へ https://x/y {知らない}')
})

/* ------------------------------------------------- サーバー（偽の相手と） -- */
const REDIS = 'https://redis.test.invalid'
for (const n of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[n]
Object.assign(process.env, {
  UPSTASH_REDIS_REST_URL: REDIS, UPSTASH_REDIS_REST_TOKEN: 't', ADMIN_KEY: 'test-admin-key', SESSION_SECRET: 'sess-quote',
  RESEND_API_KEY: 'resend', CONTACT_FROM_EMAIL: '見本商店 <shop@example.jp>',
})
const kv = new Map()
const hashes = new Map()
const mails = []
function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    if (op === 'GET') return { result: kv.has(k) ? kv.get(k) : null }
    if (op === 'SET') { kv.set(k, String(c[2])); return { result: 'OK' } }
    if (op === 'DEL') { kv.delete(k); return { result: 1 } }
    if (op === 'INCR') { const v = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(v)); return { result: v } }
    if (op === 'HSET') { const h = hashes.get(k) || new Map(); h.set(c[2], String(c[3])); hashes.set(k, h); return { result: 1 } }
    if (op === 'HDEL') { const h = hashes.get(k); if (h) h.delete(c[2]); return { result: 1 } }
    if (op === 'HGETALL') { const h = hashes.get(k); return { result: h ? [...h].flat().map(String) : [] } }
    return { result: null }
  })
}
const jres = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) return jres(redis(JSON.parse(init.body)))
  if (u.includes('api.resend.com')) { mails.push(JSON.parse(init.body)); return jres({ id: 'm' }) }
  throw new Error('unexpected fetch ' + u)
}

const S = await import('../api/_quotes.js')
const api = await import('../api/quotes.js')
const view = await import('../api/quote-view.js')
const { BRAND, KV } = await import('../api/_brand.js')
const ADMIN = { authorization: 'Bearer test-admin-key', 'content-type': 'application/json' }
const post = async (body) => { const r = await api.POST(new Request('https://lumenium.net/api/quotes', { method: 'POST', headers: { ...ADMIN, 'x-forwarded-for': '198.51.100.7' }, body: JSON.stringify(body) })); return { status: r.status, d: await r.json() } }
const get = async (q = '', h = ADMIN) => { const r = await api.GET(new Request('https://lumenium.net/api/quotes' + q, { headers: { ...h, 'x-forwarded-for': '198.51.100.7' } })); return { status: r.status, d: await r.json() } }
const open = (t) => view.GET(new Request('https://lumenium.net/api/quote-view?t=' + encodeURIComponent(t)))

await test('見るだけのリンク: 署名・書き換え・別の鍵・期限', async () => {
  const now = Date.parse('2026-10-05T00:00:00Z')
  const t = await S.signView('qtabc123', now + 86400000, 'k1')
  assert.deepEqual(await S.verifyView(t, 'k1', now), { ok: true, id: 'qtabc123' })
  assert.equal((await S.verifyView(t, 'k2', now)).reason, 'bad', '別の鍵')
  assert.equal((await S.verifyView(t.replace('qtabc123', 'qtabc124'), 'k1', now)).reason, 'bad', 'id の書き換え')
  const [id, exp, sig] = t.split('.')
  assert.equal((await S.verifyView(`${id}.${Number(exp) + 86400}.${sig}`, 'k1', now)).reason, 'bad', '期限の書き換え')
  assert.equal((await S.verifyView(t, 'k1', now + 2 * 86400000)).reason, 'expired')
  assert.equal((await S.verifyView('', 'k1', now)).reason, 'bad')
  assert.equal((await S.verifyView(t, '', now)).reason, 'bad', '鍵が無ければ通さない')
})

await test('窓口: 管理キーが無ければ断る', async () => {
  const r = await get('', { 'content-type': 'application/json' })
  assert.equal(r.status, 401)
})

let first
await test('窓口: 設定（登録番号の形・端数処理）', async () => {
  const bad = await post({ action: 'settings', settings: { regNo: 'T12345' } })
  assert.equal(bad.status, 400)
  const r = await post({ action: 'settings', settings: { company: '見本商店', regNo: 'Ｔ7000012050002', rounding: 'round', validDays: 14, bank: '見本銀行 本店 普通 1234567' } })
  assert.equal(r.status, 200, r.d.message)
  assert.equal(r.d.settings.regNo, 'T7000012050002')
  assert.equal(r.d.regNo.state, 'ok')
  assert.equal((await post({ action: 'settings', settings: { rounding: 'banker' } })).status, 400)
  assert.equal((await post({ action: 'settings', settings: { seal: 'data:text/html;base64,AAAA' } })).status, 400)
  assert.equal((await post({ action: 'settings', settings: { logo: 'http://insecure.example/logo.png' } })).status, 400)
  const st = await get()
  assert.equal(st.d.catalogSeeded, true, 'よく使う品目は、はじめはサイトの価格から')
  assert.ok(st.d.catalog.length > 0)
})

await test('窓口: 作る・番号は自動で順に・同じ番号は断る', async () => {
  const a = await post({ action: 'save', quote: { subject: 'HP制作', date: '2026-10-05', toCompany: '株式会社A', items: [item(300000)] } })
  assert.equal(a.status, 200, a.d.message)
  first = a.d.quote
  assert.equal(first.number, 'Q-2026-0001')
  assert.match(first.id, /^qt/)
  assert.equal(a.d.summary.total, 330000)
  const b = await post({ action: 'save', quote: { subject: '2件目', date: '2026-10-05', items: [item(1000)] } })
  assert.equal(b.d.quote.number, 'Q-2026-0002')
  const dup = await post({ action: 'save', quote: { subject: '3件目', number: 'Q-2026-0001', items: [item(1)] } })
  assert.equal(dup.status, 400)
  const hand = await post({ action: 'save', quote: { subject: '手で番号', number: 'Q-2026-0010', date: '2026-10-05', items: [item(1)] } })
  assert.equal(hand.status, 200)
  const c = await post({ action: 'save', quote: { subject: '次', date: '2026-10-05', items: [item(1)] } })
  assert.equal(c.d.quote.number, 'Q-2026-0011', '手で直した番号を飛び越える')
  const ed = await post({ action: 'save', quote: Object.assign({}, first, { subject: 'HP制作（直し）' }) })
  assert.equal(ed.d.quote.number, 'Q-2026-0001', '直しても番号は変わらない')
  assert.equal(ed.d.quote.history.at(-1).what, 'edited')
  const list = (await get()).d.list
  assert.equal(list.length, 4)
})

await test('窓口: 問い合わせから下書き・保存すると問い合わせの履歴に残る', async () => {
  const picks = { kind: 'lp', pages: 's', extra: 'none' }
  const message = E.summarise('web', picks, E.calculate('web', picks))
  const rec = { id: 'qinq0001', receivedAt: '2026-10-04T00:00:00Z', name: '鈴木', company: 'みどり工房', email: 'm@example.com', topics: ['Web制作'], message, source: { short: '検索（google.com）', kind: 'search' }, history: [], status: 'new', spam: false }
  kv.set(`${KV}inq:r:qinq0001`, JSON.stringify(rec))
  const p = await post({ action: 'from-inquiry', inquiryId: 'qinq0001' })
  assert.equal(p.status, 200, p.d.message)
  assert.equal(p.d.draft.toCompany, 'みどり工房')
  assert.equal(p.d.draft.validUntil, C.addDays(C.jstToday(), 14), '設定の有効期限（14日）')
  const s = await post({ action: 'save', quote: p.d.draft })
  assert.equal(s.d.quote.inquiryId, 'qinq0001')
  assert.equal(s.d.summary.source, '検索（google.com）')
  const after = JSON.parse(kv.get(`${KV}inq:r:qinq0001`))
  assert.match(after.history.at(-1).text, /見積書 Q-2026-\d{4} を作成/)
  assert.equal((await post({ action: 'from-inquiry', inquiryId: 'nope' })).status, 400)
})

await test('窓口: 送付（試用アドレスは断る・送ると送付済み・リンクを開くと記録）', async () => {
  const keep = BRAND.from
  BRAND.from = 'X <onboarding@resend.dev>'
  const sb = await post({ action: 'send', id: first.id, to: 'a@example.com' })
  assert.equal(sb.status, 400)
  assert.match(sb.d.message, /試用アドレス/)
  BRAND.from = keep
  assert.equal(mails.length, 0)
  assert.equal((await post({ action: 'send', id: first.id, to: 'not-an-address' })).status, 400)
  const r = await post({ action: 'send', id: first.id, to: 'a@example.com', subject: '{件名}', body: '{宛名}\n{リンク}' })
  assert.equal(r.status, 200, r.d.message)
  assert.equal(r.d.quote.status, 'sent')
  assert.ok(r.d.quote.sentAt)
  assert.equal(mails.length, 1)
  assert.equal(mails[0].subject, 'HP制作（直し）')
  const link = /https:\/\/\S+\/api\/quote-view\?t=(\S+)/.exec(mails[0].text)
  assert.ok(link, 'メールに見るだけのリンク')
  assert.ok(mails[0].text.startsWith('株式会社A 御中') || mails[0].text.startsWith('株式会社A 様'))
  const page = await open(decodeURIComponent(link[1]))
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(html.includes('御見積書') && html.includes('Q-2026-0001') && html.includes('T7000012050002'))
  assert.ok(html.includes('印刷・PDFで保存'))
  assert.match(page.headers.get('x-robots-tag'), /noindex/)
  const q = (await get('?id=' + first.id)).d.quote
  assert.ok(q.openedAt, '開いた日を記録')
  assert.equal(q.views, 1)
  await open(decodeURIComponent(link[1]))
  assert.equal((await get('?id=' + first.id)).d.quote.views, 2)
  assert.equal((await open(decodeURIComponent(link[1]).slice(0, -1) + '0')).status, 400, '書き換えたリンク')
  const old = await S.signView(first.id, Date.now() - 1000, 'sess-quote')
  assert.equal((await open(old)).status, 410, '期限切れのリンク')
  const lk = await post({ action: 'link', id: first.id })
  assert.match(lk.d.url, /\/api\/quote-view\?t=qt/)
})

await test('窓口: 受注 → 請求書の下書き・複製・状態・消す', async () => {
  assert.equal((await post({ action: 'invoice', id: first.id })).status, 400, '受注前は請求書にできない')
  const w = await post({ action: 'status', id: first.id, status: 'won' })
  assert.equal(w.d.quote.status, 'won')
  assert.ok(w.d.quote.decidedAt)
  const inv = await post({ action: 'invoice', id: first.id })
  assert.equal(inv.status, 200, inv.d.message)
  assert.equal(inv.d.quote.kind, 'invoice')
  assert.equal(inv.d.quote.number, 'INV-' + C.jstToday().slice(0, 4) + '-0001')
  assert.equal(inv.d.quote.fromQuote, first.id)
  assert.equal(inv.d.quote.dueDate, C.endOfNextMonth(C.jstToday()))
  assert.equal(inv.d.quote.status, 'draft')
  assert.equal((await post({ action: 'status', id: inv.d.quote.id, status: 'paid' })).d.quote.status, 'paid')
  assert.equal((await post({ action: 'status', id: inv.d.quote.id, status: 'won' })).status, 400, '請求書は受注にはならない')
  const dp = await post({ action: 'duplicate', id: first.id })
  assert.equal(dp.d.quote.status, 'draft')
  assert.equal(dp.d.quote.sentAt, '')
  assert.equal(dp.d.quote.views, 0)
  assert.notEqual(dp.d.quote.number, first.number)
  assert.equal((await post({ action: 'delete', id: dp.d.quote.id })).status, 200)
  assert.equal((await get('?id=' + dp.d.quote.id)).status, 404)
  const st = C.quoteStats((await get()).d.list, C.jstToday())
  assert.equal(st.won, 1)
  assert.ok(!(await get()).d.list.some((s) => s.id === dp.d.quote.id))
})

await test('窓口: よく使う品目を保存・知らない操作', async () => {
  const r = await post({ action: 'catalog', items: [{ name: '出張費', unit: '回', price: '5,000', rate: 10 }, { name: '' }] })
  assert.deepEqual(r.d.catalog, [{ name: '出張費', unit: '回', price: 5000, rate: 10 }])
  assert.equal((await get()).d.catalogSeeded, false)
  assert.equal((await post({ action: 'nope' })).status, 400)
})

console.log(`✓ 見積書のテスト ${passed}件`)
