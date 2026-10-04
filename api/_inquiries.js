// 問い合わせの保存（Upstash Redis）と、数え方。
//
// これまでフォームの内容はメールで送るだけで、どこにも残りませんでした。
// メールが送れなかったとき（キーの期限切れ・送信先の不調）は、お客様の
// 問い合わせがそのまま消えていました。いまは「先に保存、それからメール」
// の順にしてあり、メールが失敗しても、管理画面に「メール未送信」として
// 残ります。
//
// 置き方。
//   ${KV}inq:list        id → 一覧用の要約（JSON）。一覧・数・検索はこれだけで出します
//   ${KV}inq:r:<id>      1件の全部（本文・メモ・履歴）
//   ${KV}inq:settings    保存期間・受付確認メール・LINE通知・ブロックするドメイン
//   ${KV}inq:tpl         返信の文例
//
// 1件＝1つの JSON にしているのは、2つの画面で同時に別の問い合わせを
// 直しても、互いの変更を消さないためです。
//
// 保存期間（既定365日）を過ぎたものは、一覧を開いたときに消します。
// お名前・メールアドレス・内容は個人情報なので、必要以上に持ち続けない
// ためです。
//
// 計算（返信までの時間・遅れ・集計・CSV）は保存と切り離してあり、
// scripts/test-inquiries.mjs が保存先なしで確かめます。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { SOURCES, aiName, refKind } from './_referrers.js'

export const IK = {
  list: `${KV}inq:list`,
  rec: (id) => `${KV}inq:r:${id}`,
  settings: `${KV}inq:settings`,
  tpl: `${KV}inq:tpl`,
}

export const STATUS_LABEL = { new: '未対応', doing: '対応中', done: '完了' }
export const STATUSES = Object.keys(STATUS_LABEL)

/* 件数と長さの上限。画面の不具合や悪意のあるリクエストで、保存先
   （無料枠は容量が小さい）を埋め尽くさないためです。 */
export const CAPS = {
  records: 3000, notes: 50, note: 1000, history: 80, templates: 20,
  tplName: 40, tplSubject: 120, tplBody: 3000, assignee: 40, domains: 100, bulk: 100,
}

/* 「48時間以内に返信」はサイトに書いてある約束です。24時間で黄色、
   48時間で赤にします。土日も含めた、ただの経過時間です。 */
export const PROMISED_H = 48
export const WARN_H = 24

export const NO_STORE_MSG = '保存先が無いため、問い合わせは保存されていません。メールで届いたものだけが手元に残ります。Vercel の環境変数に保存先（Upstash Redis の URL とトークン）を入れると、ここに貯まるようになります（フォームはお客様の側で動くため、この管理画面にだけ入れたキーでは保存できません）。'

export const SANDBOX_MSG = '送信元がResendの試用アドレス（onboarding@resend.dev）のため、お客様への受付確認メールは送っていません。試用アドレスからは、Resendに登録した自分のアドレスにしか届かないためです。自社のドメインをResendで認証し、送信元（CONTACT_FROM_EMAIL）をそのアドレスにすると送れるようになります。'

export const DEFAULT_SETTINGS = {
  retentionDays: 365,
  replyHours: 48,
  autoReply: {
    on: false,
    subject: '【{brand}】お問い合わせを受け付けました',
    body: [
      '{company} {name} 様',
      '',
      '{brand} です。お問い合わせありがとうございます。',
      '内容を確かめて、{reply_hours}時間以内に担当からご返信いたします。',
      '',
      'お急ぎの場合や、内容を書き足したい場合は、このメールにそのまま返信してください。',
      '',
      '※このメールは送信と同時に自動でお送りしています。',
      '　お心当たりが無い場合は、お手数ですがこのメールを破棄してください。',
    ].join('\n'),
  },
  lineOn: false,
  lineUserId: '',
  blockedDomains: [],
}

export const DEFAULT_TEMPLATES = [
  {
    id: 'thanks', name: 'お礼と日程の相談',
    subject: '【{brand}】お問い合わせありがとうございます',
    body: '{company} {name} 様\n\n{brand} です。お問い合わせありがとうございます。\n「{topics}」についてのご相談、詳しくお聞かせいただけますと幸いです。\n\nオンラインで30分ほど、お話をうかがえる日時の候補をいくつかお知らせください。\n\nどうぞよろしくお願いいたします。',
  },
  {
    id: 'estimate', name: '見積りのご案内',
    subject: '【{brand}】お見積りについて',
    body: '{company} {name} 様\n\n{brand} です。お問い合わせありがとうございます。\nいただいた内容をもとに、お見積りをお送りします。\n\n（ここに金額と内訳を書きます）\n\nご不明な点があれば、このメールにそのまま返信してください。',
  },
  {
    id: 'decline', name: 'お受けできない場合',
    subject: '【{brand}】お問い合わせへのご返信',
    body: '{company} {name} 様\n\n{brand} です。お問い合わせありがとうございます。\n大変申し訳ありませんが、今回のご依頼は、私どもではお受けすることが難しい内容でした。\n\nまたの機会がございましたら、どうぞよろしくお願いいたします。',
  },
]

/* ---------------- 値の検査 ---------------- */

export const str = (v, n) => (v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n || 500)
const one = (v, n) => str(v, n).replace(/\s+/g, ' ').trim()
export const idOk = (v) => /^[a-z0-9_-]{1,40}$/.test(String(v || ''))
const isoOk = (v) => typeof v === 'string' && !isNaN(Date.parse(v))
const tok = (v, n) => String(v || '').toLowerCase().trim().slice(0, n).replace(/[^a-z0-9._-]/g, '')

export function newId(now = Date.now()) {
  return 'q' + now.toString(36) + Math.random().toString(36).slice(2, 6)
}

/** 電話番号は任意。数字と記号だけを残します。 */
export function cleanPhone(v) {
  const s = str(v, 30).replace(/[^\d+\-() ]/g, '').trim()
  return /\d{6,}/.test(s.replace(/\D/g, '')) ? s.slice(0, 20) : ''
}

/* ---------------- どこから来たか ----------------
   フォームが、計測（beacon-core.js）の「いまの訪問」の控えをそのまま
   添えて送ってきます。s = 計測リンクの名前（?ref=）、m = 種類、
   c = キャンペーン、r = 紹介元のホスト。アクセス解析と同じ表を使って、
   人が読める言葉にします。 */
export function sourceInfo(raw) {
  const x = raw && typeof raw === 'object' ? raw : {}
  const s = tok(x.s, 32)
  const m = tok(x.m, 32)
  const c = tok(x.c, 48)
  let r = ''
  try { r = x.r ? new URL(String(x.r).slice(0, 200)).hostname.toLowerCase().replace(/^www\./, '') : '' } catch (_) { r = '' }
  let kind = 'direct'
  let short = '直接・不明'
  let label = '直接・不明（ブックマーク、URLの入力、メールやアプリ内のリンクなど、紹介元が分からない経路）'
  if (s && /^[a-z0-9_-]+$/.test(s)) {
    const known = SOURCES[s]
    kind = known ? known[1] : 'referral'
    short = known ? `${known[0]}（計測リンク）` : `計測リンク「${s}」`
    label = `${known ? known[0] : `「${s}」`}（計測リンク）から来た人`
  } else if (s || r) {
    const host = s && s.includes('.') ? s.replace(/^www\./, '') : r
    kind = refKind(host)
    const name = aiName(host)
    if (kind === 'ai') { short = `${name}（AI）`; label = `${name}（AIアシスタントの回答）から来た人` }
    else if (kind === 'search') { short = `検索（${host}）`; label = `検索エンジン（${host}）から来た人` }
    else if (kind === 'social') { short = `SNS（${host}）`; label = `SNS・LINE（${host}）から来た人` }
    else { short = `他のサイト（${host}）`; label = `他のサイト（${host}）から来た人` }
  }
  if (c) label += `・キャンペーン「${c}」`
  return { s, m, c, r, kind, short, label }
}

/* ---------------- 1件の形 ---------------- */

/** フォームの値（api/contact.js で検査済み）から、保存する1件を作る。 */
export function newRecord(input, now = Date.now()) {
  const i = input || {}
  return {
    id: idOk(i.id) ? i.id : newId(now),
    receivedAt: new Date(now).toISOString(),
    name: one(i.name, 50),
    company: one(i.company, 80),
    org: one(i.org, 20),
    email: one(i.email, 100),
    phone: cleanPhone(i.phone),
    topics: (Array.isArray(i.topics) ? i.topics : []).map((t) => one(t, 30)).filter(Boolean).slice(0, 7),
    message: str(i.message, 1000).trim(),
    page: one(i.page, 120),
    estimate: !!i.estimate,
    source: sourceInfo(i.source),
    status: 'new',
    spam: !!i.spam,
    readAt: '',
    repliedAt: '',
    assignee: '',
    notes: [],
    history: [{ at: new Date(now).toISOString(), what: 'received', text: i.spam ? '受信（ブロックするドメインのため迷惑に分類）' : '受信' }],
    mail: { owner: 'pending', ownerError: '', auto: 'off', autoError: '', line: 'off', lineError: '' },
  }
}

/** 一覧用の要約。一覧・数・検索・CSV 以外では本体を読みます。 */
export function summary(r) {
  return {
    id: r.id, receivedAt: r.receivedAt, name: r.name, company: r.company, email: r.email,
    topics: r.topics || [], snippet: String(r.message || '').slice(0, 160), status: r.status,
    spam: !!r.spam, readAt: r.readAt || '', repliedAt: r.repliedAt || '', assignee: r.assignee || '',
    source: r.source ? r.source.short : '', kind: r.source ? r.source.kind : 'direct',
    campaign: r.source ? r.source.c : '', estimate: !!r.estimate,
    mailOwner: r.mail ? r.mail.owner : '', notes: (r.notes || []).length,
  }
}

/* ---------------- 状態を変える ----------------
   変えたことは履歴に残します。「いつ誰が完了にしたか」が後から分からないと、
   同じお客様に二人が返信したり、誰も返信しなかったりします。 */
export function applyPatch(rec, patch, now = Date.now()) {
  const r = JSON.parse(JSON.stringify(rec))
  const p = patch || {}
  const at = new Date(now).toISOString()
  const log = (what, text) => { r.history.push({ at, what, text }) }
  let changed = false
  if (p.status !== undefined) {
    if (!STATUS_LABEL[p.status]) return { ok: false, message: '状態の値が正しくありません。' }
    if (p.status !== r.status) {
      log('status', `${STATUS_LABEL[r.status] || r.status} → ${STATUS_LABEL[p.status]}`)
      r.status = p.status
      changed = true
    }
  }
  if (p.spam !== undefined && !!p.spam !== !!r.spam) {
    r.spam = !!p.spam
    log('spam', r.spam ? '迷惑に分類' : '迷惑から戻す')
    changed = true
  }
  if (p.replied !== undefined) {
    if (p.replied && !r.repliedAt) {
      r.repliedAt = isoOk(p.repliedAt) && Date.parse(p.repliedAt) <= now && Date.parse(p.repliedAt) >= Date.parse(r.receivedAt)
        ? new Date(Date.parse(p.repliedAt)).toISOString() : at
      log('replied', '返信した')
      // 返信したのに「未対応」のままだと、一覧で遅れとして数え続けます。
      if (r.status === 'new') { log('status', `${STATUS_LABEL.new} → ${STATUS_LABEL.doing}`); r.status = 'doing' }
      changed = true
    } else if (!p.replied && r.repliedAt) {
      r.repliedAt = ''
      log('replied', '「返信した」を取り消し')
      changed = true
    }
  }
  if (p.assignee !== undefined) {
    const a = one(p.assignee, CAPS.assignee)
    if (a !== r.assignee) {
      log('assignee', a ? `担当: ${a}` : '担当を外す')
      r.assignee = a
      changed = true
    }
  }
  if (p.note !== undefined) {
    const t = str(p.note, CAPS.note).trim()
    if (t) {
      r.notes.push({ at, text: t })
      r.notes = r.notes.slice(-CAPS.notes)
      changed = true
    }
  }
  if (p.read && !r.readAt) { r.readAt = at; changed = true }
  r.history = r.history.slice(-CAPS.history)
  return { ok: true, rec: r, changed }
}

/* ---------------- 返信までの時間 ---------------- */

const H = 3600 * 1000

/** 受信から「返信した」までの時間（時間）。まだなら null。 */
export function replyHours(r) {
  if (!r || !r.repliedAt) return null
  const h = (Date.parse(r.repliedAt) - Date.parse(r.receivedAt)) / H
  return isFinite(h) && h >= 0 ? h : null
}

/** 返信がまだで、24時間を超えたら 'warn'、48時間を超えたら 'late'。
 *  迷惑・完了・返信済みは数えません。 */
export function overdue(r, now = Date.now()) {
  if (!r || r.spam || r.status === 'done' || r.repliedAt) return ''
  const h = (now - Date.parse(r.receivedAt)) / H
  return h > PROMISED_H ? 'late' : h > WARN_H ? 'warn' : ''
}

export function median(xs) {
  const a = xs.filter((x) => typeof x === 'number' && isFinite(x)).sort((p, q) => p - q)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** 一覧の上に出す数字。返信までの時間は、ここ30日に受けて返信済みの
 *  ものの中央値です（平均だと、1件の放置が全体を大きく見せます）。 */
export function metrics(list, now = Date.now()) {
  const from = now - 30 * 24 * H
  const counts = { new: 0, doing: 0, done: 0, spam: 0, unread: 0, mailFailed: 0 }
  const hours = []
  let warn = 0, late = 0, open30 = 0
  for (const r of list) {
    if (r.spam) { counts.spam++; continue }
    counts[r.status] = (counts[r.status] || 0) + 1
    if (r.status === 'new' && !r.readAt) counts.unread++
    if (r.mailOwner === 'failed' || (r.mail && r.mail.owner === 'failed')) counts.mailFailed++
    const o = overdue(r, now)
    if (o === 'late') late++
    else if (o === 'warn') warn++
    if (Date.parse(r.receivedAt) >= from) {
      const h = replyHours(r)
      if (h != null) hours.push(h)
      else if (r.status !== 'done') open30++
    }
  }
  const med = median(hours)
  return {
    counts, warn, late, replied30: hours.length, open30,
    median30: med == null ? null : Math.round(med * 10) / 10,
    within: hours.filter((h) => h <= PROMISED_H).length,
    promised: PROMISED_H,
  }
}

/* ---------------- 集計 ---------------- */

function bump(o, k) { o[k] = (o[k] || 0) + 1 }
const rank = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))

/** 直近 days 日の件数を、状態・ジャンル・どこから・キャンペーン別に。 */
export function stats(list, days, now = Date.now()) {
  const from = now - days * 24 * H
  const byStatus = { new: 0, doing: 0, done: 0, spam: 0 }
  const byTopic = {}, bySource = {}, byCampaign = {}
  let total = 0
  for (const r of list) {
    if (!(Date.parse(r.receivedAt) >= from)) continue
    if (r.spam) { byStatus.spam++; continue }
    total++
    bump(byStatus, r.status)
    const topics = r.topics && r.topics.length ? r.topics : ['（選択なし）']
    topics.forEach((t) => bump(byTopic, t))
    bump(bySource, r.source || '直接・不明')
    if (r.campaign) bump(byCampaign, r.campaign)
  }
  return { days, total, byStatus, byTopic: rank(byTopic), bySource: rank(bySource), byCampaign: rank(byCampaign) }
}

/* ---------------- 文例 ---------------- */

export const TEMPLATE_VARS = ['name', 'company', 'brand', 'reply_hours', 'topics']

/** {name} などを差し込む。知らない {xxx} はそのまま残します（消すと、
 *  書き間違いに気づけません）。会社名が無いときに行頭に残る空白は詰めます。 */
export function fillTemplate(text, vars) {
  const v = vars || {}
  return String(text || '')
    .replace(/\{(name|company|brand|reply_hours|topics)\}/g, (_, k) => (v[k] == null ? '' : String(v[k])))
    .replace(/^[ 　]+/gm, '')
}

/** 受付確認メールに、送り主が書いた名前や会社名をそのまま入れると、
 *  他人のアドレスを入れて宣伝文を送らせる「踏み台」に使われます。
 *  URL やメールアドレスのようなものが入っていたら、送りません。 */
export function looksLikeLink(s) {
  return /https?:|www\.|[a-z0-9-]+\.(com|net|org|jp|ru|cn|xyz|top|info|io|me|co)\b|@/i.test(String(s || ''))
}

export function isSandboxSender(from) {
  return /onboarding@resend\.dev/i.test(String(from || ''))
}

export function cleanTemplate(t) {
  const x = t || {}
  const name = one(x.name, CAPS.tplName)
  const body = str(x.body, CAPS.tplBody).replace(/\r\n?/g, '\n')
  if (!name) return { ok: false, message: '文例の名前を入れてください。' }
  if (!body.trim()) return { ok: false, message: '文例の本文を入れてください。' }
  return { ok: true, item: { id: idOk(x.id) ? x.id : 't' + Date.now().toString(36), name, subject: one(x.subject, CAPS.tplSubject), body } }
}

/** 設定の保存。範囲の外の値は、近い端に寄せます。 */
export function cleanSettings(input, base) {
  const x = input || {}
  const b = Object.assign({}, DEFAULT_SETTINGS, base || {})
  const days = Math.round(Number(x.retentionDays ?? b.retentionDays))
  const hours = Math.round(Number(x.replyHours ?? b.replyHours))
  const ar = Object.assign({}, b.autoReply, x.autoReply || {})
  const lineId = one(x.lineUserId ?? b.lineUserId, 64)
  if (lineId && !/^U[0-9a-f]{32}$/.test(lineId)) {
    return { ok: false, message: 'LINE のユーザーIDは「U」で始まる33文字です（LINE Developers の「チャネル基本設定」のいちばん下にある「あなたのユーザーID」）。' }
  }
  const domains = (Array.isArray(x.blockedDomains) ? x.blockedDomains : String(x.blockedDomains ?? (b.blockedDomains || []).join('\n')).split(/[\s,、]+/))
    .map((d) => String(d).toLowerCase().trim().replace(/^@/, ''))
    .filter((d) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(d))
  return {
    ok: true,
    settings: {
      retentionDays: isFinite(days) ? Math.min(1095, Math.max(30, days)) : 365,
      replyHours: isFinite(hours) ? Math.min(168, Math.max(1, hours)) : 48,
      autoReply: {
        on: !!ar.on,
        subject: one(ar.subject, CAPS.tplSubject) || DEFAULT_SETTINGS.autoReply.subject,
        body: str(ar.body, CAPS.tplBody).replace(/\r\n?/g, '\n').trim() || DEFAULT_SETTINGS.autoReply.body,
      },
      lineOn: !!(x.lineOn ?? b.lineOn) && !!lineId,
      lineUserId: lineId,
      blockedDomains: [...new Set(domains)].slice(0, CAPS.domains),
    },
  }
}

/** ブロックするドメインに入っているか。サブドメインも含めます。 */
export function blockedBy(email, domains) {
  const d = String(email || '').toLowerCase().split('@')[1] || ''
  return !!d && (domains || []).some((x) => d === x || d.endsWith('.' + x))
}

/* ---------------- 保存期間 ---------------- */

export function cutoff(days, now = Date.now()) {
  return now - Math.max(1, Number(days) || 365) * 24 * H
}

/** 保存期間を過ぎた id。 */
export function expiredIds(list, days, now = Date.now()) {
  const c = cutoff(days, now)
  return list.filter((r) => !(Date.parse(r.receivedAt) >= c)).map((r) => r.id)
}

/* ---------------- CSV ----------------
   Excel で開いたとき、= + - @ で始まるセルは「式」として動きます。
   お客様が書いた文がそのまま入るので、先頭に ' を付けて文字として
   扱わせます（いわゆる CSV インジェクション対策）。 */
export function csvCell(v) {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

export const CSV_COLUMNS = [
  ['受信日時', (r) => jst(r.receivedAt)], ['状態', (r) => (r.spam ? '迷惑' : STATUS_LABEL[r.status] || r.status)],
  ['お名前', (r) => r.name], ['会社名', (r) => r.company], ['メール', (r) => r.email], ['電話', (r) => r.phone || ''],
  ['ご相談の内容', (r) => (r.topics || []).join('、')], ['本文', (r) => r.message],
  ['どこから', (r) => (r.source ? r.source.label : '')], ['キャンペーン', (r) => (r.source ? r.source.c : '')],
  ['送られたページ', (r) => r.page], ['見積り付き', (r) => (r.estimate ? 'はい' : '')],
  ['返信した日時', (r) => jst(r.repliedAt)], ['返信までの時間', (r) => { const h = replyHours(r); return h == null ? '' : h.toFixed(1) }],
  ['担当', (r) => r.assignee], ['メモ', (r) => (r.notes || []).map((n) => n.text).join(' / ')],
  ['メール通知', (r) => ({ sent: '送信済み', failed: '未送信', skipped: '送らず', pending: '未送信' }[r.mail && r.mail.owner] || '')],
]

export function jst(iso) {
  if (!iso || isNaN(Date.parse(iso))) return ''
  return new Date(Date.parse(iso) + 9 * H).toISOString().replace('T', ' ').slice(0, 16)
}

/** 先頭に BOM。付けないと、Windows の Excel が日本語を文字化けさせます。 */
export function toCsv(records) {
  const rows = [CSV_COLUMNS.map((c) => csvCell(c[0])).join(',')]
  for (const r of records) rows.push(CSV_COLUMNS.map((c) => csvCell(c[1](r))).join(','))
  return '﻿' + rows.join('\r\n') + '\r\n'
}

/* ---------------- 保存先とのやり取り ---------------- */

const parse = (s) => { try { return s ? JSON.parse(s) : null } catch (_) { return null } }

export async function loadSettings(cfg) {
  const [raw] = await pipeline(cfg, [['GET', IK.settings]])
  return cleanSettings(parse(raw) || {}, DEFAULT_SETTINGS).settings
}

export async function saveSettings(cfg, input) {
  const cur = await loadSettings(cfg)
  const r = cleanSettings(input, cur)
  if (!r.ok) return r
  await pipeline(cfg, [['SET', IK.settings, JSON.stringify(r.settings)]])
  return r
}

export async function loadTemplates(cfg) {
  const [raw] = await pipeline(cfg, [['GET', IK.tpl]])
  const list = parse(raw)
  return Array.isArray(list) ? list : DEFAULT_TEMPLATES
}

export async function saveTemplates(cfg, list) {
  await pipeline(cfg, [['SET', IK.tpl, JSON.stringify(list.slice(0, CAPS.templates))]])
}

/** 1件を書く（本体と、一覧用の要約の両方）。 */
export async function putRecord(cfg, rec) {
  await pipeline(cfg, [
    ['SET', IK.rec(rec.id), JSON.stringify(rec)],
    ['HSET', IK.list, rec.id, JSON.stringify(summary(rec))],
  ])
}

export async function getRecord(cfg, id) {
  if (!idOk(id)) return null
  const [raw] = await pipeline(cfg, [['GET', IK.rec(id)]])
  return parse(raw)
}

export async function getRecords(cfg, ids) {
  const ok = ids.filter(idOk)
  if (!ok.length) return []
  const out = await pipeline(cfg, ok.map((id) => ['GET', IK.rec(id)]))
  return out.map(parse).filter(Boolean)
}

/** 一覧用の要約を全部。新しい順。 */
export async function allSummaries(cfg) {
  const [flat] = await pipeline(cfg, [['HGETALL', IK.list]])
  const out = []
  const a = Array.isArray(flat) ? flat : []
  for (let i = 1; i < a.length; i += 2) {
    const s = parse(a[i])
    if (s && s.id && s.receivedAt) out.push(s)
  }
  return out.sort((x, y) => (x.receivedAt < y.receivedAt ? 1 : -1))
}

/** 保存期間を過ぎたものと、上限を超えた古いものを消す。消した件数を返します。 */
export async function prune(cfg, list, days, now = Date.now()) {
  const old = new Set(expiredIds(list, days, now))
  list.slice(CAPS.records).forEach((r) => old.add(r.id))
  const ids = [...old].slice(0, 200)
  if (!ids.length) return 0
  await pipeline(cfg, ids.flatMap((id) => [['DEL', IK.rec(id)], ['HDEL', IK.list, id]]))
  return ids.length
}
