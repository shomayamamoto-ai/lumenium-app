// Posting to the networks, and keeping a record of what went out.
//
// Every one of these is the platform's own documented publishing endpoint,
// called with a token the owner pasted into the admin screen. There is no
// OAuth dance here: each platform wants an app registration, a redirect URL
// and — for Meta and LinkedIn — a review before it will hand out the scopes,
// so the honest thing is a field for the token you already had to go and get.
//
// Nothing here invents a success. Whatever the platform answers is passed
// back: a wrong scope, an expired token or a rejected caption shows up as the
// platform's own words rather than as "投稿できませんでした". And when we do
// not know — the platform did not answer in time after we asked it to
// publish — the result says exactly that, because "failed" invites a resend
// and a resend of something that did go out is a duplicate post.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { setting, settingStatus, saveSetting } from './_settings.js'
import { authHeader } from './_x-oauth1.js'
import { storeFor, storeConfig, pipeline, jstDate } from './_analytics-store.js'
import { KV, BRAND } from './_brand.js'
import { RULES, compose, check, isBlobUrl, cleanCampaign, ALT_MAX, THREADABLE } from './_social-text.js'
import { fieldFor } from './_social-insights.js'
import { GBP_ACTIONS } from './_social-text.js'
import { postGbp, postBluesky, testGbp, testBluesky, blueskyMetrics } from './_social-more.js'


/* API の版は1か所に。Meta は版ごとに約2年で使えなくなり、LinkedIn は
   約1年です。上げるときはここだけを直し、scripts/test-social.mjs を流します。
   Graph API v26.0 は 2026年7月公開の最新版、LinkedIn は「年月」で指定します。 */
export const GRAPH_VERSION = 'v26.0'
export const LINKEDIN_VERSION = '202606'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`
const THREADS = 'https://graph.threads.net/v1.0'
const X_API = 'https://api.x.com/2'
const LINE_API = 'https://api.line.me'

/* 時間の決まり。Edge の関数は25秒以内に返事を始めないと打ち切られます。
   打ち切られると、どれが出てどれが出なかったかを誰にも伝えられません。
   なので1回の呼び出しは9秒まで、全体は21秒までにして、間に合わなかった
   ものは「分からない」と正直に返し、記録してから返事をします。 */
export const CALL_MS = 9000
export const POLL_MS = 10000
export const BUDGET_MS = 21000

/* 各SNSの決まりごとと、使えるようにするまでの道順。
   `setup` は管理画面にそのまま出ます。画面に X_ACCESS_TOKEN とだけ
   書いてあっても、どこで取るのか分からなければ一歩も進めません。
   取りに行く先と、取るのにかかる手間まで書いておきます。 */
export const NETWORKS = [
  {
    id: 'x', label: 'X', mark: '𝕏',
    needs: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'],
    note: 'Xでは日本語は1文字=2として数えます。画像は、この画面からアップロードしたものを4枚まで付けられます。',
    setup: {
      what: 'Xの開発者画面で作れる鍵が4つ要ります（API Key と Secret、Access Token と Secret）。',
      where: 'console.x.com でアプリを開き、先に権限を「Read and write」にしてから、4つの鍵を作ります。順番を逆にすると、読み取り専用の鍵になって投稿できません。「Bearer Token」は使いません。',
      url: 'https://console.x.com/',
      effort: '順番さえ守れば15分ほど。投稿は1件約0.015ドル（リンク付きは約0.2ドル）の従量課金です',
    },
  },
  {
    id: 'facebook', label: 'Facebook', mark: 'f', needs: ['FB_PAGE_ID', 'FB_PAGE_TOKEN'],
    note: 'ページへの投稿です。個人のタイムラインへはAPIから投稿できません。画像は1枚目だけ送ります。',
    setup: {
      what: 'Facebookページの番号と、そのページ用の鍵が要ります。',
      where: 'Meta for Developers でアプリを作り、グラフAPIエクスプローラから pages_manage_posts 権限のページアクセストークンを取ります。ページ番号は同じ画面で確認できます。',
      url: 'https://developers.facebook.com/tools/explorer/',
      effort: '個人のタイムラインには投稿できません。ページが要ります',
    },
  },
  {
    id: 'instagram', label: 'Instagram', mark: '◎', needs: ['IG_USER_ID', 'IG_TOKEN'],
    note: '画像が必須です（JPEG・縦横比 4:5〜1.91:1・8MB以下）。本文のリンクは押せません。1日100件まで。',
    setup: {
      what: 'Instagramの利用者番号と鍵が要ります。',
      where: 'Instagramをプロアカウントにし、Facebookページと連携してから、Facebookと同じ Meta for Developers で取ります。',
      url: 'https://developers.facebook.com/tools/explorer/',
      effort: 'Facebookの設定が先に要ります。画像が無いと投稿できません',
    },
  },
  {
    id: 'threads', label: 'Threads', mark: '@', needs: ['THREADS_USER_ID', 'THREADS_TOKEN'],
    note: '500文字まで。作成と公開の2段階で送ります。鍵は60日で切れるので「トークンを延長」で延ばします。',
    setup: {
      what: 'Threadsの利用者番号と鍵が要ります。',
      where: 'Meta for Developers で Threads API のアプリを作り、threads_basic と threads_content_publish の権限で長期トークンを取ります。',
      url: 'https://developers.facebook.com/docs/threads',
      effort: 'この中では比較的かんたんです',
    },
  },
  {
    id: 'linkedin', label: 'LinkedIn', mark: 'in', needs: ['LI_AUTHOR_URN', 'LI_TOKEN'],
    note: '本文とリンクだけ送ります（画像はアセット登録が別に要るため送りません）。本文が必要です。',
    setup: {
      what: '投稿者を表す文字列（urn:li:person:… など）と鍵が要ります。',
      where: 'LinkedIn Developers でアプリを作り、Share on LinkedIn の製品を追加してアクセストークンを取ります。',
      url: 'https://www.linkedin.com/developers/apps',
      effort: 'アプリの審査が要る場合があります。鍵は60日で切れます',
    },
  },
  {
    id: 'line', label: 'LINE公式アカウント', mark: 'L', needs: ['LINE_CHANNEL_TOKEN'],
    note: '友だち全員に一斉送信します。届いた人数ぶん「通数」を使います（無料プランは月200通）。',
    setup: {
      what: 'LINE公式アカウントの「チャネルアクセストークン（長期）」が1つ要ります。',
      where: 'LINE Official Account Manager › 設定 › Messaging API で利用を開始し、LINE Developers のチャネル › Messaging API設定 の一番下で「チャネルアクセストークン（長期）」を発行します。',
      url: 'https://developers.line.biz/console/',
      effort: '20分ほど。送るたびに友だちの人数ぶん通数を使います',
    },
  },
  {
    id: 'gbp', label: 'Googleビジネスプロフィール', mark: 'G',
    needs: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_LOCATION'],
    note: 'Google検索・マップのお店の情報に「最新情報」として出ます。1500文字まで。リンクはボタン（詳細・予約など）として付きます。画像は1枚目だけ送ります。',
    setup: {
      what: 'サイトの Google 接続（Googleカレンダーと同じ GOOGLE_CLIENT_ID / SECRET）に、ビジネスプロフィールの許可を足します。',
      where: '下の「Googleビジネスプロフィールを連携」を押して許可し、「店舗を選ぶ」で投稿する店舗を選びます。Google Cloud で「My Business」の各APIを有効にし、Business Profile API の利用申請が通っている必要があります。',
      url: 'https://developers.google.com/my-business/content/prereqs',
      effort: '連携は数分。APIの利用申請は Google の審査に数日かかることがあります',
    },
  },
  {
    id: 'bluesky', label: 'Bluesky', mark: '🦋', needs: ['BSKY_HANDLE', 'BSKY_APP_PASSWORD'],
    note: '300文字まで（見た目の文字数で数えます）。リンクとハッシュタグは押せる形で送ります。画像は、この画面からアップロードしたものを4枚まで（1枚1MBまで）。',
    setup: {
      what: 'Blueskyのハンドル（例：shop.bsky.social）と「アプリパスワード」が要ります。',
      where: 'Bluesky の 設定 › プライバシーとセキュリティ › アプリパスワード で作ります（ログイン用のパスワードは使いません）。',
      url: 'https://bsky.app/settings/app-passwords',
      effort: '5分ほど。無料です',
    },
  },
].map((n) => ({ ...n, ...RULES[n.id] }))

const LOG = `${KV}social:log`
const METRICS = `${KV}social:metrics`
const TOKENS = `${KV}social:tok`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function creds(names, req) {
  const out = {}
  for (const n of names) out[n] = await setting(n, '', req)
  return out
}

/** What this network still needs. One answer for both the list and the send:
 *  they used to disagree about Instagram's fallback to the Facebook page
 *  token, so the row said 利用可 and pressing 投稿 said IG_TOKEN が未設定.
 *  Without `req` this answers for the daily job, which carries no browser and
 *  so cannot see keys kept only in the admin's browser. */
export async function missingFor(net, req) {
  const got = await creds(net.needs, req)
  const missing = net.needs.filter((k) => !got[k])
  if (net.id === 'instagram' && missing.includes('IG_TOKEN') && (await setting('FB_PAGE_TOKEN', '', req))) {
    return missing.filter((k) => k !== 'IG_TOKEN')
  }
  return missing
}

/** Which networks can actually be posted to right now, and what is missing.
 *  `scheduled` says whether the daily job (which has no browser) can post
 *  there too — a key kept only in this browser works now and not at 9 a.m. */
export async function socialStatus(req) {
  const rows = []
  for (const n of NETWORKS) {
    const missing = await missingFor(n, req)
    const ready = !missing.length
    rows.push({
      id: n.id, label: n.label, mark: n.mark, limit: n.limit,
      image: n.image, maxImages: n.maxImages, weighted: !!n.weighted, needText: !!n.needText,
      note: n.note, needs: n.needs, setup: n.setup,
      ready,
      missing,
      scheduled: ready ? !(await missingFor(n)).length : false,
    })
  }
  return rows
}

/* ---------------------------------------------------------------- calls -- */

/** The platform's answer, or the transport error, never a guess.
 *  `publish: true` marks the call that makes the post public: if that one
 *  times out, the post may well exist, and the result has to say so. */
export async function call(url, init, label, ctx, opts = {}) {
  const left = (ctx && ctx.deadline ? ctx.deadline : Date.now() + CALL_MS) - Date.now()
  if (left < 700) {
    return { ok: false, timeout: true, message: `${label}：時間内に順番が回りませんでした。送っていません。` }
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), Math.min(opts.ms || CALL_MS, left))
  let res, text
  try {
    res = await fetch(url, { ...init, signal: ac.signal })
    text = await res.text()
  } catch (e) {
    const aborted = ac.signal.aborted || /abort|timeout/i.test(String((e && e.name) || '') + String((e && e.message) || ''))
    if (aborted) {
      return opts.publish
        ? { ok: false, timeout: true, unknown: true,
            message: `${label}：時間内に返事がありませんでした。投稿されたかどうか分かりません。${label.replace(/（.*$/, '')}の画面で確認してから、必要なときだけ出し直してください。` }
        : { ok: false, timeout: true, message: `${label}：時間内に返事がありませんでした。投稿はしていません。` }
    }
    return { ok: false, message: `${label} に接続できませんでした：${String((e && e.message) || e).slice(0, 160)}` }
  } finally {
    clearTimeout(timer)
  }
  let data = null
  try { data = JSON.parse(text) } catch (_) {}
  if (!res.ok) {
    const why =
      (data && data.error && (data.error.error_user_msg || data.error.message)) ||
      (data && (data.detail || data.message || data.title || data.error_description)) ||
      text.slice(0, 200) || `HTTP ${res.status}`
    return {
      ok: false, status: res.status, data, res,
      code: data && data.error && data.error.code,
      message: `${label}：${String(why).slice(0, 300)}`,
    }
  }
  return { ok: true, status: res.status, data: data || {}, res }
}

/** Meta's containers (Instagram and Threads) are built asynchronously: the
 *  image is fetched and checked after we ask. Publishing before it is ready
 *  fails, and the old code did exactly that. Ask until it is FINISHED, for at
 *  most POLL_MS, and report the platform's own error if it says ERROR. */
async function waitReady(url, field, label, ctx) {
  const until = Math.min(Date.now() + POLL_MS, ctx.deadline - 2500)
  let last = ''
  for (let i = 0; ; i++) {
    const r = await call(url, {}, label, ctx, { ms: 4000 })
    if (r.ok) {
      last = String((r.data && r.data[field]) || '')
      if (last === 'FINISHED' || last === 'PUBLISHED') return { ok: true }
      if (last === 'ERROR' || last === 'EXPIRED') {
        const why = (r.data && (r.data.error_message || r.data.status)) || last
        return { ok: false, message: `${label}：画像や本文の確認で止まりました（${why}）。投稿はしていません。` }
      }
    }
    if (Date.now() + 1500 > until) break
    await sleep(i === 0 ? 1000 : 1500)
  }
  return {
    ok: false, timeout: true,
    message: `${label}：${Math.round(POLL_MS / 1000)}秒待っても準備が終わりませんでした（${last || '応答なし'}）。投稿はしていません。少し時間をおいて出し直してください。`,
  }
}

/* -------------------------------------------------------------------- X -- */

/* X は4つの鍵で署名して送ります（OAuth 1.0a）。
   以前は OAuth 2.0 のユーザー用トークン1つを Bearer で送っていましたが、
   その種類のトークンは開発者画面のボタンでは作れず、2時間で切れます。
   4つの鍵はどれもボタンで作れて、期限もありません。 */
async function xKeys(req) {
  const got = await creds(['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'], req)
  return {
    apiKey: got.X_API_KEY, apiSecret: got.X_API_SECRET,
    accessToken: got.X_ACCESS_TOKEN, accessSecret: got.X_ACCESS_SECRET,
  }
}

async function xCall(method, url, keys, body, label, ctx, opts = {}) {
  const u = new URL(url)
  const extra = Object.fromEntries(u.searchParams)
  const auth = await authHeader({ method, url: u.origin + u.pathname, keys, extra })
  const headers = { Authorization: auth }
  let payload
  if (body instanceof FormData) payload = body
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  return call(url, { method, headers, body: payload }, label, ctx, opts)
}

const X_HINT = '（よくある原因: アプリの権限を「Read and write」にする前に Access Token を作った。' +
  '権限を直したあと、Access Token と Secret を作り直して貼り直してください）'

/** One image, by the documented v2 chunked upload: initialize, one append
 *  (images are at most 5MB, one segment), finalize. Only our own Blob store
 *  is fetched — see isBlobUrl for why. */
async function xUpload(url, keys, ctx, alt) {
  if (!isBlobUrl(url)) return { ok: false, message: 'X：アップロードした画像以外は付けられません。' }
  // call() reads text; an image needs its bytes, so this one is fetched here.
  // No redirects: the address was checked, wherever it would lead was not.
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), Math.min(CALL_MS, ctx.deadline - Date.now()))
  let bytes, type
  try {
    const res = await fetch(url, { redirect: 'error', signal: ac.signal })
    if (!res.ok) return { ok: false, message: `X：画像を読み込めませんでした（HTTP ${res.status}）。投稿はしていません。` }
    type = (res.headers.get('content-type') || '').split(';')[0].trim()
    bytes = await res.arrayBuffer()
  } catch (e) {
    return { ok: false, message: 'X：画像を読み込めませんでした。投稿はしていません。' }
  } finally { clearTimeout(t) }
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return { ok: false, message: 'X：JPEG・PNG・WebP 以外の画像は付けられません。' }
  if (bytes.byteLength > 5 * 1024 * 1024) return { ok: false, message: 'X：画像が5MBを超えています。' }

  const init = await xCall('POST', `${X_API}/media/upload/initialize`, keys,
    { media_type: type, total_bytes: bytes.byteLength, media_category: 'tweet_image' }, 'X（画像の準備）', ctx)
  if (!init.ok) return init
  const id = init.data && init.data.data && init.data.data.id
  if (!id) return { ok: false, message: 'X（画像の準備）：番号が返ってきませんでした。' }
  const form = new FormData()
  form.set('segment_index', '0')
  form.set('media', new Blob([bytes], { type }), 'image')
  const app = await xCall('POST', `${X_API}/media/upload/${encodeURIComponent(id)}/append`, keys, form, 'X（画像の送信）', ctx)
  if (!app.ok) return app
  const fin = await xCall('POST', `${X_API}/media/upload/${encodeURIComponent(id)}/finalize`, keys, undefined, 'X（画像の確定）', ctx)
  if (!fin.ok) return fin
  const mediaId = String((fin.data && fin.data.data && fin.data.data.id) || id)
  // 代替テキスト（読み上げ用の説明）。確定のあと、投稿の前に付けます（X の決まり）。
  // 付けられなくても投稿は止めません。そのことだけを伝えます。
  let note = ''
  if (alt) {
    const meta = await xCall('POST', `${X_API}/media/metadata`, keys,
      { id: mediaId, metadata: { alt_text: { text: alt } } }, 'X（代替テキスト）', ctx)
    if (!meta.ok) note = '代替テキストは付けられませんでした'
  }
  return { ok: true, id: mediaId, note }
}

async function postX(c, req, ctx) {
  const keys = await xKeys(req)
  let mediaIds = []
  let altNote = ''
  if (c.images.length) {
    const ups = await Promise.all(c.images.map((i) => xUpload(i.url, keys, ctx, i.alt)))
    const bad = ups.find((u) => !u.ok)
    if (bad) return { ok: false, message: `${bad.message}（画像が付けられなかったため、Xには投稿していません）` }
    mediaIds = ups.map((u) => u.id)
    altNote = ups.some((u) => u.note) ? '代替テキストは付けられませんでした' : ''
  }
  const parts = c.parts && c.parts.length > 1 ? c.parts : [c.text]
  const r = await xCall('POST', `${X_API}/tweets`, keys,
    mediaIds.length ? { text: parts[0], media: { media_ids: mediaIds } } : { text: parts[0] },
    'X', ctx, { publish: true })
  /* いちばん多いつまずきは「権限を Read and write にする前に Access Token を
     作った」です。その鍵は読み取り専用のままで、投稿は 403 になります。
     X の返事だけでは原因が分からないので、直し方を添えます。 */
  if (!r.ok && /403|forbidden|oauth1-permissions|not permitted/i.test(String(r.status || '') + String(r.message || ''))) {
    r.message = String(r.message || '') + X_HINT
  }
  if (!r.ok) return r
  const id = r.data && r.data.data && r.data.data.id
  const url = id ? `https://x.com/i/web/status/${id}` : ''
  // スレッドの2件目から：1つ前の投稿への返信としてつなげます。
  const rest = await chain(parts, id, async (text, prev) => {
    const x = await xCall('POST', `${X_API}/tweets`, keys, { text, reply: { in_reply_to_tweet_id: prev } }, 'X', ctx, { publish: true })
    return x.ok ? { ok: true, id: x.data && x.data.data && x.data.data.id } : x
  }, 'X')
  return { ok: true, id, url, parts: parts.length, message: [altNote, rest].filter(Boolean).join('。') }
}

/** スレッドの2件目以降を順に出します。1件目はもう公開されているので、
 *  途中で止まっても「成功」のまま、何件目で止まったかを伝えます。 */
async function chain(parts, firstId, send, label) {
  let prev = firstId
  for (let i = 1; i < parts.length; i++) {
    const r = await send(parts[i], prev, i)
    if (!r.ok || !r.id) {
      return `スレッドの ${i + 1}/${parts.length} 件目で止まりました（${String(r.message || '返事に番号がありませんでした').replace(/^.*?：/, '')}）。` +
        `${r.unknown ? '出たかどうか分かりません。' : ''}続きは${label}の画面で、${i}件目への返信として足してください`
    }
    prev = r.id
  }
  return parts.length > 1 ? `スレッド ${parts.length} 件をつなげて投稿しました` : ''
}

/* ------------------------------------------------------------- Facebook -- */

async function postFacebook(c, req, ctx) {
  const page = await setting('FB_PAGE_ID', '', req)
  const token = await setting('FB_PAGE_TOKEN', '', req)
  const form = new URLSearchParams()
  const img = c.images[0]
  const path = img ? 'photos' : 'feed'
  if (img) {
    form.set('url', img.url)
    form.set('caption', c.text)
  } else {
    form.set('message', c.text)
    if (c.linkSeparate) form.set('link', c.link)
  }
  form.set('access_token', token)
  const r = await call(`${GRAPH}/${encodeURIComponent(page)}/${path}`, { method: 'POST', body: form }, 'Facebook', ctx, { publish: true })
  if (!r.ok) return r
  const id = r.data.post_id || r.data.id
  return { ok: true, id, url: id ? `https://www.facebook.com/${id}` : '' }
}

/* ------------------------------------------------------------ Instagram -- */

export async function igToken(req) {
  return (await setting('IG_TOKEN', '', req)) || (await setting('FB_PAGE_TOKEN', '', req))
}

/** Meta's two-step publish: build a container, wait for it, then publish.
 *  Every step can fail on its own, and each says which one it was. */
async function postInstagram(c, req, ctx, p) {
  const user = await setting('IG_USER_ID', '', req)
  const token = await igToken(req)
  if (!token) return { ok: false, message: 'Instagram：アクセストークンが未設定です（Facebookページのトークンでも構いません）。' }
  if (!c.images[0]) return { ok: false, message: 'Instagram：画像が必要です。' }
  const make = new URLSearchParams({ image_url: c.images[0].url, caption: c.text, access_token: token })
  // 代替テキスト（2025年3月から画像の投稿で使えます。リール・ストーリーズは不可）。
  if (c.images[0].alt) make.set('alt_text', c.images[0].alt)
  const made = await call(`${GRAPH}/${encodeURIComponent(user)}/media`, { method: 'POST', body: make }, 'Instagram（下書き作成）', ctx)
  if (!made.ok) return made
  const cid = String(made.data.id || '')
  const ready = await waitReady(`${GRAPH}/${encodeURIComponent(cid)}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    'status_code', 'Instagram（画像の確認）', ctx)
  if (!ready.ok) return ready
  const form = new URLSearchParams({ creation_id: cid, access_token: token })
  const pub = await call(`${GRAPH}/${encodeURIComponent(user)}/media_publish`, { method: 'POST', body: form }, 'Instagram（公開）', ctx, { publish: true })
  if (!pub.ok) return pub
  const id = pub.data.id
  let url = ''
  if (ctx.deadline - Date.now() > 2500) {
    const link = await call(`${GRAPH}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`, {}, 'Instagram', ctx, { ms: 2500 })
    if (link.ok) url = link.data.permalink || ''
  }
  /* 最初のコメント（ハッシュタグや「リンクはプロフィールから」など）。
     公開のすぐあとに、自分のアカウントからコメントします。付けられなくても
     投稿はもう出ているので「成功」のまま、そのことだけを伝えます。
     instagram_manage_comments の権限が要ります。 */
  let message = ''
  const first = String((p && p.firstComment) || '').trim()
  if (first) {
    const cm = await call(`${GRAPH}/${encodeURIComponent(id)}/comments`, {
      method: 'POST', body: new URLSearchParams({ message: first, access_token: token }),
    }, 'Instagram（最初のコメント）', ctx, { ms: 4000 })
    message = cm.ok
      ? '最初のコメントも付けました。'
      : '最初のコメントは付けられませんでした（鍵に instagram_manage_comments の権限が要ります）。投稿の画面から手でコメントしてください。'
  }
  return { ok: true, id, url, message }
}

/* -------------------------------------------------------------- Threads -- */

/** Threads に1件。reply_to があれば、その投稿への返信（スレッドの続き）。 */
async function threadsOne(user, token, text, img, replyTo, ctx) {
  const make = new URLSearchParams({ media_type: img ? 'IMAGE' : 'TEXT', text, access_token: token })
  if (img) make.set('image_url', img.url)
  if (img && img.alt) make.set('alt_text', img.alt)
  if (replyTo) make.set('reply_to_id', replyTo)
  const made = await call(`${THREADS}/${encodeURIComponent(user)}/threads`, { method: 'POST', body: make }, 'Threads（下書き作成）', ctx)
  if (!made.ok) return made
  const cid = String(made.data.id || '')
  const ready = await waitReady(`${THREADS}/${encodeURIComponent(cid)}?fields=status,error_message&access_token=${encodeURIComponent(token)}`,
    'status', 'Threads（内容の確認）', ctx)
  if (!ready.ok) return ready
  const pub = new URLSearchParams({ creation_id: cid, access_token: token })
  const p = await call(`${THREADS}/${encodeURIComponent(user)}/threads_publish`, { method: 'POST', body: pub }, 'Threads（公開）', ctx, { publish: true })
  if (!p.ok) return p
  return { ok: true, id: p.data.id }
}

async function postThreads(c, req, ctx) {
  const user = await setting('THREADS_USER_ID', '', req)
  const token = await setting('THREADS_TOKEN', '', req)
  const parts = c.parts && c.parts.length > 1 ? c.parts : [c.text]
  const first = await threadsOne(user, token, parts[0], c.images[0], '', ctx)
  if (!first.ok) return first
  const id = first.id
  const rest = await chain(parts, id, (text, prev) => threadsOne(user, token, text, null, prev, ctx), 'Threads')
  let url = ''
  if (ctx.deadline - Date.now() > 2500) {
    const link = await call(`${THREADS}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`, {}, 'Threads', ctx, { ms: 2500 })
    if (link.ok) url = link.data.permalink || ''
  }
  return { ok: true, id, url, parts: parts.length, message: rest }
}

/* ------------------------------------------------------------- LinkedIn -- */

/** The Posts API reads `commentary` as its own markup ("little text"): these
 *  characters mean something there, and unescaped they cut the post short or
 *  get it refused. */
export function liEscape(s) {
  return String(s).replace(/[\\|{}@[\]()<>#*_~]/g, (ch) => '\\' + ch)
}

async function postLinkedIn(c, req, ctx) {
  const author = await setting('LI_AUTHOR_URN', '', req)
  const token = await setting('LI_TOKEN', '', req)
  const r = await call('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      commentary: liEscape(c.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  }, 'LinkedIn', ctx, { publish: true })
  if (!r.ok) return r
  const id = (r.res && r.res.headers.get('x-restli-id')) || r.data.id || ''
  return { ok: true, id, url: id ? `https://www.linkedin.com/feed/update/${id}` : '' }
}

/* ----------------------------------------------------------------- LINE -- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Broadcast to every friend. The retry key is the composer's own id, so a
 *  resend of the same composition is refused by LINE (409) rather than
 *  arriving twice on every customer's phone. */
async function postLine(c, req, ctx, p) {
  const token = await setting('LINE_CHANNEL_TOKEN', '', req)
  const messages = []
  if (String(c.text || '').trim()) messages.push({ type: 'text', text: c.text })
  const img = c.images[0]
  if (img) messages.push({ type: 'image', originalContentUrl: img.url, previewImageUrl: img.preview || img.url })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (p && UUID.test(String(p.sendId || ''))) headers['X-Line-Retry-Key'] = p.sendId
  const r = await call(`${LINE_API}/v2/bot/message/broadcast`, { method: 'POST', headers, body: JSON.stringify({ messages }) }, 'LINE', ctx, { publish: true })
  if (!r.ok && r.status === 409) {
    return { ok: true, id: (r.res && r.res.headers.get('x-line-accepted-request-id')) || '', url: '',
      message: 'この内容はすでに受け付け済みでした（二重送信を防ぎました）。' }
  }
  if (!r.ok && r.status === 429) {
    r.message = 'LINE：今月送れる通数の上限に達しています。LINE Official Account Manager でプランを確認するか、来月まで待ってください。（' + r.message + '）'
  }
  if (!r.ok && r.status === 401) r.message = 'LINE：チャネルアクセストークンが無効です。発行し直して貼り直してください。'
  if (!r.ok) return r
  return { ok: true, id: (r.res && r.res.headers.get('x-line-request-id')) || '', url: '' }
}

const SENDERS = {
  x: postX, facebook: postFacebook, instagram: postInstagram,
  threads: postThreads, linkedin: postLinkedIn, line: postLine,
  gbp: postGbp, bluesky: postBluesky,
}

/* -------------------------------------------------------------- payload -- */

/** 画像の代替テキスト。改行は空白に、ALT_MAX 文字まで（X・Instagram の上限）。 */
function cleanAlt(v) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, ALT_MAX)
}

/** Read and check what the composer sent, once, for both "send now" and
 *  "send on a date". Returns { ok, payload } or { ok:false, message }. */
export function readPayload(body) {
  const b = body || {}
  const text = String(b.text || '').trim()
  const link = String(b.link || '').trim()
  const campaign = cleanCampaign(b.campaign)
  const targets = Array.isArray(b.targets) ? [...new Set(b.targets.map(String))] : []
  let images = Array.isArray(b.images) ? b.images : []
  if (!images.length && b.imageUrl) images = [{ url: String(b.imageUrl) }]
  images = images.slice(0, 4).map((i) => (typeof i === 'string' ? { url: i } : i || {}))
    .map((i) => ({ url: String(i.url || '').trim(), preview: String(i.preview || '').trim(), alt: cleanAlt(i.alt) }))
    .filter((i) => i.url)

  if (!targets.length) return { ok: false, message: '投稿先が選ばれていません。' }
  const unknown = targets.filter((t) => !NETWORKS.some((n) => n.id === t))
  if (unknown.length) return { ok: false, message: '不明な投稿先です：' + unknown.join(', ') }
  if (text.length > 5000) return { ok: false, message: '本文が長すぎます（5000文字まで）。' }
  // http:// は受け付けません。Instagram・LINE は https の画像しか取りに
  // 行かず、リンクも http だと各SNSで「安全でない」と出るためです。
  for (const u of [link, ...images.map((i) => i.url), ...images.map((i) => i.preview)]) {
    if (u && !/^https:\/\/\S+$/i.test(u)) return { ok: false, message: 'リンクと画像のURLは https:// で始まる必要があります（http:// は使えません）。' }
  }
  const variants = {}
  const raw = b.variants && typeof b.variants === 'object' ? b.variants : {}
  for (const id of Object.keys(raw)) {
    if (!RULES[id]) continue
    const v = raw[id] || {}
    const t = typeof v.text === 'string' ? v.text.slice(0, 6000) : ''
    if (t.length > 5000) return { ok: false, message: `${id} 用の本文が長すぎます。` }
    variants[id] = { text: t, noLink: !!v.noLink }
  }
  const sendId = UUID.test(String(b.sendId || '')) ? String(b.sendId) : crypto.randomUUID()
  // Googleビジネスプロフィールのボタンの種類（知らない値は「詳細」にします）。
  const gbpAction = String((b.gbp && b.gbp.action) || '')
  const gbp = { action: GBP_ACTIONS[gbpAction] ? gbpAction : 'LEARN_MORE' }
  // Instagram の「最初のコメント」（公開のすぐあとに付けます）。Instagram に出すときだけ。
  const firstComment = targets.includes('instagram') ? String(b.firstComment || '').trim().slice(0, 2200) : ''
  const out = { text, link, campaign, images, variants, targets, sendId, gbp }
  if (firstComment) out.firstComment = firstComment
  // スレッドに分ける投稿先（X・Threads・Bluesky のうち、選んだもの）と、番号を付けるか。
  const th = b.thread && typeof b.thread === 'object' ? b.thread : null
  const thNets = th && Array.isArray(th.nets) ? th.nets.map(String).filter((n) => THREADABLE[n] && targets.includes(n)) : []
  if (thNets.length) out.thread = { nets: [...new Set(thNets)], number: th.number !== false }
  return { ok: true, payload: out }
}

/** 繰り返し投稿の中身を、定型文から作る関数（_social-queue.js の planRepeats に渡します）。
 *  送り先は「毎朝の自動処理から送れるもの」だけ——ブラウザにだけ置いた鍵は、
 *  朝9時には見えないためです。 */
export async function repeatBuilder() {
  const nets = await socialStatus()
  return (t) => {
    const targets = (t.nets || []).filter((id) => nets.some((n) => n.id === id && n.ready && n.scheduled))
    if (!targets.length) return { ok: false, message: '予約で送れる投稿先がありません（選んだSNSの鍵を、Vercel の環境変数か保存先に入れてください）。' }
    const r = readPayload({ text: t.text, link: t.link, campaign: t.campaign, targets, images: t.images || [] })
    if (!r.ok) return r
    const problems = precheck(r.payload)
    return problems.length ? { ok: false, message: problems.join(' / ') } : r
  }
}

/** Every target, checked before anything is sent. A post that is wrong for
 *  one network is refused as a whole: sending it to four and not the fifth
 *  leaves the owner with a half-published mistake to clean up by hand. */
export function precheck(payload, host = BRAND.host) {
  const problems = []
  for (const id of payload.targets) {
    const c = compose(id, payload, host)
    const k = check(id, c)
    const net = NETWORKS.find((n) => n.id === id)
    for (const e of k.errors) problems.push(`${net ? net.label : id}：${e}`)
  }
  return problems
}

/* ----------------------------------------------------------------- send -- */

async function sendOne(id, payload, req, ctx) {
  const net = NETWORKS.find((n) => n.id === id)
  const missing = await missingFor(net, req)
  if (missing.length) return { ok: false, message: `${net.label}：${missing.join('・')} が未設定です。` }
  const c = compose(id, payload, BRAND.host)
  const k = check(id, c)
  if (k.errors.length) return { ok: false, message: `${net.label}：${k.errors.join(' ')}` }
  return SENDERS[id](c, req, ctx, payload)
}

/** All targets at once. One slow network no longer holds the others up, and
 *  none of them can run past the budget: whatever has not answered by then
 *  is reported as unknown, and the record is written before we reply. */
export async function sendPost(payload, req, opts = {}) {
  const ctx = { deadline: Date.now() + (opts.budget || BUDGET_MS) }
  const capped = (id) => Promise.race([
    sendOne(id, payload, req, ctx),
    sleep(Math.max(0, ctx.deadline - Date.now()) + 1500).then(() => ({
      ok: false, unknown: true, timeout: true,
      message: '時間内に結果が分かりませんでした。投稿されている可能性があります。そのSNSの画面で確認してから、必要なときだけ出し直してください。',
    })),
  ])
  const settled = await Promise.allSettled(payload.targets.map(capped))
  const results = settled.map((s, i) => {
    const id = payload.targets[i]
    const net = NETWORKS.find((n) => n.id === id)
    const r = s.status === 'fulfilled' ? s.value : { ok: false, message: String((s.reason && s.reason.message) || s.reason).slice(0, 200) }
    let message = r.message || ''
    if (!r.ok && message && !message.startsWith(net.label) && !message.startsWith(net.label.slice(0, 4))) message = `${net.label}：${message}`
    const row = {
      net: id, label: net.label, ok: !!r.ok, unknown: !r.ok && !!r.unknown,
      id: r.id ? String(r.id) : '', url: r.url || '', message,
    }
    if (r.parts > 1) row.parts = r.parts
    return row
  })

  // What each network was actually handed, when it differed from the base
  // text — the history should show what went out, not what was typed.
  const texts = {}
  // どの投稿先に、計測用の印（?ref=）つきの自社リンクが入っていたか。
  // 「投稿ごとの成果」は、この名前でアクセス解析の数を引きます。
  const refs = {}
  for (const id of payload.targets) {
    const c = compose(id, payload, BRAND.host)
    if (c.parts && c.parts.length > 1) texts[id] = c.parts.join('\n―\n').slice(0, 1500)
    else if (c.text !== payload.text) texts[id] = c.text.slice(0, 600)
    if (/[?&]ref=/.test(c.text + ' ' + c.link)) refs[id] = fieldFor(id, payload.campaign)
  }
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    text: payload.text.slice(0, 400),
    link: payload.link,
    campaign: payload.campaign || '',
    images: payload.images.map((i) => i.url),
    texts,
    refs,
    results,
  }
  if (opts.scheduledFor) entry.scheduledFor = opts.scheduledFor
  const kept = await logPosts(entry, req)
  return { entry, results, kept }
}

/* -------------------------------------------------------------- history -- */

async function cfgFor(req) {
  return req ? await storeFor(req) : storeConfig()
}

/** The record the SEO/AIO side reads. Posting works without a store; only the
 *  history and the "how much did we put out" figure need one. It is resolved
 *  the same way the settings are — the admin's own pair counts — so the
 *  screen that saved keys into a store also keeps the history there. */
export async function logPosts(entry, req) {
  const cfg = await cfgFor(req)
  if (!cfg) return false
  try {
    await pipeline(cfg, [
      ['LPUSH', LOG, JSON.stringify(entry)],
      ['LTRIM', LOG, 0, 199],
    ])
    return true
  } catch (_) { return false }
}

export async function historyStored(req) {
  return !!(await cfgFor(req))
}

export async function recentPosts(limit = 30, req) {
  const cfg = await cfgFor(req)
  if (!cfg) return []
  try {
    const [raw, metrics] = await pipeline(cfg, [
      ['LRANGE', LOG, 0, Math.max(0, limit - 1)],
      ['HGETALL', METRICS],
    ])
    const m = {}
    const flat = Array.isArray(metrics) ? metrics : []
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try { m[flat[i]] = JSON.parse(flat[i + 1]) } catch (_) {}
    }
    return (Array.isArray(raw) ? raw : [])
      .map((s) => { try { return JSON.parse(s) } catch (_) { return null } })
      .filter(Boolean)
      .map((p) => {
        const key = p.id || p.at
        for (const r of p.results || []) if (m[`${key}|${r.net}`]) r.metrics = m[`${key}|${r.net}`]
        return p
      })
  } catch (_) { return [] }
}

/** Posts per network over the last N days, for the AIO report and the
 *  advisor: an answer engine that never mentions you, and a month with two
 *  posts in it, are the same sentence. A post that reached no network at all
 *  is not a post — it used to be counted as one. */
export async function socialActivity(days = 30, req) {
  const posts = await recentPosts(200, req)
  const from = new Date(Date.now() - days * 86400000).toISOString()
  const recent = posts.filter((p) => p && p.at && p.at >= from)
  const out = recent.filter((p) => (p.results || []).some((r) => r.ok))
  const byNet = {}
  let sent = 0
  let failed = 0
  for (const p of recent) {
    for (const r of p.results || []) {
      if (r.ok) { byNet[r.net] = (byNet[r.net] || 0) + 1; sent++ } else failed++
    }
  }
  const days7 = new Date(Date.now() - 7 * 86400000).toISOString()
  return {
    days,
    posts: out.length,
    attempts: recent.length,
    sent,
    failed,
    byNet,
    last7: out.filter((p) => p.at >= days7).length,
    lastAt: out.length ? out[0].at : null,
    date: jstDate(),
  }
}

/* --------------------------------------------------------------- quotas -- */

function yyyymmdd(d) { return d.replace(/-/g, '') }

/** LINE: what this month allows, what is used, and how many people a
 *  broadcast reaches. Followers are counted by LINE once a day, so the latest
 *  figure is yesterday's. */
async function lineQuota(req) {
  const token = await setting('LINE_CHANNEL_TOKEN', '', req)
  const ctx = { deadline: Date.now() + 8000 }
  const h = { headers: { Authorization: `Bearer ${token}` } }
  const date = jstDate(1)
  const [q, used, fol] = await Promise.all([
    call(`${LINE_API}/v2/bot/message/quota`, h, 'LINE', ctx, { ms: 6000 }),
    call(`${LINE_API}/v2/bot/message/quota/consumption`, h, 'LINE', ctx, { ms: 6000 }),
    call(`${LINE_API}/v2/bot/insight/followers?date=${yyyymmdd(date)}`, h, 'LINE', ctx, { ms: 6000 }),
  ])
  if (!q.ok) return { ok: false, message: q.status === 401 ? 'LINE：チャネルアクセストークンが無効です。' : q.message }
  const unlimited = q.data.type === 'none'
  const limit = unlimited ? null : Number(q.data.value) || 0
  const total = used.ok ? Number(used.data.totalUsage) || 0 : null
  const ready = fol.ok && fol.data.status === 'ready'
  const followers = ready ? Number(fol.data.followers) || 0 : null
  // 届く人数 = 友だち − ブロック。LINE が数えた targetedReaches があればそれを使います。
  const reach = ready
    ? (fol.data.targetedReaches != null ? Number(fol.data.targetedReaches) : Math.max(0, followers - (Number(fol.data.blocks) || 0)))
    : null
  return {
    ok: true, unlimited, limit, used: total,
    remaining: unlimited || total == null ? null : Math.max(0, limit - total),
    followers, reach, date,
    note: ready ? '' : '友だちの人数は、LINE側の集計がまだのため取得できませんでした。',
  }
}

async function metaLimit(id, req) {
  const ig = id === 'instagram'
  const user = await setting(ig ? 'IG_USER_ID' : 'THREADS_USER_ID', '', req)
  const token = ig ? await igToken(req) : await setting('THREADS_TOKEN', '', req)
  const base = ig ? GRAPH : THREADS
  const path = ig ? 'content_publishing_limit' : 'threads_publishing_limit'
  const r = await call(`${base}/${encodeURIComponent(user)}/${path}?fields=quota_usage,config&access_token=${encodeURIComponent(token)}`,
    {}, ig ? 'Instagram' : 'Threads', { deadline: Date.now() + 7000 }, { ms: 6000 })
  if (!r.ok) return { ok: false, message: r.message }
  const row = (r.data.data || [])[0] || {}
  const total = Number(row.config && row.config.quota_total) || (ig ? 100 : 250)
  const used = Number(row.quota_usage) || 0
  return { ok: true, used, total, remaining: Math.max(0, total - used) }
}

/** How much room is left, for the networks that ration it. Read only when
 *  the panel asks, and never on a send: a slow quota answer must not delay a
 *  post, and the platform enforces its own limit anyway. */
export async function socialQuotas(req) {
  const nets = await socialStatus(req)
  const on = (id) => nets.some((n) => n.id === id && n.ready)
  const out = {}
  const jobs = []
  if (on('line')) jobs.push(lineQuota(req).then((v) => { out.line = v }))
  if (on('instagram')) jobs.push(metaLimit('instagram', req).then((v) => { out.instagram = v }))
  if (on('threads')) jobs.push(metaLimit('threads', req).then((v) => { out.threads = v }))
  await Promise.allSettled(jobs)
  return out
}

/* ------------------------------------------------------ connection test -- */

/** Read the platform's answer the way the owner needs it: is the key dead,
 *  is it alive but missing a permission, or is it fine. */
export function diagnose(r) {
  if (r.ok) return 'ok'
  const code = Number(r.code)
  if (r.status === 401 || code === 190 || code === 102) return 'expired'
  if (r.status === 403 || code === 10 || code === 200 || (code >= 200 && code < 300)) return 'permission'
  if (r.timeout || !r.status) return 'network'
  return 'error'
}

const SAY = {
  expired: '鍵が無効か、期限が切れています。発行し直して、設定状況 › キーの入力に貼り直してください。',
  permission: '鍵は使えますが、必要な権限が付いていません。発行するときの権限（スコープ）を確認してください。',
  network: 'つながりませんでした。時間をおいてもう一度お試しください。',
  error: 'エラーが返ってきました。',
}

/** A cheap read with the stored keys — nothing is posted. */
export async function testNetwork(id, req) {
  const net = NETWORKS.find((n) => n.id === id)
  if (!net) return { ok: false, state: 'error', message: '不明な投稿先です。' }
  const missing = await missingFor(net, req)
  if (missing.length) return { ok: false, state: 'missing', message: `${missing.join('・')} が未設定です。` }
  const ctx = { deadline: Date.now() + 9000 }
  let r
  let who = ''
  if (id === 'x') {
    r = await xCall('GET', `${X_API}/users/me`, await xKeys(req), undefined, 'X', ctx)
    if (r.ok) who = '@' + ((r.data.data && r.data.data.username) || '')
  } else if (id === 'facebook') {
    const page = await setting('FB_PAGE_ID', '', req)
    const token = await setting('FB_PAGE_TOKEN', '', req)
    r = await call(`${GRAPH}/${encodeURIComponent(page)}?fields=id,name&access_token=${encodeURIComponent(token)}`, {}, 'Facebook', ctx)
    if (r.ok) who = r.data.name || ''
  } else if (id === 'instagram') {
    const user = await setting('IG_USER_ID', '', req)
    r = await call(`${GRAPH}/${encodeURIComponent(user)}?fields=id,username&access_token=${encodeURIComponent(await igToken(req))}`, {}, 'Instagram', ctx)
    if (r.ok) who = '@' + (r.data.username || '')
  } else if (id === 'threads') {
    r = await call(`${THREADS}/me?fields=id,username&access_token=${encodeURIComponent(await setting('THREADS_TOKEN', '', req))}`, {}, 'Threads', ctx)
    if (r.ok) who = '@' + (r.data.username || '')
  } else if (id === 'linkedin') {
    r = await call('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${await setting('LI_TOKEN', '', req)}` } }, 'LinkedIn', ctx)
    if (r.ok) who = r.data.name || ''
    /* userinfo はプロフィールを読む権限（openid）が要ります。投稿の権限だけの
       鍵では 403 になりますが、それは「投稿できない」ではありません。 */
    if (!r.ok && r.status === 403) {
      return { ok: true, state: 'partial', message: '鍵は有効です（プロフィールを読む権限が無いため、投稿者名は確認できませんでした。投稿には影響しません）。' }
    }
  } else if (id === 'line') {
    r = await call(`${LINE_API}/v2/bot/info`, { headers: { Authorization: `Bearer ${await setting('LINE_CHANNEL_TOKEN', '', req)}` } }, 'LINE', ctx)
    if (r.ok) who = r.data.displayName || r.data.basicId || ''
  } else if (id === 'gbp') {
    r = await testGbp(req, ctx)
    if (r.ok) who = r.who || ''
  } else if (id === 'bluesky') {
    r = await testBluesky(req, ctx)
    if (r.ok) who = r.who || ''
  }
  const state = diagnose(r)
  const extra = id === 'threads' ? await threadsTokenInfo(req) : null
  if (state === 'ok') {
    return { ok: true, state, who, token: extra, message: `つながりました${who ? `（${who}）` : ''}。` + (id === 'x' ? 'Xは確認1回ごとに少額（約0.01ドル）の読み取り料金がかかります。' : '') }
  }
  return { ok: false, state, token: extra, message: `${SAY[state]}（${String(r.message || '').slice(0, 200)}）` + (id === 'x' && state === 'permission' ? X_HINT : '') }
}

/* -------------------------------------------------------- Threads token -- */

/** What we know about when the Threads token runs out. Known exactly after we
 *  refreshed it; estimated (60 days from saving) when it was pasted in. */
export async function threadsTokenInfo(req) {
  const status = (await settingStatus(req)).find((s) => s.name === 'THREADS_TOKEN') || {}
  const cfg = await cfgFor(req)
  let exp = null
  if (cfg) {
    try {
      const [raw] = await pipeline(cfg, [['HGET', TOKENS, 'threads']])
      if (raw) exp = JSON.parse(raw)
    } catch (_) {}
  }
  return {
    from: status.from || null,
    canRefresh: status.from === 'saved',
    expiresAt: exp && exp.exp ? new Date(exp.exp).toISOString() : null,
    estimated: !!(exp && exp.estimated),
    daysLeft: exp && exp.exp ? Math.floor((exp.exp - Date.now()) / 86400000) : null,
  }
}

/** Called by the settings endpoint when a token is pasted in or cleared, so
 *  the daily job has an expiry to go by. Long-lived Threads tokens last 60
 *  days from issue; the paste is usually the same day, so this is an estimate
 *  and is labelled as one. */
export async function noteTokenSaved(name, cleared, req) {
  if (name !== 'THREADS_TOKEN') return
  const cfg = await cfgFor(req)
  if (!cfg) return
  try {
    await pipeline(cfg, [cleared
      ? ['HDEL', TOKENS, 'threads']
      : ['HSET', TOKENS, 'threads', JSON.stringify({ exp: Date.now() + 60 * 86400000, at: Date.now(), estimated: true })]])
  } catch (_) {}
}

/** Extend the Threads token by another 60 days and save the new one where the
 *  old one was. Only a token saved from the settings screen can be replaced
 *  from here: one in Vercel's environment can only be changed in Vercel, and
 *  pretending otherwise would leave the old one in force. */
export async function refreshThreadsToken(req) {
  const info = await threadsTokenInfo(req)
  if (!info.from) return { ok: false, message: 'Threads のトークンが未設定です。' }
  if (info.from === 'env') {
    return { ok: false, message: 'このトークンは Vercel の環境変数に入っているため、ここからは延長できません。延長した新しいトークンを Vercel の THREADS_TOKEN に入れ直して再デプロイするか、設定状況 › キーの入力に貼ってください（貼ると以後はここから延長できます）。' }
  }
  if (info.from === 'device') {
    return { ok: false, message: 'このトークンはこの端末のブラウザにだけ保存されているため、自動の延長ができません。保存先（Upstash Redis）を接続してから貼り直してください。' }
  }
  const token = await setting('THREADS_TOKEN', '', req)
  const r = await call(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`,
    {}, 'Threads（トークンの延長）', { deadline: Date.now() + 9000 })
  if (!r.ok) {
    return { ok: false, message: diagnose(r) === 'expired'
      ? 'トークンはすでに期限が切れているため延長できません。Meta for Developers で発行し直して貼り直してください。'
      : `延長できませんでした。発行から24時間たっていないトークンは延長できません。（${r.message}）` }
  }
  const fresh = String(r.data.access_token || '')
  if (!fresh) return { ok: false, message: 'Threads から新しいトークンが返ってきませんでした。' }
  const saved = await saveSetting('THREADS_TOKEN', fresh, req)
  if (!saved.ok) return { ok: false, message: '新しいトークンを保存できませんでした。今のトークンはそのまま使えます。' }
  const exp = Date.now() + (Number(r.data.expires_in) || 60 * 86400) * 1000
  const cfg = await cfgFor(req)
  if (cfg) {
    try { await pipeline(cfg, [['HSET', TOKENS, 'threads', JSON.stringify({ exp, at: Date.now(), estimated: false })]]) } catch (_) {}
  }
  return { ok: true, expiresAt: new Date(exp).toISOString(), message: `延長しました。次の期限は ${new Date(exp + 9 * 3600000).toISOString().slice(0, 10)} ごろです。` }
}

/* -------------------------------------------------------------- metrics -- */

const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))

async function metricsFor(r, req, ctx) {
  if (r.net === 'x') {
    const m = await xCall('GET', `${X_API}/tweets/${encodeURIComponent(r.id)}?tweet.fields=public_metrics`, await xKeys(req), undefined, 'X', ctx)
    if (!m.ok) return { ok: false, message: m.message }
    const pm = (m.data.data && m.data.data.public_metrics) || {}
    return { ok: true, likes: num(pm.like_count), comments: num(pm.reply_count), shares: num((pm.retweet_count || 0) + (pm.quote_count || 0)), impressions: num(pm.impression_count) }
  }
  if (r.net === 'facebook') {
    const token = await setting('FB_PAGE_TOKEN', '', req)
    const m = await call(`${GRAPH}/${encodeURIComponent(r.id)}?fields=reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares&access_token=${encodeURIComponent(token)}`, {}, 'Facebook', ctx)
    if (!m.ok) return { ok: false, message: m.message }
    const d = m.data
    return { ok: true, likes: num(d.reactions && d.reactions.summary && d.reactions.summary.total_count), comments: num(d.comments && d.comments.summary && d.comments.summary.total_count), shares: num(d.shares && d.shares.count) || 0 }
  }
  if (r.net === 'instagram') {
    const token = await igToken(req)
    const [m, ins] = await Promise.all([
      call(`${GRAPH}/${encodeURIComponent(r.id)}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`, {}, 'Instagram', ctx),
      call(`${GRAPH}/${encodeURIComponent(r.id)}/insights?metric=reach,views&access_token=${encodeURIComponent(token)}`, {}, 'Instagram', ctx),
    ])
    if (!m.ok) return { ok: false, message: m.message }
    const val = (name) => {
      const row = ins.ok && (ins.data.data || []).find((x) => x.name === name)
      return row ? num((row.values && row.values[0] && row.values[0].value) ?? (row.total_value && row.total_value.value)) : null
    }
    return { ok: true, likes: num(m.data.like_count), comments: num(m.data.comments_count), reach: val('reach'), impressions: val('views') }
  }
  if (r.net === 'threads') {
    const token = await setting('THREADS_TOKEN', '', req)
    const m = await call(`${THREADS}/${encodeURIComponent(r.id)}/insights?metric=views,likes,replies,reposts,quotes&access_token=${encodeURIComponent(token)}`, {}, 'Threads', ctx)
    if (!m.ok) return { ok: false, message: m.message }
    const val = (name) => {
      const row = (m.data.data || []).find((x) => x.name === name)
      return row ? num((row.values && row.values[0] && row.values[0].value) ?? (row.total_value && row.total_value.value)) : null
    }
    return { ok: true, likes: val('likes'), comments: val('replies'), shares: (val('reposts') || 0) + (val('quotes') || 0), impressions: val('views') }
  }
  if (r.net === 'line') {
    if (!r.id) return { ok: false, message: 'LINE：送信の番号が記録されていないため、集計を取れません。' }
    const token = await setting('LINE_CHANNEL_TOKEN', '', req)
    const m = await call(`${LINE_API}/v2/bot/insight/message/event?requestId=${encodeURIComponent(r.id)}`, { headers: { Authorization: `Bearer ${token}` } }, 'LINE', ctx)
    if (!m.ok) return { ok: false, message: m.message }
    const o = m.data.overview || {}
    if (o.delivered == null) return { ok: false, message: 'LINE：まだ集計されていません（送信の翌日以降に出ます。20人未満のときは出ません）。' }
    return { ok: true, reach: num(o.delivered), impressions: num(o.uniqueImpression), clicks: num(o.uniqueClick) }
  }
  if (r.net === 'bluesky') return blueskyMetrics(r.id, ctx)
  if (r.net === 'gbp') return { ok: false, message: 'Googleビジネスプロフィールの投稿ごとの反応は、APIでは取れなくなりました（ビジネスプロフィールの「パフォーマンス」でご確認ください）。' }
  return { ok: false, message: 'LinkedIn の反応は、この画面からは取得できません（LinkedIn の画面でご確認ください）。' }
}


/* ---- 毎朝の自動取得 ----
   投稿の1日後と7日後に、反応を1回ずつ取りに行きます（押さなくても履歴と
   「いつ出すと良いか」が埋まるように）。1回の実行で取るのは AUTO_MAX 件まで。
   X は読み取りごとに料金がかかるので、設定で許したときだけです。
   LinkedIn と Googleビジネスプロフィールは取れないので外します。 */
export const AUTO_MAX = 8
export const AUTO_STAGES = [
  { stage: 'd1', after: 20 * 3600000, until: 3 * 86400000 },
  { stage: 'd7', after: 6.5 * 86400000, until: 10 * 86400000 },
]
const NO_METRICS = ['linkedin', 'gbp']

/** いま取りに行くべきもの [{ entryId, net, id, stage }]。すでにその段階より後に
 *  取った数字があるもの（手で取った場合も含む）は外します。 */
export function dueForRefresh(posts, now, opts = {}) {
  const out = []
  for (const p of posts || []) {
    if (!p || !p.at) continue
    const t = Date.parse(p.at)
    const age = now - t
    const st = AUTO_STAGES.find((s) => age >= s.after && age < s.until)
    if (!st) continue
    for (const r of p.results || []) {
      if (!r.ok || !r.id || NO_METRICS.includes(r.net)) continue
      if (r.net === 'x' && !opts.allowX) continue
      if (opts.ready && !opts.ready.includes(r.net)) continue
      const m = r.metrics
      if (m && m.at && Date.parse(m.at) >= t + st.after) continue
      out.push({ entryId: p.id || p.at, net: r.net, id: r.id, stage: st.stage })
      if (out.length >= (opts.max || AUTO_MAX)) return out
    }
  }
  return out
}

/** 毎朝の自動処理から呼びます。req は無し（保存先と環境変数の鍵だけを使います）。 */
export async function refreshDue(opts = {}) {
  const cfg = await cfgFor()
  if (!cfg) return { ok: false, fetched: 0, message: '保存先がありません。' }
  const nets = (await socialStatus()).filter((n) => n.scheduled).map((n) => n.id)
  const due = dueForRefresh(await recentPosts(60), Date.now(), { allowX: !!opts.allowX, ready: nets, max: opts.max })
  if (!due.length) return { ok: true, fetched: 0, failed: 0 }
  const ctx = { deadline: Date.now() + Math.max(3000, opts.budget || 8000) }
  const at = new Date().toISOString()
  const got = await Promise.all(due.map(async (d) => {
    try { return [d, { ...(await metricsFor({ net: d.net, id: d.id }, undefined, ctx)), at, stage: d.stage }] }
    catch (e) { return [d, { ok: false }] }
  }))
  const save = got.filter(([, m]) => m.ok).map(([d, m]) => ['HSET', METRICS, `${d.entryId}|${d.net}`, JSON.stringify(m)])
  if (save.length) { try { await pipeline(cfg, save) } catch (_) {} }
  return { ok: true, fetched: save.length, failed: got.length - save.length }
}

/** Likes, comments and reach for one history entry, fetched only when asked
 *  (X charges per read) and kept with the entry so the next look is free. */
export async function fetchMetrics(entryId, req) {
  const cfg = await cfgFor(req)
  if (!cfg) return { ok: false, message: '保存先（Upstash Redis）が未接続のため、反応を記録できません。' }
  const list = await recentPosts(200, req)
  const entry = list.find((p) => (p.id || p.at) === entryId)
  if (!entry) return { ok: false, message: 'その投稿の記録が見つかりませんでした。' }
  const ctx = { deadline: Date.now() + 15000 }
  const targets = (entry.results || []).filter((r) => r.ok && r.id)
  if (!targets.length) return { ok: false, message: '反応を取れる投稿がありません（投稿に成功し、番号が記録されたものだけ取れます）。' }
  const at = new Date().toISOString()
  const nets = await socialStatus(req)
  const got = await Promise.all(targets.map(async (r) => {
    if (!nets.some((n) => n.id === r.net && n.ready)) return [r.net, { ok: false, message: '鍵が未設定です。' }]
    try { return [r.net, { ...(await metricsFor(r, req, ctx)), at }] } catch (e) { return [r.net, { ok: false, message: String(e && e.message).slice(0, 160) }] }
  }))
  const save = got.filter(([, m]) => m.ok).map(([net, m]) => ['HSET', METRICS, `${entryId}|${net}`, JSON.stringify(m)])
  if (save.length) { try { await pipeline(cfg, save) } catch (_) {} }
  return { ok: true, metrics: Object.fromEntries(got) }
}
