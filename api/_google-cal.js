// Google カレンダー連携。空き時間の確認と、Meet 付き予定の作成だけ。
//
// なぜサービスアカウントではなく OAuth のリフレッシュトークンなのか:
// サービスアカウントは自分自身のカレンダーしか持たず、個人の Google
// アカウントのカレンダーには（Workspace のドメイン委任を設定しない限り）
// 入れません。代表個人のカレンダーを見て、そこに予定を入れるのが目的なので、
// 本人が一度だけ許可して得たリフレッシュトークンを使います。
//
// 運用上の注意が一つだけあります。Google Cloud の OAuth 同意画面が「テスト」
// のままだと、リフレッシュトークンは7日で無効になります。公開（内部アプリ
// なら「内部」）にしてから接続してください。無効になった場合は接続ボタンを
// もう一度押すだけで復帰します。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { setting } from './_settings.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const CAL = 'https://www.googleapis.com/calendar/v3'

// events = 予定の作成、readonly = 空き時間の確認。これ以上は要りません。
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  // Search Console の読み取り。検索でどう見えているか（どの語で何回表示され、
  // 何回押され、平均何位か）は、こちらからは他に取りようがありません。
  // 読むだけで、こちらから何かを登録したり消したりはできない権限です。
  // すでに接続済みの場合、この項目は前回の同意に含まれていないため、
  // 管理画面から一度接続し直す必要があります。
  'https://www.googleapis.com/auth/webmasters.readonly',
].join(' ')

/** 設定されている資格情報。req はあってもなくてもよい（訪問者のリクエスト
 *  では環境変数と保存済みの値だけが見えます）。 */
export async function creds(req) {
  const [clientId, clientSecret, refreshToken, calendarId] = await Promise.all([
    setting('GOOGLE_CLIENT_ID', '', req),
    setting('GOOGLE_CLIENT_SECRET', '', req),
    setting('GOOGLE_REFRESH_TOKEN', '', req),
    setting('GOOGLE_CALENDAR_ID', 'primary', req),
  ])
  return { clientId, clientSecret, refreshToken, calendarId: calendarId || 'primary' }
}

export const connected = (c) => !!(c && c.clientId && c.clientSecret && c.refreshToken)

/** 同意画面のURL。state は呼び出し側が使い捨てで発行します。 */
export function consentUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    // リフレッシュトークンは「初回の同意」でしか返らないため、毎回同意を
    // 求める。接続し直しのたびに空のトークンが返って原因が分からなくなる、
    // という一番ありがちな詰まり方をここで防いでいます。
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${q}`
}

/** 認可コードをトークンに交換する。戻り値の refresh_token を保存します。 */
export async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, code, grant_type: 'authorization_code',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description || data.error || `token ${res.status}`)
  return data
}

// アクセストークンは1時間もつので、同じ isolate の中では使い回します。
let tok = { value: '', exp: 0, key: '' }

export async function accessToken(c) {
  const key = c.refreshToken.slice(-12)
  if (tok.value && tok.key === key && Date.now() < tok.exp - 60000) return tok.value
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId, client_secret: c.clientSecret,
      refresh_token: c.refreshToken, grant_type: 'refresh_token',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    // invalid_grant = トークンが失効している。接続し直しが要る、という
    // 唯一の対処が分かる形で投げます。
    const why = data.error === 'invalid_grant'
      ? 'Googleとの接続が切れています（管理画面から接続し直してください）'
      : (data.error_description || data.error || `token ${res.status}`)
    throw new Error(why)
  }
  tok = { value: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000, key }
  return tok.value
}

/** 指定期間の埋まっている時間帯。予定の中身は取りません。 */
export async function busy(c, fromMs, toMs) {
  const token = await accessToken(c)
  const res = await fetch(`${CAL}/freeBusy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
      timeZone: 'Asia/Tokyo',
      items: [{ id: c.calendarId }],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `freeBusy ${res.status}`)
  const cal = (data.calendars || {})[c.calendarId] || {}
  if (cal.errors && cal.errors.length) throw new Error(cal.errors[0].reason || 'freeBusy error')
  return (cal.busy || []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
}

/** Meet 付きの予定を作り、相手にも招待を送る。 */
export async function createEvent(c, { startMs, endMs, summary, description, attendee, attendeeName }) {
  const token = await accessToken(c)
  const body = {
    summary,
    description,
    start: { dateTime: new Date(startMs).toISOString(), timeZone: 'Asia/Tokyo' },
    end: { dateTime: new Date(endMs).toISOString(), timeZone: 'Asia/Tokyo' },
    attendees: [{ email: attendee, displayName: attendeeName || undefined }],
    // Meet のURLはここで発行されます。requestId は同じ値で再送すると同じ
    // 会議が返る冪等キーなので、枠の時刻から作ります。
    conferenceData: {
      createRequest: {
        requestId: `lum-${startMs}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
  }
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'all' })
  const res = await fetch(`${CAL}/calendars/${encodeURIComponent(c.calendarId)}/events?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `events.insert ${res.status}`)
  const meet = data.hangoutLink
    || (data.conferenceData?.entryPoints || []).find((e) => e.entryPointType === 'video')?.uri
    || ''
  return { id: data.id, meet, link: data.htmlLink || '' }
}
