export const config = { runtime: 'edge' }

import { storeConfig, pipeline, jstDate, K } from './_analytics-store.js'
import { setting } from './_settings.js'
import { hit, seenBefore, digest } from './_ratelimit.js'
import { orgLabel, pickTopics } from './_form-options.js'
import { BRAND, KV } from './_brand.js'
import { newRecord, putRecord, loadSettings, blockedBy, fillTemplate, isSandboxSender, looksLikeLink } from './_inquiries.js'

// Per IP. Three enquiries in ten minutes is well past what a real person
// sends; the daily cap stops a slow drip from adding up to a flooded inbox
// and an exhausted Resend quota.
const BURST = { max: 3, windowS: 10 * 60 }
const DAILY = { max: 12, windowS: 24 * 60 * 60 }

/** Record that an enquiry went through, or why it did not.
 *
 *  Until now a failure only reached console.error. If the Resend key expired
 *  the form would keep refusing enquiries and nothing the owner ever looks at
 *  would say so — on a site whose revenue arrives through this endpoint, that
 *  is the worst way for it to break. Only the reason is stored, never the
 *  enquiry itself. */
async function record(ok, reason, field) {
  const cfg = storeConfig()
  if (!cfg) return
  const d = jstDate()
  try {
    const cmds = [
      ['HINCRBY', K.dayContact(d), field || (ok ? 'ok' : 'fail'), 1],
      ['EXPIRE', K.dayContact(d), K.expire],
    ]
    if (!ok && !field) {
      cmds.push(['SET', K.contactLastError,
        JSON.stringify({ at: new Date().toISOString(), reason: String(reason).slice(0, 200) }),
        'EX', 90 * 24 * 3600])
    }
    await pipeline(cfg, cmds)
  } catch (_) { /* never fail an enquiry because the counter is down */ }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LIMITS = { name: 50, email: 100, company: 80, message: 1000 }



export async function POST(req) {
  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  // A field no visitor can see and no visitor fills. Answer 200 so a bot
  // cannot tell it was caught and start probing for the reason.
  // 罠は website。company は本当に会社名を受け取る欄になりました——ここを
  // 取り違えると、会社名を書いた人の問い合わせが黙って捨てられます。
  if (String(payload?.website ?? '').trim()) return json({ ok: true })

  const name = String(payload?.name ?? '').trim()
  const email = String(payload?.email ?? '').trim()
  const message = String(payload?.message ?? '').trim()
  const company = String(payload?.company ?? '').trim().slice(0, LIMITS.company)
  const org = orgLabel(payload?.orgType)
  const topics = pickTopics(payload?.topics)

  if (!name || name.length > LIMITS.name) return json({ error: 'invalid_name' }, 400)
  if (!email || !EMAIL_RE.test(email) || email.length > LIMITS.email) return json({ error: 'invalid_email' }, 400)
  if (message.length < 10 || message.length > LIMITS.message) return json({ error: 'invalid_message' }, 400)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // De-duplicate before counting, so a double-tap on the button — or a retry
  // after a slow response — costs the sender nothing from their allowance.
  const fp = await digest(email, message)
  if (await seenBefore(`${KV}ct:dup:${fp}`, 10 * 60)) {
    return json({ ok: true, duplicate: true })
  }

  const burst = await hit(`${KV}ct:rl:${ip}`, BURST.max, BURST.windowS)
  const daily = await hit(`${KV}ct:rl:d:${ip}`, DAILY.max, DAILY.windowS)
  if (burst.limited || daily.limited) {
    // Counted apart from failures. A block is the system working; filing it
    // as a failure would make the health page raise an alarm about itself.
    await record(null, null, 'blocked')
    return json({
      error: 'rate_limited',
      message: '送信が続いています。しばらく時間をおいてからお試しください。',
    }, 429, { 'retry-after': String(burst.limited ? burst.retryAfter : daily.retryAfter) })
  }

  const from_page = String(payload?.page ?? '').slice(0, 120)
  const withEstimate = /概算見積り|概算:/.test(message)

  // 先に保存、それからメール。メールが送れなくても、問い合わせは管理画面
  // （問い合わせ管理）に「メール未送信」として残ります。以前はメールだけが
  // 頼りで、送れなかった問い合わせはどこにも残りませんでした。
  // 保存先が無いサイトでは、これまでどおりメールだけです。
  const cfg = storeConfig()
  let rec = null
  let st = null
  let blocked = false
  if (cfg) {
    try {
      st = await loadSettings(cfg)
      blocked = blockedBy(email, st.blockedDomains)
      rec = newRecord({
        name, company, org, email, phone: payload?.phone, topics, message,
        page: from_page, estimate: withEstimate, source: payload?.src, spam: blocked,
      })
      await putRecord(cfg, rec)
    } catch (err) {
      console.error('[api/contact] could not store the enquiry', err)
      rec = null
    }
  }
  // 1件の記録の「メールはどうなったか」を書き足す。書けなくても問い合わせは止めません。
  const mark = (field, value, error) => {
    if (!rec) return
    rec.mail[field] = value
    if (error) rec.mail[field + 'Error'] = String(error).slice(0, 200)
  }
  const flush = async () => { if (rec) { try { await putRecord(cfg, rec) } catch (_) {} } }

  // ブロックするドメイン（管理画面で指定）からの送信。保存だけして、
  // メールは送りません。送り主には普段どおり「送信しました」と返します。
  if (blocked && rec) {
    mark('owner', 'skipped')
    await flush()
    return json({ ok: true })
  }

  const apiKey = await setting('RESEND_API_KEY')
  if (!apiKey) {
    console.error('[api/contact] RESEND_API_KEY is not set')
    await record(false, 'RESEND_API_KEY が未設定')
    if (rec) {
      mark('owner', 'failed', 'RESEND_API_KEY が未設定')
      if (st.autoReply.on) mark('auto', 'failed', 'RESEND_API_KEY が未設定')
      await linePush(st, rec, mark)
      await flush()
      return json({ ok: true, stored: true })
    }
    return json({ error: 'server_misconfigured' }, 503)
  }

  const from = BRAND.from
  const to = await setting('CONTACT_TO_EMAIL', BRAND.owner)
  const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16)

  // 件名で仕分けられるように、区分と会社名を先に出します。
  const who = company ? `${company} ${name}様` : `${name}様`
  const subject = `【お問い合わせ】${who}より${topics.length ? `（${topics[0]}${topics.length > 1 ? 'ほか' : ''}）` : ''}${withEstimate ? '（見積り付き）' : ''}`
  const text = [
    `お名前: ${name}`,
    `メール: ${email}`,
    org ? `ご依頼元: ${org}${company ? ` / ${company}` : ''}` : (company ? `会社名: ${company}` : null),
    topics.length ? `ご相談の内容: ${topics.join('、')}` : null,
    `受信: ${jst} (JST)`,
    from_page ? `流入ページ: ${from_page}` : null,
    withEstimate ? '見積りシミュレーターの内容が含まれています。' : null,
    '',
    message,
    rec ? '' : null,
    rec ? `管理画面で開く: ${BRAND.url}/admin-members.html#inq=${rec.id}` : null,
  ].filter((l) => l !== null).join('\n')

  const sent = await sendMail(apiKey, { from, to: [to], reply_to: email, subject, text })
  if (!sent.ok) {
    console.error('[api/contact] owner mail failed', sent.reason)
    await record(false, sent.reason)
    // 保存できていれば、送り主には「届いた」と返します。管理画面に
    // 「メール未送信」として残っていて、取りこぼしにはならないからです。
    if (!rec) return json({ error: sent.network ? 'network' : 'send_failed' }, 502)
    mark('owner', 'failed', sent.reason)
  } else {
    mark('owner', 'sent')
    await record(true)
  }

  // ここから先は保存できたときだけ（設定が保存先にあるため）。どれも
  // 失敗しても、送り主への返事は変えません。
  if (rec) {
    await autoReply(st, rec, { apiKey, from, to }, mark)
    await linePush(st, rec, mark)
    await flush()
  }
  return json(sent.ok ? { ok: true } : { ok: true, stored: true })
}

/** 送り主への受付確認メール（管理画面で文面を直せます。既定は送らない）。
 *
 *  送らない場合が3つあります。
 *   ・送信元が Resend の試用アドレス: 試用アドレスからはResendに登録した
 *     本人にしか届かないので、送っても失敗するだけです。管理画面で知らせます。
 *   ・お名前や会社名に URL やアドレスのようなものがある: 他人のアドレスを
 *     入れて宣伝文を届けさせる「踏み台」を防ぐためです。本文は入れません。
 *   ・迷惑に分類されたもの（上で先に返しています）。 */
async function autoReply(st, rec, { apiKey, from, to }, mark) {
  if (!st || !st.autoReply.on) return mark('auto', 'off')
  if (isSandboxSender(from)) return mark('auto', 'sandbox')
  if (looksLikeLink(rec.name) || looksLikeLink(rec.company)) return mark('auto', 'skipped', 'お名前か会社名にURLのようなものがあるため')
  const vars = { name: rec.name, company: rec.company, brand: BRAND.name, reply_hours: st.replyHours, topics: rec.topics.join('、') }
  const r = await sendMail(apiKey, {
    from, to: [rec.email], reply_to: to,
    subject: fillTemplate(st.autoReply.subject, vars).replace(/\s+/g, ' ').slice(0, 150),
    text: fillTemplate(st.autoReply.body, vars),
  })
  mark('auto', r.ok ? 'sent' : 'failed', r.ok ? '' : r.reason)
}

/** 持ち主の LINE に「問い合わせが来ました」を1通（Messaging API の push）。
 *  公式アカウントの月の無料通数から1通ずつ使います。お客様の本文は送らず、
 *  名前と区分と管理画面へのリンクだけにしています。 */
async function linePush(st, rec, mark) {
  if (!st || !st.lineOn || !st.lineUserId) return mark('line', 'off')
  const token = await setting('LINE_CHANNEL_TOKEN')
  if (!token) return mark('line', 'failed', 'LINE_CHANNEL_TOKEN が未設定')
  const who = rec.company ? `${rec.company} ${rec.name}様` : `${rec.name}様`
  const text = [
    '新しいお問い合わせが届きました。',
    who + (rec.topics.length ? `（${rec.topics.join('、')}）` : ''),
    rec.mail.owner === 'failed' ? '※メール通知は送れていません。管理画面で確認してください。' : null,
    `${BRAND.url}/admin-members.html#inq=${rec.id}`,
  ].filter(Boolean).join('\n')
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: st.lineUserId, messages: [{ type: 'text', text }] }),
    })
    if (res.ok) return mark('line', 'sent')
    const d = await res.json().catch(() => ({}))
    mark('line', 'failed', `LINE が ${res.status} を返しました${d && d.message ? `（${String(d.message).slice(0, 80)}）` : ''}`)
  } catch (_) {
    mark('line', 'failed', 'LINE への通信エラー')
  }
}

/** Resend に1通送る。失敗の理由は、管理画面に出せる日本語で返します。 */
async function sendMail(apiKey, body) {
  let res
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, network: true, reason: 'メール送信先への通信エラー' }
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[api/contact] resend answered', res.status, detail.slice(0, 200))
    return { ok: false, reason: `Resend が ${res.status} を返しました` }
  }
  return { ok: true }
}

function json(payload, status = 200, extra) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extra || {}) },
  })
}
