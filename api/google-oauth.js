export const config = { runtime: 'edge' }

// Googleカレンダーへの接続を、管理画面のボタン1つで終わらせるための往復。
//
//   GET /api/google-oauth?start=1   → 同意画面のURLを返す（要 ADMIN_KEY）
//   GET /api/google-oauth?code=…    → Googleからの戻り。トークンを保存する
//
// 戻り先のリクエストには管理キーが付きません（Googleがブラウザを飛ばして
// くるだけなので）。以前はここで使う照合用の値を保存先（Upstash）に置いて
// いましたが、そのせいで「保存先が無いと接続そのものが始められない」状態に
// なっていました。保存先を用意する前に接続したい、という順序はごく自然です。
//
// いまは照合用の値に ADMIN_KEY で署名を付けています。署名が合っていて、かつ
// 有効期限内であれば本物——どこにも保存せずに確かめられます。
//
// 受け取ったトークンは保存先に書きます。保存先が無いときは、画面に出して
// Vercel の環境変数に貼ってもらいます（そうしないと、接続できたのに何も
// 残らない、という一番分かりにくい終わり方になります）。

import { requireAdmin, json } from './_admin-auth.js'
import { saveSetting, storeReady } from './_settings.js'
import { creds, consentUrl, exchangeCode } from './_google-cal.js'

const STATE_TTL_MS = 15 * 60 * 1000
const enc = new TextEncoder()

async function sign(message) {
  const secret = (process.env.ADMIN_KEY || '').trim()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 「有効期限.署名」。保存先は要りません。 */
export async function makeState() {
  const exp = String(Date.now() + STATE_TTL_MS)
  return `${exp}.${await sign(exp)}`
}

export async function checkState(state) {
  const [exp, sig] = String(state || '').split('.')
  if (!exp || !sig) return false
  if (!equal(sig, await sign(exp))) return false
  return Number(exp) > Date.now()
}

const page = (title, body, ok = true) => new Response(
  `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
  `<title>${title}</title><style>` +
  `body{background:#171c33;color:#f5f7fb;font-family:'Noto Sans JP','Hiragino Sans',system-ui,sans-serif;` +
  `line-height:2;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}` +
  `div.card{max-width:560px;background:#262c4a;border:1px solid #424a6b;border-radius:14px;padding:24px 26px}` +
  `h1{font-size:17px;margin:0 0 10px;color:${ok ? '#67e8f9' : '#f87171'}}` +
  `p{font-size:13.5px;color:#abb5cb;margin:0 0 8px}a{color:#a5b4fc}` +
  `code{display:block;background:#171c33;border:1px solid #424a6b;border-radius:8px;padding:10px 12px;` +
  `font-size:12px;word-break:break-all;color:#f5f7fb;margin:8px 0;line-height:1.7}` +
  `</style></head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`,
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
      return json({
        ok: false,
        message: 'GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET が未設定です。' +
          (await storeReady(req)
            ? '上の欄に貼って保存してから、もう一度押してください。'
            : 'この2つは訪問者のリクエストで読む値なので、この端末には保存できません。Vercel の環境変数に入れてください。'),
      }, 400)
    }
    return json({
      ok: true,
      url: consentUrl({ clientId: c.clientId, redirectUri, state: await makeState() }),
      redirectUri,
      // 保存先が無いと、受け取ったトークンを保存できません。始める前に伝えます。
      willSave: await storeReady(req),
    })
  }

  /* ---- Googleからの戻り ---- */
  const err = url.searchParams.get('error')
  if (err) return page('接続を中止しました', `<p>Google 側で「${err}」となりました。管理画面からやり直せます。</p>`, false)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') || ''
  if (!code) return page('不正なアクセスです', '<p>このURLは Google からの戻り先です。管理画面の「Googleカレンダーに接続」から始めてください。</p>', false)

  if (!(await checkState(state))) {
    return page('接続の有効期限が切れています',
      '<p>管理画面からもう一度「Googleカレンダーに接続」を押してください（開始から15分で無効になります）。</p>', false)
  }

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
  if (!saved.ok) {
    /* 保存先が無い。ここで「失敗しました」とだけ出すと、許可は済んでいるのに
       手元には何も残らず、同じ操作を繰り返すことになります。値を出して、
       置き場所を伝えます。 */
    return page('あと1手だけ残っています',
      '<p>Googleの許可は完了しました。ただし保存先（Upstash Redis）が無いため、受け取った値をこちらで保存できません。</p>' +
      '<p>下の値を Vercel › Settings › Environment Variables に <b>GOOGLE_REFRESH_TOKEN</b> という名前で登録し、再デプロイしてください。' +
      'これで接続が完了します。</p>' +
      `<code>${String(data.refresh_token).replace(/[<>&]/g, '')}</code>` +
      '<p style="font-size:12px">この値は鍵と同じものです。画面を閉じると二度と表示されません（もう一度接続すれば新しい値が出ます）。' +
      'メールやチャットに貼らないでください。</p>', true)
  }

  return page('Googleカレンダーに接続しました',
    '<p>これ以降、フォーム送信直後に出る候補日時はあなたのカレンダーの空きから作られ、' +
    '予約が入ると Google Meet 付きの予定が自動で登録されます。</p>' +
    '<p>このタブは閉じて構いません。</p>')
}
