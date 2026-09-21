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
// One cannot live here, and the UI says so:
//   · ADMIN_KEY — it is what authorises the page that would change it.
//
// The store's own address is a special case rather than an impossible one: it
// cannot be saved into the store, but it can be held by the admin's browser,
// and admin requests carry that. Counting visits still needs it in the
// environment, because visitors' requests carry nothing of the admin's.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, storeFor, pipeline, storeEnvNames } from './_analytics-store.js'
import { bag, bagReady } from './_keybag.js'

const K = (name) => `lum:cfg:${name}`

/** The groups the admin screen shows these in, in order. */
export const GROUPS = [
  { id: 'site', label: 'サイトの機能', note: '問い合わせ・AI・保存まわり。ここが埋まると管理ポータルの7つが動きます。' },
  { id: 'search', label: '検索エンジンへの登録', note: 'Search Console と Bing Webmaster Tools の所有権確認。ここに貼ると、確認用のファイルはその場で有効になります（再デプロイは要りません）。Bing の索引は ChatGPT検索やCopilotが読んでいるので、AIの回答に入る経路としては Google と同じくらい大事です。' },
  { id: 'booking', label: '商談の自動予約（Googleカレンダー）', note: 'フォーム送信の直後に空き日時を出し、1クリックで Google Meet 付きの予定を入れるための設定。下の「Googleカレンダーに接続」を押すと、3つ目は自動で入ります。' },
  { id: 'social', label: 'SNS 投稿', note: '管理ポータルから直接投稿するための資格情報。使う SNS の分だけ入れれば足ります。' },
]

/** What the admin can set, in the order it is shown. */
export const SETTINGS = [
  {
    // The store's own address. It had no row at all, because saved values live
    // in the store and the store cannot hold its own address — so the screen
    // that asks for every other key had nowhere to type these two, while the
    // panels that need them said 「未設定です」. They are device-savable: the
    // admin's own screens carry the admin's cookie, so history, saved settings
    // and the AIO reports can use a pair held here. Pageview counting cannot,
    // because it happens on visitors' requests, and `why` says so.
    name: 'UPSTASH_REDIS_REST_URL', label: '保存先のURL（Upstash Redis）', kind: 'text', group: 'site',
    where: 'Vercel › Storage › Upstash Redis › REST URL（https://…upstash.io）',
    why: 'この端末に保存すると、AIO計測の履歴と設定の保存がこの保存先に入ります。訪問者の閲覧数を数えるのは訪問者側のリクエストなので、アクセス解析まで動かすには Vercel の環境変数にも同じ値が必要です。',
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN', label: '保存先のトークン（Upstash Redis）', kind: 'secret', group: 'site',
    where: 'Vercel › Storage › Upstash Redis › REST TOKEN',
    why: 'URLと対で使います。片方だけでは保存先は有効になりません。',
  },
  {
    // device:false — these are read while serving somebody else's request (a
    // visitor sending the contact form, a member logging in), and that browser
    // carries no cookie of ours. Storing them per-device would look like it
    // worked and quietly do nothing.
    name: 'RESEND_API_KEY', label: '問い合わせ・会員登録メール', kind: 'secret', group: 'site', device: false,
    where: 'resend.com › API Keys',
    why: 'これが無いと、お問い合わせフォームも会員登録も送信できません。',
  },
  {
    name: 'CONTACT_TO_EMAIL', label: '問い合わせの宛先', kind: 'text', group: 'site', device: false,
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
    name: 'MEMBER_CODE', label: '会員登録コード', kind: 'secret', group: 'site', device: false,
    where: '好きな文字列',
    why: '未設定のあいだは、リポジトリに公開されている既定コードが有効なままです。',
  },
  {
    name: 'SESSION_SECRET', label: 'ログインセッションの署名鍵', kind: 'secret', group: 'site', device: false,
    where: '推測できない長い文字列',
    why: '未設定のあいだは公開されている既定の鍵で署名されるため、ログイン状態を偽造できます。変更すると、いまログイン中の会員は入り直しになります。',
  },

  // 検索エンジンの所有権確認。読みに来るのは Google / Bing のクローラーで、
  // こちらの鍵は何も持っていないため device:false。
  {
    name: 'GOOGLE_SITE_VERIFICATION', label: 'Google Search Console の確認', kind: 'text', group: 'search', device: false,
    where: 'search.google.com/search-console › プロパティを追加（URLプレフィックス）› HTMLファイル の googleXXXX.html というファイル名',
    why: 'ファイル名をそのまま貼れば、https://lumenium.net/googleXXXX.html が有効になります。確認後は sitemap.xml と sitemap-content.xml を送信してください。',
  },
  {
    name: 'BING_SITE_VERIFICATION', label: 'Bing Webmaster Tools の確認', kind: 'text', group: 'search', device: false,
    where: 'bing.com/webmasters › サイト追加 › XMLファイル の <user> に入っている文字列',
    why: '貼ると https://lumenium.net/BingSiteAuth.xml が有効になります。Bing の索引は ChatGPT検索・Copilot の材料です。',
  },

  // 商談の自動予約。これらは訪問者のリクエストを処理している最中に読む値
  // （予約するのは訪問者で、その人のブラウザはこちらの鍵を何も持っていない）
  // なので device:false。端末保存を許すと、保存できたように見えて実際には
  // 何も動かない、という一番たちの悪い壊れ方をします。
  {
    name: 'GOOGLE_CLIENT_ID', label: 'Google クライアントID', kind: 'text', group: 'booking', device: false,
    where: 'console.cloud.google.com › APIとサービス › 認証情報 › OAuth 2.0 クライアント（種類: ウェブアプリケーション）',
    why: '承認済みのリダイレクトURIに https://lumenium.net/api/google-oauth を登録してください。Google Calendar API の有効化も必要です。',
  },
  {
    name: 'GOOGLE_CLIENT_SECRET', label: 'Google クライアントシークレット', kind: 'secret', group: 'booking', device: false,
    where: '同じ画面のクライアントシークレット',
    why: 'IDと対で使います。片方だけでは接続できません。',
  },
  {
    name: 'GOOGLE_REFRESH_TOKEN', label: 'Google 接続トークン', kind: 'secret', group: 'booking', device: false,
    where: '下の「Googleカレンダーに接続」を押すと自動で入ります',
    why: 'OAuth同意画面が「テスト」のままだと7日で失効します。「公開」または「内部」にしてから接続してください。切れた場合は接続し直すだけで戻ります。',
  },
  {
    // Cloud Console を触らずに済む道。ログインして1本コピーするだけで、
    // 候補日時が本当の空きから作られるようになります。
    name: 'GOOGLE_CALENDAR_ICS_URL', label: 'カレンダーの非公開URL（簡易接続）', kind: 'secret', group: 'booking', device: false,
    where: 'Googleカレンダー › 設定 › 対象のカレンダー › 「カレンダーの統合」 › 「非公開の iCal 形式の URL」',
    why: 'Googleにログインしてコピーするだけで、空き時間が本物のカレンダーから反映されます（読み取りのみ）。予定の自動登録とMeetの発行には、上のクライアントIDによる接続が必要です。このURLを知る人は予定を読めるので、扱いは鍵と同じにしてください。',
  },
  {
    name: 'GOOGLE_CALENDAR_ID', label: '使うカレンダー', kind: 'text', group: 'booking', device: false,
    where: '空欄なら primary（そのアカウントの既定のカレンダー）',
    why: '商談だけ別カレンダーで管理したい場合は、そのカレンダーIDを入れます。空き時間の判定もそのカレンダーで行われます。',
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

async function all(req) {
  // The admin's own pair counts here: it is their request, and their cookie.
  const cfg = await storeFor(req)
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

/** The value in force, in the order a person would expect: what was saved for
 *  everyone, then what this browser is carrying, then the environment.
 *  `req` is optional — without it the browser's own keys are simply not seen,
 *  which is the correct answer on a visitor's request. */
/* 保存先の2つだけ、Vercel の Upstash 連携が別の名前で作ります。同じ値なので
   どちらの名前でも読みますが、URL とトークンは必ず同じ組から取ります
   （組の選び方は _analytics-store.js の storeEnvNames）。 */
const envAlias = (name) => {
  if (name === 'UPSTASH_REDIS_REST_URL') return storeEnvNames().url
  if (name === 'UPSTASH_REDIS_REST_TOKEN') return storeEnvNames().token
  return name
}

export async function setting(name, fallback, req) {
  const saved = (await all(req))[name]
  if (saved) return saved
  if (req) {
    const mine = (await bag(req))[name]
    if (mine) return mine
  }
  // 保存先の2つだけ、Vercel の連携が作る名前も見ます。
  const n = envAlias(name)
  const v = n ? (process.env[n] || '').trim() : ''
  return v || fallback || ''
}

/** Where each value is coming from, and enough of it to tell keys apart —
 *  never the value itself. */
export async function settingStatus(req) {
  const saved = await all(req)
  const mine = req ? await bag(req) : {}
  // 入っているのに「未設定」と出さないよう、別名も見ます。
  const envValue = (name) => {
    const n = envAlias(name)
    const v = n ? (process.env[n] || '').trim() : ''
    return v ? { name: n, value: v } : null
  }
  return SETTINGS.map((s) => {
    const found = envValue(s.name)
    const env = found ? found.value : ''
    const device = s.device !== false ? mine[s.name] : ''
    const value = saved[s.name] || device || env
    return {
      name: s.name,
      label: s.label,
      kind: s.kind,
      group: s.group || 'site',
      net: s.net || '',
      device: s.device !== false,
      where: s.where,
      why: s.why,
      set: !!value,
      from: saved[s.name] ? 'saved' : device ? 'device' : (env ? 'env' : null),
      /* 同じ値が複数の場所にあることは普通に起こります。これまで表示は
         「勝っている場所」しか出しておらず、Vercel の環境変数に入れたのに
         画面は「この端末に保存済み」のまま——入ったのか入っていないのか
         分からない、という見え方になっていました。全部の在りかを返します。 */
      inStore: !!saved[s.name],
      onDevice: !!device,
      inEnv: !!env,
      // 別名で入っているときは、その名前を返します（画面で「この名前で
      // 入っています」と言えるように）。
      envName: found ? found.name : null,
      hint: value ? (s.kind === 'text' ? value : '••••' + value.slice(-4)) : '',
    }
  })
}

export async function saveSetting(name, value, req) {
  if (!NAMES.has(name)) return { ok: false, message: '設定できない項目です。' }
  const cfg = await storeFor(req)
  if (!cfg) return { ok: false, message: 'NO_STORE' }
  const v = String(value || '').trim()
  await pipeline(cfg, [v ? ['SET', K(name), v] : ['DEL', K(name)]])
  cache = null
  return { ok: true, cleared: !v }
}

export async function storeReady(req) {
  return !!(await storeFor(req))
}

/** Can a key be kept in this browser? Only if there is an ADMIN_KEY to
 *  derive the encryption from — which there is, or this screen would not
 *  have opened. */
export async function deviceReady() {
  return await bagReady()
}

export function canGoOnDevice(name) {
  const s = SETTINGS.find((x) => x.name === name)
  return !!s && s.device !== false
}
