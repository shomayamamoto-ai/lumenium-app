// Call every endpoint once, authorised, with nothing real on the other end.
//
// This exists because two endpoints were broken in production and nothing
// said so. Factoring the auth check into one guard deleted each endpoint's
// local `url` and `submitted`; two of them still referenced those, so every
// authorised request threw a ReferenceError and Vercel answered 500. The
// tests written at the time only exercised the refusal path — wrong key,
// lockout, content type — which returns before reaching any of it.
//
// So the assertion here is deliberately shallow and deliberately on the happy
// path: with a valid key, does the handler come back at all? A 503 for a
// missing integration is a pass — that is the endpoint working. A thrown
// exception, or a 500, is not.
//
// Every outbound call is stubbed, so this is offline and deterministic. It
// runs in prebuild: a deploy that would 500 fails here instead.
//
// Not covered: POST /api/aio and /api/advisor. Reaching their bodies means a
// real model call, and a build step should not spend money. Their GET and
// their refusal paths are here; the rest is covered by the AIO tests.

const REDIS = 'https://redis.smoke.invalid'
Object.assign(process.env, {
  ADMIN_KEY: 'smoke-admin-key',
  RESEND_API_KEY: 'smoke',
  ANTHROPIC_API_KEY: 'sk-ant-smoke',
  RESEND_AUDIENCE_ID: 'aud_smoke',
  CONTACT_TO_EMAIL: 'smoke@example.com',
  MEMBER_CODE: 'SMOKE',
  SESSION_SECRET: 'smoke-secret',
  // 週次メールの定期実行。合言葉つきの呼び出しが本文（集計とメール送信）まで
  // 通ることを確かめます。
  CRON_SECRET: 'smoke-cron-secret',
  GITHUB_TOKEN: 'smoke-token',
  GITHUB_REPO: 'smoke/smoke',
  // 商談の自動予約。接続済みのつもりで呼ぶ（枠の計算と同意画面URLの組み立て
  // まで通すため）。実際の Google へは出ない — 上の fetch が受け止める。
  GOOGLE_CLIENT_ID: 'smoke.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'smoke',
  GOOGLE_REFRESH_TOKEN: 'smoke',
  UPSTASH_REDIS_REST_URL: REDIS,
  UPSTASH_REDIS_REST_TOKEN: 'smoke',
  // The five networks, so POST /api/social is exercised on the path where it
  // actually sends rather than on the "not configured" refusal.
  // X は4つの鍵で署名して送る（OAuth 1.0a）。1つでも欠けると「未設定」扱い。
  X_API_KEY: 'smoke', X_API_SECRET: 'smoke', X_ACCESS_TOKEN: 'smoke', X_ACCESS_SECRET: 'smoke',
  FB_PAGE_ID: '1', FB_PAGE_TOKEN: 'smoke',
  IG_USER_ID: '2', IG_TOKEN: 'smoke',
  THREADS_USER_ID: '3', THREADS_TOKEN: 'smoke',
  LI_AUTHOR_URN: 'urn:li:person:smoke', LI_TOKEN: 'smoke',
  LINE_CHANNEL_TOKEN: 'smoke',
  // SNS（動画）の YouTube と TikTok。
  YOUTUBE_REFRESH_TOKEN: 'smoke', TIKTOK_CLIENT_KEY: 'smoke', TIKTOK_CLIENT_SECRET: 'smoke', TIKTOK_REFRESH_TOKEN: 'smoke',
  // 予約投稿と毎朝の自動処理。BLOB_READ_WRITE_TOKEN は入れません——入れると
  // @vercel/blob が本物の Vercel に出ていこうとします（ここでは止められない）。
  CRON_SECRET: 'smoke-cron',
})

const store = new Map()
const hashes = new Map()

function redis(cmds) {
  return cmds.map((c) => {
    const op = String(c[0]).toUpperCase()
    const k = c[1]
    if (op === 'GET') return { result: store.get(k) ?? null }
    if (op === 'SET') { store.set(k, c[2]); return { result: 'OK' } }
    if (op === 'DEL') { store.delete(k); hashes.delete(k); return { result: 1 } }
    if (op === 'INCR') { const v = (Number(store.get(k)) || 0) + 1; store.set(k, String(v)); return { result: v } }
    if (op === 'HSET') { const h = hashes.get(k) || new Map(); h.set(String(c[2]), String(c[3])); hashes.set(k, h); return { result: 1 } }
    if (op === 'HGET') { const h = hashes.get(k); return { result: h?.get(String(c[2])) ?? null } }
    if (op === 'HGETALL') { const h = hashes.get(k); return { result: h ? [...h].flat() : [] } }
    if (op === 'LRANGE') return { result: [] }
    if (op === 'HDEL') { const h = hashes.get(k); return { result: h && h.delete(String(c[2])) ? 1 : 0 } }
    if (op === 'HLEN') { const h = hashes.get(k); return { result: h ? h.size : 0 } }
    return { result: null }
  })
}

const ok = (body, type = 'application/json') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200, headers: { 'content-type': type },
  })

globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url ? input.url : input)
  if (u.startsWith(REDIS)) return ok(redis(JSON.parse(init.body || '[]')))
  if (u.includes('api.resend.com')) {
    if (u.includes('/contacts')) {
      return ok({ data: [{ email: 'a@example.com', first_name: 'ス', last_name: '', unsubscribed: false, created_at: '2026-01-01T00:00:00Z' }] })
    }
    return ok({ id: 'smoke' })
  }
  if (u.includes('api.anthropic.com')) {
    // SNSの下書きは JSON の形を指定して頼むので、その形で返します。
    let req = {}
    try { req = JSON.parse(init.body || '{}') } catch (_) {}
    const fmt = req.output_config && req.output_config.format
    // SNS（動画）の構成分析と台本づくり。形だけ合った返事を返します。
    if (fmt && fmt.type === 'json_schema' && fmt.schema.properties.analyses) {
      const ids = [...String(req.messages[0].content).matchAll(/post_id: (\S+)/g)].map((m) => m[1])
      const analyses = ids.map((id) => ({ post_id: id, hook_text: 'スモーク', hook_type: 'question', beats: [{ label: 'hook', start: 0, end: 3, purpose: 'つかみ' }], cta: '', takeaways: ['型'] }))
      return ok({ id: 'm', type: 'message', role: 'assistant', model: req.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ analyses }) }], usage: { input_tokens: 1, output_tokens: 1 } })
    }
    if (fmt && fmt.type === 'json_schema' && fmt.schema.properties.lines) {
      const script = { title: 'スモーク', hook: 'これ知ってた？', hook_type: 'question', body: '本文', cta: '保存してね', target_duration_sec: 9, hashtags: ['スモーク'], rationale: '型',
        lines: [{ start: 0, end: 3, narration: 'これ知ってた？', telop: 'これ知ってた？', visual: 'A cafe' }, { start: 3, end: 9, narration: '保存してね', telop: '保存してね', visual: 'A cup' }] }
      return ok({ id: 'm', type: 'message', role: 'assistant', model: req.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(script) }], usage: { input_tokens: 1, output_tokens: 1 } })
    }
    if (fmt && fmt.type === 'json_schema') {
      const nets = fmt.schema.properties.drafts.required
      const drafts = Object.fromEntries(nets.map((n) => [n, { text: 'スモークテストの下書きです。', hashtags: ['スモーク'] }]))
      return ok({ id: 'm', type: 'message', role: 'assistant', model: req.model, stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ drafts }) }], usage: { input_tokens: 1, output_tokens: 1 } })
    }
    return ok({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'スモークテストの回答です。' }], usage: { input_tokens: 1, output_tokens: 1 } })
  }
  if (u.includes('oauth2.googleapis.com')) return ok({ access_token: 'at', expires_in: 3600 })
  if (u.includes('webmasters/v3')) {
    if (u.endsWith('/sites')) return ok({ siteEntry: [{ siteUrl: 'sc-domain:lumenium.net' }] })
    // 問い合わせの次元ごとに、その形の行を返す（合計・語・ページ・語×ページ・端末）。
    const dims = (JSON.parse(init.body || '{}').dimensions || []).join(',')
    if (!dims) return ok({ rows: [{ clicks: 3, impressions: 120, ctr: 0.025, position: 14.1 }] })
    if (dims === 'query,page') return ok({ rows: [{ keys: ['東京 動画制作', 'https://lumenium.net/services/video.html'], clicks: 1, impressions: 20, position: 18.2 }] })
    if (dims === 'page') return ok({ rows: [{ keys: ['https://lumenium.net/services/video.html'], clicks: 1, impressions: 20, position: 18.2 }] })
    if (dims === 'device') return ok({ rows: [{ keys: ['MOBILE'], clicks: 1, impressions: 20, position: 18.2 }] })
    return ok({ rows: [{ keys: ['東京 動画制作'], clicks: 1, impressions: 20, position: 18.2 }] })
  }
  if (u.includes('googleapis.com/calendar')) return ok({ calendars: { primary: { busy: [] } } })
  if (u.includes('api.github.com')) return ok({ sha: 'deadbeef', content: '', commit: { sha: 'deadbeef' } })
  // The site reading itself, for /api/site-audit: a sitemap with one page in
  // it, and a page with enough in it to be checked. Without these the audit
  // would be exercised only on its error path, which is the half that was
  // already working.
  if (u.includes('dir.example.jp')) return ok('<html><title>一覧</title><body>ルメニウム（Lumenium）</body></html>', 'text/html')
  if (u.includes('/sitemap-urls.txt')) return ok('https://lumenium.net/\nhttps://lumenium.net/about.html', 'text/plain')
  if (u.includes('api.indexnow.org')) return ok({}, 'application/json')
  if (u.includes('/sitemap.xml')) {
    return ok('<urlset><url><loc>https://lumenium.net/about.html</loc></url></urlset>', 'application/xml')
  }
  if (u.includes('lumenium.net/about.html')) {
    return ok('<html><head><title>ルメニウム（Lumenium）とは | 東京の制作会社</title>' +
      '<meta name="description" content="' + 'あ'.repeat(80) + '"></head>' +
      '<body><h1>ルメニウム（Lumenium）とは</h1><p>東京都・3万円〜・お問い合わせから48時間以内。</p>' +
      '<script>fetch("/api/track")</scr' + 'ipt></body></html>', 'text/html')
  }
  // The publishing endpoints. Shapes match what each platform documents, so a
  // handler that reads the wrong field here reads the wrong field in
  // production too.
  if (u.includes('.public.blob.vercel-storage.com/')) {
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
  }
  if (u.includes('api.x.com') || u.includes('api.twitter.com')) {
    if (u.includes('/media/upload')) return ok({ data: { id: '1880000000000000000', media_key: '3_1' } })
    if (u.includes('/users/me')) return ok({ data: { id: '1', username: 'smoke' } })
    if (u.includes('public_metrics')) return ok({ data: { id: '1', public_metrics: { like_count: 1, reply_count: 0, retweet_count: 0, quote_count: 0, impression_count: 10 } } })
    return ok({ data: { id: '1770000000000000000', text: 'smoke' } })
  }
  if (u.includes('api.line.me')) {
    if (u.includes('/quota/consumption')) return ok({ totalUsage: 12 })
    if (u.includes('/quota')) return ok({ type: 'limited', value: 200 })
    if (u.includes('/insight/followers')) return ok({ status: 'ready', followers: 40, targetedReaches: 38, blocks: 2 })
    if (u.includes('/bot/info')) return ok({ displayName: 'スモーク', basicId: '@smoke' })
    return ok({})
  }
  if (u.includes('graph.facebook.com') || u.includes('graph.threads.net')) {
    if (u.includes('permalink')) return ok({ permalink: 'https://example.invalid/p/smoke' })
    if (u.includes('fields=status')) return ok({ status_code: 'FINISHED', status: 'FINISHED' })
    if (u.includes('publishing_limit')) return ok({ data: [{ quota_usage: 1, config: { quota_total: 100 } }] })
    if (u.includes('refresh_access_token')) return ok({ access_token: 'smoke-new', token_type: 'bearer', expires_in: 5184000 })
    if (u.includes('media_publish') || u.includes('threads_publish')) return ok({ id: 'published_1' })
    return ok({ id: 'container_1', post_id: '1_2' })
  }
  if (u.includes('api.linkedin.com')) return ok({ id: 'urn:li:share:1' })
  if (u.includes('googleapis.com/youtube/v3/videos')) return ok({ items: [{ statistics: { viewCount: '12', likeCount: '1', commentCount: '0' } }] })
  if (u.includes('open.tiktokapis.com')) {
    if (u.includes('/oauth/token/')) return ok({ access_token: 'tt', refresh_token: 'smoke', scope: 'video.upload' })
    if (u.includes('/inbox/video/init/')) return ok({ data: { publish_id: 'p_1', upload_url: 'https://open-upload.tiktokapis.com/upload/?id=1' }, error: { code: 'ok' } })
    if (u.includes('/status/fetch/')) return ok({ data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } })
    return ok({ data: { videos: [{ id: '1', view_count: 5 }] }, error: { code: 'ok' } })
  }
  if (u.includes('open-upload.tiktokapis.com')) return new Response(null, { status: 201 })
  throw new Error(`smoke test tried to reach the network: ${u}`)
}

const KEY = { Authorization: 'Bearer smoke-admin-key' }
const JSONH = { ...KEY, 'content-type': 'application/json' }

// A real signed session, so the members-only pages are exercised on the path a
// logged-in member takes and not only on the redirect.
const { issueSession } = await import(new URL('../api/_session.js', import.meta.url))
const MEMBER = { cookie: `lum_session=${(await issueSession(false)).token}` }

// One authorised call per endpoint. Bodies are the smallest thing the handler
// will accept — the point is to reach the end of the function, not to test it.
const CALLS = [
  ['health', 'GET', '', KEY],
  // 管理画面のログイン。ADMIN_KEY だけで通ること（Resend に頼らない）。
  ['admin-ping', 'GET', '', KEY],
  ['members-list', 'GET', '', KEY],
  // 会員リストの詳しい内容とグループ（api/members.js）。
  ['members', 'GET', '?id=smoke1', KEY],
  ['members', 'GET', '?view=audit', KEY],
  ['members', 'POST', '', JSONH, { action: 'update', id: 'smoke1', name: 'スモーク', company: '' }],
  ['members', 'POST', '', JSONH, { action: 'segment.create', name: 'スモーク' }],
  ['members', 'GET', '?view=mail', KEY],
  ['members', 'GET', '?view=growth', KEY],
  ['members', 'GET', '?view=broadcast&id=smoke', KEY],
  ['members', 'POST', '', JSONH, { action: 'mail.preview', subject: 'スモーク', body: '本文' }],
  ['members', 'POST', '', JSONH, { action: 'mail.count', segment: '' }],
  // 配信停止のページ（だれでも開ける）。署名の無いリンクは 400。
  ['unsubscribe', 'GET', '?e=a%40example.com&t=00', {}],
  // 設定状況の「テスト」。相手のサービスはすべて上の fetch が受け止めます。
  ...['resend', 'github', 'ai', 'store', 'google'].map((t) => ['settings-test', 'POST', '', JSONH, { target: t }]),
  // The key goes in the header; ?key= is refused (see api/_admin-auth.js).
  ['members-view', 'GET', '', KEY],
  ['members-xlsx', 'GET', '', KEY],
  ['analytics', 'GET', '?days=30', KEY],
  ['share-links', 'GET', '', KEY],
  ['share-links', 'POST', '', JSONH, { action: 'create', label: 'smoke', days: 7 }],
  ['aio', 'GET', '', KEY],
  // 1問だけのお試し。壊れているかどうかを全問ぶん払わずに確かめる入口
  // なので、これ自体が壊れていては意味がない。
  ['aio', 'POST', '', JSONH, { action: 'probe', index: 0 }],
  // 計測の開始（回数とAIを選んで、呼び出し回数の予約まで。AIは呼ばない）。
  ['aio', 'POST', '', JSONH, { action: 'start', samples: 3, engines: ['claude'] }],
  // 質問の編集。中身の検査で断られるのも、応答のうちです。
  ['aio', 'PUT', '', JSONH, { questions: [{ cat: '動画制作', q: '東京の動画制作会社を教えてください。' }] }],
  ['site-audit', 'GET', '', KEY],
  // 文章編集の「AIに書き直してもらう」。押すのが手軽なぶん、壊れていると
  // 編集の手が止まります。
  ['rewrite', 'POST', '', JSONH, { text: 'とても豊富な実績があります。', way: 'short', where: 'hero · リード文' }],
  // 検索エンジンへの登録まわり。確認ファイルは鍵を持たない相手（Google /
  // Bing のクローラー）が読みに来るので、認証なしで呼ぶ。
  ['verify', 'GET', '', {}],
  ['search-console', 'GET', '', KEY],
  // 「再取得」。保存した結果を飛ばして Google に聞き直す側。
  ['search-console', 'GET', '?fresh=1', KEY],
  // クローラーの来訪（middleware.js が記録したもの）を管理画面に返す。
  ['crawlers', 'GET', '', KEY],
  ['listing-check', 'POST', '', JSONH, { urls: ['https://dir.example.jp/list'] }],
  ['indexnow', 'GET', '', KEY],
  ['indexnow', 'POST', '', JSONH, {}],
  // 商談の自動予約。GET は訪問者、?recent= は管理者、POST は枠を指定しない
  // 呼び方（= 断られる側）を通す。ここで見たいのは、どの入り方でも 500 を
  // 返さないこと。
  ['booking', 'GET', '', {}],
  ['booking', 'GET', '?recent=1', KEY],
  ['booking', 'GET', '?service=default&all=1', {}],
  ['booking', 'PUT', '', JSONH, { rules: { wording: '来店', services: [{ id: 'cut', name: 'カット', minutes: 60 }] } }],
  ['booking', 'PATCH', '', JSONH, { id: 'bk_1_smoke', action: 'cancel' }],
  ['booking-manage', 'GET', '?t=bk_1_smoke.zzzz.00000000000000000000000000000000', {}],
  ['booking-manage', 'POST', '', { 'content-type': 'application/x-www-form-urlencoded' }, 't=bad&action=cancel&sure=1'],
  ['booking', 'POST', '', { 'content-type': 'application/json' },
    { key: '2099-01-01T01:00:00.000Z', name: 'スモーク', email: 'smoke@example.com', message: 'テスト' }],
  ['google-oauth', 'GET', '?start=1', KEY],
  ['google-oauth', 'GET', '', {}],
  // Served to crawlers, so they are called the way a crawler calls them: no
  // key, and a user-agent that gets recorded.
  ['robots', 'GET', '', { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2)' }],
  ['llms', 'GET', '', { 'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)' }],
  ['social', 'GET', '', KEY],
  ['social', 'POST', '', JSONH,
    { text: 'スモークテストの投稿です。', link: 'https://lumenium.net/',
      imageUrl: 'https://lumenium.net/ogp.png',
      targets: ['facebook', 'instagram', 'threads', 'linkedin', 'line'] }],
  // 投稿先ごとの本文・アップロードした画像（X は画像を実際に送る道を通る）。
  ['social', 'POST', '', JSONH,
    { action: 'post', text: 'スモーク', link: 'https://lumenium.net/', campaign: 'smoke',
      images: [{ url: 'https://smoke.public.blob.vercel-storage.com/a.jpg' }],
      variants: { x: { text: 'X用の本文' }, instagram: { noLink: true } },
      targets: ['x', 'instagram'] }],
  ['social', 'GET', '?quota=1', KEY],
  ['social', 'POST', '', JSONH, { action: 'test', net: 'x' }],
  ['social', 'POST', '', JSONH, { action: 'test', net: 'line' }],
  ['social', 'POST', '', JSONH, { action: 'refresh-threads' }],
  ['social', 'POST', '', JSONH, { action: 'metrics', id: 'none' }],
  ['social', 'POST', '', JSONH, { action: 'schedule', date: new Date(Date.now() + 33 * 3600000).toISOString().slice(0, 10), text: 'スモーク', targets: ['threads'] }],
  ['social', 'POST', '', JSONH, { action: 'cancel', id: 'none' }],
  // 繰り返し投稿つきの定型文（8週間ぶんの予約を入れるところまで通す）。
  ['social', 'PUT', '', JSONH, { templates: [{ title: 'スモーク', text: '定休日です', nets: ['threads'], repeat: { kind: 'monthly', day: 31 } }] }],
  ['social', 'PUT', '', JSONH, { links: { latest: 2, items: [{ title: 'ご予約', url: 'https://lumenium.net/booking' }] } }],
  // プロフィールのリンク集。訪問者が開くページなので、鍵なしで呼ぶ。
  ['links', 'GET', '?from=instagram', {}],
  // 承認の流れ：承認待ちの保存と、責任者が開くページ（鍵なし。使えないリンクは 410）。
  ['social', 'POST', '', JSONH, { action: 'approval-create', text: 'スモーク', targets: ['x'], note: 'smoke' }],
  ['social', 'POST', '', JSONH, { action: 'approval-send', id: 'none' }],
  ['social-approve', 'GET', '?t=0000', {}],
  // コメントの受信箱（押したときだけ読む）と返信。
  ['social', 'POST', '', JSONH, { action: 'inbox' }],
  ['social', 'POST', '', JSONH, { action: 'inbox-reply', net: 'instagram', id: '1', message: 'スモーク' }],
  ['social-approve', 'POST', '', { 'content-type': 'application/x-www-form-urlencoded' }, 't=0000&decision=approve'],
  ['social-cron', 'GET', '', { authorization: 'Bearer smoke-cron' }],
  ['social-cron', 'GET', '', {}],
  ['booking-cron', 'GET', '', { authorization: 'Bearer smoke-cron' }],
  ['booking-cron', 'GET', '', {}],
  ['social-write', 'POST', '', JSONH, { topic: '秋の新メニュー', nets: ['x', 'instagram', 'line'], link: 'https://lumenium.net/' }],
  // 画像の置き場所が無い状態（＝ 503 で理由を返す）。
  ['social-upload', 'POST', '', { ...KEY, 'content-type': 'image/jpeg' }, '__bytes__'],
  // SNS（文章）の運用プラン。読む・丸ごと保存・あとから柱を付ける。
  ['social-plan', 'GET', '', KEY],
  ['social-plan', 'PUT', '', JSONH, { plan: { pillars: [{ name: 'お役立ち' }, { name: '宣伝', promo: true }], targets: { x: { on: true, per: 'week', n: 5 } } } }],
  ['social-plan', 'PUT', '', JSONH, { tag: { id: 'none', pillar: '' } }],
  // SNS（動画）。プロジェクトを決まった id で作り、その中で一通り呼びます。
  ['video', 'GET', '', KEY],
  ['video', 'POST', '', JSONH, { action: 'project.save', project: { id: 'smoke-prj', name: 'スモーク', brand: { banned_words: ['最安'], notation: { 'ネイル': 'nail' } } } }],
  ['video', 'PUT', '', JSONH, { kind: 'posts', project: 'smoke-prj', items: [{ id: 'smoke-post', title: '架空の投稿', caption: '架空のキャプション #a', views: 100, likes: 5, duration_sec: 20, published_at: '2026-10-01T00:00:00Z' }] }],
  ['video', 'GET', '?project=smoke-prj', KEY],
  ['video', 'POST', '', JSONH, { action: 'analyze', project: 'smoke-prj', ids: ['smoke-post'] }],
  ['video', 'POST', '', JSONH, { action: 'script.generate', project: 'smoke-prj', topic: '秋の新メニュー', platform: 'instagram' }],
  ['video', 'POST', '', JSONH, { action: 'pub.save', project: 'smoke-prj', item: { id: 'smoke-pub', platform: 'instagram', caption: 'スモーク', hashtags: ['a'], video_url: 'https://x.public.blob.vercel-storage.com/video/a.mp4', video_size: 1000, external_id: '1' } }],
  ['video', 'POST', '', JSONH, { action: 'pub.save', project: 'smoke-prj', item: { id: 'smoke-tt', platform: 'tiktok', caption: 'スモーク', video_url: 'https://x.public.blob.vercel-storage.com/video/a.mp4', video_size: 7 } }],
  ['video', 'POST', '', JSONH, { action: 'ig.discover', project: 'smoke-prj', username: 'smoke_shop' }],
  ['video-publish', 'GET', '', KEY],
  ['video-publish', 'POST', '', JSONH, { action: 'instagram.start', project: 'smoke-prj', pub: 'smoke-pub' }],
  ['video-publish', 'POST', '', JSONH, { action: 'instagram.status', project: 'smoke-prj', pub: 'smoke-pub' }],
  ['video-publish', 'POST', '', JSONH, { action: 'metrics', project: 'smoke-prj', pub: 'smoke-pub' }],
  ['video-publish', 'POST', '', JSONH, { action: 'schedule', project: 'smoke-prj', pub: 'smoke-pub', date: new Date(Date.now() + 33 * 3600000).toISOString().slice(0, 10) }],
  ['video-publish', 'POST', '', JSONH, { action: 'youtube.token' }],
  ['video-publish', 'POST', '', JSONH, { action: 'tiktok.send', project: 'smoke-prj', pub: 'smoke-tt' }],
  ['video-publish', 'POST', '', JSONH, { action: 'tiktok.status', project: 'smoke-prj', pub: 'smoke-tt' }],
  ['video-upload', 'POST', '', JSONH, { type: 'blob.generate-client-token', payload: { pathname: 'video/a.mp4' } }],
  ['video-oauth', 'GET', '?start=youtube', KEY],
  ['video-oauth', 'GET', '?start=tiktok', KEY],
  ['video-oauth', 'GET', '', {}],
  ['video', 'POST', '', JSONH, { action: 'project.delete', id: 'smoke-prj' }],
  // The committed-state reads behind the two editors.
  ['settings', 'GET', '', KEY],
  ['settings', 'POST', '', JSONH, { name: 'CONTACT_TO_EMAIL', value: 'smoke@example.com' }],
  ['news-post', 'GET', '', KEY],
  ['content-save', 'GET', '', KEY],
  // Members-only pages. Called without a session, so what is exercised is the
  // redirect — which is the path every logged-out visitor takes, and the one
  // that must not throw. (api/og.jsx is left out: it is JSX and needs the
  // build's transform to import at all.)
  ['members-game', 'GET', '', {}],
  ['members-puzzle', 'GET', '', {}],
  ['members-territory', 'GET', '', {}],
  ['members-game', 'GET', '', MEMBER],
  ['members-puzzle', 'GET', '', MEMBER],
  ['members-territory', 'GET', '', MEMBER],
  // These two write through GitHub, which is stubbed above — nothing leaves
  // the process. They are called with a body that passes validation, because a
  // 400 would stop short of the part that was broken elsewhere.
  ['news-post', 'POST', '', JSONH, { action: 'add', title: 'スモークテスト', body: '', link: '' }],
  ['content-save', 'POST', '', JSONH, { changes: { 'text.hero.lead': 'DIGITAL CREATIVE STUDIO · TOKYO' } }],
  // 保存のあと、サイトの作り直しが終わったかを GitHub に聞く。
  ['deploy-status', 'GET', '?sha=deadbeef', KEY],
  ['track', 'POST', '', { 'content-type': 'application/json' }, { e: 'contact_view', s: 'instagram' }],
  // 計測の新しい窓口（中身は track と同じ）。訪問の始まり・離れたときの時間・
  // サイト内の移動、の3通りで呼びます。
  ['p', 'POST', '', { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'https://lumenium.net' },
    { p: '/', n: 0, r: 'https://www.google.com' }],
  ['p', 'POST', '', { 'content-type': 'application/json' }, { p: '/about.html', e: 'exit', t: 12000, g: 1, l: '/' }],
  ['p', 'POST', '', { 'content-type': 'application/json' }, { p: '/about.html', e: 'page_time', t: 3000 }],
  // ChatGPT のアプリから来た人は紹介元が空で、手がかりは utm_source=chatgpt.com
  // だけ。AIからの入口ページの記録まで通す。
  ['p', 'POST', '', { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'https://lumenium.net' },
    { p: '/services/web.html', n: 0, s: 'chatgpt.com' }],
  // 週次メール: 管理画面の状態、テスト送信、Vercel の定期実行（合言葉つき）。
  ['weekly-report', 'GET', '', KEY],
  ['weekly-report', 'POST', '', JSONH, { action: 'test' }],
  ['weekly-report', 'GET', '', { Authorization: 'Bearer smoke-cron-secret', 'user-agent': 'vercel-cron/1.0' }],
  ['contact', 'POST', '', { 'content-type': 'application/json' },
    { name: 'スモーク', email: 'smoke@example.com', message: 'これは自動チェックの送信です。',
      orgType: 'company', company: '株式会社スモーク', topics: ['video', 'ai'] }],
  // 問い合わせ管理。上の contact が保存した1件が一覧に出るところまで。
  ['inquiries', 'GET', '', KEY],
  ['inquiries', 'GET', '?status=all&q=スモーク', KEY],
  ['inquiries', 'GET', '?view=badge', KEY],
  ['inquiries', 'GET', '?view=stats&days=90', KEY],
  ['inquiries', 'GET', '?view=settings', KEY],
  ['inquiries', 'GET', '?view=export&status=all', KEY],
  ['inquiries', 'GET', '?id=qsmoke', KEY],
  ['inquiries', 'PATCH', '', JSONH, { ids: ['qsmoke'], status: 'doing', note: 'スモーク' }],
  ['inquiries', 'POST', '', JSONH, { action: 'settings.save', settings: { retentionDays: 180, autoReply: { on: true } } }],
  ['inquiries', 'POST', '', JSONH, { action: 'template.save', item: { name: 'スモーク', body: '{name} 様' } }],
  ['inquiries', 'POST', '', JSONH, { action: 'domain.block', domain: 'spam.example' }],
  ['register', 'POST', '', { 'content-type': 'application/json' },
    { name: 'スモーク', email: 'smoke@example.com', code: 'SMOKE', consent: true }],
  ['register', 'GET', '', {}],
  ['auth', 'POST', '', { 'content-type': 'application/json' }, { code: 'SMOKE' }],
  // 自動改善。読む・設定・止める・提案の操作・実験の開始と停止・いま1回。
  ['exp', 'GET', '', {}],
  ['auto', 'GET', '', KEY],
  ['auto', 'GET', '?view=snapshots&days=7', KEY],
  ['auto', 'POST', '', JSONH, { action: 'settings.save', settings: { autoStart: false, monthlyYen: 300 } }],
  ['auto', 'POST', '', JSONH, { action: 'exp.start', key: 'text.lp.ctaPrimary', b: 'まずは無料で相談' }],
  ['auto', 'POST', '', JSONH, { action: 'proposal.dismiss', id: 'none' }],
  ['auto', 'POST', '', JSONH, { action: 'exp.stop', id: 'none' }],
  ['auto', 'POST', '', JSONH, { action: 'kill' }],
  ['auto', 'POST', '', JSONH, { action: 'resume' }],
  ['auto', 'POST', '', JSONH, { action: 'run' }],
  ['p', 'POST', '', { 'content-type': 'application/json' }, { p: '/', e: 'exp_view', x: 'xsmoke1:B' }],
]

let failed = 0
let n = 0
for (const [name, method, query, headers, body] of CALLS) {
  const label = `${method} /api/${name}`
  // A fresh address each time, so the public endpoints' own rate limits do not
  // turn a later call in the list into a false failure.
  const ip = `203.0.113.${++n}`
  try {
    const mod = await import(new URL(`../api/${name}.js`, import.meta.url))
    const fn = mod[method]
    if (!fn) { console.error(`✗ ${label} — no ${method} export`); failed++; continue }
    const req = new Request(`https://lumenium.net/api/${name}${query}`, {
      method,
      headers: { ...headers, 'x-forwarded-for': ip },
      body: body === undefined ? undefined : body === '__bytes__' ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]) : JSON.stringify(body),
    })
    const res = await fn(req)
    if (!(res instanceof Response)) { console.error(`✗ ${label} — returned ${typeof res}, not a Response`); failed++; continue }
    if (res.status >= 500 && res.status !== 503) {
      console.error(`✗ ${label} — ${res.status}: ${(await res.text()).slice(0, 160)}`)
      failed++
      continue
    }
    console.log(`  ${label} → ${res.status}`)
  } catch (e) {
    console.error(`✗ ${label} — threw ${e && e.constructor && e.constructor.name}: ${e && e.message}`)
    failed++
  }
}

// The other half of the key panel: with no store, a key has to be storable in
// the admin's own browser, and the ones a visitor's request reads have to
// refuse rather than appear to save. Both paths are one endpoint, so a change
// to either can break the other silently.
{
  /* 「保存先なし」を作るには、保存先を指す環境変数を “全部” 外す必要が
     あります。同じものが2通りの名前で置かれるからです（Vercel の Upstash
     連携が作る KV_… と、手で入れる UPSTASH_…）。片方だけ消すと、本番の
     ビルド環境ではもう片方が残っていて「保存先あり」のまま動きます。

     実際そうなりました。この確認が本番のビルドでだけ落ち、ビルドごと
     止まり、それ以降 push したものが何一つ公開サイトに届かなくなって
     いました。手元と GitHub では環境変数が無いので通り、原因の見えない
     止まり方をします。名前は _analytics-store.js から取るので、名前が
     増えてもここは直さずに済みます。 */
  const { STORE_ENV } = await import(new URL('../api/_analytics-store.js', import.meta.url))
  const names = [...STORE_ENV.url, ...STORE_ENV.token]
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]))
  for (const n of names) delete process.env[n]
  try {
    const mod = await import(new URL('../api/settings.js', import.meta.url))
    const call = (body) => mod.POST(new Request('https://lumenium.net/api/settings', {
      method: 'POST',
      headers: { ...JSONH, 'x-forwarded-for': '203.0.113.200' },
      body: JSON.stringify(body),
    }))
    const kept = await call({ name: 'ANTHROPIC_API_KEY', value: 'sk-ant-smoke-1234' })
    const cookie = kept.headers.get('set-cookie') || ''
    if (kept.status !== 200 || !cookie.includes('lum_k_ANTHROPIC_API_KEY=')) {
      console.error(`✗ 保存先なしでの端末保存 — ${kept.status} / cookie=${cookie.slice(0, 40)}`)
      failed++
    } else {
      // …and it has to come back on the next request.
      const { setting } = await import(new URL('../api/_settings.js', import.meta.url))
      const back = new Request('https://lumenium.net/api/aio', { headers: { cookie: cookie.split(';')[0] } })
      const got = await setting('ANTHROPIC_API_KEY', '', back)
      if (got !== 'sk-ant-smoke-1234') { console.error(`✗ 端末保存したキーが読めない — ${got}`); failed++ }
      else console.log('  端末保存 → 次のリクエストで有効')
    }
    const refused = await call({ name: 'SESSION_SECRET', value: 'nope' })
    if (refused.status !== 503) {
      console.error(`✗ 訪問者側で読む値が端末保存を受け付けてしまう — ${refused.status}`)
      failed++
    } else console.log('  訪問者側で読む値は端末保存を拒否')
  } catch (e) {
    console.error(`✗ 端末保存 — threw ${e && e.message}`)
    failed++
  }
  // 元に戻します。無かったものは「無い」に戻す——代入すると文字列の
  // "undefined" が入り、次の確認からは「設定済み」に見えてしまいます。
  for (const n of names) {
    if (saved[n] === undefined) delete process.env[n]
    else process.env[n] = saved[n]
  }
}

if (failed) {
  console.error(`\n${failed} 件のエンドポイントが認証後に失敗します。デプロイすると 500 になります。`)
  process.exit(1)
}
console.log(`\n${CALLS.length} 件すべて応答しました。`)
