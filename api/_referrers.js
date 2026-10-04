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

/** AI アシスタントの回答から来た。いまいちばん知りたい列。
 *  ホスト名は track.js で先頭の www. を落としてから届きます。
 *  値は画面に出す呼び名です（ホスト名のままだと、お客様には
 *  「gemini.google.com」が何なのか分かりません）。 */
export const AI_HOSTS = {
  'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'openai.com': 'OpenAI',
  'perplexity.ai': 'Perplexity',
  'gemini.google.com': 'Gemini', 'bard.google.com': 'Gemini', 'aistudio.google.com': 'Gemini',
  'notebooklm.google.com': 'NotebookLM',
  'copilot.microsoft.com': 'Copilot', 'copilot.cloud.microsoft': 'Copilot', 'm365.cloud.microsoft': 'Copilot',
  'claude.ai': 'Claude',
  'poe.com': 'Poe', 'you.com': 'You.com', 'felo.ai': 'Felo', 'genspark.ai': 'Genspark', 'phind.com': 'Phind',
  'deepseek.com': 'DeepSeek', 'chat.deepseek.com': 'DeepSeek',
  'grok.com': 'Grok', 'x.ai': 'Grok',
  'mistral.ai': 'Le Chat', 'chat.mistral.ai': 'Le Chat',
  'kagi.com': 'Kagi', 'duck.ai': 'Duck.ai',
  'meta.ai': 'Meta AI', 'chat.qwen.ai': 'Qwen', 'kimi.com': 'Kimi', 'kimi.moonshot.cn': 'Kimi',
}

/** 画面に出す呼び名。一覧に無ければホスト名のまま。 */
export function aiName(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  if (AI_HOSTS[h]) return AI_HOSTS[h]
  if (h.startsWith('src:') && SOURCES[h.slice(4)]) return SOURCES[h.slice(4)][0]
  if (h.endsWith('.perplexity.ai')) return 'Perplexity'
  return h
}

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
  { key: 'ai', label: 'AIアシスタントから', note: 'ChatGPT・Perplexity・Gemini・Copilot・Claude などの回答に載って、そこから来た人。AIO対策が効いているかは、ここが動くかで分かります。' },
  { key: 'search', label: '検索エンジンから', note: 'Google・Yahoo・Bing の検索結果から。GoogleのAIによる概要から来た人も、Googleが区別を教えないためここに入ります。' },
  { key: 'social', label: 'SNS・LINEから', note: 'X・Instagram・LINE・YouTube などの投稿やプロフィール欄のリンクから。' },
  { key: 'referral', label: '他のサイトから', note: '掲載先・紹介記事・ディレクトリなど。増えると外部掲載が効いている証拠です。' },
  { key: 'direct', label: '直接・不明', note: 'URLを直接入力、ブックマーク、QRコード、メールやアプリ内のリンクなど。紹介元が送られてこない経路はすべてここです。' },
]

/* 計測用リンク（?ref=名前）から来た人。紹介元を送ってこないアプリ内の
   リンクやQRコードも、どこから来たかが分かるようにするためのものです。
   流入元の一覧には「src:instagram」のように入り、名前から種類を決めます。 */
export const SOURCES = {
  instagram: ['Instagram', 'social'], 'instagram-post': ['Instagram 投稿', 'social'],
  x: ['X（旧Twitter）', 'social'], line: ['LINE', 'social'], facebook: ['Facebook', 'social'],
  youtube: ['YouTube', 'social'], tiktok: ['TikTok', 'social'], note: ['note', 'social'],
  gbp: ['Googleビジネスプロフィール', 'search'],
  card: ['名刺（QR）', 'direct'], flyer: ['チラシ・資料（QR）', 'direct'],
  mail: ['メール署名', 'direct'], seminar: ['セミナー・登壇', 'direct'],
  // SNS の投稿から貼ったリンク（SNS の画面が ?ref= に付ける名前）。
  threads: ['Threads', 'social'], linkedin: ['LinkedIn', 'social'],
  // AI に自分で載せたリンク（?ref=chatgpt など）。紹介元を送らないアプリから
  // 来ても「AIアシスタントから」に入るように。
  chatgpt: ['ChatGPT', 'ai'], perplexity: ['Perplexity', 'ai'], gemini: ['Gemini', 'ai'],
  copilot: ['Copilot', 'ai'], claude: ['Claude', 'ai'],
}

/** 計測用の名前（?ref= / ?utm_source=）を、流入元の一覧に入れる形にする。
 *
 *  名前なら「src:名前」。ホスト名の形をしていれば、紹介元のホスト名と同じ
 *  扱いにします——ChatGPT はリンクに utm_source=chatgpt.com を付けて送り
 *  出し、スマホのアプリから開かれたときは紹介元が空で届くので、手がかりは
 *  この値しかありません。以前は「.」を含む値を捨てていたため、アプリ経由の
 *  ChatGPT の訪問は「直接・不明」に入っていました。
 *
 *  どちらの形でもない値は null（呼び出し側は紹介元のほうを使います）。 */
export function sourceKey(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (/^[a-z0-9_-]{1,32}$/.test(s)) return `src:${s}`
  if (s.length <= 60 && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(s)) return s.replace(/^www\./, '')
  return null
}

/** ホスト名を5種類のどれかに割り当てる。'direct' は「分からない」も含む。 */
export function refKind(host) {
  const h = String(host || '').toLowerCase()
  if (!h || h === 'direct') return 'direct'
  if (h.startsWith('src:')) return (SOURCES[h.slice(4)] || [null, 'referral'])[1]
  if (AI_HOSTS[h.replace(/^www\./, '')] || h.endsWith('.perplexity.ai')) return 'ai'
  if (SEARCH.some((re) => re.test(h))) return 'search'
  if (SOCIAL.includes(h)) return 'social'
  return 'referral'
}
