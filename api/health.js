export const config = { runtime: 'edge' }

// What is configured, and what is quietly broken.
//
// Every panel used to discover its own misconfiguration and say so in its own
// words, so the only way to learn what was set up was to open all six and read
// six different errors. Worse, two of the environment variables fall back to
// values published in the repository, and nothing anywhere said so.
//
// This never returns a secret. Each check reports only whether a value is
// present, and the counts come from the same store as the analytics.

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig, pipeline, lastDays, jstDate, K } from './_analytics-store.js'
import { listShares } from './_share.js'
import { settingStatus } from './_settings.js'
import { socialStatus } from './_social.js'

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const store = storeConfig()

  // Read the same way everything else does — what was saved from this screen,
  // else the environment. Reading process.env directly meant a key entered in
  // the admin, and working, was still reported here as 未設定. And the AI row
  // asked `apiKey() ? ...`, which became a Promise when keys moved into the
  // store: always truthy, so the one row that was supposed to say "no AI key"
  // said 利用可 whatever was set.
  const settings = await settingStatus(req)
  const has = (name) => settings.some((s) => s.name === name && s.set)

  const checks = [
    {
      id: 'admin', label: '管理キー', env: 'ADMIN_KEY',
      state: 'ok',
      note: 'この画面が開けているので設定済みです。',
    },
    {
      id: 'resend', label: '問い合わせメール送信', env: 'RESEND_API_KEY',
      state: has('RESEND_API_KEY') ? 'ok' : 'error',
      note: has('RESEND_API_KEY')
        ? '問い合わせフォームと会員登録が動作します。'
        : '未設定です。お問い合わせフォームが動作していません。resend.com でキーを発行し、Vercel に RESEND_API_KEY を設定してください。',
    },
    {
      id: 'contactTo', label: '問い合わせの宛先', env: 'CONTACT_TO_EMAIL',
      state: has('CONTACT_TO_EMAIL') ? 'ok' : 'warn',
      note: has('CONTACT_TO_EMAIL')
        ? '指定のアドレスに届きます。'
        : '未設定のため既定の shoma.yamamoto@lumenium.net に送られます。別の宛先にする場合は CONTACT_TO_EMAIL を設定してください。',
    },
    {
      id: 'store', label: 'アクセス解析・AIOの保存先', env: 'UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN',
      state: store ? 'ok' : 'warn',
      note: store
        ? 'ページビュー・導線・AIO計測が記録され、失効できる共有リンクも発行できます。'
        : '未接続のため、アクセス解析と導線は一切記録されていません。AIO計測は実行できますが、結果はこの端末にだけ残り、別の端末からは見られません。会員リストの共有リンクも、管理キー入りのURL（個別に失効できない）しか作れません。Vercel の Storage から Upstash Redis を接続してください。',
    },
    {
      id: 'ai', label: 'AI（SEO/AIO分析・アドバイザー）', env: 'ANTHROPIC_API_KEY',
      state: has('ANTHROPIC_API_KEY') ? 'ok' : 'warn',
      note: has('ANTHROPIC_API_KEY')
        ? 'AIO計測とアドバイザーが使えます。'
        : '未設定のため、AIO計測とAIアドバイザーが使えません。console.anthropic.com で発行してください。',
    },
    {
      id: 'github', label: 'お知らせ投稿・文章編集の保存', env: 'GITHUB_TOKEN',
      state: has('GITHUB_TOKEN') ? 'ok' : 'warn',
      note: has('GITHUB_TOKEN')
        ? '保存すると自動デプロイが走ります。'
        : '未設定のため、お知らせの投稿とサイト文章の保存ができません。',
    },
    // The two that fail open. Both fall back to a value anyone can read in the
    // public repository, so "unset" here does not mean "off" — it means the
    // published default is live.
    {
      id: 'memberCode', label: '会員登録コード', env: 'MEMBER_CODE',
      state: has('MEMBER_CODE') ? 'ok' : 'error',
      note: has('MEMBER_CODE')
        ? '独自のコードが設定されています。'
        : '未設定のため、リポジトリに公開されている既定コード「LUMEN2026」が有効です。誰でも会員登録できる状態なので、MEMBER_CODE を設定してください。',
    },
    {
      id: 'sessionSecret', label: 'ログインセッションの署名鍵', env: 'SESSION_SECRET',
      state: has('SESSION_SECRET') ? 'ok' : 'error',
      note: has('SESSION_SECRET')
        ? '独自の鍵が設定されています。'
        : '未設定のため、リポジトリに公開されている既定の鍵が使われています。ログイン状態を偽造できる状態なので、SESSION_SECRET を設定してください。',
    },
  ]

  // The networks, as one row: which of the five can be posted to right now.
  const nets = await socialStatus(req)
  const live = nets.filter((n) => n.ready)
  checks.push({
    id: 'social', label: 'SNS 投稿', env: 'X_ACCESS_TOKEN ほか',
    state: live.length ? 'ok' : 'warn',
    note: live.length
      ? `${live.map((n) => n.label).join('・')} に管理ポータルから直接投稿できます。` +
        (live.length < nets.length
          ? `残り（${nets.filter((n) => !n.ready).map((n) => n.label).join('・')}）は資格情報が未入力です。`
          : '')
      : '未設定です。各SNSの開発者画面でアクセストークンを発行し、下の「キーの入力」に貼ると、管理ポータルから直接投稿できるようになります。',
  })

  // Live signals, when there is somewhere to have recorded them.
  let contact = null
  if (store) {
    const dates = lastDays(30)
    try {
      const out = await pipeline(store, [
        ...dates.map((d) => ['HGETALL', K.dayContact(d)]),
        ['GET', K.contactLastError],
      ])
      let ok = 0, fail = 0, blocked = 0
      let last7ok = 0
      out.slice(0, dates.length).forEach((flat, i) => {
        if (!Array.isArray(flat)) return
        for (let j = 0; j + 1 < flat.length; j += 2) {
          const n = Number(flat[j + 1]) || 0
          const field = String(flat[j])
          if (field === 'ok') { ok += n; if (i >= dates.length - 7) last7ok += n }
          // A spam block is the limiter working, not the form breaking.
          else if (field === 'blocked') blocked += n
          else fail += n
        }
      })
      let lastError = null
      try { lastError = JSON.parse(out[dates.length]) } catch (_) {}
      contact = { days: 30, ok, fail, blocked, last7ok, lastError }

      if (blocked > 0) {
        checks.push({
          id: 'contactBlocked', label: '迷惑送信のブロック', env: '',
          state: 'ok',
          note: `直近30日で ${blocked} 件を回数制限で遮断しました。受信箱とメール送信枠を守っています。`,
        })
      }
      if (fail > 0) {
        checks.push({
          id: 'contactFail', label: '問い合わせの送信失敗', env: '',
          state: 'error',
          note: `直近30日で ${fail} 件の送信が失敗しています。` +
            (lastError ? `最後の失敗: ${lastError.reason}（${lastError.at}）` : ''),
        })
      }
    } catch (_) { /* the report is still useful without the counts */ }

    // A link you issued and forgot is the one that leaks. Anything still open
    // belongs on the page that lists what is switched on.
    try {
      const links = await listShares()
      if (links && links.length) {
        const forever = links.filter((l) => !l.expiresAt).length
        checks.push({
          id: 'share', label: '会員リストの共有リンク', env: '',
          state: forever ? 'warn' : 'ok',
          note: `${links.length}本が有効です（会員リストのみ・この管理画面は開けません）。` +
            (forever
              ? `うち${forever}本が無期限です。渡した用事が済んだものは「会員リスト」タブで失効させてください。`
              : 'すべて期限付きで、期日が来れば自動的に使えなくなります。'),
        })
      }
    } catch (_) { /* the rest of the report stands without this */ }
  }

  const worst = checks.some((c) => c.state === 'error')
    ? 'error'
    : checks.some((c) => c.state === 'warn') ? 'warn' : 'ok'

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    today: jstDate(),
    worst,
    checks,
    contact,
  })
}
