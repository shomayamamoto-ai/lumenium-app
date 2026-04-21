// Lightweight article metadata (for home teaser + list pages, no content body).
export const articlesMeta = [
  { id: 1, slug: 'ai-intro-checklist', date: '2026.04.04', category: 'AI活用', title: "AI導入前に知るべき3つのこと", summary: "AI導入で押さえるべきポイントを解説。" },
  { id: 2, slug: 'chatgpt-business-cautions', date: '2026.04.01', category: 'AI活用', title: "ChatGPT業務利用の注意点5選", summary: "業務利用時のセキュリティと品質管理。" },
  { id: 3, slug: 'sns-marketing-3-steps', date: '2026.03.25', category: 'SNS運用', title: "SNS集客の始め方3ステップ", summary: "投稿前に整えるべきことを解説。" },
  { id: 4, slug: 'corporate-pr-video-tips', date: '2026.03.18', category: '動画制作', title: "企業PR動画のコツ", summary: "効果的なPR動画のコツと失敗パターン。" },
  { id: 5, slug: 'sns-outsourcing-guide', date: '2026.03.25', category: 'SNS運用', title: "SNS運用の外注ガイド", summary: "外注のメリットと業者選びのコツ。" },
  { id: 6, slug: 'line-official-sales', date: '2026.03.20', category: 'LINE構築', title: "公式LINEで売上を伸ばす方法", summary: "売上につながる具体的な活用法。" },
  { id: 7, slug: 'web-renewal-signs', date: '2026.03.15', category: 'Web制作', title: "HPリニューアルの5つのサイン", summary: "リニューアルが必要なサインを解説。" },
  { id: 8, slug: 'sns-video-first-3-seconds', date: '2026.04.15', category: '動画制作', title: "SNS動画の「最初の3秒」で離脱を防ぐ設計", summary: "スマホ縦型動画で視聴維持率を上げるフック設計のコツ。" },
  { id: 9, slug: 'line-delivery-design', date: '2026.04.12', category: 'LINE運用', title: "公式LINEが「ただの通知」にならない配信設計", summary: "購読解除を抑えつつ反応率を上げるシナリオ配信の考え方。" },
  { id: 10, slug: 'sns-post-checklist', date: '2026.04.08', category: 'SNS運用', title: "SNSで「刺さる投稿」を考える前に確認したい3項目", summary: "投稿の質を上げる前に、そもそもの設計を見直すチェックリスト。" },
  { id: 11, slug: 'recruit-video-techniques', date: '2026.04.02', category: '採用・ブランディング', title: "採用動画で「会社の空気」まで伝える構成テクニック", summary: "応募率と定着率を同時に上げる、採用コンテンツの作り方。" },
]

export function getArticlesMetaSorted() {
  return [...articlesMeta].sort((a, b) => b.date.localeCompare(a.date))
}

export function getMetaBySlug(slug) {
  return articlesMeta.find(a => a.slug === slug) || null
}

export const ALL_CATEGORY = 'すべて'
