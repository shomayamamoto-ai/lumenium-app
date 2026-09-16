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

/** What the admin can set, in the order it is shown. */
export const SETTINGS = [
  {
    name: 'RESEND_API_KEY', label: '問い合わせ・会員登録メール', kind: 'secret',
    where: 'resend.com › API Keys',
    why: 'これが無いと、お問い合わせフォームも会員登録も送信できません。',
  },
  {
    name: 'CONTACT_TO_EMAIL', label: '問い合わせの宛先', kind: 'text',
    where: '受け取りたいメールアドレス',
    why: '未設定のときは shoma.yamamoto@lumenium.net に届きます。',
  },
  {
    name: 'ANTHROPIC_API_KEY', label: 'AI（SEO/AIO分析・アドバイザー）', kind: 'secret',
    where: 'console.anthropic.com › API keys',
    why: 'これが無いと、AIO計測とAIアドバイザーは動きません。',
  },
  {
    name: 'GITHUB_TOKEN', label: 'お知らせ・文章編集の保存', kind: 'secret',
    where: 'github.com › Settings › Developer settings › Fine-grained tokens（対象リポジトリの Contents: Read and write）',
    why: 'これが無いと、お知らせの投稿もサイト文章の保存もできません。',
  },
  {
    name: 'MEMBER_CODE', label: '会員登録コード', kind: 'secret',
    where: '好きな文字列',
    why: '未設定のあいだは、リポジトリに公開されている既定コードが有効なままです。',
  },
  {
    name: 'SESSION_SECRET', label: 'ログインセッションの署名鍵', kind: 'secret',
    where: '推測できない長い文字列',
    why: '未設定のあいだは公開されている既定の鍵で署名されるため、ログイン状態を偽造できます。変更すると、いまログイン中の会員は入り直しになります。',
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
