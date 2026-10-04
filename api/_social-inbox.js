// コメントの受信箱（Instagram・Facebook ページ）。
//
// 最近の投稿（各5件）についたコメントを読み、管理画面から返信・非表示に
// できます。読むのは「読み込む」を押したときだけ（自動では取りに行きません）。
//
// 要る権限（Meta for Developers で鍵を作るときに付けます）:
//   Instagram  instagram_basic・instagram_manage_comments（読む・返信・非表示）
//              ＋ Facebook ログイン経由の鍵なら pages_show_list・pages_read_engagement
//   Facebook   pages_read_engagement・pages_read_user_content（コメントと書いた人を読む）
//              pages_manage_engagement（返信・非表示）
// 足りないときは、Meta の返事（どの権限が要るか）をそのまま画面に出します。
//
// X のメンション（返信）は扱いません。X は読み取り1回ごとに料金がかかる
// ためです（画面にもそう書きます）。
//
//   GET  /{ig-user-id}/media?fields=…comments_count        最近の投稿
//   GET  /{ig-media-id}/comments?fields=…replies{username}   コメントと、自分の返信の有無
//   POST /{ig-comment-id}/replies  message=                 返信
//   POST /{ig-comment-id}          hide=true|false          非表示
//   GET  /{page-id}/posts?fields=…                          ページの最近の投稿
//   GET  /{post-id}/comments?filter=toplevel&fields=…comments{from}
//   POST /{comment-id}/comments    message=                 返信
//   POST /{comment-id}             is_hidden=true|false     非表示
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { setting } from './_settings.js'
import { call, igToken, GRAPH_VERSION, missingFor, NETWORKS } from './_social.js'

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`
export const INBOX_POSTS = 5
export const INBOX_NETS = ['instagram', 'facebook']
export const INBOX_NOTE = {
  instagram: 'Instagram のコメントを読む・返信する・非表示にするには、鍵に instagram_manage_comments の権限が要ります（instagram_basic も）。',
  facebook: 'Facebook ページのコメントを読むには pages_read_engagement と pages_read_user_content、返信・非表示には pages_manage_engagement の権限が要ります。',
  x: 'X のメンション（返信）はここでは扱いません。X は読み取り1回ごとに料金がかかるためです。X の画面で確認してください。',
}
const ID = /^[0-9_]{1,64}$/

const q = (o) => new URLSearchParams(o).toString()

async function readInstagram(req, ctx) {
  const user = await setting('IG_USER_ID', '', req)
  const token = await igToken(req)
  const me = await call(`${GRAPH}/${encodeURIComponent(user)}?${q({ fields: 'username', access_token: token })}`, {}, 'Instagram', ctx)
  const own = me.ok ? String(me.data.username || '') : ''
  const media = await call(`${GRAPH}/${encodeURIComponent(user)}/media?${q({ fields: 'id,caption,permalink,timestamp,comments_count', limit: String(INBOX_POSTS), access_token: token })}`, {}, 'Instagram', ctx)
  if (!media.ok) return { ok: false, message: media.message }
  const posts = await Promise.all((media.data.data || []).map(async (m) => {
    const post = { id: String(m.id), text: String(m.caption || '').slice(0, 120), url: m.permalink || '', at: m.timestamp || '', count: Number(m.comments_count) || 0, comments: [] }
    if (!post.count) return post
    const c = await call(`${GRAPH}/${encodeURIComponent(m.id)}/comments?${q({ fields: 'id,text,username,timestamp,hidden,like_count,replies{username}', limit: '20', access_token: token })}`, {}, 'Instagram', ctx)
    if (!c.ok) { post.error = c.message; return post }
    post.comments = (c.data.data || []).map((x) => {
      const replies = (x.replies && x.replies.data) || []
      return {
        id: String(x.id), text: String(x.text || ''), from: x.username ? '@' + x.username : '', at: x.timestamp || '',
        hidden: !!x.hidden, canHide: true, replies: replies.length,
        answered: !!own && replies.some((r) => r.username === own), mine: !!own && x.username === own,
      }
    }).filter((x) => !x.mine)
    return post
  }))
  return { ok: true, posts }
}

async function readFacebook(req, ctx) {
  const page = await setting('FB_PAGE_ID', '', req)
  const token = await setting('FB_PAGE_TOKEN', '', req)
  const list = await call(`${GRAPH}/${encodeURIComponent(page)}/posts?${q({ fields: 'id,message,permalink_url,created_time', limit: String(INBOX_POSTS), access_token: token })}`, {}, 'Facebook', ctx)
  if (!list.ok) return { ok: false, message: list.message }
  const posts = await Promise.all((list.data.data || []).map(async (m) => {
    const post = { id: String(m.id), text: String(m.message || '').slice(0, 120), url: m.permalink_url || '', at: m.created_time || '', comments: [] }
    const c = await call(`${GRAPH}/${encodeURIComponent(m.id)}/comments?${q({ fields: 'id,message,from,created_time,is_hidden,can_hide,comments.limit(10){from}', filter: 'toplevel', order: 'reverse_chronological', limit: '20', access_token: token })}`, {}, 'Facebook', ctx)
    if (!c.ok) { post.error = c.message; return post }
    post.comments = (c.data.data || []).map((x) => {
      const replies = (x.comments && x.comments.data) || []
      return {
        id: String(x.id), text: String(x.message || ''), from: (x.from && x.from.name) || '', at: x.created_time || '',
        hidden: !!x.is_hidden, canHide: x.can_hide !== false, replies: replies.length,
        answered: replies.some((r) => r.from && String(r.from.id) === String(page)), mine: !!(x.from && String(x.from.id) === String(page)),
      }
    }).filter((x) => !x.mine)
    post.count = post.comments.length
    return post
  }))
  return { ok: true, posts }
}

/** 受信箱をまとめて読みます。つないでいないSNSは、その旨だけ返します。 */
export async function readInbox(req, budget = 20000) {
  const ctx = { deadline: Date.now() + budget }
  const out = { ok: true, at: new Date().toISOString(), nets: {}, unanswered: 0, notes: INBOX_NOTE }
  await Promise.all(INBOX_NETS.map(async (id) => {
    const net = NETWORKS.find((n) => n.id === id)
    const missing = await missingFor(net, req)
    if (missing.length) { out.nets[id] = { ok: false, connected: false, message: `${net.label} はまだつないでいません。` }; return }
    let r
    try { r = id === 'instagram' ? await readInstagram(req, ctx) : await readFacebook(req, ctx) }
    catch (e) { r = { ok: false, message: String((e && e.message) || e).slice(0, 200) } }
    if (r.ok) r.unanswered = r.posts.reduce((a, p) => a + p.comments.filter((c) => !c.answered && !c.hidden).length, 0)
    if (!r.ok) r.message = `${r.message}（${INBOX_NOTE[id]}）`
    out.nets[id] = { connected: true, ...r }
    if (r.ok) out.unanswered += r.unanswered
  }))
  return out
}

/** 返信。 */
export async function replyComment(net, id, message, req) {
  const text = String(message || '').trim().slice(0, 2000)
  if (!INBOX_NETS.includes(net) || !ID.test(String(id || ''))) return { ok: false, message: '不正な指定です。' }
  if (!text) return { ok: false, message: '返信の文を書いてください。' }
  const ctx = { deadline: Date.now() + 12000 }
  const token = net === 'instagram' ? await igToken(req) : await setting('FB_PAGE_TOKEN', '', req)
  const url = net === 'instagram' ? `${GRAPH}/${id}/replies` : `${GRAPH}/${id}/comments`
  const r = await call(url, { method: 'POST', body: new URLSearchParams({ message: text, access_token: token }) }, net === 'instagram' ? 'Instagram' : 'Facebook', ctx, { publish: true })
  if (!r.ok) return { ok: false, unknown: !!r.unknown, message: r.unknown ? r.message : `${r.message}（${INBOX_NOTE[net]}）` }
  return { ok: true, id: String(r.data.id || ''), message: '返信しました。' }
}

/** 非表示・再表示。消すのではなく、書いた本人とその友だち以外から見えなくします。 */
export async function hideComment(net, id, hide, req) {
  if (!INBOX_NETS.includes(net) || !ID.test(String(id || ''))) return { ok: false, message: '不正な指定です。' }
  const ctx = { deadline: Date.now() + 12000 }
  const token = net === 'instagram' ? await igToken(req) : await setting('FB_PAGE_TOKEN', '', req)
  const body = new URLSearchParams({ access_token: token })
  body.set(net === 'instagram' ? 'hide' : 'is_hidden', hide ? 'true' : 'false')
  const r = await call(`${GRAPH}/${id}`, { method: 'POST', body }, net === 'instagram' ? 'Instagram' : 'Facebook', ctx)
  if (!r.ok) return { ok: false, message: `${r.message}（${INBOX_NOTE[net]}）` }
  return { ok: true, message: hide ? '非表示にしました（書いた人と、その友だちには見えています）。' : '表示に戻しました。' }
}
