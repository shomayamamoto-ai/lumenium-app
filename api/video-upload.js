// 動画を Vercel Blob に「ブラウザから直接」置くための、短い鍵の発行（管理者のみ）。
//
// Vercel の関数は 4.5MB までしか受け取れず、ショート動画は数十MBあります。
// そこで動画そのものはここを通さず、ブラウザが Blob に直接送ります。ここが
// するのは、@vercel/blob の handleUpload で「この名前・この種類・この大きさ
// までなら置いてよい」という使い捨ての鍵を作ることだけです。
//
// 画面側は public/blob-upload.js（@vercel/blob/client の upload をそのまま
// 束ねたもの）を使います。置き終わりの通知（onUploadCompleted）は受けません。
// 通知は Vercel から管理キーなしで届くため、受けるなら別の確かめ方が要ります。
// 置いた結果の URL はブラウザが受け取って、投稿に保存します。

import { requireAdmin, json } from './_admin-auth.js'
import { setting } from './_settings.js'
import { NO_BLOB } from './social-upload.js'

export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024 // Instagram リールの上限（1GB）に合わせます
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const token = await setting('BLOB_READ_WRITE_TOKEN', '', req)
  if (!token) return json(NO_BLOB, 503)
  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  if (!body || body.type !== 'blob.generate-client-token') {
    return json({ ok: false, message: 'このエンドポイントは、動画のアップロード用の鍵を作るだけです。' }, 400)
  }
  const path = String((body.payload && body.payload.pathname) || '')
  if (!/^video\/[A-Za-z0-9._/-]{1,200}$/.test(path) || path.includes('..')) {
    return json({ ok: false, message: '置き場所の名前が正しくありません。' }, 400)
  }
  try {
    const { handleUpload } = await import('@vercel/blob/client')
    const out = await handleUpload({
      body,
      request: req,
      token,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: VIDEO_TYPES,
        maximumSizeInBytes: MAX_VIDEO_BYTES,
        addRandomSuffix: true,
        // 鍵は30分で使えなくなります（大きな動画でも送り始めるには十分）。
        validUntil: Date.now() + 30 * 60 * 1000,
      }),
    })
    return json(out)
  } catch (e) {
    const m = String((e && e.message) || e)
    return json({
      ok: false,
      message: /token|unauthor|forbidden|access/i.test(m)
        ? '動画の置き場所（Vercel Blob）の鍵が使えませんでした。Vercel の Storage で接続し直してください。'
        : `アップロードの準備ができませんでした（${m.slice(0, 120)}）`,
    }, 502)
  }
}
