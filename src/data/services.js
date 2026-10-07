// Service cards — copy only. Services.jsx pairs each entry with its icon
// by id, so every sentence here is editable from the admin page.
// Order is the order of importance: システム開発・ホームページ制作 and AI研修 are the
// main lines; the rest are offered too, listed after them.
export const SERVICES = [
  {
    id: 'web',
    title: 'システム開発・ホームページ制作',
    desc: '予約・在庫・契約書・営業リストなど、手作業で回している仕事を仕組みにする**業務効率化システム**の開発と、ホームページ制作。公開後も自分たちで更新・分析できる管理画面をお付けできます。',
    tags: ['業務効率化', 'システム開発', 'HP制作'],
    highlights: [
      '紙やExcel、電話で回している業務を効率化したい方',
      '予約・在庫・顧客の管理を1つの仕組みにまとめたい方',
      '公開後の更新や分析を自分たちで行いたい方',
      '古いホームページをリニューアルしたい方',
    ],
    examples: [
      '業務効率化システムの開発',
      '予約・在庫・契約書などの管理システム',
      '企業ホームページ制作',
    ],
    price: 'システムはお見積り / サイト 60万円〜 / LP 30万円〜',
  },
  {
    id: 'ai',
    title: 'AI研修・AI導入支援',
    desc: '社員向けの生成AI研修（講師・教材制作）と、業務へのAI導入の支援。オンライン・対面のどちらにも対応します。',
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
    id: 'video',
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
      '企業PR動画',
      '就業支援・研修動画',
    ],
    price: '5万円〜(案件規模に応じてご提案)',
  },
  {
    id: 'sns',
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
    id: 'creative',
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
      '作詞作曲・楽曲提供',
    ],
    price: '3万円〜(内容に応じてご提案)',
  },
  {
    id: 'cast',
    title: 'キャスト手配・イベント',
    desc: '在籍150名のモデル・アクター手配。\nMC、イベント企画運営。',
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
]
