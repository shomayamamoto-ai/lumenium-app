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
