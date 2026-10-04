export const config = { runtime: 'edge' }

// 「YouTube連携」「TikTok連携」のボタンの往復。
//
//   GET /api/video-oauth?start=youtube   → Google の同意画面のURL（要 ADMIN_KEY）
//   GET /api/video-oauth?start=tiktok    → TikTok の同意画面のURL（要 ADMIN_KEY）
//   GET /api/video-oauth?code=…&state=…  → TikTok からの戻り。トークンを保存する
//
// YouTube の戻り先は、カレンダーと同じ /api/google-oauth です。Google Cloud に
// 戻り先をもう1つ登録してもらう手間を増やさないためで、state の頭に「yt~」を
// 付けて、戻ってきたときに YouTube 用のトークンとして保存し分けます。
// 照合用の値（state）は google-oauth.js と同じく ADMIN_KEY で署名し、
// どこにも保存せずに確かめます。

import { requireAdmin, json } from './_admin-auth.js'
import { setting, saveSetting, storeReady } from './_settings.js'
import { makeState, checkState } from './google-oauth.js'
import { youtubeConsentUrl, exchangeTikTok, TIKTOK_SCOPES } from './_video-platforms.js'

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const page = (title, body, ok = true) => new Response(
  `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
  `<title>${title}</title><style>body{background:#f6f4ef;color:#17171c;font-family:'Noto Sans JP','Hiragino Sans',system-ui,sans-serif;line-height:2;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}` +
  `div{max-width:560px;background:#fff;border:1px solid #dcd8ce;border-radius:14px;padding:24px 26px}h1{font-size:17px;margin:0 0 10px;color:${ok ? '#047857' : '#b42318'}}p{font-size:13.5px;color:#5b5b66;margin:0 0 8px}` +
  `code{display:block;background:#faf9f6;border:1px solid #dcd8ce;border-radius:8px;padding:10px 12px;font-size:12px;word-break:break-all;color:#17171c}</style></head><body><div><h1>${title}</h1>${body}</div></body></html>`,
  { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" } },
)

export async function GET(req) {
  const url = new URL(req.url)
  const start = url.searchParams.get('start')
  if (start) {
    const denied = await requireAdmin(req)
    if (denied) return denied
    if (start === 'youtube') {
      const [id, secret] = await Promise.all([setting('GOOGLE_CLIENT_ID', '', req), setting('GOOGLE_CLIENT_SECRET', '', req)])
      if (!id || !secret) return json({ ok: false, message: 'Google のクライアントIDとシークレットが未設定です（「設定状況 › キーの入力」の「商談の自動予約」と同じ欄です）。Google Cloud で YouTube Data API v3 を有効にしてください。' }, 400)
      return json({ ok: true, url: youtubeConsentUrl({ clientId: id, redirectUri: `${url.origin}/api/google-oauth`, state: 'yt~' + (await makeState()) }), willSave: await storeReady(req) })
    }
    if (start === 'tiktok') {
      const [key, secret] = await Promise.all([setting('TIKTOK_CLIENT_KEY', '', req), setting('TIKTOK_CLIENT_SECRET', '', req)])
      if (!key || !secret) return json({ ok: false, message: 'TikTok のクライアントキーとシークレットが未設定です。TikTok for Developers でアプリを作り、「設定状況 › キーの入力」に貼ってください。' }, 400)
      const q = new URLSearchParams({ client_key: key, scope: TIKTOK_SCOPES, response_type: 'code', redirect_uri: `${url.origin}/api/video-oauth`, state: await makeState() })
      return json({ ok: true, url: `https://www.tiktok.com/v2/auth/authorize/?${q}`, willSave: await storeReady(req) })
    }
    return json({ ok: false, message: '連携先が正しくありません。' }, 400)
  }

  const err = url.searchParams.get('error')
  if (err) return page('連携を中止しました', `<p>TikTok 側で「${esc(err.slice(0, 80))}」となりました。管理画面からやり直せます。</p>`, false)
  const code = url.searchParams.get('code')
  if (!code) return page('不正なアクセスです', '<p>このURLは TikTok からの戻り先です。管理画面の「TikTok連携」から始めてください。</p>', false)
  if (!(await checkState(url.searchParams.get('state') || ''))) return page('連携の有効期限が切れています', '<p>管理画面からもう一度「TikTok連携」を押してください（開始から15分で無効になります）。</p>', false)
  const r = await exchangeTikTok(req, code, `${url.origin}/api/video-oauth`)
  if (!r.ok) return page('連携に失敗しました', `<p>${esc(String(r.message).slice(0, 200))}</p>`, false)
  const saved = await saveSetting('TIKTOK_REFRESH_TOKEN', r.refreshToken, req)
  if (!saved.ok) {
    return page('あと1手だけ残っています',
      '<p>TikTok の許可は完了しました。ただし保存先（Upstash Redis）が無いため、受け取った値を保存できません。</p>' +
      '<p>下の値を Vercel の環境変数に <b>TIKTOK_REFRESH_TOKEN</b> という名前で登録し、再デプロイしてください。</p>' +
      `<code>${esc(r.refreshToken)}</code><p style="font-size:12px">この値は鍵と同じものです。メールやチャットに貼らないでください。</p>`)
  }
  const missing = ['video.upload'].filter((s) => r.scope && r.scope.split(',').indexOf(s) < 0)
  return page('TikTok と連携しました', `<p>管理画面から TikTok の受信箱（下書き）に動画を送れるようになりました。${missing.length ? `ただし ${missing.join('・')} の権限が許可されていません。アプリの権限を確かめてください。` : ''}</p><p>このタブは閉じて構いません。</p>`)
}
