// お問い合わせフォームで選べるものの対応表。
//
// 画面から来た値をそのまま信じず、ここにあるものだけを通します。件名や
// 予定のタイトルに入る値なので、任意の文字列を通すわけにいきません。
//
// 画面側（src/data/site.js の ORG_TYPES / TOPICS）と id を揃えてあります。
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

export const ORG_LABELS = {
  company: '法人',
  sole: '個人事業主',
  personal: '個人',
  other: 'その他',
}

export const TOPIC_LABELS = {
  video: '動画制作',
  ai: 'AI導入・研修',
  sns: 'SNS運用・LINE',
  web: 'Web制作・システム',
  cast: 'キャスト手配',
  creative: 'ロゴ・バナー',
  undecided: 'まだ決まっていない',
}

/** 選ばれたジャンルを、表示用の日本語にする。知らない値は落とします。 */
export function pickTopics(list) {
  return (Array.isArray(list) ? list : [])
    .map((t) => TOPIC_LABELS[String(t)])
    .filter(Boolean)
    .slice(0, 7)
}

export const orgLabel = (id) => ORG_LABELS[String(id)] || ''
