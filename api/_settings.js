// Keys entered from the admin page, kept in the same store as the analytics.
//
// Until now every key lived in a Vercel environment variable, which means the
// only way to switch a feature on was to leave the site, find the project,
// find the settings page, type the name exactly, and redeploy. That is a lot
// of ceremony for "paste this key", and it is why five of the seven sections
// were still switched off.
//
// What this does NOT change: a value saved here is readable by anything that
// can read the store, and the store's own credentials are still environment
// variables. So this is not a stronger place to keep a secret than Vercel —
// it is the same trust boundary, reachable from the admin page. A value is
// never sent back to the browser; the status says only whether one is set and
// shows the last four characters so you can tell one key from another.
//
// Two cannot live here, and the UI says so:
//   · UPSTASH_REDIS_REST_URL / _TOKEN — this store itself. Nothing can save
//     the address of the place it saves things to.
//   · ADMIN_KEY — it is what authorises the page that would change it.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, pipeline } from './_analytics-store.js'

const K = (name) => `lum:cfg:${name}`

/** The groups the admin screen shows these in, in order. */
export const GROUPS = [
  { id: 'site', label: 'サイトの機能', note: '問い合わせ・AI・保存まわり。ここが埋まると管理ポータルの7つが動きます。' },
  { id: 'social', label: 'SNS 投稿', note: '管理ポータルから直接投稿するための資格情報。使う SNS の分だけ入れれば足ります。' },
]

/** What the admin can set, in the order it is shown. */
export const SETTINGS = [
  {
    name: 'RESEND_API_KEY', label: '問い合わせ・会員登録メール', kind: 'secret', group: 'site',
    where: 'resend.com › API Keys',
    why: 'これが無いと、お問い合わせフォームも会員登録も送信できません。',
  },
  {
    name: 'CONTACT_TO_EMAIL', label: '問い合わせの宛先', kind: 'text', group: 'site',
    where: '受け取りたいメールアドレス',
    why: '未設定のときは shoma.yamamoto@lumenium.net に届きます。',
  },
  {
    name: 'ANTHROPIC_API_KEY', label: 'AI（SEO/AIO分析・アドバイザー）', kind: 'secret', group: 'site',
    where: 'console.anthropic.com › API keys',
    why: 'これが無いと、AIO計測とAIアドバイザーは動きません。',
  },
  {
    name: 'GITHUB_TOKEN', label: 'お知らせ・文章編集の保存', kind: 'secret', group: 'site',
    where: 'github.com › Settings › Developer settings › Fine-grained tokens（対象リポジトリの Contents: Read and write）',
    why: 'これが無いと、お知らせの投稿もサイト文章の保存もできません。',
  },
  {
    name: 'MEMBER_CODE', label: '会員登録コード', kind: 'secret', group: 'site',
    where: '好きな文字列',
    why: '未設定のあいだは、リポジトリに公開されている既定コードが有効なままです。',
  },
  {
    name: 'SESSION_SECRET', label: 'ログインセッションの署名鍵', kind: 'secret', group: 'site',
    where: '推測できない長い文字列',
    why: '未設定のあいだは公開されている既定の鍵で署名されるため、ログイン状態を偽造できます。変更すると、いまログイン中の会員は入り直しになります。',
  },

  // SNS. Every one of these is a token the platform hands you in its own
  // developer console; none of them can be obtained from here, and each is
  // tied to a specific account, so the account id sits next to its token.
  {
    name: 'X_ACCESS_TOKEN', label: 'X（旧Twitter）', kind: 'secret', group: 'social', net: 'x',
    where: 'developer.x.com › Projects & Apps › OAuth 2.0 のユーザーアクセストークン（scope に tweet.write と users.read、offline.access）',
    why: '投稿 API v2（POST /2/tweets）に使います。無料枠は月あたりの投稿数に上限があります。',
  },
  {
    name: 'FB_PAGE_ID', label: 'Facebook ページID', kind: 'text', group: 'social', net: 'facebook',
    where: 'Facebook ページ › ページ情報 の数字ID',
    why: 'どのページに投稿するかの指定です。',
  },
  {
    name: 'FB_PAGE_TOKEN', label: 'Facebook ページアクセストークン', kind: 'secret', group: 'social', net: 'facebook',
    where: 'developers.facebook.com › Graph API Explorer で pages_manage_posts を付けて発行し、長期トークンに交換',
    why: 'ページ投稿（POST /{page-id}/feed）に使います。短期トークンは数時間で切れます。',
  },
  {
    name: 'IG_USER_ID', label: 'Instagram ビジネスアカウントID', kind: 'text', group: 'social', net: 'instagram',
    where: 'Graph API の /me/accounts › instagram_business_account の id',
    why: 'Instagram はプロアカウント（ビジネス/クリエイター）で、Facebookページと連携している必要があります。',
  },
  {
    name: 'IG_TOKEN', label: 'Instagram アクセストークン', kind: 'secret', group: 'social', net: 'instagram',
    where: 'Facebook ページトークンと同じもので構いません（instagram_content_publish 権限が必要）',
    why: '空欄のときは Facebook ページアクセストークンを使います。',
  },
  {
    name: 'THREADS_USER_ID', label: 'Threads ユーザーID', kind: 'text', group: 'social', net: 'threads',
    where: 'developers.facebook.com › Threads API › /me の id',
    why: 'Threads は Instagram とは別のトークンが要ります。',
  },
  {
    name: 'THREADS_TOKEN', label: 'Threads アクセストークン', kind: 'secret', group: 'social', net: 'threads',
    where: 'Threads API の長期アクセストークン（threads_basic と threads_content_publish）',
    why: '投稿の作成と公開の2段階に使います。',
  },
  {
    name: 'LI_AUTHOR_URN', label: 'LinkedIn 投稿者URN', kind: 'text', group: 'social', net: 'linkedin',
    where: '個人なら urn:li:person:xxxx、会社ページなら urn:li:organization:12345',
    why: '誰の名前で投稿するかの指定です。',
  },
  {
    name: 'LI_TOKEN', label: 'LinkedIn アクセストークン', kind: 'secret', group: 'social', net: 'linkedin',
    where: 'linkedin.com/developers › 自分のアプリ › w_member_social（会社ページは w_organization_social）',
    why: 'UGC Posts API に使います。既定では60日で失効します。',
  },
]

const NAMES = new Set(SETTINGS.map((s) => s.name))

// One round trip per isolate per half minute rather than one per request. A
// key that was just saved has to take effect promptly, so the window is short
// and saving clears the cache outright.
let cache = null
let cacheAt = 0
const TTL = 30000

async function all() {
  const cfg = storeConfig()
  if (!cfg) return {}
  const now = Date.now()
  if (cache && now - cacheAt < TTL) return cache
  try {
    const names = [...NAMES]
    const out = await pipeline(cfg, names.map((n) => ['GET', K(n)]))
    const map = {}
    names.forEach((n, i) => { if (out[i]) map[n] = String(out[i]) })
    cache = map
    cacheAt = now
    return map
  } catch (_) {
    // A store that is briefly unreachable must not switch the whole site off;
    // the environment is still there underneath.
    return cache || {}
  }
}

/** The value in force: what was saved from the admin, else the environment. */
export async function setting(name, fallback) {
  const saved = (await all())[name]
  if (saved) return saved
  const env = (process.env[name] || '').trim()
  return env || fallback || ''
}

/** Where each value is coming from, and enough of it to tell keys apart —
 *  never the value itself. */
export async function settingStatus() {
  const saved = await all()
  return SETTINGS.map((s) => {
    const env = (process.env[s.name] || '').trim()
    const value = saved[s.name] || env
    return {
      name: s.name,
      label: s.label,
      kind: s.kind,
      group: s.group || 'site',
      net: s.net || '',
      where: s.where,
      why: s.why,
      set: !!value,
      from: saved[s.name] ? 'saved' : (env ? 'env' : null),
      hint: value ? (s.kind === 'text' ? value : '••••' + value.slice(-4)) : '',
    }
  })
}

export async function saveSetting(name, value) {
  if (!NAMES.has(name)) return { ok: false, message: '設定できない項目です。' }
  const cfg = storeConfig()
  if (!cfg) return { ok: false, message: 'NO_STORE' }
  const v = String(value || '').trim()
  await pipeline(cfg, [v ? ['SET', K(name), v] : ['DEL', K(name)]])
  cache = null
  return { ok: true, cleared: !v }
}

export function storeReady() {
  return !!storeConfig()
}
