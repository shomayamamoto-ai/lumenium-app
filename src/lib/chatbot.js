// Local chat responder.
// The previous external service (line-bot-omega-liard.vercel.app) returns
// 403 "Host not in allowlist" for every browser origin, so the chat widget
// was effectively broken. This replaces it with a rule-based local responder
// keyed off the quick-reply labels that ship with ChatWidget.jsx.

const SERVICES_SUMMARY =
  '【サービス一覧】\n' +
  '① 動画制作・映像編集（3万円〜）\n' +
  '② AI導入・研修（講師1回10万円〜）\n' +
  '③ SNS運用・LINE構築（初期20万円〜／月10万円〜）\n' +
  '④ Web制作・アプリ開発（30万円〜）\n' +
  '⑤ キャスト手配・イベント（5,000円〜）\n' +
  '⑥ クリエイティブ制作（3万円〜）\n\n' +
  '気になる項目をタップしてください👇'

const RULES = [
  {
    match: /(サービス|一覧|何ができ|できること|メニュー)/,
    reply: () => SERVICES_SUMMARY,
  },
  {
    match: /(料金|価格|費用|見積|いくら|お金|プラン)/,
    reply: () =>
      '【料金の目安】\n' +
      '・動画制作：3万円〜\n' +
      '・Web制作：30万円〜\n' +
      '・AI研修：講師1回 10万円〜\n' +
      '・LINE構築：初期20万円／月10万円〜\n' +
      '・クリエイティブ：3万円〜\n\n' +
      '※ 内容・規模により変動します。お見積りは無料です。',
  },
  {
    match: /(AI|研修|教材|IT講師|リテラシー)/i,
    reply: () =>
      '【AI導入・研修】\n' +
      '・企業向けAI研修（管理職向け／全社員向け）\n' +
      '・AI教材／メルマガの内製化支援\n' +
      '・AI活用ワークショップ／IT講師派遣\n\n' +
      '「何から始めるべきか分からない」段階からのご相談も歓迎です。',
  },
  {
    match: /(動画|映像|PR|YouTube|ショート|編集)/,
    reply: () =>
      '【動画制作・映像編集】\n' +
      '・PR／SNSショート動画／企業紹介／採用動画\n' +
      '・AI動画の企画〜納品まで一貫対応\n' +
      '・登録者数十万人規模のYouTubeチャンネル制作実績あり\n\n' +
      '企画構成だけのご相談もOKです。',
  },
  {
    match: /(Web|HP|ホームページ|LP|ランディング|サイト|アプリ)/i,
    reply: () =>
      '【Web制作・アプリ開発】\n' +
      '・コーポレートサイト／LP／ECサイト\n' +
      '・業務効率化Webアプリ／スマホアプリ\n' +
      '・Next.js・React・Vercelによる高速構築\n\n' +
      '現行HPのリニューアル相談も承ります。',
  },
  {
    match: /(SNS|Instagram|TikTok|LINE|公式LINE|Bot|運用代行)/i,
    reply: () =>
      '【SNS運用・LINE構築】\n' +
      '・Instagram／TikTok／X の運用代行\n' +
      '・公式LINEのシナリオ配信・セグメント配信設計\n' +
      '・LINE Bot制作（AI応答対応）\n\n' +
      '「投稿ネタが思いつかない」レベルからご相談ください。',
  },
  {
    match: /(依頼|流れ|進め方|発注|納期|期間)/,
    reply: () =>
      '【ご依頼の流れ】\n' +
      '① お問い合わせ（フォーム／メール）\n' +
      '② ヒアリング（Zoom 30分・無料）\n' +
      '③ お見積り・ご提案\n' +
      '④ 制作・実装（進捗共有は週1）\n' +
      '⑤ 納品・運用サポート\n\n' +
      '最短2週間で納品可能な案件もあります。',
  },
  {
    match: /(問い合わせ|相談|連絡|メール|contact|支援)/i,
    reply: () =>
      'お問い合わせありがとうございます🙏\n' +
      '下記いずれかからご連絡ください：\n\n' +
      '① ページ下部の「お問い合わせフォーム」\n' +
      '② メール：contact@lumenium.net\n\n' +
      '48時間以内にご返信いたします。',
  },
  {
    match: /(キャスト|モデル|MC|司会|イベント|撮影)/,
    reply: () =>
      '【キャスト手配・イベント】\n' +
      '・モデル／アクター／MC／司会の手配（在籍150名）\n' +
      '・アイドル／配信者のプロデュース\n' +
      '・企業イベントの企画・運営\n\n' +
      '撮影現場のキャスト手配だけのご相談もOKです。',
  },
  {
    match: /(ロゴ|バナー|ポスター|イラスト|作詞|作曲|ライター|クリエイティブ)/,
    reply: () =>
      '【クリエイティブ制作】\n' +
      '・ロゴ／バナー／ポスター／イラスト\n' +
      '・ライティング（書籍・ブログ・教材）\n' +
      '・作詞作曲・楽曲提供\n\n' +
      '塾教材4万ページを1ヶ月で制作した実績もあります。',
  },
  {
    match: /(こんにちは|はじめまして|hello|hi|こんばんは|おはよう)/i,
    reply: () =>
      'こんにちは！Lumenium（ルーメニウム）です💡\n' +
      '「ぼんやりした悩みに光を当てる」をテーマに、\n' +
      '企画から運用までワンストップでお手伝いします。\n\n' +
      '下のボタンから知りたい情報をお選びください。',
  },
  {
    match: /(ありがとう|助かった|感謝|thanks)/i,
    reply: () =>
      'こちらこそ、お問い合わせいただきありがとうございます😊\n' +
      '他にも気になる点があれば、お気軽にお知らせください。',
  },
]

const FALLBACK =
  'ご質問ありがとうございます。\n' +
  'より詳しくお答えしたいので、下のボタンから近いトピックをお選びいただくか、\n' +
  'ページ下部の「お問い合わせフォーム」からご連絡ください（48時間以内にご返信）。'

export function replyTo(message) {
  const text = String(message || '').trim()
  if (!text) return FALLBACK
  // Web-form submissions from ContactForm carry this prefix
  if (text.startsWith('【Webフォーム】')) {
    return 'お問い合わせありがとうございます。48時間以内にご返信いたします。'
  }
  for (const rule of RULES) {
    if (rule.match.test(text)) return rule.reply(text)
  }
  return FALLBACK
}
