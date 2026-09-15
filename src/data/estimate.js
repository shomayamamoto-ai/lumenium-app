// Structured pricing for the estimator.
//
// "3万円〜" tells a visitor nothing they can act on, and asking for a quote to
// find out is the step most people will not take. These are the same published
// figures broken into a base and a set of multipliers, so a visitor can reach a
// real range on their own.
//
// `base` is the published floor for that service and must stay equal to the
// number in src/data/services.js — the estimator contradicting the price list
// would be worse than having no estimator. The range is deliberately wide and
// labelled as an estimate: it exists to start a conversation, not to quote.

export const SPREAD = 1.6   // the top of the range, as a multiple of the bottom

export const ESTIMATE = [
  {
    id: 'video',
    title: '動画制作・映像編集',
    base: 30000,
    unitNote: '1本あたり',
    steps: [
      {
        key: 'kind', label: 'つくるもの', options: [
          { id: 'sns', label: 'SNS用の短尺（〜60秒）', mul: 1 },
          { id: 'pr', label: '会社紹介・PR動画（2〜3分）', mul: 2.6 },
          { id: 'recruit', label: '採用動画（3〜5分）', mul: 3.4 },
          { id: 'event', label: 'イベント記録・ダイジェスト', mul: 2.2 },
        ],
      },
      {
        key: 'shoot', label: '撮影', options: [
          { id: 'none', label: '素材はこちらで用意（編集のみ）', mul: 1 },
          { id: 'half', label: '半日ロケ', mul: 1.9 },
          { id: 'full', label: '1日ロケ', mul: 2.8 },
        ],
      },
      {
        key: 'vol', label: '本数', options: [
          { id: '1', label: '1本', mul: 1 },
          { id: '3', label: '3本', mul: 2.6 },
          { id: '6', label: '6本以上（継続）', mul: 4.6 },
        ],
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI導入・研修',
    base: 100000,
    unitNote: '研修1回あたり',
    steps: [
      {
        key: 'kind', label: '内容', options: [
          { id: 'intro', label: '導入研修（半日）', mul: 1 },
          { id: 'deep', label: '実務ハンズオン（1日）', mul: 1.8 },
          { id: 'series', label: '連続講座（全4回）', mul: 5.2 },
        ],
      },
      {
        key: 'size', label: '受講人数', options: [
          { id: 's', label: '〜10名', mul: 1 },
          { id: 'm', label: '11〜30名', mul: 1.3 },
          { id: 'l', label: '31名以上', mul: 1.7 },
        ],
      },
      {
        key: 'material', label: '教材', options: [
          { id: 'std', label: '標準教材', mul: 1 },
          { id: 'custom', label: '自社業務に合わせて作成', mul: 1.6 },
        ],
      },
    ],
  },
  {
    id: 'sns',
    title: 'SNS運用・LINE構築',
    base: 200000,
    unitNote: '初期費用',
    monthlyBase: 100000,
    steps: [
      {
        key: 'kind', label: '対象', options: [
          { id: 'sns', label: 'SNS運用代行', mul: 1 },
          { id: 'line', label: 'LINE公式アカウント構築', mul: 1.2 },
          { id: 'both', label: '両方', mul: 1.8 },
        ],
      },
      {
        key: 'freq', label: '投稿頻度', options: [
          { id: 'w1', label: '週1回', mul: 1 },
          { id: 'w3', label: '週3回', mul: 1.7 },
          { id: 'd1', label: 'ほぼ毎日', mul: 2.6 },
        ],
      },
      {
        key: 'prod', label: '制作範囲', options: [
          { id: 'plan', label: '企画・投稿のみ', mul: 1 },
          { id: 'design', label: '画像制作も含む', mul: 1.4 },
          { id: 'movie', label: '動画制作も含む', mul: 1.9 },
        ],
      },
    ],
  },
  {
    id: 'web',
    title: 'Web制作・システム開発',
    base: 300000,
    unitNote: '一式',
    steps: [
      {
        key: 'kind', label: 'つくるもの', options: [
          { id: 'lp', label: 'ランディングページ（1枚）', mul: 1 },
          { id: 'site', label: 'コーポレートサイト', mul: 2.2 },
          { id: 'system', label: '業務システム・Webアプリ', mul: 4.5 },
        ],
      },
      {
        key: 'pages', label: '規模', options: [
          { id: 's', label: '〜5ページ / 小規模', mul: 1 },
          { id: 'm', label: '6〜15ページ / 中規模', mul: 1.6 },
          { id: 'l', label: '16ページ以上 / 大規模', mul: 2.4 },
        ],
      },
      {
        key: 'extra', label: '追加', options: [
          { id: 'none', label: 'なし', mul: 1 },
          { id: 'cms', label: '自分で更新できる仕組み（CMS）', mul: 1.35 },
          { id: 'form', label: '予約・決済などの機能', mul: 1.7 },
        ],
      },
    ],
  },
  {
    id: 'cast',
    title: 'キャスト手配・イベント',
    base: 5000,
    unitNote: 'キャスト1名・1日あたり',
    steps: [
      {
        key: 'kind', label: '依頼内容', options: [
          { id: 'staff', label: 'イベントスタッフ', mul: 1 },
          { id: 'model', label: 'モデル・コンパニオン', mul: 2.4 },
          { id: 'mc', label: 'MC・司会', mul: 6 },
        ],
      },
      {
        key: 'count', label: '人数', options: [
          { id: '1', label: '1〜2名', mul: 1 },
          { id: '5', label: '3〜5名', mul: 3.2 },
          { id: '10', label: '6名以上', mul: 6.5 },
        ],
      },
      {
        key: 'plan', label: '企画・運営', options: [
          { id: 'none', label: '手配のみ', mul: 1 },
          { id: 'plan', label: '企画から依頼したい', mul: 4 },
        ],
      },
    ],
  },
  {
    id: 'creative',
    title: 'クリエイティブ制作',
    base: 30000,
    unitNote: '一式',
    steps: [
      {
        key: 'kind', label: 'つくるもの', options: [
          { id: 'banner', label: 'バナー・SNS画像', mul: 1 },
          { id: 'logo', label: 'ロゴ', mul: 3 },
          { id: 'poster', label: 'ポスター・チラシ', mul: 2 },
          { id: 'music', label: '作詞・作曲', mul: 4 },
        ],
      },
      {
        key: 'vol', label: '点数', options: [
          { id: '1', label: '1点', mul: 1 },
          { id: '3', label: '3点', mul: 2.4 },
          { id: '10', label: '10点以上', mul: 6 },
        ],
      },
      {
        key: 'rev', label: '修正', options: [
          { id: 'std', label: '2〜3回（標準）', mul: 1 },
          { id: 'many', label: '納得いくまで', mul: 1.5 },
        ],
      },
    ],
  },
]

export const BY_ID = Object.fromEntries(ESTIMATE.map((e) => [e.id, e]))

/** Round to a step that suits the magnitude. A flat ¥10,000 grain pushed the
 *  ¥5,000 cast floor up to ¥10,000 — the estimator must never quote above a
 *  price the site publishes. */
const grain = (n) => (n < 100000 ? 1000 : 10000)
const roundTo = (n) => Math.round(n / grain(n)) * grain(n)

/** Multiply the base by one option from each step. Returns the bottom of the
 *  range; the top is SPREAD times it. */
export function calculate(service, picks) {
  const svc = BY_ID[service]
  if (!svc) return null
  let mul = 1
  for (const step of svc.steps) {
    const chosen = step.options.find((o) => o.id === picks[step.key])
    if (!chosen) return null
    mul *= chosen.mul
  }
  const low = Math.max(svc.base, roundTo(svc.base * mul))
  return {
    low,
    high: Math.max(low, roundTo(low * SPREAD)),
    monthly: svc.monthlyBase ? roundTo(svc.monthlyBase * mul) : null,
  }
}

export const yen = (n) => '¥' + n.toLocaleString('ja-JP')

/** The line the enquiry carries, so it arrives already qualified. */
export function summarise(service, picks, result) {
  const svc = BY_ID[service]
  if (!svc || !result) return ''
  const lines = svc.steps.map((step) => {
    const chosen = step.options.find((o) => o.id === picks[step.key])
    return `・${step.label}: ${chosen ? chosen.label : '-'}`
  })
  const money = result.monthly
    ? `初期 ${yen(result.low)}〜${yen(result.high)} / 月額 ${yen(result.monthly)}〜`
    : `${yen(result.low)}〜${yen(result.high)}`
  return [`【${svc.title}】の概算見積り`, ...lines, `概算: ${money}（${svc.unitNote}）`].join('\n')
}
