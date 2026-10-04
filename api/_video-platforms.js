// 動画の投稿先（Instagram リール・YouTube ショート・TikTok）とのやりとり。
//
// どれも「動画ファイルそのもの」をこちらの関数に通さない作りです。
//   ・Instagram … Vercel Blob に置いた動画の URL を渡し、Meta が取りに来ます。
//     受け取ったあと Meta 側で変換が走るので「準備中 → 公開」の2段階です。
//     準備が終わるまで1つの関数で待つと時間切れになるため、画面（または
//     毎朝の自動処理）が短い問い合わせをくり返して確かめます。
//   ・YouTube … ブラウザが YouTube に直接アップロードします。サーバーは
//     保存してある接続トークンから「1時間だけ使える鍵」を作って渡すだけです。
//   ・TikTok … 「下書き（受信箱）に送る」API を使います。動画は Blob から
//     少しずつ読み、TikTok の受け口へ流します。一般公開まで API で行うには
//     TikTok の審査（監査）が要り、審査前のアプリからは非公開でしか出せません。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { setting, saveSetting } from './_settings.js'
import { scheduleReady } from './_social-queue.js'
import { GRAPH_VERSION } from './_social.js'
import { accessToken } from './_google-cal.js'
import { apiKey } from './_admin-auth.js'

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`
const YT = 'https://www.googleapis.com/youtube/v3'
const TT = 'https://open.tiktokapis.com/v2'

// YouTube へのアップロードと、自分の動画の数字の読み取り。カレンダーの
// 接続とは別に同意をもらいます（カレンダーだけ使いたい人に、YouTube への
// 投稿権限まで求めないため）。
export const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ')
export const TIKTOK_SCOPES = 'user.info.basic,video.upload,video.list'

export function youtubeConsentUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: YT_SCOPES,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

async function igCreds(req) {
  const [user, token] = await Promise.all([setting('IG_USER_ID', '', req), setting('IG_TOKEN', '', req)])
  return { user, token: token || (await setting('FB_PAGE_TOKEN', '', req)) }
}

async function ytCreds(req) {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    setting('GOOGLE_CLIENT_ID', '', req), setting('GOOGLE_CLIENT_SECRET', '', req), setting('YOUTUBE_REFRESH_TOKEN', '', req),
  ])
  return { clientId, clientSecret, refreshToken }
}

async function ttCreds(req) {
  const [key, secret, refresh] = await Promise.all([
    setting('TIKTOK_CLIENT_KEY', '', req), setting('TIKTOK_CLIENT_SECRET', '', req), setting('TIKTOK_REFRESH_TOKEN', '', req),
  ])
  return { key, secret, refresh }
}

/** 画面に「何が使えるか」を出すための一覧。値そのものは返しません。 */
export async function readiness(req) {
  const [ig, yt, tt, blob, ai] = await Promise.all([igCreds(req), ytCreds(req), ttCreds(req), setting('BLOB_READ_WRITE_TOKEN', '', req), apiKey(req)])
  const sch = scheduleReady()
  return {
    ai: !!ai,
    blob: !!blob,
    instagram: !!(ig.user && ig.token),
    youtubeClient: !!(yt.clientId && yt.clientSecret),
    youtube: !!(yt.clientId && yt.clientSecret && yt.refreshToken),
    tiktokClient: !!(tt.key && tt.secret),
    tiktok: !!(tt.key && tt.secret && tt.refresh),
    schedule: sch.ok ? { ok: true } : { ok: false, message: sch.message },
  }
}

/* ---------------- 共通 ---------------- */

async function call(url, init, ms) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms || 9000)
  try {
    const res = await fetch(url, { ...(init || {}), signal: ac.signal })
    const text = await res.text()
    let data = {}
    try { data = text ? JSON.parse(text) : {} } catch (_) { data = { raw: text.slice(0, 200) } }
    return { ok: res.ok, status: res.status, data, headers: res.headers }
  } catch (e) {
    const aborted = ac.signal.aborted
    return { ok: false, status: 0, data: {}, message: aborted ? '相手の返事が時間内に来ませんでした。' : '相手につながりませんでした。' }
  } finally { clearTimeout(t) }
}

/** Meta の返すエラーを、何をすればよいかが分かる日本語に。 */
export function metaError(r, where) {
  const e = (r.data && r.data.error) || {}
  const code = Number(e.code)
  const sub = Number(e.error_subcode)
  let m
  if (r.message) m = r.message
  else if (code === 190) m = 'アクセストークンが失効しています。Instagram（Facebook）のトークンを発行し直して「設定状況 › キーの入力」に貼ってください。'
  else if (code === 10 || code === 200 || code === 3) m = '権限が足りません。トークンに instagram_content_publish と instagram_manage_insights の権限があるか確かめてください。'
  else if (code === 4 || code === 17 || code === 32 || code === 613) m = '短い時間に呼びすぎました。しばらく待ってからやり直してください。'
  else if (code === 9 || sub === 2207042) m = 'Instagram の24時間の投稿上限に達しました。明日もう一度お試しください。'
  else if (code === 110 || code === 24) m = 'このアカウントは見つからないか、ビジネス／クリエイターアカウントではありません。'
  else if (sub === 2207026 || /video/i.test(String(e.message || ''))) m = '動画の形式が Instagram の条件に合いませんでした（MP4・H.264・縦9:16・3〜90秒・最大1GB が目安です）。'
  else m = e.message ? `Instagram からの返事: ${String(e.message).slice(0, 160)}` : `Instagram から想定外の返事がありました（${r.status}）。`
  return { ok: false, message: `${where ? where + '：' : ''}${m}` }
}

/* ---------------- Instagram ---------------- */

/** 競合のアカウントの最近の投稿（business_discovery）。Instagram は他人の
 *  再生数と動画の長さを返さないので、その2つは空欄のまま入ります。 */
export async function igDiscover(req, username) {
  const { user, token } = await igCreds(req)
  if (!user || !token) return { ok: false, code: 'NO_IG', message: 'Instagram のキー（ビジネスアカウントIDとアクセストークン）が未設定です。CSV か手入力で追加できます。' }
  const fields = `business_discovery.username(${username}){username,media.limit(25){caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`
  const r = await call(`${GRAPH}/${encodeURIComponent(user)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`)
  if (!r.ok) return metaError(r, '競合の取得')
  const media = (((r.data || {}).business_discovery || {}).media || {}).data || []
  const posts = media.filter((m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO').map((m) => {
    const cap = String(m.caption || '')
    return {
      platform: 'instagram', url: m.permalink || '', title: cap.split('\n')[0].slice(0, 120), caption: cap,
      author: username, published_at: m.timestamp || '', views: null, likes: m.like_count ?? null, comments: m.comments_count ?? null, shares: null,
      source: 'instagram', id: `ig-${String(m.permalink || m.timestamp || Math.random()).replace(/[^A-Za-z0-9]/g, '').slice(-40)}`,
    }
  })
  return {
    ok: true, posts,
    note: `${posts.length}件のリールを取り込みました。Instagram は他のアカウントの再生数と動画の長さを公開していないため、その2つは空欄です（分かる場合は表で直せます）。再生数が無い投稿は、反応率と伸びる速さが「不明」になります。`,
  }
}

/** リールの「入れ物」を作ります（ここで Meta が動画を取りに来ます）。 */
export async function igStartReel(req, { videoUrl, caption }) {
  const { user, token } = await igCreds(req)
  if (!user || !token) return { ok: false, code: 'NO_IG', message: 'Instagram のキーが未設定です。' }
  const form = new URLSearchParams({ media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: 'true', access_token: token })
  const r = await call(`${GRAPH}/${encodeURIComponent(user)}/media`, { method: 'POST', body: form }, 15000)
  if (!r.ok || !r.data.id) return metaError(r, 'リールの準備')
  return { ok: true, containerId: String(r.data.id) }
}

/** 準備の状況を見て、終わっていれば公開します。1回の呼び出しは数秒で返ります。 */
export async function igAdvance(req, containerId) {
  const { user, token } = await igCreds(req)
  if (!user || !token) return { ok: false, code: 'NO_IG', message: 'Instagram のキーが未設定です。' }
  const st = await call(`${GRAPH}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`)
  if (!st.ok) return metaError(st, '準備状況の確認')
  const code = String(st.data.status_code || '')
  if (code === 'IN_PROGRESS' || code === '') return { ok: true, state: 'processing' }
  if (code === 'ERROR' || code === 'EXPIRED') {
    return { ok: false, state: 'failed', message: code === 'EXPIRED' ? '準備から24時間以上たったため無効になりました。もう一度投稿してください。' : `Instagram が動画を処理できませんでした（${String(st.data.status || '').slice(0, 120)}）。MP4（H.264・AAC）で書き出し直すと通ることが多いです。` }
  }
  if (code === 'PUBLISHED') return { ok: true, state: 'published', mediaId: '' }
  const pub = await call(`${GRAPH}/${encodeURIComponent(user)}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: containerId, access_token: token }) }, 15000)
  if (!pub.ok || !pub.data.id) return { ...metaError(pub, '公開'), state: 'failed' }
  const id = String(pub.data.id)
  const link = await call(`${GRAPH}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`, {}, 4000)
  return { ok: true, state: 'published', mediaId: id, url: (link.ok && link.data.permalink) || '' }
}

/* リールの数字。v22 以降、リールの再生は "views"（旧 plays は廃止）、
   平均視聴時間は ig_reels_avg_watch_time（ミリ秒）です。1つでも名前が
   通らないと全体がエラーになるので、断られたら基本の指標だけで聞き直します。 */
const IG_REEL_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'ig_reels_avg_watch_time']
const IG_BASIC = ['views', 'reach', 'likes', 'comments', 'saved']

export async function igInsights(req, mediaId) {
  const { token } = await igCreds(req)
  if (!token) return { ok: false, code: 'NO_IG', message: 'Instagram のキーが未設定です。' }
  let r = await call(`${GRAPH}/${encodeURIComponent(mediaId)}/insights?metric=${IG_REEL_METRICS.join(',')}&access_token=${encodeURIComponent(token)}`)
  if (!r.ok && Number(((r.data || {}).error || {}).code) === 100) {
    r = await call(`${GRAPH}/${encodeURIComponent(mediaId)}/insights?metric=${IG_BASIC.join(',')}&access_token=${encodeURIComponent(token)}`)
  }
  if (!r.ok) return metaError(r, '数字の取得')
  const v = {}
  for (const m of r.data.data || []) v[m.name] = ((m.values || [])[0] || {}).value ?? m.total_value?.value ?? null
  return {
    ok: true,
    snapshot: {
      views: v.views ?? null, reach: v.reach ?? null, likes: v.likes ?? null, comments: v.comments ?? null,
      shares: v.shares ?? null, saves: v.saved ?? null,
      avg_watch_sec: v.ig_reels_avg_watch_time != null ? Math.round(Number(v.ig_reels_avg_watch_time) / 100) / 10 : null,
      source: 'instagram',
    },
  }
}

/* ---------------- YouTube ---------------- */

/** ブラウザが YouTube に直接アップロードするための、1時間だけ使える鍵。 */
export async function ytAccess(req) {
  const c = await ytCreds(req)
  if (!c.clientId || !c.clientSecret) return { ok: false, code: 'NO_GOOGLE', message: 'Google のクライアントID・シークレットが未設定です（「設定状況 › キーの入力」の商談の自動予約の欄と同じものを使います）。' }
  if (!c.refreshToken) return { ok: false, code: 'NO_YT', message: 'YouTube と連携していません。「YouTube連携」を押して許可してください。' }
  try {
    const token = await accessToken({ clientId: c.clientId, clientSecret: c.clientSecret, refreshToken: c.refreshToken })
    return { ok: true, token, expiresIn: 3000 }
  } catch (e) {
    return { ok: false, message: /接続が切れて/.test(String(e.message)) ? 'YouTube との連携が切れています。「YouTube連携」をもう一度押してください。' : `YouTube の鍵を作れませんでした（${String(e.message || e).slice(0, 100)}）` }
  }
}

export async function ytStats(req, videoId) {
  const a = await ytAccess(req)
  if (!a.ok) return a
  const r = await call(`${YT}/videos?part=statistics&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${a.token}` } })
  if (!r.ok) return { ok: false, message: `YouTube から数字を取れませんでした（${(r.data.error && r.data.error.message) || r.message || r.status}）。` }
  const s = ((r.data.items || [])[0] || {}).statistics
  if (!s) return { ok: false, message: 'その動画が見つかりませんでした（削除されたか、別のアカウントの動画です）。' }
  const n = (x) => (x == null ? null : Number(x))
  return { ok: true, snapshot: { views: n(s.viewCount), likes: n(s.likeCount), comments: n(s.commentCount), source: 'youtube' } }
}

/* ---------------- TikTok ---------------- */

function ttError(r, where) {
  const e = (r.data && r.data.error) || {}
  const code = String(e.code || '')
  let m
  if (r.message) m = r.message
  else if (code === 'access_token_invalid' || code === 'invalid_grant') m = 'TikTok との連携が切れています。「TikTok連携」をもう一度押してください。'
  else if (code === 'scope_not_authorized') m = 'TikTok アプリに video.upload（数字は video.list）の権限がありません。TikTok for Developers でアプリの権限を追加してから連携し直してください。'
  else if (code === 'spam_risk_too_many_pending_share') m = 'TikTok の受信箱に未処理の下書きがたまっています（24時間で5件まで）。アプリで処理してから送ってください。'
  else if (code === 'rate_limit_exceeded') m = '短い時間に呼びすぎました。しばらく待ってからやり直してください。'
  else m = e.message ? `TikTok からの返事: ${String(e.message).slice(0, 160)}` : `TikTok から想定外の返事がありました（${r.status}）。`
  return { ok: false, message: `${where ? where + '：' : ''}${m}` }
}

export async function ttAccess(req) {
  const c = await ttCreds(req)
  if (!c.key || !c.secret) return { ok: false, code: 'NO_TIKTOK', message: 'TikTok のクライアントキーとシークレットが未設定です。' }
  if (!c.refresh) return { ok: false, code: 'NO_TIKTOK', message: 'TikTok と連携していません。「TikTok連携」を押して許可してください。' }
  const r = await call(`${TT}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: c.key, client_secret: c.secret, grant_type: 'refresh_token', refresh_token: c.refresh }),
  })
  if (!r.ok || !r.data.access_token) return ttError({ ...r, data: { error: { code: r.data.error || 'invalid_grant', message: r.data.error_description } } }, '連携')
  // TikTok は更新のたびに新しいリフレッシュトークンを返すことがあります。
  // 古いものは期限まで使えますが、新しいほうを残しておきます。
  if (r.data.refresh_token && r.data.refresh_token !== c.refresh) {
    try { await saveSetting('TIKTOK_REFRESH_TOKEN', r.data.refresh_token, req) } catch (_) {}
  }
  return { ok: true, token: r.data.access_token }
}

export async function exchangeTikTok(req, code, redirectUri) {
  const c = await ttCreds(req)
  const r = await call(`${TT}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: c.key, client_secret: c.secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
  })
  if (!r.ok || !r.data.refresh_token) return { ok: false, message: r.data.error_description || r.data.error || `TikTok ${r.status}` }
  return { ok: true, refreshToken: r.data.refresh_token, scope: r.data.scope || '' }
}

const MB = 1024 * 1024

/** TikTok の分割の決まり: 1つ 5〜64MB（全体が 64MB 以下なら1回で可）、
 *  最後の1つは残りをまとめて最大128MBまで。 */
export function ttChunks(size) {
  if (size <= 64 * MB) return { chunk: size, count: 1 }
  const chunk = 10 * MB
  return { chunk, count: Math.floor(size / chunk) }
}

/** Blob の動画を TikTok の受信箱（下書き）に送ります。動画は少しずつ読み、
 *  全体を一度に持たないようにしています。 */
export async function ttInboxUpload(req, { videoUrl, size }, deadlineMs) {
  const a = await ttAccess(req)
  if (!a.ok) return a
  const { chunk, count } = ttChunks(size)
  const init = await call(`${TT}/post/publish/inbox/video/init/`, {
    method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count } }),
  })
  if (!init.ok || !(init.data.data && init.data.data.upload_url)) return ttError(init, '下書きの準備')
  const { publish_id, upload_url } = init.data.data
  for (let i = 0; i < count; i++) {
    if (Date.now() > deadlineMs) return { ok: false, publishId: publish_id, message: `時間内に送り切れませんでした（${i}/${count}）。動画を短くするか、ファイルを小さくして送り直してください。` }
    const from = i * chunk
    const to = i === count - 1 ? size - 1 : from + chunk - 1
    const part = await fetch(videoUrl, { headers: { Range: `bytes=${from}-${to}` } })
    if (!part.ok && part.status !== 206) return { ok: false, publishId: publish_id, message: '置き場所（Blob）から動画を読めませんでした。' }
    const bytes = new Uint8Array(await part.arrayBuffer())
    const put = await call(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length), 'Content-Range': `bytes ${from}-${to}/${size}` },
      body: bytes,
    }, 30000)
    if (!put.ok && put.status !== 206) return { ok: false, publishId: publish_id, message: `TikTok に動画を送れませんでした（${put.status || put.message}）。` }
  }
  return { ok: true, publishId: publish_id }
}

export async function ttStatus(req, publishId) {
  const a = await ttAccess(req)
  if (!a.ok) return a
  const r = await call(`${TT}/post/publish/status/fetch/`, {
    method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: publishId }),
  })
  if (!r.ok) return ttError(r, '状況の確認')
  const s = (r.data.data || {}).status || ''
  const map = {
    PROCESSING_UPLOAD: '受け取り中', PROCESSING_DOWNLOAD: '受け取り中', SEND_TO_USER_INBOX: 'TikTok アプリの受信箱に届きました。アプリで開いて投稿してください。',
    PUBLISH_COMPLETE: '公開されました', FAILED: `失敗しました（${(r.data.data || {}).fail_reason || '理由不明'}）`,
  }
  return { ok: true, status: s, label: map[s] || s, videoIds: (r.data.data || {}).publicaly_available_post_id || [] }
}

export async function ttStats(req, videoId) {
  const a = await ttAccess(req)
  if (!a.ok) return a
  const r = await call(`${TT}/video/query/?fields=id,view_count,like_count,comment_count,share_count`, {
    method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ filters: { video_ids: [String(videoId)] } }),
  })
  if (!r.ok) return ttError(r, '数字の取得')
  const v = ((r.data.data || {}).videos || [])[0]
  if (!v) return { ok: false, message: 'その動画が見つかりませんでした。TikTok アプリで公開したあと、動画のID（URLの数字）を投稿の欄に入れてください。' }
  return { ok: true, snapshot: { views: v.view_count ?? null, likes: v.like_count ?? null, comments: v.comment_count ?? null, shares: v.share_count ?? null, source: 'tiktok' } }
}
