// 「どこから来たか」を、意味のある単位にまとめる。
//
// これまで流入元はホスト名のまま並べていました。google.com と
// chatgpt.com と x.com が同じ列に並ぶので、いちばん知りたい
// 「AI に紹介されて来た人がいるか」が読み取れません。いまの
// Lumenium の目的は AIO（AIの回答に載ること）なので、そこだけは
// 独立して数えられる必要があります。
//
// 正直に書いておくべき限界がひとつあります。Google の AI による
// 概要（AI Overviews）から来た人は、紹介元が google.com のままで
// 届きます。Google 側がそれ以上を教えてくれないので、ここでは
// 「検索エンジン」に入ります。AI 経由として数えられるのは、
// ChatGPT や Perplexity のように独立したサイトから来た場合だけです。

/** AI の回答から来た。いまいちばん知りたい列。 */
const AI = [
  'chatgpt.com', 'chat.openai.com', 'openai.com',
  'perplexity.ai', 'www.perplexity.ai',
  'gemini.google.com', 'bard.google.com', 'notebooklm.google.com',
  'copilot.microsoft.com', 'claude.ai', 'poe.com',
  'you.com', 'felo.ai', 'genspark.ai', 'phind.com',
  'deepseek.com', 'chat.deepseek.com', 'grok.com', 'x.ai',
  'mistral.ai', 'chat.mistral.ai', 'kagi.com',
]

/** 検索エンジン。google.co.jp のような国別ドメインも拾う。 */
const SEARCH = [
  /^google\./, /^www\.google\./,
  /^bing\.com$/, /^search\.yahoo\./, /^yahoo\.co\.jp$/,
  /^duckduckgo\.com$/, /^search\.brave\.com$/, /^ecosia\.org$/,
  /^baidu\.com$/, /^search\.naver\.com$/, /^yandex\./,
]

/** SNS・メッセージアプリ。 */
const SOCIAL = [
  'x.com', 'twitter.com', 't.co', 'facebook.com', 'm.facebook.com', 'l.facebook.com',
  'instagram.com', 'l.instagram.com', 'threads.net', 'threads.com',
  'line.me', 'lin.ee', 'liff.line.me',
  'youtube.com', 'm.youtube.com', 'tiktok.com', 'linkedin.com', 'lnkd.in',
  'note.com', 'pinterest.com', 'reddit.com', 'hatena.ne.jp', 'b.hatena.ne.jp',
]

export const REF_KINDS = [
  { key: 'ai', label: 'AI検索から', note: 'ChatGPT・Perplexity などの回答に載って、そこから来た人。AIO対策が効いているかは、ここが動くかで分かります。' },
  { key: 'search', label: '検索エンジンから', note: 'Google・Yahoo・Bing の検索結果から。GoogleのAIによる概要から来た人も、Googleが区別を教えないためここに入ります。' },
  { key: 'social', label: 'SNS・LINEから', note: 'X・Instagram・LINE・YouTube などの投稿やプロフィール欄のリンクから。' },
  { key: 'referral', label: '他のサイトから', note: '掲載先・紹介記事・ディレクトリなど。増えると外部掲載が効いている証拠です。' },
  { key: 'direct', label: '直接・不明', note: 'URLを直接入力、ブックマーク、QRコード、メールやアプリ内のリンクなど。紹介元が送られてこない経路はすべてここです。' },
]

/** ホスト名を5種類のどれかに割り当てる。'direct' は「分からない」も含む。 */
export function refKind(host) {
  const h = String(host || '').toLowerCase()
  if (!h || h === 'direct') return 'direct'
  if (AI.includes(h) || h.endsWith('.perplexity.ai')) return 'ai'
  if (SEARCH.some((re) => re.test(h))) return 'search'
  if (SOCIAL.includes(h)) return 'social'
  return 'referral'
}
