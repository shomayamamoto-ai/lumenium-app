// Site content shared by the SPA components and the static page generator,
// so an indexable /pricing.html etc. can never drift from what the app shows.

export const CASE_STUDIES = [
  {
    tag: '教材制作',
    title: '1ヶ月で塾教材4万ページ制作',
    desc: '各教科の教師を含めた20人規模の人員を確保し、期限内に遂行しました。',
    metric: 40000,
    metricLabel: 'ページ / 1ヶ月',
  },
  {
    tag: 'AI講師',
    title: '研修・就業支援動画制作',
    desc: 'オンライン・オフライン・オンデマンドに対応。企業研修や就業支援向けの動画制作・講師を担当しました。',
  },
]

export const ACHIEVEMENTS = [
  '登録者数十万人規模のチャンネルの動画制作',
  '企業向けAI活用メルマガ制作',
  'AI教材制作',
  '企業ロゴ・バナー・ポスター制作',
  '企業公式LINE構築',
  'AI企業PR動画制作',
  'アプリ開発',
  '企業ホームページ制作',
  '有名飲食店での企画・映像制作',
  '配信者のプロデュース',
  'アイドルイベント主催',
  '作詞作曲',
]

export const TESTIMONIALS = [
  {
    text: '抽象的な相談から具体的な企画書に。スピード感に驚きです。',
    name: '飲食店経営者',
    detail: 'SNS運用・動画制作をご依頼',
    initial: 'T',
  },
  {
    text: 'AI活用の相談から研修まで。業務効率が目に見えて改善しました。',
    name: 'IT企業 マネージャー',
    detail: 'AI研修をご依頼',
    initial: 'M',
  },
  {
    text: 'LINE構築から配信まで一括対応。反応率が3倍になりました。',
    name: '美容サロン オーナー',
    detail: 'LINE Bot制作をご依頼',
    initial: 'K',
  },
  {
    text: '動画・LP・SNS運用を一社に任せられるのは、それだけで価値がありました。',
    name: '教育系企業 広報担当',
    detail: '採用動画・Web制作をご依頼',
    initial: 'S',
  },
  {
    text: '打ち合わせが穏やかで、話しやすかった。意図を汲んでくれる姿勢に助けられました。',
    name: '士業事務所',
    detail: 'コーポレートサイト制作',
    initial: 'N',
  },
]

// Text of the 5 steps. Flow.jsx pairs these with its inline SVG icons by index.
export const FLOW_STEPS = [
  {
    title: 'ご相談・お問い合わせ',
    desc: 'まずはメールやフォームから、困っていることを教えてください。抽象的な内容でも大丈夫です。',
    meta: { time: '即時', prep: '連絡手段のみ' },
    checks: [
      'お名前・ご連絡先だけでOK',
      '相談内容が決まっていなくても歓迎',
      '48時間以内にご返信',
    ],
  },
  {
    title: 'ヒアリング・お見積り',
    desc: 'オンライン or 対面で現状と目標をお伺いし、最適なプランと概算をご提案します。',
    meta: { time: '30〜60分', prep: '現状の課題メモ' },
    checks: [
      '参考資料があれば共有ください',
      'ご予算・希望スケジュールを確認',
      '24h以内に概算レンジをお伝え',
    ],
  },
  {
    title: 'ご契約・キックオフ',
    desc: '内容にご納得いただけたら契約へ。必要に応じてNDAを交わし、制作スケジュールを確定します。',
    meta: { time: '1〜3営業日', prep: 'NDA要否' },
    checks: [
      '仕様書と工程表を共有',
      '担当窓口を一本化',
      '着手金のご相談も対応',
    ],
  },
  {
    title: '制作・実行',
    desc: '企画→制作→レビューをサイクルで進行。中間共有で認識ズレを最小化します。',
    meta: { time: '2週間〜2ヶ月', prep: '定例1本分の時間' },
    checks: [
      'Slack / Chatwork / メールどれでも',
      '週1の進捗共有 + 随時レビュー',
      '修正回数は案件ごとに合意',
    ],
  },
  {
    title: '納品・運用サポート',
    desc: '納品後も、必要に応じて改善・運用代行・追加制作まで伴走します。',
    meta: { time: '継続可', prep: '—' },
    checks: [
      '納品データ一式をお渡し',
      '運用KPIのレビュー会も可',
      '追加のご相談はいつでも',
    ],
  },
]

export const PRICE_OPTIONS = [
  { key: 'video', label: '動画制作', sub: 'PR・SNS・企業紹介など', min: 30000, max: 300000, icon: '🎬' },
  { key: 'ai', label: 'AI導入・研修', sub: '講師1回+教材ベース', min: 100000, max: 300000, icon: '🤖' },
  { key: 'sns', label: 'SNS・LINE構築', sub: '初期+月額想定', min: 200000, max: 500000, icon: '💬' },
  { key: 'web', label: 'Web / LP 制作', sub: 'HP・LP・Webアプリ', min: 300000, max: 2000000, icon: '💻' },
  { key: 'cast', label: 'キャスト手配', sub: 'モデル・MC・イベント', min: 5000, max: 100000, icon: '🎭' },
  { key: 'creative', label: 'クリエイティブ', sub: 'ロゴ・バナー・ポスター他', min: 30000, max: 500000, icon: '🎨' },
]

// Pain points. Why.jsx pairs these with its inline SVG icons by index.
export const PAIN_POINTS = [
  {
    num: '01',
    title: 'SNSに弱い…',
    pain: 'SNSで集客したいけど何から始めればいいかわからない。',
    solution: '企画〜運用まで全てお任せ。',
    accent: '#2563eb',
  },
  {
    num: '02',
    title: '動画を作る時間がない…',
    pain: '動画を作りたいけど時間を割けない。',
    solution: '企画から納品まで一貫対応します。',
    accent: '#7c3aed',
  },
  {
    num: '03',
    title: 'LINEで発信したい…',
    pain: '公式LINEで発信したいがやり方がわからない。',
    solution: 'Bot制作から配信設計まで対応します。',
    accent: '#0891b2',
  },
]

export const BRAND_CHAPTERS = [
  {
    no: '01',
    eyebrow: 'NAME',
    title: '社名について',
    body: [
      'Lumenium（ルメニウム）は、ラテン語で「光」を意味する Lumen から取りました。',
      'お客様の中でまだ輪郭のない目的に、光を当てて形にしていく。',
      'それが、私たちの役割だと考えています。',
    ],
  },
  {
    no: '02',
    eyebrow: 'APPROACH',
    title: '対応領域',
    body: [
      '動画・AI・Web・SNS・キャスト手配・クリエイティブの6領域を扱っています。',
      '実際のプロジェクトでは、これらは一つの目的のもとで絡み合うことがほとんどです。',
      '複数社をまたぐ調整をお客様側で抱え込まずに済むよう、窓口を一本化しています。',
    ],
  },
  {
    no: '03',
    eyebrow: 'STANCE',
    title: '制作後の伴走',
    body: [
      '動画もサイトも LINE も、公開した時点では成果が出揃いません。',
      '数字が動き始めるまでには、運用とチューニングに時間がかかります。',
      '制作だけで終わらせず、運用フェーズまでご一緒できる体制を前提にしています。',
    ],
  },
]

export const POSITIONING_NOTES = [
  { k: '大手制作会社・広告代理店', v: '品質は高いが固定費が重く、最低発注額・最低契約期間のハードルが大きい。' },
  { k: 'クラウドソーシング・フリーランス', v: '安価で着手できるが、品質・進行・運用責任が分散しやすい。' },
  { k: 'Lumenium（ルメニウム）', v: '企画〜運用までワンストップ。大手品質のアウトプットを、必要な規模だけで提供します。' },
]

export const CAREER = [
  { year: '2019.4', detail: '慶應義塾大学 文学部 入学', sub: '経済新人会マーケ研 / 早稲田AI研究会' },
  { year: '在学中', detail: 'ADKビジコン・Microsoftビジコン入賞多数', sub: '' },
  { year: '2020.3〜', detail: '個人事業主として活動開始', sub: '動画 / SNS / AI開発' },
  { year: '2024.1', detail: '株式会社Link AI（業務委託）', sub: 'AIメディア事業部 PM / メルマガライター' },
  { year: '2026.3', detail: '慶應義塾大学 文学部 卒業', sub: '' },
  { year: '現在', detail: 'Lumenium（ルメニウム）設立', sub: '動画制作・DX支援・AI研修を軸に事業展開' },
]

export const PROFILE_BRICKS = [
  {
    label: 'EXPERTISE',
    title: '得意領域',
    text: 'AI活用の設計と現場実装、動画の企画・演出、業務自動化のためのLINE / Web開発。「目的→手段」の翻訳に強みがあります。',
    list: ['AI研修 (企業向け・エンジニア向け)', '動画企画・編集・配信設計', 'LINE Bot / Webアプリ開発'],
  },
  {
    label: 'BACKGROUND',
    title: 'バックグラウンド',
    text: '在学中から個人事業主として活動開始。マーケ・映像・AI開発を横断し、企業のAI導入コンサル、メディア運営 PM、ライター業を経て Lumenium（ルメニウム）を設立。',
    list: ['慶應義塾大学 文学部 卒業', 'ビジネスコンテスト入賞多数', '株式会社Link AI にて AI メディア PM'],
  },
  {
    label: 'PHILOSOPHY',
    title: '仕事観',
    text: '制作物は「成果への通り道」だと考えています。お客様の事業が前に進むことを最優先に、工程・関係・情報をなるべく透明にして伴走します。',
    list: ['まず「目的」を一緒に言語化する', '作って終わりではなく運用まで', '不透明な費用・工程を作らない'],
  },
]
