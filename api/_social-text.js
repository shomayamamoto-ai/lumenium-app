// SNS投稿の「数え方」と「組み立て方」。画面とサーバーの両方で同じものを使います。
//
// なぜ1か所なのか。以前は画面とサーバーが別々に文字数を数えていて、どちらも
// JavaScript の .length でした。X は日本語1文字を2として数え、URL は長さに
// 関係なく23として数えるので、画面で「残り20文字」と出た投稿が X に断られて
// いました。数え方が2つあると、いずれ必ずずれます。
//
// このファイルは import を持ちません。ビルドのとき scripts/build-social-text.mjs
// が export を外して public/social-text.js（管理画面が読むファイル）を作ります。
// 直すのはこのファイルだけにしてください。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

/* X の数え方（twitter-text v3 の設定と同じ値）。
   1 を 100 として数え、下の範囲の文字は 100、それ以外（日本語・全角・
   絵文字など）は 200。URL は 23 文字ぶん、絵文字は組み合わせ（肌の色や
   家族の絵文字）でも1つで 2 です。 */
export const X_RULES = {
  max: 280,
  scale: 100,
  defaultWeight: 200,
  urlLength: 23,
  ranges: [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]],
}

/* 投稿先ごとの決まり。limit は「本文＋リンク」の上限です。
   maxImages は実際に送れる枚数（Facebook・Instagram・Threads・LINE は
   1枚目だけを送ります。複数枚の投稿は各SNSで別の手続きが要るためです）。 */
export const RULES = {
  x: { limit: 280, weighted: true, needText: true, maxImages: 4, image: 'optional' },
  facebook: { limit: 5000, needText: false, maxImages: 1, image: 'optional' },
  instagram: { limit: 2200, needText: false, maxImages: 1, image: 'required', hashtags: 30 },
  threads: { limit: 500, needText: false, maxImages: 1, image: 'optional' },
  linkedin: { limit: 3000, needText: true, maxImages: 0, image: 'none' },
  line: { limit: 5000, needText: false, maxImages: 1, image: 'optional' },
}

/* X の料金（従量課金）。画面の注意書きに出すだけで、計算には使いません。
   値は 2026年の X の料金表の目安です。変わったらここだけ直します。 */
export const X_COST = { post: 0.015, postWithLink: 0.2, read: 0.005 }

// URL の中に使える文字（ASCIIのみ）。日本語や全角の句読点が来たら URL は終わり。
var URL_CHARS = "[A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%]"
var GTLD = 'com|net|org|info|biz|app|dev|xyz|site|online|shop|blog|tokyo|jobs|pro|name|mobi|asia|store|tech|link|page|news|work|life|club|design|studio'
var CCTLD = 'jp|io|co|me|ai|tv|us|uk|cc|ly|to|fm|gl|gg|be|de|fr|kr|tw|cn|hk|sg|au|ca'

/** 本文の中の URL を探す正規表現（毎回新しく作ります。g フラグの lastIndex を
 *  呼び出し元どうしで共有しないためです）。
 *  https:// 付きのもの、または「example.com」のように付いていないもの。
 *  付いていないものは twitter-text と同じく、.jp のような国別ドメインは
 *  後ろに / が続くときだけ URL と見なします（.co と .tv は例外で常に URL）。 */
export function urlPattern() {
  return new RegExp(
    '(https?:\\/\\/' + URL_CHARS + '+)' +
    '|(?:^|(?<=[^A-Za-z0-9@_.\\-]))' +
      '((?:[A-Za-z0-9](?:[A-Za-z0-9\\-]*[A-Za-z0-9])?\\.)+' +
      '(?:(?:' + GTLD + '|co|tv)(?![A-Za-z0-9\\-])(?:\\/' + URL_CHARS + '*)?' +
      '|(?:' + CCTLD + ')(?![A-Za-z0-9\\-])\\/' + URL_CHARS + '*))',
    'gi'
  )
}

// 終わりに付いた句読点は URL に含めません（「詳しくは https://a.jp/x.」の「.」）。
function trimUrl(u) {
  return u.replace(/[.,!?:;'")\]]+$/, '')
}

/** 本文の中の URL を [{ start, end, url }] で返します。 */
export function findUrls(text) {
  var s = String(text == null ? '' : text)
  var re = urlPattern()
  var out = []
  var m
  while ((m = re.exec(s))) {
    var raw = m[1] || m[2] || ''
    if (!raw) { re.lastIndex++; continue }
    var start = m.index + m[0].indexOf(raw)
    var url = trimUrl(raw)
    out.push({ start: start, end: start + url.length, url: url })
  }
  return out
}

// 絵文字のまとまり（ZWJ でつないだ家族、肌の色、国旗、キーキャップ）。
var EMOJI = /(?:\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])*(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])*)*)|[\u{1F1E6}-\u{1F1FF}]{2}|[#*0-9]️?⃣/gu

function cpWeight(cp) {
  var r = X_RULES.ranges
  for (var i = 0; i < r.length; i++) if (cp >= r[i][0] && cp <= r[i][1]) return 100
  return X_RULES.defaultWeight
}

function plainWeight(s) {
  var total = 0
  var re = new RegExp(EMOJI.source, 'gu')
  var last = 0
  var m
  while ((m = re.exec(s))) {
    // 単独の © ® ‼ などは X でも1文字扱い（下の範囲に入る）なので、
    // まとまりとしては数えません。
    var cp0 = m[0].codePointAt(0)
    if (m[0].length === 1 && cp0 < 0x2190) continue
    total += codepoints(s.slice(last, m.index))
    total += X_RULES.defaultWeight
    last = m.index + m[0].length
  }
  return total + codepoints(s.slice(last))
}

function codepoints(s) {
  var total = 0
  for (var ch of s) total += cpWeight(ch.codePointAt(0))
  return total
}

/** X で何文字として数えられるか（280 まで）。日本語は1文字=2、URLは23。 */
export function xLength(text) {
  var s = String(text == null ? '' : text)
  if (s.normalize) s = s.normalize('NFC')
  var urls = findUrls(s)
  var total = 0
  var at = 0
  for (var i = 0; i < urls.length; i++) {
    total += plainWeight(s.slice(at, urls[i].start))
    total += X_RULES.urlLength * X_RULES.scale
    at = urls[i].end
  }
  total += plainWeight(s.slice(at))
  return Math.ceil(total / X_RULES.scale)
}

/** 投稿先ごとの文字数。X だけは X の数え方、それ以外は画面の文字数です。 */
export function lengthFor(net, text) {
  var r = RULES[net]
  return r && r.weighted ? xLength(text) : String(text == null ? '' : text).length
}

/* 計測用リンク。自社サイトへのリンクに ?ref=<SNS名> を付けると、
   アクセス解析でどの投稿から来た人かが分かります（アプリ内のブラウザは
   紹介元を送ってこないことが多く、付けないと「直接」に混ざります）。
   付けるのは自社サイトへのリンクだけです。他社のURLを書き換えるのは失礼で、
   壊すおそれもあります。 */
export var REF_NAMES = { x: 'x', facebook: 'facebook', instagram: 'instagram', threads: 'threads', linkedin: 'linkedin', line: 'line' }

/** キャンペーン名を URL に入れて困らない形にします（空白は - に、40文字まで）。 */
export function cleanCampaign(s) {
  return String(s == null ? '' : s).trim().replace(/[\s　]+/g, '-').replace(/[?&#=/\\"'<>]/g, '').slice(0, 40)
}

function sameSite(hostname, host) {
  var a = String(hostname || '').toLowerCase().replace(/^www\./, '')
  var b = String(host || '').toLowerCase().replace(/^www\./, '')
  return !!a && !!b && a === b
}

/** 自社サイトへの URL なら ref（と utm_campaign）を付けて返します。 */
export function tagUrl(url, net, campaign, host) {
  var raw = String(url == null ? '' : url)
  if (!raw || !REF_NAMES[net]) return raw
  var full = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw
  var u
  try { u = new URL(full) } catch (_) { return raw }
  if (!sameSite(u.hostname, host)) return raw
  u.searchParams.set('ref', REF_NAMES[net])
  var c = cleanCampaign(campaign)
  if (c) u.searchParams.set('utm_campaign', c)
  else u.searchParams.delete('utm_campaign')
  return u.toString()
}

/** 本文の中の自社サイトへのリンクにも同じ印を付けます。 */
export function tagText(text, net, campaign, host) {
  var s = String(text == null ? '' : text)
  var urls = findUrls(s)
  if (!urls.length) return s
  var out = ''
  var at = 0
  for (var i = 0; i < urls.length; i++) {
    out += s.slice(at, urls[i].start) + tagUrl(urls[i].url, net, campaign, host)
    at = urls[i].end
  }
  return out + s.slice(at)
}

/** X に画像を付けられるのは、この管理画面からアップロードした画像だけ
 *  （Vercel Blob の公開URL）。X は画像そのものを受け取る作りなので、
 *  サーバーが画像を取りに行く必要があり、任意のURLを取りに行くと
 *  社内のアドレスを叩かされる穴（SSRF）になるためです。 */
export function isBlobUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s]+$/i.test(String(url || ''))
}

/** その投稿先に実際に渡すものを組み立てます。
 *  p = { text, link, campaign, images: [{url, preview}], variants: { net: { text, noLink } } }
 *  戻り値の text が、その投稿先に送る本文そのものです。 */
export function compose(net, p, host) {
  var v = (p && p.variants && p.variants[net]) || {}
  var own = typeof v.text === 'string' && v.text.trim() ? v.text : ''
  var body = tagText(String(own || (p && p.text) || '').trim(), net, p && p.campaign, host)
  var link = v.noLink ? '' : tagUrl(String((p && p.link) || '').trim(), net, p && p.campaign, host)
  var rule = RULES[net] || { maxImages: 1 }
  var all = (p && p.images) || []
  var images = all.slice(0, rule.maxImages)
  if (net === 'x') images = images.filter(function (i) { return isBlobUrl(i.url) })
  // 同じリンクが本文に入っているなら、後ろにもう一度付けません。
  var inBody = link && body.indexOf(link) !== -1
  // Facebook は画像なしの投稿ならリンクを別に渡し、カードとして出します。
  var separate = net === 'facebook' && !images.length
  var text = body
  if (link && !inBody && !separate) text = body ? body + '\n' + link : link
  return {
    net: net,
    text: text,
    body: body,
    link: link,
    linkSeparate: separate && !!link,
    images: images,
    droppedImages: all.length - images.length,
    custom: !!own,
  }
}

/** 送る前の確認。errors があれば送りません。warnings は知らせるだけです。 */
export function check(net, c) {
  var r = RULES[net]
  var errors = []
  var warnings = []
  if (!r) return { count: 0, limit: 0, errors: ['不明な投稿先です。'], warnings: warnings }
  var count = lengthFor(net, c.text)
  var hasText = !!String(c.body || '').trim() || !!c.link
  if (count > r.limit) {
    errors.push(net === 'x'
      ? '文字数が上限を超えています（Xの数え方で ' + count + ' / ' + r.limit + '）。'
      : '文字数が上限を超えています（' + count + ' / ' + r.limit + '）。')
  }
  if (r.needText && !hasText) errors.push('本文が必要です（画像だけの投稿はできません）。')
  if (!hasText && !c.images.length) errors.push('本文か画像のどちらかが必要です。')
  if (r.image === 'required' && !c.images.length) errors.push('画像が必要です（Instagramは画像なしでは投稿できません）。')
  if (net === 'instagram') {
    if (c.link || findUrls(c.body).length) {
      warnings.push('本文のリンクは押せません。『プロフィールのリンクから』と書くのがおすすめです。')
    }
    var tags = (String(c.text).match(/[#＃][^\s#＃]+/g) || []).length
    if (tags > r.hashtags) errors.push('ハッシュタグは ' + r.hashtags + ' 個までです（いま ' + tags + ' 個）。')
  }
  if (net === 'x') {
    warnings.push(findUrls(c.text).length
      ? 'リンク付きは1投稿あたり約0.2ドル（リンクなしは約0.015ドル）かかります。'
      : 'X は1投稿あたり約0.015ドルかかります（リンクを入れると約0.2ドル）。')
    if (c.droppedImages > 0) {
      warnings.push('この画像はXには付きません。Xに画像を付けられるのは、この画面からアップロードした画像だけです。')
    }
  } else if (c.droppedImages > 0 && r.maxImages > 0) {
    warnings.push('画像は1枚目だけを送ります。')
  } else if (c.droppedImages > 0) {
    warnings.push('LinkedIn には画像を送れません（本文とリンクだけ送ります）。')
  }
  if (net === 'line' && count > 0) {
    warnings.push('友だち全員に届き、届いた人数ぶん通数を使います。')
  }
  return { count: count, limit: r.limit, errors: errors, warnings: warnings }
}

/* ===================================================== 投稿前チェック（表現） ==
   出す前に「言い方」で引っかかりそうなところを拾います。決まった言葉と形を
   探すだけの、機械的な確認です。法律の判断はしません——同じ「日本一」でも、
   調査の根拠が書いてあれば言ってよいことがあり、逆にここで何も出なくても
   問題が無いとは限りません。画面にもそう書きます。

   拾うもの（kind）:
     keihyo   景品表示法（根拠の無い「最安」「No.1」「絶対」など）
     yakki    薬機法など（医薬品でない商品・サービスで体への効き目をうたう）
     stema    ステマ規制（2023年10月から。頼まれて紹介する投稿は「PR」表示が要る）
     nijuu    二重価格（「通常価格→特価」で、いつまでの値段かが書いていない）
     privacy  個人の情報（電話番号・メール・住所）
     platform 投稿先の決まり（ハッシュタグの数）
     ng       このサイトで決めた「使わない言葉」
     notation 表記の統一（このサイトで決めた書き方）

   どれも送信を止めません。知らせるだけで、送る/送らないは人が決めます。 */

export var REVIEW_KINDS = {
  keihyo: '景品表示法',
  yakki: '薬機法など',
  stema: 'ステマ規制',
  nijuu: '二重価格',
  privacy: '個人の情報',
  platform: '投稿先の決まり',
  ng: '使わない言葉',
  notation: '表記の統一',
}

export var REVIEW_NOTE = '確認の手助けで、法的な判断ではありません。気になるときは、専門家や各SNSの決まりを確かめてください。'

/* 決まった言葉。re は「その言葉」だけに当たるように書き、事実の説明に
   なる形（「完全予約制」「果汁100%」）は先読み・後読みで外します。 */
var KEIHYO = [
  { re: /業界最安|地域最安|最安値?|日本一安い/g, alt: '「お求めやすい価格」、または根拠を添える（例：※2026年9月 当店調べ・市内の同業5店と比較）' },
  { re: /日本一|世界一|地域一番|業界(?:No\.?|ナンバー)\s*[1１]|[Nn][Oo]\.?\s*[1１](?![0-9０-９])|ナンバーワン|№\s*[1１]/g, alt: '「多くのお客様に選ばれています」、または根拠を添える（例：※〇〇調べ 2026年8月・調査の対象と方法）' },
  { re: /業界初|日本初|世界初|地域初|唯一無二|唯一の/g, alt: '「当店では初めての」「〇〇市では珍しい」など、確かめられる範囲の言い方に' },
  { re: /最高(?!気温|裁|齢|速度|値|位|責任者|経営)|最上級|最強|究極/g, alt: '「自信をもっておすすめする」「こだわりの」など', soft: true },
  { re: /(?:絶対|必ず)(?=[^。\n！!]{0,14}(?:効|治|痩|やせ|儲|稼|成功|上が|伸び|満足|変わ|結果|叶|合格|売れ|集客|増え|きれい|綺麗|若))/g, alt: '「〜を目指します」「〜のお手伝いをします」など、結果を約束しない言い方に' },
  { re: /(?<!果汁|綿|麻|毛|絹|国産|天然|純|ウール|コットン|そば粉|米粉|小麦|原料|素材|産)100\s*[%％](?!\s*(?:果汁|オーガニック|天然|国産|綿|そば|ジュース|使用))|百パーセント/g, alt: '実際の数字（例：「9割以上のお客様が」※2026年 当店アンケート 120人）か、「ほとんどの」' },
  { re: /完全(?!予約|個室|禁煙|分煙|週休|貸切|貸し切り|在宅|オーダー|版|攻略|無料)|永久(?!歯|凍土)|永遠に/g, alt: '「しっかり」「長くお使いいただける」など' },
]
var KEIHYO_WHY = '根拠の無い「いちばん」「必ず」は、実際より良く見せる表示（景品表示法の優良誤認・有利誤認）とされるおそれがあります。'
var KEIHYO_WHY_SOFT = '「最高の一日」のような感想なら問題ありません。商品やサービスの品質を「いちばん」と言う使い方なら、根拠が要ります（景品表示法の優良誤認）。'
var KEIHYO_WHY_BASIS = '根拠らしき書き方（※〜調べ など）があります。調べた時期・対象・方法まで書いてあるか、今も正しいかを確かめてください。'

var YAKKI = [
  { re: /治(?:る|り|す|します|った|療)/g, alt: '「〜が気になる方に」' },
  { re: /効(?:く|き(?:ます|目)|いた)|効果(?:抜群|てきめん|絶大)/g, alt: '「〜のときにおすすめ」「ご好評をいただいています」' },
  { re: /痩せ(?:る|ます|た|られ)|やせ(?:る|ます|られ)|ダイエット効果|脂肪(?:燃焼|を燃や)|代謝(?:アップ|が上が)/g, alt: '「軽やかな毎日を応援」「体を動かすきっかけに」' },
  { re: /若返(?:る|り)|アンチエイジング|老化(?:防止|を防)/g, alt: '「年齢に応じたお手入れ（エイジングケア）」「いきいきとした印象に」' },
  { re: /(?:シミ|しみ|シワ|しわ|たるみ|ニキビ|くすみ)(?:が|を)?(?:消え|消す|なくな|無くな|取れ|改善)/g, alt: '「明るい印象の肌へ」「うるおいを与えて、すこやかに」（化粧品として言える範囲で）' },
  { re: /デトックス|免疫力|血行(?:促進|が良く)|血流(?:改善|が良く)|むくみ(?:解消|が取れ|が消え)|便秘(?:解消|が治)|発毛|育毛効果|薄毛(?:改善|が治)|自律神経(?:を整え|が整)/g, alt: '「すっきり」「心地よい」「リラックスのひとときに」' },
]
var YAKKI_WHY = '医薬品・医療機器として認められていない商品やサービス（食品・雑貨・エステ・整体など）で、体の変化や効き目をうたうと、薬機法・健康増進法・景品表示法に触れるおそれがあります（医療機関も、広告できる内容は限られています）。'

var STEMA_HINT = /提供して(?:いただ|頂)|ご提供(?:いただ|頂)|(?:いただ|頂)いた(?:商品|サンプル)|サンプルを(?:いただ|頂)|招待(?:いただ|頂|され)|ご招待で|タイアップ|案件|アフィリエイト|紹介コード|ギフティング|モニター(?:として|に当選)|PR依頼|紹介料|コラボ(?:商品|企画)/
var STEMA_MARK = /(?:^|[^A-Za-z])(?:PR|ＰＲ)(?![A-Za-z])|広告|プロモーション|タイアップ投稿|提供[:：]/

// URL を同じ長さの空白に置き換えます（位置をずらさずに、URL の中を探さないため）。
function blankUrls(text) {
  var s = String(text == null ? '' : text)
  var urls = findUrls(s)
  for (var i = urls.length - 1; i >= 0; i--) {
    s = s.slice(0, urls[i].start) + ' '.repeat(urls[i].end - urls[i].start) + s.slice(urls[i].end)
  }
  return s
}

/** 本文の中のハッシュタグ [{ start, end, tag }]（URL の中の # と「#1」は数えません）。 */
export function hashtags(text) {
  var s = blankUrls(text)
  var out = []
  var re = /(^|[^0-9A-Za-z_&\/])[#＃]([^\s#＃.,!?、。！？「」()（）\[\]【】]+)/g
  var m
  while ((m = re.exec(s))) {
    if (/^[0-9]+$/.test(m[2])) continue
    out.push({ start: m.index + m[1].length, end: m.index + m[0].length, tag: m[2] })
  }
  return out
}

/** 表現の確認。text は実際に送る本文、net は投稿先（無くてもよい）、
 *  style は validateStyle を通した { ng, notation }。
 *  戻り値: [{ kind, label, level: 'warn'|'note', word, at, why, alt, fix?, count? }] */
export function review(text, net, style) {
  var raw = String(text == null ? '' : text)
  var s = blankUrls(raw)
  var out = []
  var push = function (kind, level, word, at, why, alt, extra) {
    var item = { kind: kind, label: REVIEW_KINDS[kind], level: level, word: word, at: at, why: why, alt: alt || '' }
    if (extra) for (var k in extra) item[k] = extra[k]
    out.push(item)
  }
  var basis = /※|調べ|調査|出典|自社比|当社比/.test(s)
  var seen = {}
  var each = function (list, fn) {
    list.forEach(function (r) {
      var re = new RegExp(r.re.source, 'g')
      var m
      while ((m = re.exec(s))) {
        if (!m[0]) { re.lastIndex++; continue }
        if (seen[m[0]]) continue
        seen[m[0]] = 1
        fn(m, r)
      }
    })
  }
  each(KEIHYO, function (m, r) {
    push('keihyo', basis || r.soft ? 'note' : 'warn', m[0], m.index, basis ? KEIHYO_WHY_BASIS : r.soft ? KEIHYO_WHY_SOFT : KEIHYO_WHY, r.alt)
  })
  each(YAKKI, function (m, r) { push('yakki', 'warn', m[0], m.index, YAKKI_WHY, r.alt) })

  var st = STEMA_HINT.exec(s)
  if (st && !STEMA_MARK.test(s)) {
    push('stema', 'warn', st[0], st.index,
      'ほかの会社やお店から、商品・お金・招待などを受けて紹介する投稿は、広告だと分かるように書く必要があります（2023年10月からのステマ規制）。自分のお店の商品を自分のアカウントで紹介するだけなら対象外です。',
      '本文の最初に「PR」または「広告」と入れる（例：【PR】〇〇さんから商品をご提供いただきました）')
  }

  // 二重価格：「通常価格 3,000円 → 2,400円」のように比べる値段があるもの。
  var pm = /(?:通常(?:価格|料金|販売価格)?|定価|元値|当店(?:通常)?価格|参考価格|メーカー希望(?:小売)?価格)[^\n]{0,24}?[0-9０-９][0-9０-９,，]*\s*円/.exec(s)
  if (pm) {
    var cutPrice = /→|⇒|➡|から|のところ|今だけ|特価|割引|[0-9０-９]+\s*[%％]\s*(?:OFF|オフ|引)|半額|値下げ|SALE|セール/i.test(s)
    var period = /まで|期間|本日限り|今週末|今月末|[0-9０-９]{1,2}\s*[\/／月]\s*[0-9０-９]{1,2}\s*日?\s*[〜~～\-－]/.test(s)
    if (cutPrice) {
      push('nijuu', period ? 'note' : 'warn', pm[0].slice(0, 24), pm.index,
        period
          ? '比べる価格（通常価格など）は、最近の相当の期間（目安：直近8週間の半分以上）その値段で売っていた実績が要ります。実績があるか確かめてください。'
          : '値下げを見せるときは、比べる価格が本当にふだんの値段か（目安：直近8週間の半分以上その値段で売っていたか）と、いつまでの値段かを書く必要があります。期間が見当たりません。',
        '「通常価格 3,000円（2026年8月まで販売）→ 9月30日まで 2,400円」のように、期間を書く')
    }
  }

  // 個人の情報。お店の代表番号・代表アドレス・所在地なら問題ありません。
  var phone = /(?<![0-9０-９])(?:0[0-9]{1,4}[-－‐ ][0-9]{1,4}[-－‐ ][0-9]{3,4}|0[789]0[0-9]{8}|0[0-9]{9})(?![0-9０-９])/.exec(s)
  if (phone) push('privacy', 'note', phone[0], phone.index, '電話番号が入っています。お店の代表番号なら問題ありません。個人の携帯番号やお客様の番号ではないか確かめてください。', '代表番号にするか、「お電話はプロフィールの番号へ」')
  var mail = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/.exec(s)
  if (mail) push('privacy', 'note', mail[0], mail.index, 'メールアドレスが入っています。お店の代表アドレスか確かめてください（載せると迷惑メールが増えることがあります）。', '「お問い合わせはホームページのフォームから」')
  var addr = /〒\s*[0-9]{3}[-－][0-9]{4}|(?:東京都|北海道|(?:京都|大阪)府|[^\s、。]{2,3}県)[^\s、。]{1,12}?[市区町村][^\s、。]{0,12}?[0-9０-９一二三四五六七八九十]+\s*(?:丁目|番地?|[-－])\s*[0-9０-９]+/.exec(s)
  if (addr) push('privacy', 'note', addr[0], addr.index, '住所が入っています。お店の所在地なら問題ありません。ご自宅やお客様の住所ではないか確かめてください。', '「場所はプロフィールの地図から」')

  // 投稿先の決まり（ハッシュタグの数）。
  var tags = hashtags(raw).length
  if (net === 'x' && tags > 2) push('platform', 'warn', tags + '個', 0, 'X ではハッシュタグは1〜2個が目安です。多いと読みにくく、宣伝目的の投稿として表示されにくくなることがあります。', '大事な1〜2個に減らす')
  if (net === 'instagram' && tags > 5) push('platform', 'note', tags + '個', 0, 'Instagram は 3〜5個を勧めています（30個まで付けられますが、多いほど届くわけではありません）。', '内容に合う3〜5個に絞る')
  if (net === 'threads' && tags > 1) push('platform', 'note', tags + '個', 0, 'Threads のトピックタグは1投稿に1つだけです。2つ目からはタグになりません。', 'いちばん大事な1つだけ残す')
  if (net === 'bluesky' && tags > 3) push('platform', 'note', tags + '個', 0, 'Bluesky では、ハッシュタグは少なめ（1〜3個）が読みやすいとされます。', '1〜3個に減らす')
  if (net === 'gbp' && tags) push('platform', 'note', tags + '個', 0, 'Googleビジネスプロフィールの投稿では、ハッシュタグは検索にも表示にも使われません。', 'ハッシュタグを外し、地名やサービス名を文章で書く')

  // このサイトの決まり。
  var my = style || {}
  ;(my.ng || []).forEach(function (w) {
    var i = s.indexOf(w.word)
    if (i !== -1) push('ng', 'warn', w.word, i, 'このサイトで「使わない」と決めた言葉です。' + (w.why ? '（' + w.why + '）' : ''), w.alt ? '「' + w.alt + '」' : '')
  })
  ;(my.notation || []).forEach(function (r) {
    var hits = notationHits(raw, r)
    if (hits.length) {
      push('notation', 'note', r.from, hits[0], '書き方を「' + r.to + '」にそろえると決めています（' + hits.length + 'か所）。', '「' + r.from + '」→「' + r.to + '」', { fix: true, count: hits.length })
    }
  })
  // 同じ種類の中は、本文に出てくる順に。
  var order = Object.keys(REVIEW_KINDS)
  return out.sort(function (a, b) { return (order.indexOf(a.kind) - order.indexOf(b.kind)) || (a.at - b.at) })
}

/** 表記の決まり1つが当たる場所（先頭の位置の一覧）。例外の言葉の中、
 *  すでに直した形（to）の中、URL の中は数えません。 */
export function notationHits(text, rule) {
  var s = blankUrls(text)
  var from = String((rule && rule.from) || '')
  if (!from) return []
  var guard = []
  var keep = ((rule && rule.except) || []).slice()
  if (rule.to && rule.to.indexOf(from) !== -1) keep.push(rule.to)
  keep.forEach(function (e) {
    if (!e) return
    var i = s.indexOf(e)
    while (i !== -1) { guard.push([i, i + e.length]); i = s.indexOf(e, i + 1) }
  })
  var out = []
  var at = s.indexOf(from)
  while (at !== -1) {
    var end = at + from.length
    var inside = guard.some(function (g) { return g[0] <= at && end <= g[1] })
    if (!inside) out.push(at)
    at = s.indexOf(from, end)
  }
  return out
}

/** 表記の決まりをすべて当てた本文と、直した数。 */
export function applyNotation(text, rules) {
  var s = String(text == null ? '' : text)
  var changes = 0
  ;(rules || []).forEach(function (r) {
    var hits = notationHits(s, r)
    for (var i = hits.length - 1; i >= 0; i--) {
      s = s.slice(0, hits[i]) + r.to + s.slice(hits[i] + r.from.length)
      changes++
    }
  })
  return { text: s, changes: changes }
}

/* ---- このサイトの決まり（使わない言葉・表記の統一）の保存形 ----
   画面では1行に1つ書いてもらいます。
     使わない言葉: 「激安」 または 「激安 → お求めやすい（安っぽく見えるため）」
     表記の統一:   「お客様 → お客さま」 または 「お客様 → お客さま ／ 例外: お客様各位, お客様窓口」 */
export var STYLE_LIMITS = { ng: 100, notation: 100, word: 30, except: 10, exceptLen: 40, why: 60 }

function cut(v, n) { return String(v == null ? '' : v).replace(/[\r\n\t]/g, ' ').trim().slice(0, n) }

/** 受け取った決まりを確かめて、保存できる形にします。おかしな行は落とし、
 *  落とした理由を problems に入れます。 */
export function validateStyle(input) {
  var L = STYLE_LIMITS
  var src = input && typeof input === 'object' ? input : {}
  var problems = []
  var ng = []
  var seenNg = {}
  ;(Array.isArray(src.ng) ? src.ng : []).forEach(function (w) {
    var word = cut(w && typeof w === 'object' ? w.word : w, L.word)
    if (!word || seenNg[word]) return
    if (ng.length >= L.ng) { problems.push('使わない言葉は' + L.ng + '個までです。'); return }
    seenNg[word] = 1
    ng.push({ word: word, alt: cut(w && w.alt, L.word), why: cut(w && w.why, L.why) })
  })
  var notation = []
  var seenFrom = {}
  ;(Array.isArray(src.notation) ? src.notation : []).forEach(function (r) {
    var from = cut(r && r.from, L.word)
    var to = cut(r && r.to, L.word)
    if (!from) return
    if (!to) { problems.push('「' + from + '」の直した後の書き方がありません（「前 → 後」の形で書きます）。'); return }
    if (from === to) { problems.push('「' + from + '」は直す前と後が同じです。'); return }
    if (seenFrom[from]) { problems.push('「' + from + '」が2回書かれています（最初の1つを使います）。'); return }
    if (notation.length >= L.notation) { problems.push('表記の決まりは' + L.notation + '個までです。'); return }
    seenFrom[from] = 1
    var except = (Array.isArray(r.except) ? r.except : []).map(function (e) { return cut(e, L.exceptLen) })
      .filter(function (e) { return e && e.indexOf(from) !== -1 }).slice(0, L.except)
    notation.push({ from: from, to: to, except: except })
  })
  return { style: { ng: ng, notation: notation }, problems: problems }
}

/** 画面の欄（1行に1つ）から決まりを読みます。 */
export function parseStyleLines(ngText, notationText) {
  var arrow = /\s*(?:→|->|=>|⇒)\s*/
  var ng = String(ngText || '').split(/\r?\n/).map(function (l) {
    l = l.trim()
    if (!l) return null
    var why = ''
    var m = /[（(]([^）)]*)[）)]\s*$/.exec(l)
    if (m) { why = m[1]; l = l.slice(0, m.index).trim() }
    var p = l.split(arrow)
    return { word: p[0], alt: p[1] || '', why: why }
  }).filter(Boolean)
  var notation = String(notationText || '').split(/\r?\n/).map(function (l) {
    l = l.trim()
    if (!l) return null
    var ex = []
    var m = /\s*[／\/|｜]?\s*例外\s*[:：]\s*(.*)$/.exec(l)
    if (m) { ex = m[1].split(/\s*[,、，]\s*/); l = l.slice(0, m.index).trim() }
    var p = l.split(arrow)
    return { from: p[0], to: p[1] || '', except: ex }
  }).filter(Boolean)
  return { ng: ng, notation: notation }
}

/** 保存してある決まりを、画面の欄に戻す形にします。 */
export function styleToLines(style) {
  var st = style || {}
  return {
    ng: (st.ng || []).map(function (w) { return w.word + (w.alt ? ' → ' + w.alt : '') + (w.why ? '（' + w.why + '）' : '') }).join('\n'),
    notation: (st.notation || []).map(function (r) { return r.from + ' → ' + r.to + (r.except && r.except.length ? ' ／ 例外: ' + r.except.join(', ') : '') }).join('\n'),
  }
}
