// 会社そのものの、機械が読む形の記述。
//
// これまで2つの生成スクリプトが同じ内容を別々に持っていて、片方だけ直ると
// ページによって会社情報が違う、という事故が起きる形でした。1か所にします。
//
// ここに入れてよいのは、サイトのどこかに人間向けにも書いてある事実だけです。
// 構造化データにしか無い主張は、読み合わせたときに裏が取れず、かえって
// 「確認できない会社」の側に寄せてしまいます。

import { PRICE_OPTIONS, PROFILES } from './site.js'

export const SITE = 'https://lumenium.net'

const yen = (n) => String(n)

/** schema.org の Organization。全ページに同じものが入ります。 */
export function orgNode() {
  return {
    '@type': 'Organization',
    '@id': `${SITE}/#organization`,
    name: 'Lumenium',
    alternateName: ['ルメニウム', 'Lumenium（ルメニウム）'],
    url: SITE,
    // 業種。「東京の制作会社」という聞かれ方に対して、何屋かを型でも示す。
    additionalType: 'https://schema.org/ProfessionalService',
    slogan: '散文化した目的に、焦点を当てる。',
    description:
      'ルメニウム（Lumenium）は、東京都を拠点に動画制作・AI導入研修・SNS運用・LINE構築・Web制作・キャスト手配・クリエイティブ制作を、企画から納品・運用までワンストップで手がける日本のクリエイティブ／DX支援カンパニーです。',
    foundingDate: '2026',
    founder: { '@type': 'Person', name: '山本 捷真', jobTitle: '代表' },
    address: { '@type': 'PostalAddress', addressRegion: '東京都', addressCountry: 'JP' },
    foundingLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressRegion: '東京都', addressCountry: 'JP' },
    },
    areaServed: [
      { '@type': 'Country', name: 'Japan' },
      { '@type': 'AdministrativeArea', name: '東京都' },
    ],
    knowsAbout: [
      '動画制作', '採用動画', '生成AI研修', 'AI導入支援', 'SNS運用代行',
      'LINE公式アカウント構築', 'Web制作', '業務システム開発', 'キャスト手配', 'ロゴ制作',
    ],
    // 何をいくらで提供しているか。料金ページに書いてある数字と同じものです。
    makesOffer: PRICE_OPTIONS.map((o) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: o.label, description: o.sub },
      priceCurrency: 'JPY',
      priceSpecification: {
        '@type': 'PriceSpecification',
        minPrice: yen(o.min),
        maxPrice: yen(o.max),
        priceCurrency: 'JPY',
      },
      areaServed: { '@type': 'Country', name: 'Japan' },
    })),
    // 連絡先は問い合わせフォーム。メールアドレスと電話は、特定商取引法の
    // 表記のとおり、取引が発生した際に請求に応じて開示します。
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${SITE}/contact.html`,
      availableLanguage: ['ja'],
    },
    logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` },
    // 公式アカウントのURL。空のあいだは項目ごと出しません（空配列は
    // 「どこにも載っていない」と明示することになるため）。
    ...(PROFILES.length ? { sameAs: PROFILES } : {}),
  }
}

export const ORG_NODE = orgNode()
