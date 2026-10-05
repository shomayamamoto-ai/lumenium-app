// SNS投稿用の画像を Vercel Blob に置き、公開URLを返します（管理者のみ）。
//
// なぜ置き場所が要るのか。Instagram・Threads・LINE は「画像そのもの」では
// なく「画像のURL」を受け取り、各社のサーバーが取りに来ます。お客様の多くは
// 公開URLのある画像を持っていないので、ここで置き場所を作ります。
// X は逆に画像そのものを受け取るので、サーバーが画像を取りに行きます。
// そのとき取りに行くのはここで置いた画像（Blob のURL）だけです——任意の
// URL を取りに行くと、社内のアドレスを叩かされる穴（SSRF）になります。
//
// Node の関数にしているのは @vercel/blob が Node 用の部品を使うためです。
// 受け取れる大きさは Vercel の関数の上限（約4.5MB）で決まります。それより
// 大きい画像は、画面側で JPEG に縮めてから送ります。
//
//   POST（本文は画像そのもの。Content-Type: image/jpeg|png|webp）
//     ?kind=preview … LINE の小さい見本画像（1MBまで）
//   -> { ok, url, size, type }

import { requireAdmin, json } from './_admin-auth.js'
import { setting } from './_settings.js'
import { jstDate } from './_analytics-store.js'

// Vercel の関数が受け取れる本文の上限は 4.5MB。少し余裕を持たせます。
export const MAX_BYTES = Math.floor(4.4 * 1024 * 1024)
export const MAX_PREVIEW = 1024 * 1024
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** 中身が本当にその形式か（拡張子や Content-Type は名乗りでしかないため）。 */
export function sniff(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return ''
}

export const NO_BLOB = {
  ok: false, code: 'NO_BLOB',
  message: '画像の置き場所（Vercel Blob）が未接続です。Vercel のプロジェクト › Storage › Create › Blob で作成してこのプロジェクトに接続すると、BLOB_READ_WRITE_TOKEN が自動で入ります（再デプロイが必要です）。それまでは、公開されている画像のURLを貼ってください。',
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const token = await setting('BLOB_READ_WRITE_TOKEN', '', req)
  if (!token) return json(NO_BLOB, 503)

  const kind = new URL(req.url).searchParams.get('kind')
  const preview = kind === 'preview'
  // お知らせの画像（admin-news.js）も同じ置き場所に、別のフォルダで置きます。
  const dir = kind === 'news' ? 'news' : kind === 'quote' ? 'quote' : 'social'
  const limit = preview ? MAX_PREVIEW : MAX_BYTES
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > limit) {
    return json({ ok: false, message: `画像が大きすぎます（${(declared / 1048576).toFixed(1)}MB）。${(limit / 1048576).toFixed(1)}MB までにしてください。` }, 413)
  }
  let buf
  try { buf = new Uint8Array(await req.arrayBuffer()) } catch (_) {
    return json({ ok: false, message: '画像を受け取れませんでした。' }, 400)
  }
  if (!buf.length) return json({ ok: false, message: '画像が空です。' }, 400)
  if (buf.length > limit) {
    return json({ ok: false, message: `画像が大きすぎます。${(limit / 1048576).toFixed(1)}MB までにしてください。` }, 413)
  }
  const type = sniff(buf)
  if (!TYPES[type]) return json({ ok: false, message: 'JPEG・PNG・WebP の画像だけ置けます。' }, 415)

  const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const path = `${dir}/${jstDate()}/${rand}${preview ? '-s' : ''}.${TYPES[type]}`
  try {
    const { put } = await import('@vercel/blob')
    const out = await put(path, Buffer.from(buf), { access: 'public', contentType: type, token, addRandomSuffix: false })
    return json({ ok: true, url: out.url, size: buf.length, type })
  } catch (e) {
    const m = String((e && e.message) || e)
    return json({
      ok: false,
      message: /token|unauthor|forbidden|access/i.test(m)
        ? '画像の置き場所（Vercel Blob）の鍵が使えませんでした。Vercel の Storage で接続し直してください。'
        : `画像を置けませんでした（${m.slice(0, 120)}）`,
    }, 502)
  }
}
