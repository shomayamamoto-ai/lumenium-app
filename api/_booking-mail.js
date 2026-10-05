// 予約のメール。受付・取り消し・日時の変更・前日のお知らせ・確定。
//
// 送り方はお問い合わせと同じ Resend です（RESEND_API_KEY）。送信元が
// Resend の試用アドレス（…@resend.dev）のままだと、お客様あてのメールは
// 届きません（Resend は試用中、自分のアドレスにしか送らないため）。管理画面の
// 「予約管理」にその旨を出しています。
//
// お客様あてのメールには「予約の確認・変更・取り消し」のリンクを入れます。
// リンクは署名付きで、SESSION_SECRET（無ければ ADMIN_KEY）で作ります。
// どちらも無いときはリンクを入れず、「ご連絡ください」とだけ書きます。

import { setting } from './_settings.js'
import { BRAND } from './_brand.js'
import { label, icsFile, bookingNoun, recSpan, signManage } from './_booking.js'

/** 送信元が Resend の試用アドレスか（お客様に届かない）。 */
export const sandboxFrom = () => /@resend\.dev>?\s*$/i.test(BRAND.from)

export async function manageSecret(req) {
  return (await setting('SESSION_SECRET', '', req)) || (process.env.ADMIN_KEY || '').trim()
}

export async function manageLink(req, rec) {
  const secret = await manageSecret(req)
  if (!secret) return ''
  return `${BRAND.url}/api/booking-manage?t=${await signManage(rec.id, recSpan(rec).end, secret)}`
}

export const ownerAddress = (req) => setting('CONTACT_TO_EMAIL', BRAND.owner, req)

/** UTF-8 のまま base64 に。btoa は1バイト文字しか受けないので、日本語の
 *  入った .ics をそのまま渡すと例外になります。 */
function b64(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** 送る関数。キーが無ければ null。送れたかどうか（true/false）を返します。 */
async function sender(req) {
  const apiKey = await setting('RESEND_API_KEY', '', req)
  if (!apiKey) return null
  return (payload) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: BRAND.from, ...payload }),
  }).then((r) => r.ok).catch(() => false)
}

const word = (rec, rules) => rec.wording || rules.wording
const svcName = (rec) => (rec.service && rec.service.name) || ''
const svcLine = (rec) => (rec.service ? `メニュー: ${rec.service.name}（${rec.service.minutes}分）` : null)
const whenOf = (rec) => { const { start, end } = recSpan(rec); return label(start, end) }

export function summaryOf(rec, rules) {
  return `${word(rec, rules)}: ${svcName(rec) ? `${svcName(rec)} ` : ''}${rec.company ? `${rec.company} ` : ''}${rec.name}様 × ${BRAND.name}`
}

export function descriptionOf(rec) {
  return [
    svcLine(rec),
    `お名前: ${rec.name}`,
    rec.company ? `会社名: ${rec.company}` : null,
    `メール: ${rec.email}`,
    (rec.topics || []).length ? `ご相談の内容: ${rec.topics.join('、')}` : null,
    rec.page ? `申し込みページ: ${rec.page}` : null,
    rec.note ? `\nご要望:\n${rec.note}` : null,
  ].filter(Boolean).join('\n')
}

function ics(rec, rules, owner, method) {
  const { start, end } = recSpan(rec)
  return icsFile({
    id: rec.id, startMs: start, endMs: end, summary: summaryOf(rec, rules), description: descriptionOf(rec),
    organizer: owner, attendee: rec.email, method, sequence: rec.seq || 0,
  })
}
const attach = (text) => [{ filename: `${BRAND.slug}-booking.ics`, content: b64(text) }]

const sign = () => [`${BRAND.name}（${BRAND.kana}）`, BRAND.url]

function manageLines(link, rules) {
  if (!link) return ['日時の変更・取り消しは、このメールへの返信でご連絡ください。']
  return [
    '日時の変更・取り消しは、こちらからできます（開始の' + rules.cutoffHours + '時間前まで）:',
    link,
    'このリンクはご本人用です。ほかの方には転送しないでください。',
  ]
}

/** 受け付けた直後。こちら側（オーナー）とお客様の両方に送ります。 */
export async function mailBooked(req, rec, rules) {
  const send = await sender(req)
  if (!send) return { owner: false, customer: false }
  const owner = await ownerAddress(req)
  const noun = bookingNoun(rules)
  const google = rec.mode === 'google'
  const file = google ? '' : ics(rec, rules, owner, 'REQUEST')
  const link = await manageLink(req, rec)
  const toOwner = send({
    to: [owner],
    reply_to: rec.email,
    subject: `【${noun}】${rec.when} ${rec.company ? `${rec.company} ` : ''}${rec.name}様`,
    text: [
      `日時: ${rec.when}（JST）`,
      svcLine(rec),
      `お名前: ${rec.name}`,
      rec.company ? `会社名: ${rec.company}` : null,
      `メール: ${rec.email}`,
      (rec.topics || []).length ? `ご相談の内容: ${rec.topics.join('、')}` : null,
      rec.meet ? `Meet: ${rec.meet}` : null,
      rec.page ? `申し込みページ: ${rec.page}` : null,
      google ? 'カレンダーに登録済み・相手にも招待を送信しました。' : '仮予約です（カレンダーへの自動登録は未接続）。折り返し確定のご連絡が要ります。管理画面の「予約管理」から「確定にする」を押すと、お客様に確定のメールが届きます。',
      rec.addUrl ? `\nGoogleカレンダーに追加（押して保存するだけ）:\n${rec.addUrl}` : null,
      rec.note ? `\nご要望:\n${rec.note}` : null,
    ].filter(Boolean).join('\n'),
    // 自分のカレンダーにも入れられるように、相手と同じ .ics を添付します。
    ...(file ? { attachments: attach(file) } : {}),
  })
  const toCustomer = send({
    to: [rec.email],
    reply_to: owner,
    subject: `【${google ? `${noun}を承りました` : '仮予約を承りました'}】${rec.when} ${BRAND.name}`,
    text: [
      `${rec.name} 様`,
      '',
      `${rec.when}（日本時間）で「${svcName(rec)}」のお時間を確保しました。`,
      google
        ? (rec.meet ? `当日はこちらからご参加ください: ${rec.meet}` : 'カレンダーの招待も別にお送りしています。')
        : (rules.online ? '担当より、接続用のURLを添えて確定のご連絡を差し上げます。' : '担当より、確定のご連絡を差し上げます。'),
      rules.place ? `場所: ${rules.place}` : null,
      file ? '添付のファイルを開くと、そのままカレンダーに登録できます。' : null,
      '',
      ...manageLines(link, rules),
      '',
      ...sign(),
    ].filter((x) => x !== null).join('\n'),
    ...(file ? { attachments: attach(file) } : {}),
  })
  const [o, c] = await Promise.all([toOwner, toCustomer])
  return { owner: o, customer: c }
}

/** 取り消し。by は 'customer'（お客様がリンクから）か 'owner'（管理画面から）。 */
export async function mailCancelled(req, rec, rules, by) {
  const send = await sender(req)
  if (!send) return { owner: false, customer: false }
  const owner = await ownerAddress(req)
  const noun = bookingNoun(rules)
  const when = whenOf(rec)
  const file = rec.mode === 'google' ? '' : ics(rec, rules, owner, 'CANCEL')
  const o = await send({
    to: [owner],
    reply_to: rec.email,
    subject: `【取り消し】${when} ${rec.name}様`,
    text: [
      by === 'customer' ? 'お客様がメールのリンクから取り消しました。' : '管理画面から取り消しました。',
      `日時: ${when}（JST）`, svcLine(rec), `お名前: ${rec.name}`, `メール: ${rec.email}`,
      rec.mode === 'google' ? 'Googleカレンダーの予定も削除しました。' : 'ご自分のカレンダーに入れていた場合は、添付のファイルを開くと消えます。',
    ].filter(Boolean).join('\n'),
    ...(file ? { attachments: attach(file) } : {}),
  })
  const c = await send({
    to: [rec.email],
    reply_to: owner,
    subject: `【${noun}の取り消し】${when} ${BRAND.name}`,
    text: [
      `${rec.name} 様`, '',
      by === 'customer'
        ? `${when}（日本時間）の${noun}を取り消しました。`
        : `申し訳ありません。${when}（日本時間）の${noun}を、こちらの都合で取り消させていただきました。`,
      file ? 'カレンダーに登録していた場合は、添付のファイルを開くと予定が消えます。' : null,
      'またのご予約をお待ちしています。', '', ...sign(),
    ].filter((x) => x !== null).join('\n'),
    ...(file ? { attachments: attach(file) } : {}),
  })
  return { owner: o, customer: c }
}

/** 日時の変更。rec は変更後の記録、oldWhen は前の日時の文字列。 */
export async function mailMoved(req, rec, rules, oldWhen, by) {
  const send = await sender(req)
  if (!send) return { owner: false, customer: false }
  const owner = await ownerAddress(req)
  const noun = bookingNoun(rules)
  const file = rec.mode === 'google' ? '' : ics(rec, rules, owner, 'REQUEST')
  const link = await manageLink(req, rec)
  const o = await send({
    to: [owner],
    reply_to: rec.email,
    subject: `【日時の変更】${rec.when} ${rec.name}様`,
    text: [
      by === 'customer' ? 'お客様がメールのリンクから日時を変更しました。' : '管理画面から日時を変更しました。',
      `変更前: ${oldWhen}`, `変更後: ${rec.when}（JST）`, svcLine(rec), `お名前: ${rec.name}`, `メール: ${rec.email}`,
    ].filter(Boolean).join('\n'),
    ...(file ? { attachments: attach(file) } : {}),
  })
  const c = await send({
    to: [rec.email],
    reply_to: owner,
    subject: `【${noun}の日時を変更しました】${rec.when} ${BRAND.name}`,
    text: [
      `${rec.name} 様`, '',
      `${noun}の日時を変更しました。`,
      `変更前: ${oldWhen}`, `変更後: ${rec.when}（日本時間）`,
      rec.meet ? `参加URL: ${rec.meet}` : null,
      rules.place ? `場所: ${rules.place}` : null,
      file ? '添付のファイルを開くと、カレンダーの予定が新しい日時に変わります。' : null,
      '', ...manageLines(link, rules), '', ...sign(),
    ].filter((x) => x !== null).join('\n'),
    ...(file ? { attachments: attach(file) } : {}),
  })
  return { owner: o, customer: c }
}

/** 前日のお知らせ（お客様あて）。 */
export async function mailReminder(req, rec, rules) {
  const send = await sender(req)
  if (!send) return false
  const owner = await ownerAddress(req)
  const noun = bookingNoun(rules)
  const link = await manageLink(req, rec)
  return send({
    to: [rec.email],
    reply_to: owner,
    subject: `【明日の${noun}】${rec.when} ${BRAND.name}`,
    text: [
      `${rec.name} 様`, '',
      `明日 ${rec.when}（日本時間）に「${svcName(rec)}」のご予約をいただいています。`,
      rec.meet ? `参加URL: ${rec.meet}` : null,
      rules.place ? `場所: ${rules.place}` : null,
      'お会いできるのを楽しみにしています。', '',
      ...manageLines(link, rules), '', ...sign(),
    ].filter((x) => x !== null).join('\n'),
  })
}

/** 仮予約を管理画面で「確定」にしたとき（お客様あて）。 */
export async function mailConfirmed(req, rec, rules) {
  const send = await sender(req)
  if (!send) return false
  const owner = await ownerAddress(req)
  const noun = bookingNoun(rules)
  const link = await manageLink(req, rec)
  return send({
    to: [rec.email],
    reply_to: owner,
    subject: `【${noun}が確定しました】${rec.when} ${BRAND.name}`,
    text: [
      `${rec.name} 様`, '',
      `${rec.when}（日本時間）の${noun}が確定しました。`,
      rec.meet ? `参加URL: ${rec.meet}` : null,
      rules.place ? `場所: ${rules.place}` : null,
      '', ...manageLines(link, rules), '', ...sign(),
    ].filter((x) => x !== null).join('\n'),
  })
}
