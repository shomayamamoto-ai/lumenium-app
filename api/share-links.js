export const config = { runtime: 'edge' }

// Issue, list and withdraw the member-list share links.
//
// Admin key only, and by the header only — this endpoint hands out
// credentials, so it must not be reachable by one of the links it hands out.
// requireAdmin is called without `share`, so a share token gets nowhere here,
// and without `allowQueryKey`, so the key has to travel in a header.
//
//   GET                              -> { ready, links }
//   POST {action:'create', label, days} -> { url }  (shown once)
//   POST {action:'revoke', id}       -> { ok }
//   POST {action:'open'}             -> { view, xlsx }  15-minute links
//
// The issued URL is returned once and is not recoverable: only the digest of
// the token is stored, so a copy of the database is not a set of working
// links. Losing one costs a click to reissue.

import { requireAdmin, json } from './_admin-auth.js'
import { createShare, listShares, revokeShare, shareReady, MAX_LINKS } from './_share.js'

const NOT_READY = {
  ok: false,
  code: 'STORE_NOT_CONFIGURED',
  ready: false,
  message:
    '共有リンクの発行には保存先が必要です。Vercel の Storage から Upstash Redis を接続すると、失効できる共有リンクを発行できます。接続するまでは管理キー付きのURLが使われます。',
}

const DAY_CHOICES = [7, 30, 90, 365, 0]   // 0 = 無期限

function origin(req) {
  // Behind Vercel the request URL is already the public one; the header is a
  // fallback for proxies that rewrite it.
  const here = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') || here.host
  const proto = req.headers.get('x-forwarded-proto') || here.protocol.replace(':', '')
  return `${proto}://${host}`
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  if (!shareReady()) return json(NOT_READY, 503)
  try {
    const links = await listShares()
    return json({ ok: true, ready: true, max: MAX_LINKS, links })
  } catch (_) {
    return json({ ok: false, ready: true, message: '共有リンクの読み取りに失敗しました。' }, 502)
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  if (!shareReady()) return json(NOT_READY, 503)

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }
  const action = body && body.action
  const base = origin(req)
  const urls = (token) => ({
    view: `${base}/api/members-view?s=${token}`,
    xlsx: `${base}/api/members-xlsx?s=${token}`,
  })

  try {
    if (action === 'open') {
      // The 開く buttons in the admin page. A link that dies in fifteen minutes
      // so that opening the list does not leave the admin key in the address
      // bar, in the history, and in whatever the browser syncs.
      const made = await createShare({ label: '自分で開いた', days: 0, temp: true })
      if (!made) return json(NOT_READY, 503)
      return json({ ok: true, ...urls(made.token), minutes: 15 })
    }

    if (action === 'create') {
      const existing = (await listShares()) || []
      if (existing.length >= MAX_LINKS) {
        return json({
          ok: false,
          message: `共有リンクは同時に${MAX_LINKS}本までです。使っていないものを失効させてから発行してください。`,
        }, 409)
      }
      const days = DAY_CHOICES.includes(Number(body.days)) ? Number(body.days) : 30
      const made = await createShare({ label: body.label, days })
      if (!made) return json(NOT_READY, 503)
      return json({ ok: true, link: made.link, ...urls(made.token) })
    }

    if (action === 'revoke') {
      const gone = await revokeShare(String(body.id || ''))
      return json({
        ok: true,
        removed: gone,
        message: gone ? 'このリンクは今すぐ使えなくなりました。' : 'そのリンクは既にありません。',
      })
    }
  } catch (_) {
    return json({ ok: false, message: '共有リンクの操作に失敗しました。時間をおいて再度お試しください。' }, 502)
  }

  return json({ ok: false, message: '不明な操作です。' }, 400)
}
