// 口コミを書きやすくするページ（QR → タップで答える → 下書き → ご本人が Google に投稿）の決まり。
//
// 窓口は api/review-assist.js、お客様の画面は public/review.html、設定は口コミ管理の「お願い・QR」。
//
// 守ること（Google の「評価の操作」の決まりと、ステマ規制に沿うため）:
//   ・見返りなし。全員に同じ流れ。満足度で行き先を分けない（良くない答えでも、同じ Google の画面へ）
//   ・「よかった」だけを選ばせない。どの項目も「よかった・ふつう・いまひとつ」を同じ並びで出す
//   ・店が書く内容を決めない。店名・スタッフ名・地名・検索向けの言葉を、下書きに入れない
//   ・作り話をさせない。下書きの材料は、お客様が選んだ答えと、打ったひとことだけ
//   ・投稿するのはご本人。下書きは自由に直せて、使わずに自分で書くこともできる
//
// 作り話の点検（checkDraft）は機械でします。AI の下書きがこれを通らなければ、
// 答えをそのまま文にした下書き（composeDraft。作りようがない）に差し替えます。

export const LEVELS = [['good', 'よかった'], ['ok', 'ふつう'], ['bad', 'いまひとつ']]
export const OVERALL = [[5, 'とても満足'], [4, '満足'], [3, 'ふつう'], [2, 'やや不満'], [1, '不満']]
export const STYLES = [['polite', 'ていねいに'], ['casual', 'くだけて']]
export const DEFAULT_ASPECTS = ['対応の早さ', '説明の分かりやすさ', '仕上がり', '料金', '相談のしやすさ']
export const LIMITS = { services: 12, aspects: 8, label: 24, memo: 200, detail: 40, intro: 120, draftMin: 6, draftMax: 240 }

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
const lines = (v, max) => {
  const src = Array.isArray(v) ? v : String(v == null ? '' : v).split(/\n|、|,/)
  const out = []
  for (const x of src) {
    const s = clean(x, LIMITS.label)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** 設定（口コミ管理の prefs.assist）。 */
export function defaultAssist() {
  return { on: false, mail: false, intro: '', services: [], aspects: DEFAULT_ASPECTS.slice() }
}
export function normalizeAssist(input, base) {
  const p = { ...defaultAssist(), ...(base || {}) }
  const x = input && typeof input === 'object' ? input : {}
  if ('on' in x) p.on = !!x.on
  // お願いメールからも、このページを開けるようにするか（Google の画面へのリンクも、同じメールに並べます）。
  if ('mail' in x) p.mail = !!x.mail
  if ('intro' in x) p.intro = clean(x.intro, LIMITS.intro)
  if ('services' in x) p.services = lines(x.services, LIMITS.services)
  if ('aspects' in x) { const a = lines(x.aspects, LIMITS.aspects); p.aspects = a.length ? a : DEFAULT_ASPECTS.slice() }
  return p
}

/** お客様の答えを、設定にある選択肢だけに絞ります（画面を書きかえて送られても、材料は増えません）。 */
export function normalizeAnswers(input, cfg) {
  const x = input && typeof input === 'object' ? input : {}
  const services = (Array.isArray(x.services) ? x.services : []).map(String).filter((s) => cfg.services.includes(s)).slice(0, 4)
  const aspects = {}
  const src = x.aspects && typeof x.aspects === 'object' ? x.aspects : {}
  for (const a of cfg.aspects) if (LEVELS.some((l) => l[0] === src[a])) aspects[a] = src[a]
  const overall = OVERALL.some((o) => o[0] === Number(x.overall)) ? Number(x.overall) : 0
  const style = x.style === 'casual' ? 'casual' : 'polite'
  const memo = clean(x.memo, LIMITS.memo)
  // 項目ごとの「どのあたりが？」。答えた項目にだけ付けられます（本人の言葉。そのまま下書きに入ります）。
  const details = {}
  const dsrc = x.details && typeof x.details === 'object' ? x.details : {}
  for (const k of Object.keys(aspects)) { const d = clean(dsrc[k], LIMITS.detail); if (d) details[k] = d }
  return { services, aspects, overall, style, memo, details }
}

/** 見本の答え。設定にある選択肢から、良い点・ふつう・気になった点を1つずつ入れます。 */
export function sampleAnswers(cfg, style) {
  const aspects = {}
  const lv = ['good', 'bad', 'ok', 'good']
  cfg.aspects.slice(0, 4).forEach((k, i) => { aspects[k] = lv[i] })
  return normalizeAnswers({ services: cfg.services.slice(0, 1), aspects, overall: 4, style }, cfg)
}

/** 下書きを作れるだけの答えがあるか。 */
/** 答えの充実度（0〜5）と、次に足すとよいもの。お客様の画面と同じ数え方です。
 *  材料が多いほど、下書きが本人の体験どおりになります。 */
export function richness(a, cfg) {
  const n = Object.keys(a.aspects).length
  const own = !!a.memo || Object.keys(a.details || {}).length > 0
  const items = [
    ['利用したもの', !cfg.services.length || a.services.length > 0],
    ['項目を2つ以上', n >= 2],
    ['全体として', !!a.overall],
    ['気になった点か、ふつうだった点', Object.values(a.aspects).some((v) => v !== 'good') || n >= 3],
    ['あなたの言葉（ひとこと・どのあたりが）', own],
  ]
  return { score: items.filter((i) => i[1]).length, max: items.length, missing: items.filter((i) => !i[1]).map((i) => i[0]) }
}

export function enough(a) {
  return !!(a.overall || a.memo || Object.keys(a.aspects).length)
}

/* ---- 答えをそのまま文にする（AI を使わない下書き。作り話が入りようがない） ---- */

const join = (list) => (list.length <= 1 ? list.join('') : list.slice(0, -1).join('、') + 'と' + list[list.length - 1])
const pick = (arr, n) => arr[n % arr.length]

const WORDS = {
  polite: {
    used: [(s) => `${s}をお願いしました。`, (s) => `${s}で利用しました。`, (s) => `${s}を頼みました。`],
    good: [(s) => `${s}がよかったです。`, (s) => `よかったのは、${s}です。`, (s) => `${s}は、よかったと思います。`],
    ok: [(s) => `${s}は、ふつうでした。`, (s) => `${s}は、可もなく不可もなくです。`],
    bad: [(s) => `${s}は、いまひとつでした。`, (s) => `${s}は、少し気になりました。`, (s) => `気になったのは、${s}です。`],
    mix: [(g, b) => `${g}はよかったのですが、${b}は少し気になりました。`, (g, b) => `${g}がよかった一方で、${b}はいまひとつでした。`],
    but: ['気になる点はありましたが、全体としては満足しています。', '気になった所もありますが、お願いしてよかったです。'],
    overall: {
      5: ['全体として、とても満足しています。', 'お願いしてよかったです。とても満足しています。'],
      4: ['全体として、満足しています。', '全体的には満足です。'],
      3: ['全体としては、ふつうでした。', '全体の印象は、ふつうです。'],
      2: ['全体としては、少し不満が残りました。', '全体的には、やや不満です。'],
      1: ['全体としては、不満でした。', '全体的に、不満が残りました。'],
    },
  },
  casual: {
    used: [(s) => `${s}を頼んだ。`, (s) => `${s}で利用。`, (s) => `${s}をお願いした。`],
    good: [(s) => `${s}がよかった。`, (s) => `よかったのは${s}。`, (s) => `${s}はよかったと思う。`],
    ok: [(s) => `${s}はふつう。`, (s) => `${s}は可もなく不可もなく。`],
    bad: [(s) => `${s}はいまひとつ。`, (s) => `${s}は少し気になった。`, (s) => `気になったのは${s}。`],
    mix: [(g, b) => `${g}はよかったけど、${b}は少し気になった。`, (g, b) => `${g}はよかった。ただ、${b}はいまひとつ。`],
    but: ['気になる点はあったけど、全体としては満足。', '気になった所もあるけど、頼んでよかった。'],
    overall: {
      5: ['全体として、とても満足。', '頼んでよかった。とても満足している。'],
      4: ['全体として満足。', '全体的には満足している。'],
      3: ['全体としては、ふつう。', '全体の印象はふつう。'],
      2: ['全体としては、少し不満が残った。', '全体的には、やや不満。'],
      1: ['全体としては、不満。', '全体的に不満が残った。'],
    },
  },
}

/** 項目の名前から作れる、ふつうの言い方。「対応の早さ」が「よかった」なら「対応が早かったです」。
 *
 *  名前そのものを言いかえるだけで、意味は足しません（「料金がよかった」を「安かった」とは書きません）。
 *  言いかえられる形の名前だけに使い、ほかは「〇〇がよかったです」のままにします。
 *  返すのは { good, stem, bad }（stem は「対応が早く、」と次へつなぐ形）。無ければ null。 */
export function naturalOf(label, casual) {
  const s = String(label || '')
  let m
  if ((m = /^(.{2,})の(早|速)さ$/.exec(s))) {
    const [, x, adj] = m
    return casual
      ? { good: `${x}が${adj}かった。`, stem: `${x}が${adj}く`, bad: `${x}はもう少し${adj}くしてほしかった。` }
      : { good: `${x}が${adj}かったです。`, stem: `${x}が${adj}く`, bad: `${x}は、もう少し${adj}くしてほしかったです。` }
  }
  if ((m = /^(.{2,})の(分かり|わかり)やすさ$/.exec(s))) {
    const [, x, w] = m
    return casual
      ? { good: `${x}が${w}やすかった。`, stem: `${x}が${w}やすく`, bad: `${x}は少し${w}にくかった。` }
      : { good: `${x}が${w}やすかったです。`, stem: `${x}が${w}やすく`, bad: `${x}は、少し${w}にくかったです。` }
  }
  if ((m = /^(.{2,})のしやすさ$/.exec(s))) {
    const x = m[1]
    return casual
      ? { good: `${x}しやすかった。`, stem: `${x}しやすく`, bad: `${x}は少ししにくかった。` }
      : { good: `${x}しやすかったです。`, stem: `${x}しやすく`, bad: `${x}は、少ししにくかったです。` }
  }
  if ((m = /^(.{2,})の(丁寧|ていねい|清潔|親切)さ$/.exec(s))) {
    const [, x, adj] = m
    return casual
      ? { good: `${x}が${adj}だった。`, stem: `${x}が${adj}で`, bad: null }
      : { good: `${x}が${adj}でした。`, stem: `${x}が${adj}で`, bad: null }
  }
  return null
}

/** seed を変えると、言い回しと並びが変わります（同じ答えの人が同じ文にならないように）。 */
export function composeDraft(a, seed = 0) {
  const w = WORDS[a.style === 'casual' ? 'casual' : 'polite']
  const n = Math.abs(Math.floor(Number(seed) || 0))
  const by = (lv) => Object.keys(a.aspects).filter((k) => a.aspects[k] === lv)
  const parts = []
  if (a.services.length) parts.push(pick(w.used, n)(join(a.services)))
  const memo = a.memo ? (/[。！？!?]$/.test(a.memo) ? a.memo : a.memo + '。') : ''
  const casual = a.style === 'casual'
  const det = a.details || {}
  const sentence = (t) => (/[。！？!?]$/.test(t) ? t : t + '。')
  const good = by('good').filter((k) => !det[k]), ok = by('ok').filter((k) => !det[k]), bad = by('bad').filter((k) => !det[k])
  const body = []
  // 言いかえられる名前（「対応の早さ」→「対応が早かった」）は、ふつうの言い方で書きます。
  const nat = (k) => naturalOf(k, casual)
  const goodN = good.filter((k) => nat(k)), goodG = good.filter((k) => !nat(k))
  const badN = bad.filter((k) => nat(k) && nat(k).bad), badG = bad.filter((k) => !(nat(k) && nat(k).bad))
  if (goodN.length) body.push(goodN.slice(0, -1).map((k) => nat(k).stem + '、').join('') + nat(goodN[goodN.length - 1]).good)
  // 残りの良い点と気になった点は、3回に2回、1つの文につなぎます（文末が同じ形で並ばないように）。
  if (goodG.length && badG.length && n % 3 !== 0) {
    body.push(pick(w.mix, n >> 1)(join(goodG), join(badG)))
    if (ok.length) body.push(pick(w.ok, n >> 2)(join(ok)))
  } else {
    if (goodG.length) body.push(pick(w.good, n >> 1)(join(goodG)))
    if (ok.length) body.push(pick(w.ok, n >> 2)(join(ok)))
    if (badG.length) body.push(pick(w.bad, n >> 3)(join(badG)))
  }
  for (const k of badN) body.push(nat(k).bad)
  // 本人の言葉がある項目。項目の文と、本人の言葉を、続けて置きます。
  for (const k of Object.keys(a.aspects)) {
    if (!det[k]) continue
    const lv = a.aspects[k], x = nat(k)
    const head = lv === 'good' ? (x ? x.good : pick(w.good, n >> 1)(k)) : lv === 'bad' ? (x && x.bad ? x.bad : pick(w.bad, n >> 3)(k)) : pick(w.ok, n >> 2)(k)
    body.push(head + sentence(det[k]))
  }
  // ひとことは本人の言葉なので、前のほうに置きます（一覧に出るのは最初の数十字のため）。
  if (memo && n % 2 === 0) parts.push(memo)
  parts.push(...body)
  if (memo && n % 2 === 1) parts.push(memo)
  // 気になった点を選んだうえで「満足」と答えた人は、そのとおりの締めにします。
  if (a.overall >= 4 && bad.length && (n >> 4) % 2 === 0) parts.push(pick(w.but, n >> 5))
  else if (a.overall) parts.push(pick(w.overall[a.overall], n >> 4))
  return parts.join('')
}

/* ---- AI に頼むときの文 ---- */

export function systemText() {
  return [
    'あなたは、お店やサービスを利用したお客様本人が、自分の口コミを書くのを手伝います。書くのは下書きで、投稿するのは本人です。',
    '',
    '材料の決まり（いちばん大事）。',
    '・使ってよいのは、渡された「答え」だけ。答えにない事実は1つも足さない。金額、日数、回数、時刻、人数、人の名前、店の名前、場所、商品の名前、ほかの店との比べ、これからの予定は、答えに書いてあるときだけ。',
    '・「いまひとつ」「不満」と答えた項目は、弱めず、消さず、そのまま書く。',
    '・「よかった」と答えていない項目をほめない。答えのない項目には触れない。',
    '・店名、スタッフの名前、地名、検索されやすそうな言葉を入れない。「おすすめ」「また利用したい」は、答えにあるときだけ。',
    '・「ひとこと」と、項目の「本人の言葉」は、一字も変えずにそのまま入れる。言いかえ・要約・敬語への直しをしない。',
    '・答えた項目と、選んだ利用内容と、全体の答えは、1つも落とさず全部に触れる。',
    '・時期や回数（初めて、いつも、先月、何度も）、ほかの店との比べ、これからの予定（また利用したい、次回も）、人の名前は、答えにあるときだけ。',
    '',
    '書き方の決まり（実際の口コミは、短く、ふつうの言葉で書かれています）。',
    '・本人が書いた、短い文。60〜140字が目安。答えが多いときでも200字まで。',
    '・最初の一文に、何を利用して、どうだったかを書く（一覧に出るのは最初の数十字だけのため）。',
    '・あいさつ、前置き、最後のまとめの一文は書かない。',
    '・強める言葉（非常に、大変、最高、素晴らしい、感動、ぜひ、間違いなし、心から）と、かたい言い方（〜することができました、総じて、スタッフの皆様）を使わない。',
    '・絵文字、記号の飾り、箇条書き、ハッシュタグ、「！」の連続を使わない。',
    '・返すのは本文だけ。かぎかっこで囲まない。説明を付けない。',
  ].join('\n')
}

export function promptText(a) {
  const lv = Object.fromEntries(LEVELS)
  const out = []
  out.push(`文体: ${a.style === 'casual' ? 'くだけた言い方（だ・である は使わず、話し言葉で短く）' : 'ていねいな言い方（です・ます）'}`)
  out.push(`利用したもの: ${a.services.length ? a.services.join('、') : '（答えなし。触れない）'}`)
  const asp = Object.keys(a.aspects)
  out.push('項目ごとの答え:' + (asp.length ? '' : ' （答えなし。触れない）'))
  for (const k of asp) out.push(`・${k}: ${lv[a.aspects[k]]}${(a.details || {})[k] ? `（本人の言葉:「${a.details[k]}」）` : ''}`)
  out.push(`全体として: ${a.overall ? Object.fromEntries(OVERALL)[a.overall] : '（答えなし。触れない）'}`)
  out.push(`ひとこと（本人の言葉）: ${a.memo || '（なし）'}`)
  out.push('', 'この答えだけを材料に、口コミの下書きを1つ書いてください。')
  return out.join('\n')
}

/** 点検を通らなかった下書きを、理由を添えて書き直してもらう文。 */
export function retryText(draft, reasons) {
  return [
    '前の下書きは、決まりに合っていませんでした。',
    ...reasons.slice(0, 5).map((r) => `・${r}`),
    '',
    '前の下書き:',
    draft,
    '',
    '同じ答えだけを材料に、上の点を直した下書きを1つ書いてください。返すのは本文だけです。',
  ].join('\n')
}

/* ---- 作り話と、誘導になる言葉の点検 ---- */

const POSITIVE = /よかった|良かった|満足|助か|ありがた|安心|気持ちよ|うれし|嬉し|好印象/
const NEGATIVE = /いまひとつ|今ひとつ|気にな|不満|残念|物足り|もう少し|改善|遅|分かりにく|わかりにく|しにく|高い/
const HYPE = ['非常に', '大変', '素晴らし', '最高', '感動', '間違いな', 'ぜひ', '心から', '皆様', 'スタッフ', 'することができ', '総じて', 'プロフェッショナル', 'クオリティ', 'ホスピタリティ', 'おすすめ', 'オススメ', 'また利用', 'リピート']
const NUMBER = /[0-9０-９]|[一二三四五六七八九十百千万]+(?:円|日|回|年|か月|ヶ月|時間|分|人|名|件|倍|割|％|%)/

/** 項目の名前の「芯」。「説明の分かりやすさ」→「説明」。下書きで言い換えられても見つけるため。 */
export function coreOf(label) {
  const s = String(label || '')
  const head = s.split(/の|・|\/|／/)[0]
  return head.length >= 2 ? head : s
}

const GOODISH = /早かった|速かった|早く|速く|やすかった|やすく|丁寧|清潔|親切/
const MIDDLE = /ふつう|普通|可もなく|まずまず|それなり/
const WHEN = /初めて|はじめて|何度|毎回|いつも|長年|昨日|先日|先週|先月|去年|昨年|今年|年前|か月前|ヶ月前|常連/
const COMPARE = /他社|他店|ほかの(店|会社)|他の(店|会社)|と比べ|に比べ|より(安|早|速|良|よ|高)/
const FUTURE = /また(お願い|利用|来|頼|伺|行)|次回|次も|今後も|これからも/
const NAMED = /[一-龠ぁ-んァ-ヶA-Za-z]{1,8}(さん|様|氏)(?![ざ々])/

const withoutAll = (t, list) => list.filter(Boolean).sort((x, y) => y.length - x.length).reduce((acc, w) => acc.split(w).join(''), t)
const bare = (w) => String(w || '').replace(/[。！？!?\s]+$/, '')

/** 下書きが、答えだけからできていて、答えを1つも落としていないか。{ ok, reasons:[…] }
 *
 *  見ること（完成の条件）:
 *   1. 本人の言葉（ひとこと・どのあたりが）が、一字も変わらずに入っている
 *   2. 答えにない数字・時期や回数・ほかの店との比べ・これからの予定・人の名前が無い
 *   3. 答えていない項目・選んでいない利用内容に触れていない
 *   4. 答えた項目・選んだ利用内容・全体の答えに、全部触れている（落としていない）
 *   5. 項目ごとの良し悪しが、答えと逆になっていない
 *   6. 店名・あおる言葉・飾りが無い */
export function checkDraft(text, a, cfg, brand) {
  const t = String(text || '').trim()
  const memo = a.memo || ''
  const details = a.details || {}
  const own = [memo, ...Object.values(details)].filter(Boolean)
  const reasons = []
  const inOwn = (w) => own.some((o) => o.includes(w))
  if (t.length < LIMITS.draftMin) reasons.push('短すぎます')
  if (t.length > LIMITS.draftMax + own.join('').length) reasons.push('長すぎます')

  // 1. 本人の言葉は、そのまま。
  for (const o of own) if (!t.includes(bare(o))) reasons.push(`本人の言葉（${o.slice(0, 14)}${o.length > 14 ? '…' : ''}）が、変えられているか抜けています`)

  // 本人の言葉を除いた残り（＝下書きが足した文）で、足してはいけないものを見ます。
  const strip = withoutAll(t, own.map(bare))
  // 選んだ名前そのものに入っている言葉（「初めての方向けプラン」など）は、足したものではありません。
  const rest = withoutAll(strip, [...a.services, ...Object.keys(a.aspects)])

  // 2. 数字、時期や回数、比べ、予定、人の名前。
  if (NUMBER.test(strip)) reasons.push('答えにない数字が入っています')
  if (WHEN.test(rest)) reasons.push('答えにない時期や回数が入っています')
  if (COMPARE.test(rest)) reasons.push('答えにない、ほかの店との比べが入っています')
  if (FUTURE.test(rest)) reasons.push('答えにない、これからの予定が入っています')
  if (NAMED.test(rest)) reasons.push('答えにない人の名前が入っています')

  // 3. 答えていない項目・選んでいない利用内容。
  for (const k of cfg.aspects) {
    if (a.aspects[k]) continue
    const c = coreOf(k)
    if ((strip.includes(k) || strip.includes(c))) reasons.push(`答えていない項目（${k}）に触れています`)
  }
  for (const s of cfg.services) {
    if (a.services.includes(s)) continue
    if (strip.includes(s)) reasons.push(`選んでいない利用内容（${s}）が入っています`)
  }

  // 4. 落としていないか。
  const LV = Object.fromEntries(LEVELS)
  for (const k of Object.keys(a.aspects)) if (!strip.includes(k) && !strip.includes(coreOf(k))) reasons.push(`「${LV[a.aspects[k]]}」と答えた項目（${k}）が抜けています`)
  for (const s of a.services) if (!strip.includes(s)) reasons.push(`選んだ利用内容（${s}）が抜けています`)
  const bad = Object.keys(a.aspects).filter((k) => a.aspects[k] === 'bad')
  const good = Object.keys(a.aspects).filter((k) => a.aspects[k] === 'good')
  if ((bad.length || (a.overall && a.overall <= 2)) && !NEGATIVE.test(strip)) reasons.push('良くなかった答えが、文に出ていません')
  if (a.overall >= 4 && !POSITIVE.test(strip.replace(/不満/g, ''))) reasons.push('全体の答え（満足）が、文に出ていません')
  if (a.overall === 3 && !MIDDLE.test(strip)) reasons.push('全体の答え（ふつう）が、文に出ていません')

  // 5. 良し悪しが逆になっていないか。項目に触れている文ごとに見ます。
  const sentences = strip.split(/[。！？!?]/).map((x) => x.trim()).filter(Boolean)
  const pos = (x) => POSITIVE.test(x.replace(/不満/g, '')) || GOODISH.test(x)
  for (const k of Object.keys(a.aspects)) {
    const mine = sentences.filter((x) => x.includes(k) || x.includes(coreOf(k)))
    if (!mine.length) continue
    const lv = a.aspects[k]
    if (lv === 'bad' && !mine.some((x) => NEGATIVE.test(x))) reasons.push(`「いまひとつ」と答えた項目（${k}）が、そう書かれていません`)
    if (lv === 'good' && mine.every((x) => NEGATIVE.test(x) && !pos(x))) reasons.push(`「よかった」と答えた項目（${k}）が、悪く書かれています`)
    if (lv === 'ok' && mine.every((x) => (pos(x) !== NEGATIVE.test(x)) && !MIDDLE.test(x)) && Object.keys(a.aspects).length === 1) reasons.push(`「ふつう」と答えた項目（${k}）が、そう書かれていません`)
  }
  if (!good.length && !(a.overall >= 4) && POSITIVE.test(strip.replace(/不満/g, ''))) reasons.push('答えにないほめ言葉が入っています')
  if (a.overall && a.overall <= 2 && /満足しています|満足です|大満足/.test(strip.replace(/不満[^。]*。/g, ''))) reasons.push('全体の答えと逆のことを書いています')

  // 6. 店名・あおる言葉・飾り。本人の言葉にあるものは通します。
  for (const w of HYPE) if (rest.includes(w)) { reasons.push(`答えにない言葉（${w}）が入っています`); break }
  for (const n of (brand && brand.names) || []) if (n && strip.toLowerCase().includes(String(n).toLowerCase())) { reasons.push('店名が入っています'); break }
  if (/[#＃]|https?:|[\u{1F300}-\u{1FAFF}☀-➿]/u.test(strip)) reasons.push('記号・絵文字・リンクが入っています')
  if ((strip.match(/[!！]/g) || []).length >= 2) reasons.push('「！」が続いています')
  if (/^[「『]|[」』]$/.test(t) || /^(下書き|案|本文)[:：]/.test(t)) reasons.push('本文以外が付いています')
  return { ok: reasons.length === 0, reasons }
}

export function cleanDraft(s) {
  return String(s || '').trim()
    .replace(/^```[a-z]*\n?|```$/g, '')
    .replace(/^(下書き|案|本文)[:：]\s*/, '')
    .replace(/^[「『]([\s\S]*)[」』]$/, '$1')
    .replace(/\s*\n+\s*/g, '')
    .trim()
}

/* ---- 毎週の記録（件数・評価・このページの使われ方） ---- */

const DAY = 86400000
const JST = 9 * 3600000

/** その時刻を含む週の月曜日（日本時間）。'2026-11-16' の形。 */
export function weekOf(ms = Date.now()) {
  const d = new Date(ms + JST)
  const dow = (d.getUTCDay() + 6) % 7 // 月曜 = 0
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10)
}

/** 週ごとの記録に、今週の件数と評価を入れます（同じ週は上書き。前の週はそのまま残る）。 */
export function putWeek(list, snap, ms = Date.now(), keep = 104) {
  const w = weekOf(ms)
  const out = (Array.isArray(list) ? list : []).filter((r) => r && r.w && r.w !== w)
  out.push({ w, total: Math.max(0, Math.floor(Number(snap.total) || 0)), avg: snap.avg == null ? null : Math.round(Number(snap.avg) * 10) / 10, at: new Date(ms).toISOString() })
  return out.sort((x, y) => (x.w < y.w ? -1 : 1)).slice(-keep)
}

/** 選ばれた答えを数えるときの名前。項目は「a|名前|よさ」、全体は「o|5」。 */
export function tallyFields(a) {
  const out = ['n']
  for (const k of Object.keys(a.aspects)) out.push(`a|${k}|${a.aspects[k]}`)
  if (a.overall) out.push(`o|${a.overall}`)
  return out
}

/** 週ごとの数をまとめて、項目ごとの「よかった・ふつう・いまひとつ」と、全体の答えの数にします。
 *  いま設定にある項目を先に、その並びで出します。 */
export function tallyRows(counts, aspects) {
  const asp = {}
  const overall = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  let n = 0
  for (const o of Object.values(counts || {})) {
    for (const f of Object.keys(o || {})) {
      const v = Number(o[f]) || 0
      const p = f.split('|')
      if (f === 'n') n += v
      else if (p[0] === 'a' && p.length === 3 && ['good', 'ok', 'bad'].includes(p[2])) { (asp[p[1]] = asp[p[1]] || { good: 0, ok: 0, bad: 0 })[p[2]] += v }
      else if (p[0] === 'o' && overall[p[1]] != null) overall[p[1]] += v
    }
  }
  const order = (aspects || []).filter((k) => asp[k]).concat(Object.keys(asp).filter((k) => !(aspects || []).includes(k)))
  const rows = order.map((k) => ({ label: k, ...asp[k] }))
  return { n, overall, aspects: rows, insight: insightOf(rows, n) }
}

/** いちばん喜ばれている項目と、いちばん気になられている項目。答えが5人に満たないうちは出しません
 *  （1人の答えで入れ替わる数字を、傾向のように見せないため）。 */
export function insightOf(rows, n, min = 5) {
  if (!(n >= min) || !rows.length) return null
  const top = rows.slice().sort((x, y) => y.good - x.good)[0]
  const worst = rows.slice().sort((x, y) => y.bad - x.bad)[0]
  return {
    top: top && top.good ? { label: top.label, count: top.good } : null,
    worst: worst && worst.bad ? { label: worst.label, count: worst.bad } : null,
  }
}

/** 画面に出す形。新しい週が上。前の週からの増え方と、このページの数を付けます。 */
export function weeklyRows(list, counts, max = 12) {
  const rows = (Array.isArray(list) ? list : []).slice().sort((x, y) => (x.w < y.w ? -1 : 1))
  const c = counts || {}
  return rows.map((r, i) => {
    const prev = rows[i - 1]
    const u = c[r.w] || {}
    return {
      w: r.w, total: r.total, avg: r.avg,
      diff: prev ? r.total - prev.total : null,
      open: Number(u.open) || 0, draft: Number(u.draft) || 0, google: Number(u.google) || 0, posted: Number(u.posted) || 0,
    }
  }).reverse().slice(0, max)
}
