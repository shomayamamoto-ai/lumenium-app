// このサイトの「名前と住所」。
//
// 社名・ドメイン・宛先・リポジトリが各ファイルに直接書かれていると、
// 同じ仕組みを別の会社のサイトに載せるたびに十数か所を探して書き換える
// ことになり、1か所の直し漏れで、お客様のフォームの通知が別の会社に
// 届きます。ここに集め、Vercel の環境変数で上書きできるようにしています。
// 何も設定しなければ、これまでどおり Lumenium の値です。社名（SITE_NAME）を
// 変えたときは、Lumenium 固有の既定値（読み・通知先・リポジトリなど）は使わず
// 空になります。設定状況の画面が「要対応」で知らせます。
//
//   SITE_NAME        社名（英字）           例: Lumenium
//   SITE_NAME_KANA   社名の読み             例: ルメニウム
//   SITE_URL         公開URL               例: https://lumenium.net
//   OWNER_EMAIL      通知の既定の宛先（CONTACT_TO_EMAIL が無いとき）
//   CONTACT_FROM_EMAIL 送信元               例: Lumenium <info@example.com>
//   GITHUB_REPO      文章・お知らせを保存するリポジトリ  例: owner/repo
//   KV_PREFIX        Redis のキーの頭（1つのデータベースを複数サイトで
//                    共有するとき、互いのデータを上書きしないように）
//   SITE_OWNER_NAME  代表者の名前（AIアドバイザーが相手を呼ぶときに使う）
//   SITE_AREA        拠点の地域             例: 東京
//   SITE_FOUNDED     設立年                 例: 2026年設立
//   SITE_DESCRIPTION 事業の一言説明         例: クリエイティブ／DX支援カンパニー
//   SITE_LOOKALIKES  綴りが似ている別の会社（カンマ区切り）。AIO計測で
//                    「同名の別会社の話」を自社の出現と数えないために使う。
//                    例: Lumentum,Lumenium LLC,ルメンタム

const env = (name) => (process.env[name] || '').trim()

/* Lumenium 自身の値。社名（SITE_NAME）が Lumenium のまま（または未設定）の
   ときだけ使います。社名を差し替えたサイトに、Lumenium の読み・代表者名・
   通知先・リポジトリが紛れ込まないようにするためです（紛れ込むと、別の
   会社のお問い合わせが Lumenium に届きます）。 */
const LUMENIUM = {
  kana: 'ルメニウム',
  url: 'https://lumenium.net',
  ownerName: '山本捷真',
  area: '東京',
  founded: '2026年設立',
  description: 'クリエイティブ／DX支援カンパニー',
  owner: 'shoma.yamamoto@lumenium.net',
  repo: 'shomayamamoto-ai/lumenium-app',
  // 似た名前の別会社（AIO計測で「同名の別会社の話」を自社と数えないため）。
  lookalikes: 'Lumentum,Lumenium LLC,ルメンタム',
}

/** 環境変数（の形のもの）から、このサイトの名前と住所を作ります。
 *  テストでは別の値を渡して、既定値の切り替わりを確かめます。 */
export function makeBrand(get = env) {
  const v = (n) => String(get(n) || '').trim()
  const name = v('SITE_NAME') || 'Lumenium'
  const isLumenium = name === 'Lumenium'
  const lum = (k) => (isLumenium ? LUMENIUM[k] : '')
  // URL は形が要るので、Lumenium 以外で未設定なら仮の値にします
  // （設定状況で「要対応」になります）。
  const rawUrl = v('SITE_URL') || lum('url') || 'https://example.com'
  let url = rawUrl.replace(/\/+$/, '')
  let host
  try { host = new URL(url).hostname } catch (_) { url = 'https://example.com'; host = 'example.com' }
  return {
    name,
    // Lumenium 自身のサイトか（Lumenium 固有の既定値を使ってよいか）。
    isLumenium,
    ownerName: v('SITE_OWNER_NAME') || lum('ownerName'),
    area: v('SITE_AREA') || lum('area'),
    founded: v('SITE_FOUNDED') || lum('founded'),
    description: v('SITE_DESCRIPTION') || lum('description'),
    kana: v('SITE_NAME_KANA') || lum('kana'),
    url,
    host,
    // SITE_URL が設定されているか（Lumenium 以外で未設定なら仮のURLです）。
    urlSet: !!v('SITE_URL') || isLumenium,
    lookalikes: (v('SITE_LOOKALIKES') || lum('lookalikes')).split(/[,、]/).map((s) => s.trim()).filter(Boolean),
    // 通知の既定の宛先。Lumenium 以外では空（CONTACT_TO_EMAIL が要ります）。
    owner: v('OWNER_EMAIL') || lum('owner'),
    from: v('CONTACT_FROM_EMAIL') || `${name} <onboarding@resend.dev>`,
    repo: v('GITHUB_REPO') || lum('repo'),
    // ファイル名やUser-Agentに使う、記号を含まない形。
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site',
  }
}

export const BRAND = makeBrand()

/** 文章に出す呼び名。読みがあれば「読み（社名）」、無ければ社名だけ。 */
export function brandLabel(b = BRAND, order = 'kana-first') {
  if (!b.kana || b.kana === b.name) return b.name
  return order === 'kana-first' ? `${b.kana}（${b.name}）` : `${b.name}（${b.kana}）`
}

/** Redis のキーの頭。既定の 'lum:' は、これまでに貯まったデータを
 *  そのまま読めるように変えていません。 */
export const KV = (env('KV_PREFIX') || 'lum').replace(/:+$/, '') + ':'
