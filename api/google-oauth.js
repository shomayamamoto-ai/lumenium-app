export const config = { runtime: 'edge' }

// Googleカレンダーへの接続を、管理画面のボタン1つで終わらせるための往復。
//
//   GET /api/google-oauth?start=1   → 同意画面のURLを返す（要 ADMIN_KEY）
//   GET /api/google-oauth?code=…    → Googleからの戻り。トークンを保存する
//
// 戻り先のリクエストには管理キーが付きません（Googleがブラウザを飛ばして
// くるだけなので）。そこで開始時に使い捨ての state を保存先に置き、戻って
// きたものと照合してから1度きりで消します。これが無いと、URLさえ知って
// いれば誰でもこのサイトのGoogle接続を差し替えられます。

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { saveSetting } from './_settings.js'
import { creds, consentUrl, exchangeCode } from './_google-cal.js'

const STATE = (s) => `lum:oauth:state:${s}`
const STATE_TTL = 15 * 60

const page = (title, body, ok = true) => new Response(
  `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
  `<title>${title}</title><style>` +
  `body{background:#171c33;color:#f5f7fb;font-family:'Noto Sans JP','Hiragino Sans',system-ui,sans-serif;` +
  `line-height:2;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}` +
  `div{max-width:480px;background:#262c4a;border:1px solid #424a6b;border-radius:14px;padding:24px 26px}` +
  `h1{font-size:17px;margin:0 0 10px;color:${ok ? '#67e8f9' : '#f87171'}}` +
  `p{font-size:13.5px;color:#abb5cb;margin:0 0 6px}a{color:#a5b4fc}</style></head>` +
  `<body><div><h1>${title}</h1>${body}</div></body></html>`,
  { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
)

export async function GET(req) {
  const url = new URL(req.url)
  const redirectUri = `${url.origin}/api/google-oauth`

  /* ---- 開始 ---- */
  if (url.searchParams.get('start')) {
    const denied = await requireAdmin(req)
    if (denied) return denied

    const c = await creds(req)
    if (!c.clientId || !c.clientSecret) {
      return json({ ok: false, message: 'GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を先に保存してください。' }, 400)
    }
    const store = storeConfig()
    if (!store) {
      return json({
        ok: false,
        message: '保存先が未設定です。Vercel の環境変数に UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN を設定してください（接続の照合と、受け取ったトークンの保存に要ります）。',
      }, 503)
    }
    const state = crypto.randomUUID().replace(/-/g, '')
    await pipeline(store, [['SET', STATE(state), '1', 'EX', STATE_TTL]])
    return json({ ok: true, url: consentUrl({ clientId: c.clientId, redirectUri, state }), redirectUri })
  }

  /* ---- Googleからの戻り ---- */
  const err = url.searchParams.get('error')
  if (err) return page('接続を中止しました', `<p>Google 側で「${err}」となりました。管理画面からやり直せます。</p>`, false)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') || ''
  if (!code) return page('不正なアクセスです', '<p>このURLは Google からの戻り先です。管理画面の「Googleカレンダーに接続」から始めてください。</p>', false)

  const store = storeConfig()
  if (!store) return page('保存先が未設定です', '<p>Upstash Redis の2つの環境変数を設定してから、もう一度お試しください。</p>', false)

  // 使い捨て。照合と削除を同じ往復で行うので、同じ state は二度使えません。
  const [seen] = await pipeline(store, [['GET', STATE(state)]])
  await pipeline(store, [['DEL', STATE(state)]])
  if (!seen) return page('接続の有効期限が切れています', '<p>管理画面からもう一度「Googleカレンダーに接続」を押してください（開始から15分で無効になります）。</p>', false)

  const c = await creds(req)
  let data
  try {
    data = await exchangeCode({ clientId: c.clientId, clientSecret: c.clientSecret, redirectUri, code })
  } catch (e) {
    return page('接続に失敗しました', `<p>${String(e.message || e).slice(0, 200)}</p>`, false)
  }

  if (!data.refresh_token) {
    // access_type=offline と prompt=consent を付けているので通常は返ります。
    // 返らない典型は、同じアプリに過去の許可が残っている場合です。
    return page('もう一度お試しください', '<p>Google からリフレッシュトークンが返りませんでした。' +
      '<a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">アカウントの許可一覧</a>' +
      'からこのアプリのアクセス権を削除し、管理画面から接続し直してください。</p>', false)
  }

  const saved = await saveSetting('GOOGLE_REFRESH_TOKEN', data.refresh_token, req)
  if (!saved.ok) return page('保存できませんでした', `<p>${saved.message}</p>`, false)

  return page('Googleカレンダーに接続しました',
    '<p>これ以降、フォーム送信直後に出る候補日時はあなたのカレンダーの空きから作られ、' +
    '予約が入ると Google Meet 付きの予定が自動で登録されます。</p>' +
    '<p>このタブは閉じて構いません。</p>')
}
