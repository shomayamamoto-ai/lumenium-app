export const config = { runtime: 'edge' }

// 「設定状況」の各行の「テスト」ボタン。
//
// 設定状況の ✅ は「値が入っている」ことしか見ていません。貼り間違えたキー、
// 期限の切れたトークン、送信元ドメインの未認証は、どれも ✅ のまま実際には
// 動かず、お客様からの連絡が届かないことで初めて分かります。ここでは
// 実際に相手のサービスに問い合わせて、動くかどうかと直し方を返します。
//
// 何も書き換えません（GitHub は読むだけ・Redis は60秒で消える目印だけ）。
// 例外はメールで、テストメールを1通、管理者の宛先にだけ送ります。
// 値そのものは返しません。

import { requireAdmin, json } from './_admin-auth.js'
import { setting } from './_settings.js'
import { storeFor, storePing } from './_analytics-store.js'
import { hit } from './_ratelimit.js'
import { creds, connected, accessToken } from './_google-cal.js'
import { BRAND, KV } from './_brand.js'
import { senderInfo, SANDBOX_NOTE, DNS_STEPS } from './_sender.js'

/* テストは1種類ごとに1時間10回まで。メールは送るものなので1時間3通まで。
   押し続けても相手のサービスの上限や送信枠を使い切らないようにするためです。 */
const LIMITS = { resend: 3 }
const DEFAULT_LIMIT = 10

const TARGETS = ['resend', 'github', 'ai', 'store', 'google']

async function resendTest(req) {
  const key = await setting('RESEND_API_KEY', '', req)
  if (!key) return { state: 'error', message: 'RESEND_API_KEY が入っていません。resend.com › API Keys で発行して「キーの入力」に貼ってください。' }
  const to = (await setting('CONTACT_TO_EMAIL', '', req)) || BRAND.owner
  const sender = senderInfo(BRAND.from)
  const out = { state: 'ok', items: [] }

  // 1) 送れるか。宛先は管理者だけ（任意の宛先には送りません）。
  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: BRAND.from, to: [to],
      subject: `【${BRAND.name}】管理画面からのテストメール`,
      text: 'これは管理画面「設定状況」のテストボタンから送ったメールです。届いていれば、問い合わせの通知は正しく送られます。返信は不要です。',
    }),
  }).catch(() => null)
  if (!send) return { state: 'error', message: 'Resend に接続できませんでした。少し時間をおいてもう一度お試しください。' }
  if (send.status === 401 || send.status === 403) {
    const body = await send.json().catch(() => ({}))
    if (/domain/i.test(String(body.message || ''))) {
      out.items.push({ state: 'error', text: `送信元のドメイン（${sender.domain}）が Resend で認証されていないため送れませんでした。${DNS_STEPS}` })
    } else {
      return { state: 'error', message: 'キーが正しくないか、取り消されています。resend.com › API Keys で新しいキーを発行して貼り直してください。' }
    }
  } else if (!send.ok) {
    out.items.push({ state: 'error', text: `テストメールを送れませんでした（Resend の応答 ${send.status}）。宛先 ${to} が正しいか確認してください。` })
  } else {
    out.items.push({ state: 'ok', text: `テストメールを ${to} に送りました。数分以内に届くか確認してください（迷惑メールフォルダも）。` })
  }

  // 2) 訪問者にも届くか — 送信元ドメインが認証済みか。
  if (sender.sandbox) {
    out.items.push({ state: 'error', text: SANDBOX_NOTE + ' ' + DNS_STEPS })
  } else if (sender.domain) {
    const dr = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } }).catch(() => null)
    if (dr && dr.ok) {
      const list = ((await dr.json().catch(() => ({}))).data) || []
      const d = list.find((x) => String(x.name || '').toLowerCase() === sender.domain)
      if (!d) out.items.push({ state: 'error', text: `送信元のドメイン ${sender.domain} が Resend に登録されていません。お客様あてのメールが届きません。${DNS_STEPS}` })
      else if (d.status !== 'verified') out.items.push({ state: 'warn', text: `送信元のドメイン ${sender.domain} は登録済みですが、まだ認証が終わっていません（状態: ${d.status}）。DNS の値が入っているか確認し、Resend の画面で Verify を押してください。` })
      else out.items.push({ state: 'ok', text: `送信元のドメイン ${sender.domain} は認証済みです。お客様あてのメールも届きます。` })
    } else {
      // 送信専用のキーではドメイン一覧が読めません。送れたかどうかで判断します。
      out.items.push({ state: 'warn', text: 'このキーは送信専用のため、送信元ドメインの認証状態までは確認できませんでした。resend.com › Domains で Verified になっているか見てください。' })
    }
  }
  out.state = out.items.some((i) => i.state === 'error') ? 'error' : out.items.some((i) => i.state === 'warn') ? 'warn' : 'ok'
  return out
}

async function githubTest(req) {
  const token = await setting('GITHUB_TOKEN', '', req)
  if (!token) return { state: 'error', message: 'GITHUB_TOKEN が入っていません。github.com › Settings › Developer settings › Personal access tokens で発行して貼ってください。' }
  const res = await fetch(`https://api.github.com/repos/${BRAND.repo}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': `${BRAND.slug}-admin` },
  }).catch(() => null)
  if (!res) return { state: 'error', message: 'GitHub に接続できませんでした。少し時間をおいてもう一度お試しください。' }
  if (res.status === 401) return { state: 'error', message: 'トークンが正しくないか、有効期限が切れています。GitHub で新しいトークンを発行して貼り直してください。' }
  if (res.status === 404 || res.status === 403) {
    return { state: 'error', message: `トークンでリポジトリ ${BRAND.repo} を読めません。トークンの対象リポジトリに ${BRAND.repo} が含まれているか確認してください。` }
  }
  if (!res.ok) return { state: 'error', message: `GitHub の応答が想定と違います（${res.status}）。` }
  const repo = await res.json().catch(() => ({}))
  // 古い形式のトークンは、許可の範囲がヘッダーで分かります（repo / public_repo）。
  const scopes = res.headers.get('x-oauth-scopes')
  if (scopes !== null && scopes !== '' && !/\b(public_)?repo\b/.test(scopes)) {
    return { state: 'error', message: 'リポジトリは読めますが、トークンに書き込みの許可（repo）がありません。保存できないので、repo にチェックを入れて発行し直してください。' }
  }
  if (repo.permissions && repo.permissions.push === false) {
    return { state: 'error', message: 'リポジトリは読めますが、書き込みの権限がありません。お知らせ・文章の保存ができないので、Contents を「Read and write」にしたトークンを発行し直してください。' }
  }
  return { state: 'ok', message: `リポジトリ ${BRAND.repo} を読め、書き込みの権限もあります（実際には何も書き込んでいません）。` }
}

async function aiTest(req) {
  const key = await setting('ANTHROPIC_API_KEY', '', req)
  if (!key) return { state: 'error', message: 'ANTHROPIC_API_KEY が入っていません。console.anthropic.com で発行して貼ってください。' }
  // モデルの一覧を読むだけ。料金はかかりません。
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  }).catch(() => null)
  if (!res) return { state: 'error', message: 'Anthropic に接続できませんでした。少し時間をおいてもう一度お試しください。' }
  if (res.status === 401) return { state: 'error', message: 'キーが正しくないか、取り消されています。console.anthropic.com › API Keys で発行し直して貼ってください。' }
  if (res.status === 403) return { state: 'error', message: 'キーは有効ですが、使う権限がありません。console.anthropic.com で支払い設定（Billing）とキーの権限を確認してください。' }
  if (res.status === 429) return { state: 'warn', message: 'キーは有効ですが、いま利用の上限に達しています。しばらく待つか、console.anthropic.com で上限を確認してください。' }
  if (!res.ok) return { state: 'warn', message: `Anthropic が一時的に応答していません（${res.status}）。キーの問題ではない可能性が高いです。` }
  return { state: 'ok', message: 'キーは有効です。AIアドバイザーとAIO計測が使えます（このテストに料金はかかりません）。' }
}

async function storeTest(req) {
  const cfg = await storeFor(req)
  if (!cfg) return { state: 'error', message: '保存先（Upstash Redis）がつながっていません。下の「すべての端末で使えるようにする」の手順で接続してください。' }
  const p = await storePing(cfg)
  return p.ok
    ? { state: 'ok', message: '保存先（Upstash Redis）に書き込み・読み込みができました。' }
    : { state: 'error', message: `保存先に接続できません（${p.message}）。URL とトークンが同じデータベースのものか、Upstash の画面で確認してください。` }
}

async function googleTest(req) {
  const c = await creds(req)
  if (!connected(c)) return { state: 'error', message: 'Google と接続されていません。「キーの入力」の Google の欄から接続してください。' }
  try {
    await accessToken(c)
    return { state: 'ok', message: 'Google との接続は有効です（予約カレンダー・Search Console が使えます）。' }
  } catch (e) {
    return { state: 'error', message: `Google との接続が使えません: ${String((e && e.message) || e).slice(0, 120)}。管理画面から接続し直してください。` }
  }
}

const RUN = { resend: resendTest, github: githubTest, ai: aiTest, store: storeTest, google: googleTest }

export async function runTest(target, req) {
  const fn = RUN[target]
  if (!fn) return { state: 'error', message: 'このテストはありません。' }
  try { return await fn(req) } catch (_) {
    return { state: 'error', message: 'テストの途中で問題が起きました。少し時間をおいてもう一度お試しください。' }
  }
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const target = String(body.target || '')
  if (!TARGETS.includes(target)) return json({ ok: false, message: 'テストする項目が分かりません。' }, 400)
  const limit = LIMITS[target] || DEFAULT_LIMIT
  const rl = await hit(`${KV}livetest:${target}`, limit, 3600)
  if (rl.limited) {
    return json({
      ok: false, code: 'RATE_LIMITED',
      message: `テストは1時間に${limit}回までです。約${Math.max(1, Math.ceil(rl.retryAfter / 60))}分後にもう一度お試しください。`,
    }, 429)
  }
  const result = await runTest(target, req)
  return json({ ok: true, target, ...result, at: new Date().toISOString() })
}
