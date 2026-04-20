import { useState } from 'react'
import { IconVideo, IconAI, IconSNS, IconWeb, IconCast, IconCreative } from './Icons'
import ServiceDetail from './ServiceDetail'
import { events } from '../lib/analytics'

const services = [
  {
    id: 'video',
    icon: <IconVideo />,
    title: '動画制作・映像編集',
    desc: 'PR・SNS・企業紹介・AI動画。企画から納品まで一貫対応。',
    partner: 'AdvoVisions',
    partnerUrl: 'https://advovisions.com/bcd31-home/',
    tags: ['PR動画', 'SNS動画', 'AI動画', '映像編集'],
    highlights: [
      '社内に映像チームがなく外注先を探している方',
      'SNS向けの短尺動画を量産したい方',
      '企業紹介・採用動画を丁寧に作りたい方',
    ],
    examples: [
      '登録者数十万人規模のYouTubeチャンネル動画制作',
      '有名飲食店での企画・映像制作',
      'AI企業PR動画',
      '就業支援・研修動画',
    ],
    price: '3万円〜(案件規模に応じてご提案)',
  },
  {
    id: 'ai',
    icon: <IconAI />,
    title: 'AI導入・研修',
    desc: '企業向けAI研修、教材制作、IT講師。現場目線で指導。',
    tags: ['AI研修', 'IT講師', '教材制作'],
    highlights: [
      'AIを業務に取り入れたいが何から始めるか迷っている方',
      '社員向けAIリテラシー研修を検討中の方',
      'AI教材・メルマガを内製化したい方',
    ],
    examples: [
      '企業向けAI活用メルマガ制作',
      'AI教材制作',
      '研修・就業支援動画のAI活用',
    ],
    price: '講師1回 10万円〜（教材費込）/ 交通費別途',
  },
  {
    id: 'sns',
    icon: <IconSNS />,
    title: 'SNS運用・LINE構築',
    desc: 'SNS運用代行、企画構成、LINE Bot制作。',
    tags: ['SNS運用', 'LINE Bot', '集客設計'],
    highlights: [
      '公式LINEで配信したいがやり方がわからない方',
      'SNSで集客したいが何を投稿すべきか不明な方',
      'シナリオ配信・セグメント配信を設計したい方',
    ],
    examples: [
      '企業公式LINE構築',
      'シナリオ型Bot制作',
      'SNS運用代行(月数十本投稿)',
    ],
    price: '初期 20万円〜 / 月額 10万円〜',
  },
  {
    id: 'web',
    icon: <IconWeb />,
    title: 'Web制作・アプリ開発',
    desc: 'HP、LP、Webアプリ、スマホアプリの開発。',
    tags: ['HP制作', 'LP', 'アプリ開発'],
    highlights: [
      '古いHPをリニューアルしたい方',
      'キャンペーン用のLPを短納期で作りたい方',
      '業務効率化のための社内ツールを開発したい方',
    ],
    examples: [
      '企業ホームページ制作',
      '業務用Webアプリ開発',
      'スマートフォンアプリ開発',
    ],
    price: '30万円〜(規模に応じてご提案)',
  },
  {
    id: 'cast',
    icon: <IconCast />,
    title: 'キャスト手配・イベント',
    desc: '在籍150名のモデル・アクター手配。MC、イベント企画運営。',
    partner: 'AdvoVisions',
    partnerUrl: 'https://advovisions.com/bcd31-home/',
    tags: ['モデル手配', 'MC', 'イベント企画'],
    highlights: [
      '撮影や配信にキャストを手配したい方',
      'MC・司会付きのイベントを企画中の方',
      '配信者・アイドルのプロデュース相談',
    ],
    examples: [
      'アイドルイベント主催',
      '配信者のプロデュース',
      '企業イベントのキャスト手配・MC',
    ],
    price: 'キャスト1名 5,000円〜 / イベント企画別途',
  },
  {
    id: 'creative',
    icon: <IconCreative />,
    title: 'クリエイティブ制作',
    desc: 'ロゴ、バナー、ポスター、イラスト、教材制作、作詞作曲。',
    tags: ['ロゴ', 'イラスト', 'ライター', '作詞作曲'],
    highlights: [
      '新ブランドのロゴ・アイデンティティを作りたい方',
      '書籍・ブログ用のライターを探している方',
      'イベント用の作詞・作曲を依頼したい方',
    ],
    examples: [
      '企業ロゴ・バナー・ポスター制作',
      '塾教材4万ページ制作(1ヶ月)',
      '作詞作曲・楽曲提供',
    ],
    price: '3万円〜(内容に応じてご提案)',
  },
]

export default function Services() {
  const [active, setActive] = useState(null)

  const openDetail = (s) => {
    events.ctaClick('service-card', s.title)
    setActive(s)
  }

  return (
    <section className="section" id="services">
      <div className="container">
        <div className="section-header" data-animate data-stroke="SERVICES">
          <p className="section-label">SERVICES</p>
          <h2 className="section-title">動画・AI・Webまで、<br />6領域をワンストップで。</h2>
          <p className="section-desc">複数の制作会社に発注する手間を1社に集約。企画から納品・運用までLumeniumが一貫して伴走します。</p>
        </div>
        <div className="services-grid">
          {services.map((s, i) => (
            <button
              key={s.title}
              className="card card--service"
              data-animate
              data-delay={i}
              onClick={() => openDetail(s)}
              type="button"
              aria-label={`${s.title}の詳細を見る`}
            >
              {s.partner && (
                <span className="partner-badge partner-badge--corner" aria-hidden="true">
                  <img src="/advovisions-logo.png" alt="" className="partner-logo" loading="lazy" decoding="async" /> {s.partner}
                </span>
              )}
              <div className="card-icon-lg">{s.icon}</div>
              <h3 className="card-title">{s.title}</h3>
              <p className="card-text">{s.desc}</p>
              <div className="card-bottom">
                <div className="card-tags">
                  {s.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
                {s.examples?.length > 0 && (
                  <div className="card-examples" aria-hidden="true">
                    <span className="card-examples-label">▸ 実績</span>
                    <ul>
                      {s.examples.slice(0, 3).map((e) => <li key={e}>{e}</li>)}
                    </ul>
                  </div>
                )}
                <span className="card-more">詳細を見る →</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {active && <ServiceDetail service={active} onClose={() => setActive(null)} />}
    </section>
  )
}
