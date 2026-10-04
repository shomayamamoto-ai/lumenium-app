// このサイトの「名前と住所」。
//
// 社名・ドメイン・宛先・リポジトリが各ファイルに直接書かれていると、
// 同じ仕組みを別の会社のサイトに載せるたびに十数か所を探して書き換える
// ことになり、1か所の直し漏れで、お客様のフォームの通知が別の会社に
// 届きます。ここに集め、Vercel の環境変数で上書きできるようにしています。
// 何も設定しなければ、これまでどおり Lumenium の値です。
//
//   SITE_NAME        社名（英字）           例: Lumenium
//   SITE_NAME_KANA   社名の読み             例: ルメニウム
//   SITE_URL         公開URL               例: https://lumenium.net
//   OWNER_EMAIL      通知の既定の宛先（CONTACT_TO_EMAIL が無いとき）
//   CONTACT_FROM_EMAIL 送信元               例: Lumenium <info@example.com>
//   GITHUB_REPO      文章・お知らせを保存するリポジトリ  例: owner/repo
//   KV_PREFIX        Redis のキーの頭（1つのデータベースを複数サイトで
//                    共有するとき、互いのデータを上書きしないように）
//   SITE_LOOKALIKES  綴りが似ている別の会社（カンマ区切り）。AIO計測で
//                    「同名の別会社の話」を自社の出現と数えないために使う。
//                    例: Lumentum,Lumenium LLC,ルメンタム

const env = (name) => (process.env[name] || '').trim()

const name = env('SITE_NAME') || 'Lumenium'
const url = (env('SITE_URL') || 'https://lumenium.net').replace(/\/+$/, '')

/* 似た名前の別会社。既定の一覧は Lumenium のものなので、社名を差し替えた
   サイトにまで持ち込むと、関係のない「Lumentum」を除外し続けることに
   なります。社名が既定のままのときだけ既定の一覧を使います。 */
const LUMENIUM_LOOKALIKES = 'Lumentum,Lumenium LLC,ルメンタム'
const lookalikes = (env('SITE_LOOKALIKES') || (name === 'Lumenium' ? LUMENIUM_LOOKALIKES : ''))
  .split(/[,、]/).map((s) => s.trim()).filter(Boolean)

export const BRAND = {
  name,
  kana: env('SITE_NAME_KANA') || 'ルメニウム',
  url,
  host: new URL(url).hostname,
  lookalikes,
  owner: env('OWNER_EMAIL') || 'shoma.yamamoto@lumenium.net',
  from: env('CONTACT_FROM_EMAIL') || `${name} <onboarding@resend.dev>`,
  repo: env('GITHUB_REPO') || 'shomayamamoto-ai/lumenium-app',
  // ファイル名やUser-Agentに使う、記号を含まない形。
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site',
}

/** Redis のキーの頭。既定の 'lum:' は、これまでに貯まったデータを
 *  そのまま読めるように変えていません。 */
export const KV = (env('KV_PREFIX') || 'lum').replace(/:+$/, '') + ':'
