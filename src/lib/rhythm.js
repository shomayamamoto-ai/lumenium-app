// 人間らしい文章の「書き方の決まり」と「機械の点検」。
//
// 書くのは AI（api/human-write.js）ですが、読んで決めるのは人です。そのため、
// 書く前に渡す決まり（WRITING_RULES）と、書いたあとに数える点検（analyze）を
// 同じこのファイルに置き、AI への指示・管理画面の説明・点検の3か所が
// 同じものを見るようにしています（画面用は scripts/build-markup.mjs が
// public/rhythm.js に写します。window.lumRhythm）。
//
// 点検は「機械的に数えられること」だけです。文末が同じ形で続いていないか、
// 文の長さが平らになっていないか、「〜を説明します」のような宣言が無いか、
// 迷い・断定・観察が切り替わっているか。良い文章かどうかは決めません。
// 決めるのは読んだ人で、点検は「ここが機械っぽく読まれやすい」を指すだけです。
//
// このファイルは import を持ちません（画面でも読むため）。

/* ------------------------------------------------------------- 書き方の決まり -- */

/** 書く前に AI に渡す決まり。画面の「この書き方の決まり」にも同じものを出します。 */
export const WRITING_RULES = [
  {
    k: 'rhythm',
    title: '緩急は「頭の動き方」を切り替えて作る',
    body: '文の長短だけで緩急は生まれない。見る（観察）→ 迷う（逡巡）→ 言い切る（断定）→ もう一度見る（再観察）のように、考えている人の頭の動きが文ごとに切り替わること。同じ動き方を4文以上続けない。',
  },
  {
    k: 'tension',
    title: 'ほどけていない問いを、最後まで1つ残す',
    body: '書き出しで生まれた引っかかりを、途中で全部ほどかない。読み終えても考え続けられる問い・違和感・決めきれないことを1つ残す。最後を「つまり」「このように」でまとめきらない。',
  },
  {
    k: 'voice',
    title: '解説する人ではなく、考えている当事者として書く',
    body: '外から教える声（〜が重要です、〜と言えるでしょう）ではなく、その場にいて考えている人の声で書く。分からないことは分からないと書いてよい。読者に教えようとしない。',
  },
  {
    k: 'material',
    title: '材料は、その場の状況からだけ取る',
    body: '一般論・統計の受け売り・どこにでも当てはまる例は使わない。渡された状況（場所・時刻・人・物・数字・言われた言葉）から材料を取る。渡されていない事実（金額・実績・社名・人数）は作らない。',
  },
  {
    k: 'device',
    title: '仕掛けは使うだけで、宣言しない',
    body: '「〜を説明します」「本記事では」「結論から言うと」「いかがでしたか」のように、これから何をするかを言う文を書かない。比喩・転換・問いかけは、言わずにそのまま使う。',
  },
  {
    k: 'surface',
    title: '書いたあとに、表面を機械で点検する',
    body: '同じ文末が3回続いていないか、文の長さが平らになっていないか、短い一文があるか、接続詞で文をつないでばかりいないかを確かめて直す。',
  },
]

/** AI に渡すための、決まりの文章（番号付き）。 */
export function rulesText() {
  return WRITING_RULES.map((r, i) => `${i + 1}. ${r.title}\n   ${r.body}`).join('\n')
}

/* ------------------------------------------------------------------ 文に分ける -- */

/** 書式の印（**、見出しの ## など）を外した、読むための文字だけ。 */
function bare(text) {
  return String(text == null ? '' : text)
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*\*|\*\*|(?<![*\w])\*(?![\s*])/g, '')
    .replace(/\r/g, '')
}

const CLOSE = '」』）)】〕"\''

/** 文に分けます。見出し（## …）・箇条書き・表の行・画像は数えません
 *  （文のリズムではなく、形のための行なので）。 */
export function sentences(text) {
  const out = []
  bare(text).split('\n').forEach((raw) => {
    const line = raw.trim()
    if (!line) return
    if (/^#{1,6}\s/.test(line) || /^[-*・]\s/.test(line) || /^\d{1,3}[.)．]\s/.test(line) || /^\|/.test(line) || /^!\[/.test(line)) return
    // 。！？ で切る。かぎかっこの中の 。 では切らない。
    let buf = ''
    let depth = 0
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      buf += c
      if (c === '「' || c === '『') depth++
      else if ((c === '」' || c === '』') && depth > 0) depth--
      if (depth === 0 && /[。！？!?]/.test(c)) {
        while (i + 1 < line.length && (/[。！？!?]/.test(line[i + 1]) || CLOSE.includes(line[i + 1]))) buf += line[++i]
        if (buf.trim()) out.push(buf.trim())
        buf = ''
      }
    }
    if (buf.trim()) out.push(buf.trim())
  })
  return out
}

/* ------------------------------------------------------------------ 文の形 -- */

/** 文末の形。「です」「ます」「た」「体言止め」など、続いたときに耳につく単位で分けます。 */
export function ending(s) {
  const t = String(s).replace(/[。！？!?…‥〜ー」』）)】〕"'\s]+$/, '')
  if (/[？?]\s*[」』）)]*$/.test(s) || /(か|かな|かしら|だろうか|でしょうか)$/.test(t)) return '問い'
  const ENDS = [
    [/ませんでした$/, 'ませんでした'], [/ました$/, 'ました'], [/ません$/, 'ません'], [/ましょう$/, 'ましょう'], [/ます$/, 'ます'],
    [/でした$/, 'でした'], [/でしょう$/, 'でしょう'], [/です[よね]*$/, 'です'],
    [/だった$/, 'だった'], [/である$/, 'である'], [/(なの)?だ[よね]*$/, 'だ'],
    [/なかった$/, 'なかった'], [/ない$/, 'ない'],
    [/た$/, 'た'],
    [/[よね]$/, '終助詞'],
    [/[うくすつぬふむゆるぐずづぶぷ]$/, '動詞'],
    [/い$/, '形容詞'],
  ]
  for (const [re, name] of ENDS) if (re.test(t)) return name
  return '体言止め'
}

const HESITATE = /(かもしれ|だろうか|でしょうか|のだろう|かどうか|か[。？?]?$|かな[あぁ]?[。？?]?$|気がする|気がします|わからな|分からな|わかりませ|分かりませ|迷っ|迷う|ためら|たぶん|多分|おそらく|どうだろう|どうなんだろう|どっちだ|と思いかけ|言い切れ|[？?])/
const OBSERVE = /([0-9０-９]|[一二三四五六七八九十]+(時|分|人|回|日|枚|本|件|年)|朝|昼|夜|夕方|午前|午後|[月火水木金土日]曜|週|窓|机|手|指|声|音|色|光|匂|におい|雨|風|画面|店|駅|道|ドア|紙|カップ|ていた|ている|ていました|ています|てきた|見えた|聞こえ|言われ|と言った|と言っ)/
const ASSERT_END = /(だ|である|のだ|のです|ない|しかない|違いない|はずだ|べきだ|ます|です|た)$/

/** その文で、書いている人の頭がどう動いているか。
 *  hesitate: 迷う・問う / assert: 短く言い切る / observe: 見たもの・起きたこと / explain: 説明 */
export function mode(s) {
  const t = String(s).replace(/[。！？!?」』）)\s]+$/, '')
  if (HESITATE.test(s)) return 'hesitate'
  if (t.length <= 20 && ASSERT_END.test(t)) return 'assert'
  if (OBSERVE.test(t)) return 'observe'
  return 'explain'
}

export const MODE_LABEL = { observe: '観察', hesitate: '逡巡', assert: '断定', explain: '説明' }

/* ------------------------------------------------------------------ 点検 -- */

// 「これから何をするか」を言う文（仕掛けの宣言）。
const META = [
  /(について|を)(ご?説明|解説|ご?紹介|お伝え|見て|考えて|掘り下げ|整理)(し|いき|して(いき)?)?(ます|ましょう|たい|ていきます)/,
  /本(記事|稿|ページ|エントリ)(では|で)/,
  /この記事(では|で|を読めば|を読むと)/,
  /いかがでした(か|でしょうか)/,
  /結論から(言|い)(うと|います|えば)/,
  /(以下|下記)(では|で|に)(.{0,8})(説明|紹介|解説|まとめ)/,
  /(それでは|では)(、)?(さっそく|早速|順に|一つずつ)/,
  /まとめ(ると|ます|てみます|てみましょう)/,
  /ポイントは(\d|[一二三四五]|以下|次)/,
  /(について|を)(詳しく|わかりやすく|分かりやすく)/,
]
// 外から教える声（解説調の決まり文句）。
const CLICHE = [
  /と言える(でしょう|だろう)/, /と言えます/, /ことが(重要|大切|大事|肝心|必要)(です|だ|になります|となります)/,
  /ではないでしょうか/, /(さまざま|様々)な/, /非常に/, /必要不可欠/, /欠かせません/, /の一つです/,
  /(重要|大切)なポイント/, /ぜひ(参考に|試して|活用)/, /してみてはいかが/, /(押さえ|おさえ)ておきましょう/,
  /と(考えられ|され)ています/, /多くの(人|方)が/, /を心がけましょう/,
  /豊富な(実績|経験|ノウハウ)/, /お気軽に/, /ワンストップ/, /幅広く(対応|ご対応)/, /(丁寧|親身)に(対応|サポート)/, /高品質な/,
]
// 最後でまとめきる書き方（ほどけていない問いが残らない）。
const WRAPUP = /^(つまり|このように|以上のように|以上から|まとめると|要するに|結局のところ|総じて|いずれにせよ|このことから)/
const CONNECT = /^(また|さらに|そして|しかし|ただし|なお|つまり|そのため|したがって|一方|加えて|まず|次に|最後に)[、,]/

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
function cv(a) {
  if (a.length < 2) return 0
  const m = mean(a)
  return m ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) / m : 0
}

/** 文章を点検します。
 *  返すもの: { list:[{ text, len, end, mode }], stats, issues:[{ id, level, title, detail, at:[文の番号] }], score, grade }
 *  level は 'warn'（機械っぽく読まれやすい）と 'info'（あると良い）の2つ。 */
export function analyze(text) {
  const ss = sentences(text)
  const list = ss.map((s) => ({ text: s, len: s.replace(/\s/g, '').length, end: ending(s), mode: mode(s) }))
  const n = list.length
  const lens = list.map((x) => x.len)
  const issues = []
  const add = (id, level, title, detail, at) => issues.push({ id, level, title, detail, at: at || [] })

  // 1. 仕掛けの宣言
  const metaAt = list.map((x, i) => (META.some((re) => re.test(x.text)) ? i : -1)).filter((i) => i >= 0)
  if (metaAt.length) add('meta', 'warn', '「これから〜します」と宣言している', '何をするかを言う文は、読む人を外に立たせます。宣言の文は消して、いきなり中身から始めてください。', metaAt)

  // 2. 解説調の決まり文句
  const clicheAt = list.map((x, i) => (CLICHE.some((re) => re.test(x.text)) ? i : -1)).filter((i) => i >= 0)
  if (clicheAt.length) add('cliche', clicheAt.length >= 2 ? 'warn' : 'info', '外から教える決まり文句', '「〜が重要です」「〜と言えるでしょう」のような言い方は、考えている人の声ではなく解説の声に聞こえます。その場で見たこと・迷ったことに置き換えてください。', clicheAt)

  // 3. 文末が同じ形で続く
  let run = 1
  const runAt = []
  for (let i = 1; i < n; i++) {
    run = list[i].end === list[i - 1].end ? run + 1 : 1
    if (run === 3) runAt.push(i - 2, i - 1, i)
    else if (run > 3) runAt.push(i)
  }
  if (runAt.length) add('endrun', 'warn', '同じ文末が3回以上続いている', `「${list[runAt[0]].end}」で終わる文が続いています。どれか1つを問い・体言止め・短い言い切りに変えると、読む速さが変わります。`, runAt)
  if (n >= 6) {
    const count = {}
    list.forEach((x) => { count[x.end] = (count[x.end] || 0) + 1 })
    const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0]
    if (count[top] / n > 0.6) add('endmono', 'warn', '文末の形がほとんど同じ', `${n}文のうち${count[top]}文が「${top}」で終わっています。`, [])
  }

  // 4. 文の長さが平ら
  if (n >= 5) {
    const c = cv(lens)
    if (c < 0.3) add('flat', 'warn', '文の長さがそろいすぎている', `どの文もだいたい${Math.round(mean(lens))}字前後です。1つは10字前後まで短く、1つは思い切って長くすると、息づかいが出ます。`, [])
    if (n >= 6 && !lens.some((l) => l <= 14)) add('noshort', 'info', '短い一文がない', '14字以下の文が1つもありません。言い切る所で、短い一文を置いてください。', [])
  }

  // 5. 頭の動き方（緩急）
  let mrun = 1
  const mAt = []
  for (let i = 1; i < n; i++) {
    mrun = list[i].mode === list[i - 1].mode ? mrun + 1 : 1
    if (mrun === 4) mAt.push(i - 3, i - 2, i - 1, i)
    else if (mrun > 4) mAt.push(i)
  }
  if (mAt.length) add('moderun', 'warn', `「${MODE_LABEL[list[mAt[0]].mode]}」が4文以上続いている`, '同じ頭の動き方が続くと、文の長さを変えても平らに読まれます。途中で一度、迷う・言い切る・見直すのどれかに切り替えてください。', mAt)
  if (n >= 6) {
    const has = (m) => list.some((x) => x.mode === m)
    if (!has('hesitate')) add('nohesitate', 'info', '迷いが一度も出てこない', '最初から最後まで分かっている人の文になっています。決めきれないこと・引っかかったことを1つ書くと、当事者の声になります。', [])
    if (!has('observe')) add('noobserve', 'info', 'その場の材料が無い', '時刻・場所・物・数字・言われた言葉など、状況から取った材料が見当たりません。', [])
  }

  // 6. 最後でまとめきる
  const tail = list.slice(-2)
  const wrapAt = tail.map((x, k) => (WRAPUP.test(x.text) ? n - tail.length + k : -1)).filter((i) => i >= 0)
  if (n >= 4 && wrapAt.length) add('wrapup', 'warn', '最後で全部まとめている', '「つまり」「このように」で締めると、ほどけていない問いが残りません。まとめの文を消すか、まだ決めきれていないことで終えてください。', wrapAt)

  // 7. 接続詞でつないでばかり
  const connAt = list.map((x, i) => (CONNECT.test(x.text) ? i : -1)).filter((i) => i >= 0)
  if (n >= 5 && connAt.length / n > 0.35) add('connect', 'info', '接続詞で文をつないでばかり', '「また、」「さらに、」で始まる文が多いと、説明の順番を読まされている感じになります。半分は接続詞を外しても意味は通ります。', connAt)

  const warn = issues.filter((x) => x.level === 'warn').length
  const info = issues.length - warn
  const score = n ? Math.max(0, Math.min(100, 100 - warn * 14 - info * 5)) : 0
  const grade = !n ? '' : score >= 85 ? '人の声で読める' : score >= 65 ? 'ところどころ機械っぽい' : '解説の声に聞こえる'
  const stats = {
    n,
    chars: lens.reduce((a, b) => a + b, 0),
    avg: n ? Math.round(mean(lens)) : 0,
    cv: Math.round(cv(lens) * 100) / 100,
    shortest: n ? Math.min(...lens) : 0,
    longest: n ? Math.max(...lens) : 0,
    modes: list.map((x) => x.mode),
  }
  return { list, stats, issues, score, grade }
}

/** 点検で見つかったことを、AI に直してもらうための指示文にします。 */
export function issuesText(result) {
  const r = result || { issues: [], list: [] }
  return r.issues.map((x) => {
    const at = x.at && x.at.length ? `（該当: ${[...new Set(x.at)].slice(0, 4).map((i) => `「${(r.list[i] || {}).text || ''}」`).join(' ')}）` : ''
    return `- ${x.title}: ${x.detail}${at}`
  }).join('\n')
}
