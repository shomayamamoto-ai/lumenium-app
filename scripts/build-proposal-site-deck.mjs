// 提案資料（14枚）を、サイトと同じデザインで作り直したもの（public/proposal-deck-site.js）を作ります。
//
//   node scripts/build-proposal-site-deck.mjs
//
// 文章と話す内容（ノート）は、元の資料（public/proposal-deck.js）と同じです。元の資料のファイルは
// 変えません。管理画面の「資料 › 提案資料」で「元のデザインに戻す」を押すと、元の資料がそのまま
// 出ます（admin-present.js）。
//
// 1枚は 1920×1358 の枠です（A4横 297×210mm と同じ比率。印刷・PDFは A4横ちょうどになります）。
//
// デザインはトップページと同じ組み方です: 明るく温かい灰色の地・筆記体の英語の見出し＋日本語の
// 見出し・白いカード・コーラルの赤・淡くぼかした写真の地。写真は実際の管理画面の画面例
// （数字は見本と書き添えます）と代表の写真だけです。
import { readFileSync, writeFileSync } from 'node:fs'

const ORIGINAL = readFileSync(new URL('../public/proposal-deck.js', import.meta.url), 'utf8')
const base = JSON.parse(ORIGINAL.slice(ORIGINAL.indexOf('=') + 1).trim().replace(/;\s*$/, ''))
const notesOf = Object.fromEntries(base.slides.map((s) => [s.id, s.notes]))

/* ---- 色と文字 ---- */
const BG = '#f3f2ef', INK = '#333338', INK2 = '#5a5a64', INK3 = '#85858f', LINE = '#e3e1dc'
const RED = '#e0565b', RED_SOFT = '#fcecec'
const SANS = "'Noto Sans JP', sans-serif"
const MIN = "'Zen Old Mincho', 'Shippori Mincho', serif"
const SCRIPT = "'Great Vibes', cursive"
const SHADOW = '0 30px 60px -36px rgba(40,40,52,.45)'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const br = (s) => esc(s).replace(/\n/g, '<br>')

/* 淡くぼかした写真の地（トップページの og-soft と同じ作り） */
const soft = (img) =>
  `<div style="position:absolute;inset:-90px;background:url('${img}') no-repeat 85% 30%/190% auto;filter:blur(44px) saturate(1.25);opacity:.5"></div>` +
  `<div style="position:absolute;inset:0;background:rgba(247,246,243,.58)"></div>`

/* 見出し：筆記体の英語＋日本語＋赤い短い線 */
function title(en, ja, { align = 'left', sub = '', top = 96 } = {}) {
  const c = align === 'center'
  return `<div style="position:absolute;left:128px;right:128px;top:${top}px;text-align:${align}">` +
    `<p style="font-family:${SCRIPT};font-size:104px;line-height:1;color:#3a3a42">${esc(en)}</p>` +
    `<h2 style="font-family:${SANS};font-size:36px;font-weight:700;letter-spacing:6px;line-height:1.5;color:${INK};margin-top:10px">${br(ja)}</h2>` +
    `<div style="width:56px;height:4px;border-radius:4px;background:${RED};margin:18px ${c ? 'auto' : '0'} 0"></div>` +
    (sub ? `<p style="font-family:${SANS};font-size:26px;line-height:1.7;color:${INK2};margin-top:18px">${br(sub)}</p>` : '') +
    `</div>`
}
const foot = (n, dark = false) =>
  `<p style="position:absolute;left:128px;bottom:52px;font-family:${SANS};font-size:24px;letter-spacing:3px;color:${dark ? '#5b6f86' : INK3}">LUMENIUM　自己紹介とご提案</p>` +
  `<p style="position:absolute;right:128px;bottom:52px;font-family:${MIN};font-size:26px;font-weight:700;color:${RED}">${String(n).padStart(2, '0')}</p>`
const card = (style, inner) => `<div style="background:#fff;border-radius:28px;box-shadow:${SHADOW};${style}">${inner}</div>`
const section = (id, bg, inner) => `<section id="${id}" style="background:${bg};font-family:${SANS};color:${INK};overflow:hidden">${inner}</section>`
const shot = (src, style, cap = '管理画面の画面例（数字・名前は見本です）') =>
  `<div style="position:absolute;${style}"><img src="${src}" alt="${esc(cap)}" style="width:100%;height:100%;object-fit:cover;object-position:left top;border-radius:24px;box-shadow:${SHADOW};display:block">` +
  `<p style="font-family:${SANS};font-size:24px;color:${INK3};margin-top:12px">${esc(cap)}</p></div>`
const icon = (name, size = 36) => `<span class="pd-ic" data-ic="${name}" style="width:${size}px;height:${size}px;display:inline-flex;flex:none"></span>`
const tones = ['linear-gradient(135deg,#f4b3a8,#e0565b)', 'linear-gradient(135deg,#b4d0ec,#5b84c4)', 'linear-gradient(135deg,#bfe0c6,#4f9a6b)', 'linear-gradient(135deg,#efd9ad,#c08a3e)']

const S = {}

/* 1. 表紙 */
S.cover = section('cover', '#ffffff',
  `<img src="/img/home/admin-portal.jpg" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:left top">` +
  `<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.94) 0%,rgba(255,255,255,.72) 55%,rgba(255,255,255,.25) 100%)"></div>` +
  card('position:absolute;left:128px;top:250px;width:1360px;padding:76px 80px 72px',
    `<p style="font-family:${SCRIPT};font-size:124px;line-height:1;color:${RED}">Lumenium</p>` +
    `<h1 style="font-family:${MIN};font-size:70px;font-weight:700;line-height:1.55;color:${INK};margin-top:24px"><span style="color:#b9b6c0">ぼんやり</span>としたお悩みを<br><span style="border-bottom:6px solid ${RED}">はっきり</span>とさせる<br>夢実現のプロフェッショナルです</h1>` +
    `<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:40px">` +
      ['業務効率化システムの開発', 'ホームページ制作', 'AI研修'].map((t) => `<p style="font-size:26px;font-weight:700;color:#a8383c;background:${RED_SOFT};padding:10px 26px;border-radius:999px">${t}</p>`).join('') +
    `</div>`) +
  `<div style="position:absolute;left:128px;right:128px;bottom:64px;display:flex;justify-content:space-between;align-items:center">` +
    `<p style="font-size:32px;font-weight:700;color:${INK}">代表　山本 捷真</p>` +
    `<p style="font-size:26px;letter-spacing:2px;color:${INK2};background:rgba(255,255,255,.85);padding:8px 22px;border-radius:999px">2026年10月　lumenium.net</p>` +
  `</div>` +
  `<p style="position:absolute;right:128px;top:64px;font-size:24px;color:${INK3};background:rgba(255,255,255,.85);padding:6px 18px;border-radius:999px">背景は管理画面の画面例（数字は見本）</p>`)

/* 2. 自己紹介 */
const career = [
  ['2019', '慶應義塾大学 文学部 入学', 'マーケティング研究会・早稲田AI研究会に所属'],
  ['在学中', 'ビジネスコンテストで入賞多数', 'ADKワカスタビジコン 2023 準優勝・2022 ベスト6、Microsoft ほか'],
  ['2020〜', '動画編集', '登録者20万人・80万人の YouTuber の動画編集を担当'],
  ['2023', 'フリーランスで開発と講師を始める', 'LINE Bot・ホームページ・アプリの開発、AI・ITの講師'],
  ['2024', '株式会社Link AI（業務委託・1年）', 'AIメディア事業部のPM、コミュニティ運営・メルマガ執筆'],
  ['2026', '大学卒業、Lumenium 設立', '業務効率化システムの開発とAI研修を軸に'],
]
S.profile = section('profile', BG,
  title('Profile', '自己紹介', { top: 96 }) +
  `<div style="position:absolute;left:128px;top:400px;width:440px;height:700px;border-radius:28px;overflow:hidden;box-shadow:${SHADOW}"><img src="/profile.jpg" alt="代表 山本 捷真の写真" style="width:100%;height:118%;object-fit:cover;object-position:center 40%;margin-top:-9%;display:block"></div>` +
  card('position:absolute;left:620px;right:128px;top:230px;padding:44px 52px 36px',
    `<p style="font-family:${MIN};font-size:60px;font-weight:700;line-height:1.2">山本 捷真</p>` +
    `<p style="font-size:24px;color:${INK2};margin-top:6px">やまもと しょうま　｜　Lumenium（ルメニウム）代表　｜　東京・オンラインで全国対応</p>` +
    `<div style="margin-top:22px">` +
      career.map(([y, t, d], i) => `<div style="display:grid;grid-template-columns:140px 1fr;gap:24px;padding:17px 0;border-top:1px solid ${i ? LINE : INK}">` +
        `<p style="font-family:${MIN};font-size:32px;font-weight:700;color:${RED};line-height:1.4">${esc(y)}</p>` +
        `<p style="font-size:29px;font-weight:700;line-height:1.45">${esc(t)}<br><span style="font-size:25px;font-weight:400;color:${INK2}">${esc(d)}</span></p></div>`).join('') +
    `</div>`) +
  foot(2))

/* 3. 強み */
const strengths = [
  ['01', '得意領域', 'AI活用の設計と現場への実装、動画の企画・演出、業務を自動化するLINE・Webの開発'],
  ['02', '仕事観', '制作物は「成果への通り道」\n作って終わりにせず、\n運用まで伴走します'],
  ['03', '約束', '費用と工程を隠しません。料金の目安を公開し、見積りは無料、返信は48時間以内'],
]
S.strengths = section('strengths', BG, soft('/img/home/admin-video.jpg') +
  title('Strength', '「目的」を言葉にして、手段に置き換える', { align: 'center', sub: '何を作るか決まっていなくても大丈夫です。お話を伺って目的を言葉にし、それに合う仕組みに置き換えます。', top: 110 }) +
  `<div style="position:absolute;left:128px;right:128px;top:560px;display:grid;grid-template-columns:repeat(3,1fr);gap:40px">` +
    strengths.map(([n, h, t]) => card('padding:60px 48px;min-height:560px',
      `<p style="width:84px;height:84px;border-radius:50%;background:${RED};color:#fff;font-family:${MIN};font-size:34px;font-weight:700;display:flex;align-items:center;justify-content:center">${n}</p>` +
      `<h3 style="font-family:${MIN};font-size:46px;font-weight:700;margin-top:26px">${h}</h3>` +
      `<p style="font-size:30px;line-height:1.85;color:${INK2};margin-top:22px">${br(t)}</p>`)).join('') +
  `</div>` + foot(3))

/* 4. 事業内容（6つの事業） */
const biz = [
  ['01', 'AI事業者向け\nシステム開発', 'システム 30万〜1500万円', 'web'],
  ['02', '0から作る\nオリジナルWebサイト制作', 'サイト 60万円〜　LP 30万円〜', 'pen'],
  ['03', 'セキュリティ特化の\nAI研修', '講師1回 10万円〜', 'shield'],
  ['04', '有名監督による\n企業PR動画・SNS運用', '動画 5万円〜　SNS 月額10万円〜', 'video'],
  ['05', '元家電量販店店員による\nスマホ・PC買い替え相談と\n携帯料金見直し', '', 'settings'],
  ['06', '個々に合わせた\n苦手克服AIを用いた\nオンライン塾', '', 'sparkle'],
]
S.business = section('business', BG,
  title('Service', '6つの事業で、お悩みに合わせてお手伝いします', { top: 96 }) +
  `<div style="position:absolute;left:128px;right:128px;top:350px;display:grid;grid-template-columns:repeat(3,1fr);gap:32px 32px">` +
    biz.map(([n, h, p, ic]) => card('padding:36px 38px;min-height:350px;display:flex;flex-direction:column;gap:16px',
      `<div style="display:flex;align-items:center;justify-content:space-between"><span style="width:64px;height:64px;border-radius:50%;background:${RED_SOFT};color:${RED};display:flex;align-items:center;justify-content:center">${icon(ic, 34)}</span>` +
      `<p style="font-family:${MIN};font-size:36px;font-weight:700;color:${RED}">${n}</p></div>` +
      `<h3 style="font-size:32px;font-weight:700;line-height:1.5">${br(h)}</h3>` +
      (p ? `<p style="font-family:${MIN};font-size:28px;font-weight:700;color:${RED};margin-top:auto">${esc(p)}</p>` : ''))).join('') +
  `</div>` +
  `<p style="position:absolute;left:128px;bottom:120px;font-size:27px;color:${INK2}">料金はいずれも目安です。内容を伺って、無料でお見積りします。</p>` + foot(4))

/* 5. お悩み・つながりたい人 */
const pains = ['紙やExcel、電話で回している業務に、\n毎日時間を取られている', '予約・在庫・顧客の管理が、\n人や店舗ごとにばらばら', 'ホームページを作ったきりで、\n更新も効果も分からない', 'AIを使いたいが、\n何から始めればよいか決まっていない']
const chips = ['人手が足りない', '人が採れない', '手作業に時間がかかる', '社員にAIを使わせたい', '予約・在庫管理がバラバラ', '電話予約を取りこぼしている', 'HPを作ったきり', '動画を作りたい', 'SNSの運用を任せたい', 'ロゴ・チラシ・ポスターを作りたい', 'モデル・MCを手配したい', '名刺を営業リストにしたい']
S.pains = section('pains', BG, soft('/img/home/admin-seo.jpg') +
  title('Problem', 'こんなお悩みはありませんか', { top: 70 }) +
  `<div style="position:absolute;left:128px;right:128px;top:320px;display:grid;grid-template-columns:1fr 1fr;gap:22px 28px">` +
    pains.map((t, i) => card('padding:28px 34px;display:flex;gap:22px;align-items:center;border-radius:22px',
      `<p style="font-family:${SCRIPT};font-size:60px;line-height:1;color:${RED};width:44px;flex:none">Q</p>` +
      `<p style="font-size:28px;font-weight:700;line-height:1.5">${br(t)}</p>`)).join('') +
  `</div>` +
  card('position:absolute;left:128px;right:128px;top:640px;padding:32px 40px 34px;border-radius:22px',
    `<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:${RED}">つながりたい人</p>` +
    `<p style="font-size:26px;line-height:1.75;margin-top:10px">人手が足りない経営者／人を雇いたい経営者／紙・Excel・電話で業務を回している中小企業や複数店舗の経営者（飲食・小売・サロン・士業事務所など）／AIを導入したいが何から始めるか決まっていない会社／中高生・受験生のお子さんの成績や塾代に悩むご家庭／パソコン・スマホを買い替えたい方</p>` +
    `<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:${RED};margin-top:26px">こんな話が出たら、お声がけください</p>` +
    `<div style="display:flex;flex-wrap:wrap;gap:12px 12px;margin-top:14px">` +
      chips.map((c) => `<p style="font-size:25px;line-height:1.2;color:#a8383c;background:${RED_SOFT};padding:9px 20px;border-radius:999px">${esc(c)}</p>`).join('') +
    `</div>`) + foot(5))

/* 6・7. 制作したシステム */
const systems = [
  ['自分で更新・分析できるホームページ', '複数店舗の店舗オーナー', 'どのページから予約が入ったか自分で分かり、\nお知らせもその日に出せる', 'web'],
  ['SNS運用の自動化ツール', 'SNS運用代行会社の代表', '企画から投稿までの手間が減り、\n数字で報告・改善できる運用に', 'chat'],
  ['電話の自動応対（予約とお客様の声）', '居酒屋チェーンの店舗統括', '忙しい時間帯の予約を取りこぼさず、\nお客様の声が本部で見える', 'megaphone'],
  ['名刺から営業リストを作って一斉送信', '名刺交換の多い経営者', '交流会の翌日に全員へお礼のメールを送り、\n次の商談につながる', 'users'],
  ['ログイン付きの交流・マッチングツール', '異業種交流会の運営会社', '会員どうしが自分で相手を見つけてつながり、\n紹介の手間が減った', 'users'],
  ['仕入れ・備品の管理システム', '数店舗の雑貨店の経営者', '欠品と二重発注がなくなり、\n仕入れ額を店舗ごとに比べられる', 'list'],
  ['契約書を作成するシステム', '士業事務所の代表', '下書きが数分ででき、\n空いた時間を確認と相談に使える', 'file'],
]
const sysRow = ([name, who, eff, ic], i) => card('display:grid;grid-template-columns:120px 1fr 1fr;gap:32px;align-items:center;padding:34px 38px;border-radius:24px',
  `<div style="width:120px;height:96px;border-radius:18px;background:${tones[i % 4]};color:#fff;display:flex;align-items:center;justify-content:center;position:relative">${icon(ic, 40)}<span style="position:absolute;right:10px;bottom:2px;font-family:${MIN};font-size:26px;font-weight:700;color:rgba(255,255,255,.7)">${String(i + 1).padStart(2, '0')}</span></div>` +
  `<div><p style="font-size:30px;font-weight:700;line-height:1.4">${esc(name)}</p><p style="display:inline-block;font-size:24px;color:${INK2};border:1px solid ${LINE};border-radius:999px;padding:2px 16px;margin-top:8px">${esc(who)}</p></div>` +
  `<p style="font-size:27px;line-height:1.6;color:${INK}">${br(eff)}</p>`)
S.systems1 = section('systems1', BG,
  title('Works', 'これまでに制作したシステム　1 / 2', { top: 80 }) +
  `<div style="position:absolute;left:128px;right:128px;top:350px;display:flex;flex-direction:column;gap:28px">${systems.slice(0, 4).map((s, i) => sysRow(s, i)).join('')}</div>` + foot(6))
S.systems2 = section('systems2', BG,
  title('Works', 'これまでに制作したシステム　2 / 2', { top: 80 }) +
  `<div style="position:absolute;left:128px;right:128px;top:350px;display:flex;flex-direction:column;gap:28px">${systems.slice(4).map((s, i) => sysRow(s, i + 4)).join('')}</div>` +
  `<p style="position:absolute;left:128px;right:128px;top:1010px;font-size:26px;line-height:1.8;color:${INK2}">お客様の例は、守秘義務のため業種と規模を一般化したモデルケースです。<br>ほかに、企業ホームページと業務システムの開発、企業公式LINEの構築、企業研修の講師・教材制作も担当しています。</p>` + foot(7))

/* 8. 管理画面 */
const feats = [
  ['pen', '文章をその場で直す', '表示を見ながら書き換えて、そのまま公開'],
  ['megaphone', 'お知らせ・SNS投稿', 'お知らせと複数のSNSへ、1か所から投稿'],
  ['chart', 'アクセスの分析', 'どこから来て、どこで問い合わせにつながったか'],
  ['inbox', '問い合わせ・予約', '届いた相談と予約を、一覧で管理・返信'],
  ['search', '検索・AIでの見え方', 'AIの回答に自社が出るかを、定期的に計測'],
  ['sparkle', '次の一手をAIに相談', '数字をもとに、次にやることをAIが提案'],
]
S.admin = section('admin', BG, soft('/img/home/admin-stats.jpg') +
  title('Management', '公開したあとも、自分たちで回せるサイトに', { top: 80, sub: 'Lumenium のサイトで毎日使っている管理画面と同じ仕組みを、お客様のサイトにもお作りできます。' }) +
  shot('/img/home/admin-portal.jpg', 'left:128px;top:470px;width:760px;height:640px') +
  card('position:absolute;left:940px;right:128px;top:470px;padding:40px 40px;display:grid;grid-template-columns:1fr;gap:28px',
    feats.map(([ic, t, d]) => `<div style="display:flex;gap:20px;align-items:center"><span style="width:62px;height:62px;border-radius:50%;background:${RED_SOFT};color:${RED};display:flex;align-items:center;justify-content:center;flex:none">${icon(ic, 30)}</span>` +
      `<div><p style="font-size:28px;font-weight:700;line-height:1.3">${t}</p><p style="font-size:24px;color:${INK2};line-height:1.45">${d}</p></div></div>`).join('')) + foot(8))

/* 9. AIでの見え方 */
const aio = [
  ['28', '問', '依頼先を探す人が実際に打つ質問を、AIにそのまま聞いて記録'],
  ['16', '問', 'AIが答えの材料にしていた紹介サイト（比較ビズ）。候補はそこから選ばれる'],
  ['1', 'ページ', '検索エンジンに読まれていた自社サイトのページ数。ここが改善の出発点'],
]
S.aio = section('aio', BG,
  title('Search', 'お客様がAIに聞いたとき、自社が挙がるかを測ります', { top: 100, sub: 'AIでの見え方の計測　自社の例・2026年10月' }) +
  `<div style="position:absolute;left:128px;right:128px;top:540px;display:grid;grid-template-columns:repeat(3,1fr);gap:40px">` +
    aio.map(([n, u, t]) => card('padding:64px 48px;min-height:500px;text-align:center',
      `<p style="font-family:${MIN};font-size:150px;font-weight:700;line-height:1;color:${RED}">${n}<span style="font-size:52px;color:${INK};margin-left:6px">${u}</span></p>` +
      `<div style="width:56px;height:4px;border-radius:4px;background:${RED};margin:28px auto"></div>` +
      `<p style="font-size:29px;line-height:1.8;color:${INK2};text-align:left">${esc(t)}</p>`)).join('') +
  `</div>` + foot(9))

/* 10. お客様の声 */
const voices = [
  ['抽象的な相談から具体的な企画書に。\nスピード感に驚きです', '飲食店経営者　｜　SNS運用・動画制作'],
  ['AI活用の相談から研修まで。\n業務効率が目に見えて改善しました', 'IT企業 マネージャー　｜　AI研修'],
  ['LINE構築から配信まで一括対応。\n反応率が3倍になりました', '美容サロン オーナー　｜　LINE Bot制作'],
  ['動画・LP・SNS運用を一社に任せられる。\nこれだけで価値がありました', '教育系企業 広報担当　｜　採用動画・Web制作'],
]
S.voices = section('voices', BG, soft('/img/home/admin-video.jpg') +
  title('Voice', 'ご依頼いただいた方から', { align: 'center', top: 100 }) +
  `<div style="position:absolute;left:128px;right:128px;top:420px;display:grid;grid-template-columns:1fr 1fr;gap:40px 40px">` +
    voices.map(([q, who]) => card('padding:52px 48px 44px;position:relative;min-height:330px',
      `<p style="position:absolute;left:30px;top:8px;font-family:${SCRIPT};font-size:120px;line-height:1;color:${RED};opacity:.35">“</p>` +
      `<p style="font-family:${MIN};font-size:36px;font-weight:700;line-height:1.6;margin-top:22px;position:relative">${br(q)}</p>` +
      `<p style="font-size:25px;color:${INK2};margin-top:24px">${esc(who)}</p>`)).join('') +
  `</div>` + foot(10))

/* 11. ご依頼の流れ */
const flow = [
  ['ご相談', '内容が決まっていなくても大丈夫です', '48時間以内に返信'],
  ['ヒアリング・\n見積り', '30〜60分で現状と目標を伺います', '24時間以内に概算'],
  ['ご契約・\nキックオフ', '仕様書と工程表を共有、必要ならNDA', '1〜3営業日'],
  ['制作・実行', '週1回の進捗共有と随時のレビュー', '2週間〜2ヶ月'],
  ['納品・運用', 'データ一式をお渡しし、改善まで伴走', '継続も可能'],
]
S.flow = section('flow', BG,
  title('Flow', 'ご依頼の流れ', { align: 'center', top: 100 }) +
  `<div style="position:absolute;left:128px;right:128px;top:420px;display:grid;grid-template-columns:repeat(5,1fr);gap:26px">` +
    flow.map(([h, t, d], i) => card('padding:52px 28px 44px;text-align:center;min-height:540px;display:flex;flex-direction:column;align-items:center;gap:24px',
      `<p style="width:96px;height:96px;border-radius:50%;background:${RED};color:#fff;font-family:${MIN};font-size:38px;font-weight:700;display:flex;align-items:center;justify-content:center">${String(i + 1).padStart(2, '0')}</p>` +
      `<h3 style="font-size:30px;font-weight:700;line-height:1.4;min-height:84px">${br(h)}</h3>` +
      `<p style="font-size:26px;line-height:1.75;color:${INK2};text-align:center">${esc(t)}</p>` +
      `<p style="font-size:25px;font-weight:700;color:#a8383c;background:${RED_SOFT};padding:6px 18px;border-radius:999px;margin-top:auto">${esc(d)}</p>`)).join('') +
  `</div>` +
  `<p style="position:absolute;left:128px;right:128px;top:1020px;text-align:center;font-size:27px;color:${INK2}">連絡は Slack・Chatwork・メールなど、お客様が普段お使いのものに合わせます。</p>` + foot(11))

/* 12. 料金の目安 */
const price = [
  ['業務効率化システム', '30万〜1500万円', '内容に応じて'],
  ['ホームページ ／ LP', 'サイト 60万円〜　LP 30万円〜', '1〜2ヶ月'],
  ['AI研修（講師1回）', '10万円〜', '準備1〜2週間'],
  ['動画制作・映像編集', '5万円〜', '2週間〜'],
  ['SNS運用・LINE構築', '初期 20万円〜　月額 10万円〜', '内容に応じて'],
  ['ロゴ・バナーなど', '3万円〜', '内容に応じて'],
]
S.price = section('price', BG,
  title('Price', '料金の目安', { top: 80 }) +
  card('position:absolute;left:128px;right:128px;top:330px;padding:14px 56px',
    price.map(([k, v, d], i) => `<div style="display:grid;grid-template-columns:1fr 760px 280px;gap:32px;align-items:center;padding:30px 0;border-top:${i ? `1px solid ${LINE}` : '0'}">` +
      `<p style="font-size:30px;font-weight:700">${esc(k)}</p><p style="font-family:${MIN};font-size:38px;font-weight:700;color:${RED}">${esc(v)}</p><p style="font-size:26px;color:${INK2}">${esc(d)}</p></div>`).join('')) +
  `<p style="position:absolute;left:128px;right:128px;top:1100px;font-size:29px;line-height:1.6">相談・お見積りは無料。最低発注額も最低契約期間もありません。<b style="color:${RED}">LP1枚・研修1回から</b>お受けします。</p>` + foot(12))

/* 13. ご提案 */
const steps = [
  ['STEP 1　無料', '業務の棚卸し', '30〜60分のヒアリングで、\n手作業で回している仕事と、\n時間がかかっている所を\n一緒に洗い出します'],
  ['STEP 2　30万円〜', '1つの業務を仕組みに', '効果の大きい1つ\n（予約・在庫・書類など）\nだけを先に作り、\n使ってみて効果を確かめます'],
  ['STEP 3　必要に応じて', '広げる・定着させる', '効果を見てほかの業務へ広げ、\n社員向けのAI研修で、\n現場で使い続けられる形にします'],
]
S.proposal = section('proposal', BG, soft('/img/home/admin-portal.jpg') +
  title('Proposal', 'まず1つの業務から、小さく始めませんか', { top: 80, sub: '最初から大きなシステムを作る必要はありません。効果を確かめてから広げるので、無駄な投資になりません。' }) +
  `<div style="position:absolute;left:128px;right:128px;top:500px;display:grid;grid-template-columns:1fr 60px 1fr 60px 1fr;align-items:stretch">` +
    steps.map(([s, h, t], i) => (i ? `<p style="display:flex;align-items:center;justify-content:center;font-size:48px;color:${RED}">→</p>` : '') +
      card('padding:52px 40px;min-height:600px',
        `<p style="display:inline-block;font-size:26px;font-weight:700;color:#fff;background:${RED};padding:6px 22px;border-radius:999px">${esc(s)}</p>` +
        `<h3 style="font-family:${MIN};font-size:44px;font-weight:700;line-height:1.35;margin-top:22px">${esc(h)}</h3>` +
        `<p style="font-size:29px;line-height:1.85;color:${INK2};margin-top:22px">${br(t)}</p>`)).join('') +
  `</div>` + foot(13))

/* 14. 連絡先（空色のカード） */
S.contact = section('contact', '#ffffff',
  `<div style="position:absolute;left:96px;right:96px;top:96px;bottom:96px;border-radius:48px;background:linear-gradient(118deg,#cfe7f4 0%,#e6f3f1 48%,#f8f5ec 100%);box-shadow:0 40px 80px -50px rgba(40,70,100,.55);overflow:hidden">` +
    `<div style="position:absolute;right:-120px;bottom:-160px;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.8),rgba(255,255,255,0) 70%)"></div>` +
    `<p style="position:absolute;left:110px;top:120px;font-family:${SCRIPT};font-size:190px;line-height:1;color:#2c4a66">Contact</p>` +
    `<h2 style="position:absolute;left:110px;top:420px;width:1100px;font-family:${MIN};font-size:74px;font-weight:700;line-height:1.5;color:${INK}">ぼんやりした段階から、<br>お気軽にご相談ください</h2>` +
    `<div style="position:absolute;left:110px;right:110px;bottom:90px;display:grid;grid-template-columns:repeat(3,1fr);gap:28px">` +
      [['代表', '山本 捷真'], ['ご相談フォーム', 'lumenium.net/contact.html'], ['お約束', '無料相談・48時間以内に返信']].map(([k, v]) =>
        `<div style="background:rgba(255,255,255,.88);border-radius:22px;padding:22px 30px"><p style="font-size:24px;letter-spacing:2px;color:${RED};font-weight:700">${k}</p><p style="font-size:32px;font-weight:700;margin-top:6px">${v}</p></div>`).join('') +
    `</div>` +
    `<img src="/lumenium-logo.svg?v=3" alt="" style="position:absolute;right:130px;top:150px;width:340px;height:340px;filter:drop-shadow(0 24px 40px rgba(40,60,90,.3))">` +
  `</div>`)

/* ---- 書き出し（並び・節・ノートは元の資料と同じ） ---- */
const slides = base.slides.map((s) => {
  if (!S[s.id]) throw new Error('missing slide: ' + s.id)
  return { id: s.id, html: S[s.id], notes: notesOf[s.id] }
})
const deck = {
  title: base.title + '（サイトのデザイン）',
  fonts: ['https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Zen+Old+Mincho:wght@400;700&family=Great+Vibes&display=swap'],
  sections: base.sections,
  slides,
}
const out = '/* 自動生成: scripts/build-proposal-site-deck.mjs が作ります（直すのはそちら）。\n' +
  '   提案資料「' + base.title + '」を、サイトと同じデザインで作り直したもの。\n' +
  '   元の資料は /proposal-deck.js のまま残してあり、管理画面で「元のデザインに戻す」を押すと元に戻ります。 */\n' +
  'window.lumProposalDeckSite = ' + JSON.stringify(deck, null, 1) + ';\n'
writeFileSync(new URL('../public/proposal-deck-site.js', import.meta.url), out)
console.log(slides.length, 'slides', out.length, 'bytes')
