// AIO計測の「質問の候補」。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// 計測する質問は、お客様が実際に打ちそうな言い方であるほど意味があります。
// その手がかりは手元に2つあります。
//   ・Google 検索で実際に表示された語（Search Console。社名を含まない語だけ）
//   ・問い合わせフォームで選ばれた「ご相談の内容」
// どちらも、すでに計測している質問と同じ話なら出しません。
//
// 問い合わせの本文は使いません（お客様の書いた文章を、AIへの質問に流すことに
// なるため）。使うのは、フォームの選択肢として選ばれた項目の名前と件数だけです。
// Search Console も、保存してある結果（6時間）だけを読み、ここから Google には
// 問い合わせません。

export const SUGGEST_MAX = 8
const MIN_IMPRESSIONS = 3

const norm = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[\s　、。・,.!?！？「」『』（）()]+/g, '')

/** 2文字ずつの重なり（0〜1）。表記の細かい違いに強く、短い語でも働きます。 */
export function similarity(a, b) {
  const grams = (s) => {
    const t = norm(s)
    const out = new Set()
    for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2))
    return out
  }
  const x = grams(a), y = grams(b)
  if (!x.size || !y.size) return 0
  let both = 0
  for (const g of x) if (y.has(g)) both++
  // 短いほう（検索語）がどれだけ相手に含まれているか。
  return both / Math.min(x.size, y.size)
}

/** 検索語を、AIに聞く形の質問に。言い方は語の中身で3通り。 */
export function questionFromQuery(q) {
  const t = String(q || '').trim().replace(/\s+/g, ' ')
  if (/費用|料金|相場|価格|値段|いくら|見積/.test(t)) return `「${t}」が気になっています。費用の目安と、相談できる会社を教えてください。`
  if (/とは|方法|やり方|仕方|コツ|違い|比較/.test(t)) return `「${t}」について、分かりやすく教えてください。おすすめの相談先があれば挙げてください。`
  return `「${t}」で探しています。おすすめの会社を教えてください。`
}

/** 問い合わせの「ご相談の内容」を、質問の形に。 */
export function questionFromTopic(topic, area) {
  const t = String(topic || '').trim()
  return `${area ? area + 'で' : ''}${t}を頼める会社を教えてください。`
}

/** いちばん近い既存の質問のカテゴリ（無ければ fallback）。 */
function guessCat(text, existing, fallback) {
  let best = null, score = 0
  for (const q of existing) {
    if (!q || q.branded) continue
    const s = Math.max(similarity(text, q.q), similarity(text, q.cat))
    if (s > score) { score = s; best = q.cat }
  }
  return score >= 0.25 && best ? best : fallback
}

/**
 * 候補を作ります。
 *   queries: Search Console の非指名の語 [{query, impressions, clicks, position}]
 *   topics:  直近の問い合わせの「ご相談の内容」 [[名前, 件数], …]
 *   existing: いまの質問 [{cat, q, branded}]
 *   area:    地域（「東京」など。無ければ付けません）
 * 返すのは [{ q, cat, from: 'search'|'inquiry', why }]。
 */
export function suggestQuestions({ queries, topics, existing, area, max = SUGGEST_MAX } = {}) {
  const have = (Array.isArray(existing) ? existing : []).filter((q) => q && q.q)
  const out = []
  const dup = (text, raw) => have.some((q) => similarity(raw, q.q) >= 0.6 || similarity(text, q.q) >= 0.6) ||
    out.some((x) => similarity(raw, x.raw) >= 0.6)

  const qs = (Array.isArray(queries) ? queries : [])
    .filter((x) => x && x.query && !x.branded && (Number(x.impressions) || 0) >= MIN_IMPRESSIONS)
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
  for (const x of qs) {
    const text = questionFromQuery(x.query)
    if (dup(text, x.query)) continue
    out.push({
      raw: x.query, q: text, from: 'search',
      cat: guessCat(x.query, have, '検索から'),
      why: `Google検索で直近28日に ${Number(x.impressions).toLocaleString('ja-JP')}回表示` + (x.position ? `（平均${Math.round(x.position * 10) / 10}位）` : ''),
    })
  }
  const ts = (Array.isArray(topics) ? topics : []).filter((t) => t && t[0] && !/選択なし|その他/.test(t[0]) && Number(t[1]) > 0)
  for (const [topic, n] of ts) {
    const text = questionFromTopic(topic, area)
    if (dup(text, topic)) continue
    out.push({ raw: topic, q: text, from: 'inquiry', cat: guessCat(topic, have, topic.slice(0, 30)), why: `直近90日の問い合わせで「${topic}」が ${n}件` })
  }
  // 検索と問い合わせを交互に（片方だけで埋まらないように）。
  const s = out.filter((x) => x.from === 'search'), i = out.filter((x) => x.from === 'inquiry')
  const mixed = []
  while ((s.length || i.length) && mixed.length < max) {
    if (s.length) mixed.push(s.shift())
    if (i.length && mixed.length < max) mixed.push(i.shift())
  }
  return mixed.map(({ raw, ...x }) => x)
}
