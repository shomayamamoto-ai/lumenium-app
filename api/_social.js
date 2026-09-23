// Posting to the five networks, and keeping a record of what went out.
//
// Every one of these is the platform's own documented publishing endpoint,
// called with a token the owner pasted into the admin screen. There is no
// OAuth dance here: each platform wants an app registration, a redirect URL
// and — for Meta and LinkedIn — a review before it will hand out the scopes,
// so the honest thing is a field for the token you already had to go and get.
//
// Nothing here invents a success. Whatever the platform answers is passed
// back: a wrong scope, an expired token or a rejected caption shows up as the
// platform's own words rather than as "投稿できませんでした".
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { setting } from './_settings.js'
import { storeConfig, pipeline, jstDate } from './_analytics-store.js'

const GRAPH = 'https://graph.facebook.com/v21.0'
const THREADS = 'https://graph.threads.net/v1.0'

/* 各SNSの決まりごとと、使えるようにするまでの道順。
   `setup` は管理画面にそのまま出ます。画面に X_ACCESS_TOKEN とだけ
   書いてあっても、どこで取るのか分からなければ一歩も進めません。
   取りに行く先と、取るのにかかる手間まで書いておきます。 */
export const NETWORKS = [
  {
    id: 'x', label: 'X', mark: '𝕏', limit: 280, needs: ['X_ACCESS_TOKEN'],
    image: 'ignored',
    note: '画像はAPIの別枠（メディアアップロード）が要るため、本文とリンクのみ送ります。',
    setup: {
      what: 'Xに投稿するための鍵が1つ要ります。',
      where: 'X の開発者ポータル（developer.x.com）でアプリを作り、Read and write 権限にしたうえで Access Token を発行します。',
      url: 'https://developer.x.com/en/portal/dashboard',
      effort: '無料枠で可。30分ほど',
    },
  },
  {
    id: 'facebook', label: 'Facebook', mark: 'f', limit: 5000, needs: ['FB_PAGE_ID', 'FB_PAGE_TOKEN'],
    image: 'optional',
    note: 'ページへの投稿です。個人のタイムラインへはAPIから投稿できません。',
    setup: {
      what: 'Facebookページの番号と、そのページ用の鍵が要ります。',
      where: 'Meta for Developers でアプリを作り、グラフAPIエクスプローラから pages_manage_posts 権限のページアクセストークンを取ります。ページ番号は同じ画面で確認できます。',
      url: 'https://developers.facebook.com/tools/explorer/',
      effort: '個人のタイムラインには投稿できません。ページが要ります',
    },
  },
  {
    id: 'instagram', label: 'Instagram', mark: '◎', limit: 2200, needs: ['IG_USER_ID', 'IG_TOKEN'],
    image: 'required',
    note: '画像URLが必須です（公開URLのみ）。プロアカウントとFacebookページの連携が要ります。',
    setup: {
      what: 'Instagramの利用者番号と鍵が要ります。',
      where: 'Instagramをプロアカウントにし、Facebookページと連携してから、Facebookと同じ Meta for Developers で取ります。',
      url: 'https://developers.facebook.com/tools/explorer/',
      effort: 'Facebookの設定が先に要ります。画像が無いと投稿できません',
    },
  },
  {
    id: 'threads', label: 'Threads', mark: '@', limit: 500, needs: ['THREADS_USER_ID', 'THREADS_TOKEN'],
    image: 'optional',
    note: '作成と公開の2段階で送ります。',
    setup: {
      what: 'Threadsの利用者番号と鍵が要ります。',
      where: 'Meta for Developers で Threads API のアプリを作り、threads_basic と threads_content_publish の権限でトークンを取ります。',
      url: 'https://developers.facebook.com/docs/threads',
      effort: '5つの中では比較的かんたんです',
    },
  },
  {
    id: 'linkedin', label: 'LinkedIn', mark: 'in', limit: 3000, needs: ['LI_AUTHOR_URN', 'LI_TOKEN'],
    image: 'ignored',
    note: '画像はアセット登録が別途必要なため、本文とリンクのみ送ります。',
    setup: {
      what: '投稿者を表す文字列（urn:li:person:… など）と鍵が要ります。',
      where: 'LinkedIn Developers でアプリを作り、Share on LinkedIn の製品を追加してアクセストークンを取ります。',
      url: 'https://www.linkedin.com/developers/apps',
      effort: 'アプリの審査が要る場合があります',
    },
  },
]

const LOG = 'lum:social:log'

async function creds(names, req) {
  const out = {}
  for (const n of names) out[n] = await setting(n, '', req)
  return out
}

/** What this network still needs. One answer for both the list and the send:
 *  they used to disagree about Instagram's fallback to the Facebook page
 *  token, so the row said 利用可 and pressing 投稿 said IG_TOKEN が未設定. */
async function missingFor(net, req) {
  const got = await creds(net.needs, req)
  const missing = net.needs.filter((k) => !got[k])
  if (net.id === 'instagram' && missing.includes('IG_TOKEN') && (await setting('FB_PAGE_TOKEN', '', req))) {
    return missing.filter((k) => k !== 'IG_TOKEN')
  }
  return missing
}

/** Which networks can actually be posted to right now, and what is missing. */
export async function socialStatus(req) {
  const rows = []
  for (const n of NETWORKS) {
    const missing = await missingFor(n, req)
    rows.push({
      id: n.id, label: n.label, mark: n.mark, limit: n.limit,
      image: n.image, note: n.note, needs: n.needs, setup: n.setup,
      ready: !missing.length,
      missing,
    })
  }
  return rows
}

/** The platform's answer, or the transport error, never a guess. */
async function call(url, init, label) {
  let res, text
  try {
    res = await fetch(url, init)
    text = await res.text()
  } catch (e) {
    return { ok: false, message: `${label} に接続できませんでした：${String((e && e.message) || e).slice(0, 160)}` }
  }
  let data = null
  try { data = JSON.parse(text) } catch (_) {}
  if (!res.ok) {
    const why =
      (data && data.error && (data.error.message || data.error.error_user_msg)) ||
      (data && (data.detail || data.message || data.title)) ||
      text.slice(0, 200) || `HTTP ${res.status}`
    return { ok: false, status: res.status, message: `${label}：${why}` }
  }
  return { ok: true, data: data || {}, res }
}

async function postX(body, req) {
  const token = await setting('X_ACCESS_TOKEN', '', req)
  const text = [body.text, body.link].filter(Boolean).join('\n')
  const r = await call('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }, 'X')
  if (!r.ok) return r
  const id = r.data && r.data.data && r.data.data.id
  return { ok: true, id, url: id ? `https://x.com/i/web/status/${id}` : '' }
}

async function postFacebook(body, req) {
  const page = await setting('FB_PAGE_ID', '', req)
  const token = await setting('FB_PAGE_TOKEN', '', req)
  const form = new URLSearchParams()
  const path = body.imageUrl ? 'photos' : 'feed'
  if (body.imageUrl) {
    form.set('url', body.imageUrl)
    form.set('caption', [body.text, body.link].filter(Boolean).join('\n'))
  } else {
    form.set('message', body.text)
    if (body.link) form.set('link', body.link)
  }
  form.set('access_token', token)
  const r = await call(`${GRAPH}/${encodeURIComponent(page)}/${path}`, { method: 'POST', body: form }, 'Facebook')
  if (!r.ok) return r
  const id = r.data.post_id || r.data.id
  return { ok: true, id, url: id ? `https://www.facebook.com/${id}` : '' }
}

/** Meta's two-step publish: build a container, then publish it. Both halves
 *  can fail on their own, and the second failing after the first succeeded is
 *  exactly the case that needs saying out loud. */
async function postInstagram(body, req) {
  const user = await setting('IG_USER_ID', '', req)
  const token = (await setting('IG_TOKEN', '', req)) || (await setting('FB_PAGE_TOKEN', '', req))
  if (!token) return { ok: false, message: 'Instagram：アクセストークンが未設定です（Facebookページのトークンでも構いません）。' }
  if (!body.imageUrl) return { ok: false, message: 'Instagram：画像URLが必要です。' }
  const make = new URLSearchParams({
    image_url: body.imageUrl,
    caption: [body.text, body.link].filter(Boolean).join('\n'),
    access_token: token,
  })
  const c = await call(`${GRAPH}/${encodeURIComponent(user)}/media`, { method: 'POST', body: make }, 'Instagram（下書き作成）')
  if (!c.ok) return c
  const pub = new URLSearchParams({ creation_id: String(c.data.id || ''), access_token: token })
  const p = await call(`${GRAPH}/${encodeURIComponent(user)}/media_publish`, { method: 'POST', body: pub }, 'Instagram（公開）')
  if (!p.ok) return p
  const id = p.data.id
  let url = ''
  const link = await call(`${GRAPH}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`, {}, 'Instagram')
  if (link.ok) url = link.data.permalink || ''
  return { ok: true, id, url }
}

async function postThreads(body, req) {
  const user = await setting('THREADS_USER_ID', '', req)
  const token = await setting('THREADS_TOKEN', '', req)
  const make = new URLSearchParams({
    media_type: body.imageUrl ? 'IMAGE' : 'TEXT',
    text: [body.text, body.link].filter(Boolean).join('\n'),
    access_token: token,
  })
  if (body.imageUrl) make.set('image_url', body.imageUrl)
  const c = await call(`${THREADS}/${encodeURIComponent(user)}/threads`, { method: 'POST', body: make }, 'Threads（下書き作成）')
  if (!c.ok) return c
  const pub = new URLSearchParams({ creation_id: String(c.data.id || ''), access_token: token })
  const p = await call(`${THREADS}/${encodeURIComponent(user)}/threads_publish`, { method: 'POST', body: pub }, 'Threads（公開）')
  if (!p.ok) return p
  const id = p.data.id
  let url = ''
  const link = await call(`${THREADS}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`, {}, 'Threads')
  if (link.ok) url = link.data.permalink || ''
  return { ok: true, id, url }
}

async function postLinkedIn(body, req) {
  const author = await setting('LI_AUTHOR_URN', '', req)
  const token = await setting('LI_TOKEN', '', req)
  const text = [body.text, body.link].filter(Boolean).join('\n')
  const r = await call('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  }, 'LinkedIn')
  if (!r.ok) return r
  const id = (r.res && r.res.headers.get('x-restli-id')) || r.data.id || ''
  return { ok: true, id, url: id ? `https://www.linkedin.com/feed/update/${id}` : '' }
}

const SENDERS = {
  x: postX, facebook: postFacebook, instagram: postInstagram,
  threads: postThreads, linkedin: postLinkedIn,
}

export async function postTo(id, body, req) {
  const net = NETWORKS.find((n) => n.id === id)
  if (!net) return { ok: false, message: '不明な投稿先です。' }
  const missing = await missingFor(net, req)
  if (missing.length) {
    return { ok: false, message: `${net.label}：${missing.join('・')} が未設定です。` }
  }
  const text = String(body.text || '')
  if (!text.trim() && !body.imageUrl) return { ok: false, message: `${net.label}：本文が空です。` }
  // Count what the platform is handed, not what was typed: the link is
  // appended to the body everywhere, and 280 characters plus a URL is a
  // rejection from X, not a 280-character post.
  const sent = [text, body.link].filter(Boolean).join('\n')
  if (sent.length > net.limit) {
    return { ok: false, message: `${net.label}：本文が ${net.limit} 文字を超えています（リンクを含めて ${sent.length}）。` }
  }
  return SENDERS[id]({ text, imageUrl: body.imageUrl || '', link: body.link || '' }, req)
}

/** The record the SEO/AIO side reads. Posting works without a store; only the
 *  history and the "how much did we put out" figure need one. */
export async function logPosts(entry) {
  const cfg = storeConfig()
  if (!cfg) return false
  try {
    await pipeline(cfg, [
      ['LPUSH', LOG, JSON.stringify(entry)],
      ['LTRIM', LOG, 0, 199],
    ])
    return true
  } catch (_) { return false }
}

export async function recentPosts(limit = 30) {
  const cfg = storeConfig()
  if (!cfg) return []
  try {
    const [raw] = await pipeline(cfg, [['LRANGE', LOG, 0, Math.max(0, limit - 1)]])
    return (Array.isArray(raw) ? raw : [])
      .map((s) => { try { return JSON.parse(s) } catch (_) { return null } })
      .filter(Boolean)
  } catch (_) { return [] }
}

/** Posts per network over the last N days, for the AIO report and the
 *  advisor: an answer engine that never mentions you, and a month with two
 *  posts in it, are the same sentence. */
export async function socialActivity(days = 30) {
  const posts = await recentPosts(200)
  const from = new Date(Date.now() - days * 86400000).toISOString()
  const recent = posts.filter((p) => p && p.at && p.at >= from)
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
    posts: recent.length,
    sent,
    failed,
    byNet,
    last7: recent.filter((p) => p.at >= days7).length,
    lastAt: recent.length ? recent[0].at : (posts[0] && posts[0].at) || null,
    date: jstDate(),
  }
}
