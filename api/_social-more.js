// SNS（文章）の投稿先のうち、あとから足した2つ：Googleビジネスプロフィールと Bluesky。
//
// Googleビジネスプロフィール（地図・検索に出るお店の情報）
//   Business Profile API v4 の accounts.locations.localPosts.create を使います
//   （2026年時点でも投稿は v4 のまま。店舗の一覧だけは新しい API に分かれています）。
//   鍵はサイトの Google 接続（api/google-oauth.js）で、business.manage の許可だけを
//   別のボタンで取ります。カレンダーの接続とは別のトークン（GBP_REFRESH_TOKEN）に
//   保存するので、片方をやり直してももう片方は切れません。
//   注意：この API は Google に利用申請（Business Profile API のアクセス申請）を
//   して通らないと、呼んでも 0 件の割り当てで断られます。
//
// Bluesky（AT Protocol）
//   アプリパスワード（設定 › プライバシーとセキュリティ › アプリパスワード）で
//   createSession → com.atproto.repo.createRecord。リンクとハッシュタグは
//   facets（UTF-8 のバイト位置）で印を付けないと、押せない文字のままになります。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { setting } from './_settings.js'
import { accessToken } from './_google-cal.js'
import { call } from './_social.js'
import { blueskyFacets, GBP_ACTIONS, isBlobUrl } from './_social-text.js'

export const GBP_API = 'https://mybusiness.googleapis.com/v4'
const GBP_ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts'
const GBP_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1'
export const BSKY_SERVICE = 'https://bsky.social'
/** Bluesky が受け取る画像の大きさの上限（約1MB）。 */
export const BSKY_IMAGE_MAX = 1000000

export const LOCATION_RE = /^accounts\/[0-9]+\/locations\/[0-9]+$/

/* ---------------------------------------------- Googleビジネスプロフィール -- */

async function gbpCreds(req) {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    setting('GOOGLE_CLIENT_ID', '', req),
    setting('GOOGLE_CLIENT_SECRET', '', req),
    setting('GBP_REFRESH_TOKEN', '', req),
  ])
  return { clientId, clientSecret, refreshToken }
}

async function gbpToken(req) {
  try { return { ok: true, token: await accessToken(await gbpCreds(req)) } }
  catch (e) { return { ok: false, message: 'Googleビジネスプロフィール：' + String((e && e.message) || e).slice(0, 200) } }
}

/** 送る形（localPost）を作ります。 */
export function gbpBody(c, p) {
  const want = String((p && p.gbp && p.gbp.action) || 'LEARN_MORE')
  const action = GBP_ACTIONS[want] ? want : 'LEARN_MORE'
  const body = { languageCode: 'ja', summary: c.text, topicType: 'STANDARD' }
  // 電話のボタンは URL を持ちません（お店の電話番号にかかります）。
  if (action === 'CALL') body.callToAction = { actionType: 'CALL' }
  else if (c.link) body.callToAction = { actionType: action, url: c.link }
  if (c.images[0]) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: c.images[0].url }]
  return body
}

export async function postGbp(c, req, ctx, p) {
  const loc = await setting('GBP_LOCATION', '', req)
  if (!LOCATION_RE.test(loc)) return { ok: false, message: 'Googleビジネスプロフィール：投稿する店舗が選ばれていません（SNS（文章）の画面の「店舗を選ぶ」から選んでください）。' }
  const t = await gbpToken(req)
  if (!t.ok) return t
  const r = await call(`${GBP_API}/${loc}/localPosts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(gbpBody(c, p)),
  }, 'Googleビジネスプロフィール', ctx, { publish: true })
  if (!r.ok && r.status === 403) {
    r.message += '（よくある原因：Business Profile API の利用申請がまだ通っていない、または連携したGoogleアカウントがこの店舗の管理者ではない）'
  }
  if (!r.ok) return r
  return { ok: true, id: String(r.data.name || ''), url: String(r.data.searchUrl || '') }
}

/** 連携したアカウントで管理している店舗の一覧（店舗を選ぶため）。 */
export async function gbpLocations(req) {
  const t = await gbpToken(req)
  if (!t.ok) return t
  const ctx = { deadline: Date.now() + 15000 }
  const auth = { headers: { Authorization: `Bearer ${t.token}` } }
  const a = await call(`${GBP_ACCOUNTS}?pageSize=20`, auth, 'Googleビジネスプロフィール', ctx)
  if (!a.ok) return { ok: false, message: a.message + (a.status === 403 || a.status === 429 ? '（Business Profile API の利用申請が通っているか確かめてください）' : '') }
  const out = []
  for (const acc of (a.data.accounts || []).slice(0, 5)) {
    const l = await call(`${GBP_INFO}/${acc.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`, auth, 'Googleビジネスプロフィール', ctx)
    if (!l.ok) continue
    for (const loc of l.data.locations || []) {
      const id = String(loc.name || '').replace(/^locations\//, '')
      const addr = loc.storefrontAddress || {}
      out.push({
        name: `${acc.name}/locations/${id}`,
        title: String(loc.title || ''),
        address: [addr.administrativeArea, addr.locality, ...(addr.addressLines || [])].filter(Boolean).join(' '),
        account: String(acc.accountName || ''),
      })
    }
  }
  return { ok: true, locations: out }
}

export async function testGbp(req, ctx) {
  const t = await gbpToken(req)
  if (!t.ok) return { ok: false, status: 401, message: t.message }
  const loc = await setting('GBP_LOCATION', '', req)
  const r = await call(`${GBP_INFO}/${loc.replace(/^accounts\/[0-9]+\//, '')}?readMask=title`, { headers: { Authorization: `Bearer ${t.token}` } }, 'Googleビジネスプロフィール', ctx)
  if (r.ok) r.who = r.data.title || ''
  return r
}

/* --------------------------------------------------------------- Bluesky -- */

async function bskySession(req, ctx) {
  const identifier = String(await setting('BSKY_HANDLE', '', req)).replace(/^@/, '').trim()
  const password = await setting('BSKY_APP_PASSWORD', '', req)
  const r = await call(`${BSKY_SERVICE}/xrpc/com.atproto.server.createSession`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }),
  }, 'Bluesky', ctx)
  if (!r.ok && r.status === 401) r.message = 'Bluesky：ハンドルかアプリパスワードが違います（ログイン用のパスワードではなく、設定で作る「アプリパスワード」を使います）。'
  return r
}

async function bskyImage(url, jwt, ctx) {
  // 取りに行くのは、この画面からアップロードした画像だけ（X と同じ理由）。
  if (!isBlobUrl(url)) return { ok: false, message: 'Bluesky：この画像は付けられません。' }
  let bytes, type
  try {
    const res = await fetch(url)
    if (!res.ok) return { ok: false, message: `Bluesky：画像を読み込めませんでした（${res.status}）。` }
    type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (e) {
    return { ok: false, message: 'Bluesky：画像を読み込めませんでした。' }
  }
  if (bytes.length > BSKY_IMAGE_MAX) return { ok: false, message: `Bluesky：画像が大きすぎます（${(bytes.length / 1048576).toFixed(1)}MB。1枚 約1MB までです）。` }
  const r = await call(`${BSKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': type }, body: bytes,
  }, 'Bluesky', ctx)
  return r.ok ? { ok: true, blob: r.data.blob } : r
}

/** 送るレコード（app.bsky.feed.post）。 */
export function bskyRecord(c, images, now = new Date()) {
  const rec = { $type: 'app.bsky.feed.post', text: c.text, createdAt: now.toISOString(), langs: ['ja'] }
  const facets = blueskyFacets(c.text)
  if (facets.length) rec.facets = facets
  if (images && images.length) {
    // alt は読み上げ用の説明（空でも送る決まりです）。
    rec.embed = { $type: 'app.bsky.embed.images', images: images.map((b, i) => ({ alt: String((c.images && c.images[i] && c.images[i].alt) || ''), image: b })) }
  }
  return rec
}

export async function postBluesky(c, req, ctx) {
  const s = await bskySession(req, ctx)
  if (!s.ok) return s
  const jwt = s.data.accessJwt
  const blobs = []
  for (const img of c.images) {
    const u = await bskyImage(img.url, jwt, ctx)
    if (!u.ok) return { ok: false, message: `${u.message}（画像が付けられなかったため、Blueskyには投稿していません）` }
    blobs.push(u.blob)
  }
  const parts = c.parts && c.parts.length > 1 ? c.parts : [c.text]
  const create = (record) => call(`${BSKY_SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: s.data.did, collection: 'app.bsky.feed.post', record }),
  }, 'Bluesky', ctx, { publish: true })
  const r = await create(bskyRecord({ ...c, text: parts[0] }, blobs))
  if (!r.ok) return r
  const uri = String(r.data.uri || '')
  const rkey = uri.split('/').pop()
  const url = rkey ? `https://bsky.app/profile/${s.data.handle || s.data.did}/post/${rkey}` : ''
  /* スレッドの続き。返信には「いちばん最初の投稿（root）」と「すぐ前の投稿
     （parent）」の両方の uri と cid が要ります。 */
  const root = { uri, cid: String(r.data.cid || '') }
  let parent = root
  let note = parts.length > 1 ? `スレッド ${parts.length} 件をつなげて投稿しました` : ''
  for (let i = 1; i < parts.length; i++) {
    const rec = bskyRecord({ text: parts[i], images: [] }, [])
    rec.reply = { root, parent }
    const x = await create(rec)
    if (!x.ok) {
      note = `スレッドの ${i + 1}/${parts.length} 件目で止まりました（${String(x.message || '').replace(/^.*?：/, '')}）。続きはBlueskyの画面で、${i}件目への返信として足してください`
      break
    }
    parent = { uri: String(x.data.uri || ''), cid: String(x.data.cid || '') }
  }
  return { ok: true, id: uri, url, parts: parts.length, message: note }
}

export async function testBluesky(req, ctx) {
  const r = await bskySession(req, ctx)
  if (r.ok) r.who = '@' + (r.data.handle || '')
  return r
}

/** いいね・返信・リポスト。公開の読み取り（ログイン不要・無料）です。 */
export async function blueskyMetrics(id, ctx) {
  const m = await call(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(id)}`, {}, 'Bluesky', ctx)
  if (!m.ok) return { ok: false, message: m.message }
  const p = (m.data.posts || [])[0]
  if (!p) return { ok: false, message: 'Bluesky：投稿が見つかりませんでした（消された可能性があります）。' }
  const n = (v) => (v == null ? null : Number(v))
  return { ok: true, likes: n(p.likeCount), comments: n(p.replyCount), shares: (Number(p.repostCount) || 0) + (Number(p.quoteCount) || 0) }
}
