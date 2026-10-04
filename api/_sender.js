// メールの送信元についての判定と説明文。
//
// 設定状況（api/health.js）とテストボタン（api/settings-test.js）が同じ言葉で
// 同じ問題を説明するよう、1か所に置いています。
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

/* 送信元アドレスとそのドメイン。'Name <a@b>' と 'a@b' の両方を読みます。 */
export function senderInfo(from) {
  const m = /<([^>]+)>/.exec(String(from || ''))
  const address = (m ? m[1] : String(from || '')).trim()
  const domain = address.includes('@') ? address.split('@').pop().toLowerCase() : ''
  return { address, domain, sandbox: domain === 'resend.dev' }
}

/* 送信元が Resend の試用アドレスのときの説明。設定状況とテストで同じ文面を使います。 */
export const SANDBOX_NOTE =
  '送信元が Resend の試用アドレス（onboarding@resend.dev）のままです。この状態では、Resend に登録した本人のアドレス以外にはメールが届きません。' +
  'つまり、会員登録のお知らせ・予約の確認メール・問い合わせへの自動返信は、お客様に届いていません。'

export const DNS_STEPS =
  '直し方: ① resend.com › Domains › Add Domain で自社のドメイン（例: example.co.jp）を追加 ' +
  '② 表示された DNS の値（TXT と MX の数行）を、ドメインを買った会社（お名前.com・ムームードメインなど）の「DNS設定」に同じとおり追加 ' +
  '③ Resend の画面で Verify を押し、Verified になるまで待つ（数分〜数時間） ' +
  '④ Vercel の環境変数 CONTACT_FROM_EMAIL を「社名 <info@そのドメイン>」にして再デプロイ。'

