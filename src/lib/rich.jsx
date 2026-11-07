import { Fragment } from 'react'
import { inlineTokens, isExternal, hasBlock, blocks } from './markup.js'

// Editable copy is stored as plain strings so the admin page can present it
// in a textarea. The markers it may carry (bold, italic, links, line breaks,
// and in prose fields headings, lists, tables and images) are read by
// ./markup.js, the same reader the static pages and the admin preview use.
// Anything else is rendered as text, so an editor cannot inject markup.
//
// Lines are also cut into clauses at 。、！？ and each clause is rendered as
// one inline block. Japanese wraps anywhere by default, so a sentence that
// did not fit came apart in the middle of a phrase — 「…すべて自分のもの /
// になります。」. Breaking between clauses means a line can only end where the
// punctuation already ends one. A clause too long for the width on its own
// falls back to auto-phrase, which breaks between phrases, never mid-word.
const CLOSERS = '。、！？'
// A nakaguro or a slash ends a phrase too: 「動画・|LP・|SNS運用を」.
const SOFT = '・／'
// Cutting a clause into phrases needs to know where one ends. A particle that
// closes a content word does: 「動画・LP・SNS運用を|一社に|任せられるのは、」.
// The particle only counts when what precedes it is the end of a word — a
// kanji, katakana, a digit or a letter — which keeps 「のは」 and 「んで」 whole,
// where the same character is part of the word rather than after it.
const PARTICLES = 'をにはがでと'
const WORD_END = /[一-鿿々゠-ヿｦ-ﾟA-Za-z0-9０-９]/

/** A clause cut into phrases, each one a box that will not be broken into. */
function phrases(text, k) {
  const cuts = []
  for (let i = 0; i < text.length - 1; i++) {
    const c = text[i]
    if (SOFT.includes(c)) { cuts.push(i + 1); continue }
    if (!PARTICLES.includes(c)) continue
    if (!WORD_END.test(text[i - 1] || '')) continue
    const next = text[i + 1]
    // Not before punctuation, and not when another particle follows — 「では」
    // and 「には」 are one joint, not two.
    if (CLOSERS.includes(next) || PARTICLES.includes(next) || SOFT.includes(next)) continue
    cuts.push(i + 1)
  }
  if (!cuts.length) return text
  const out = []
  let last = 0
  cuts.forEach((at, n) => {
    out.push(<span className="ph" key={k + 'p' + n}>{text.slice(last, at)}</span>)
    last = at
  })
  if (last < text.length) out.push(<span className="ph" key={k + 'pz'}>{text.slice(last)}</span>)
  return out
}

/* 太字・斜体・リンクの中身（入れ子もあり）を描きます。 */
function inner(list, k) {
  return list.map((tk, i) => {
    const key = k + '.' + i
    if (tk.t === 'text') return <Fragment key={key}>{phrases(tk.v, key)}</Fragment>
    if (tk.t === 'br') return <br key={key} />
    if (tk.t === 'b') return <strong key={key}>{inner(tk.c, key)}</strong>
    if (tk.t === 'i') return <em key={key}>{inner(tk.c, key)}</em>
    return isExternal(tk.href)
      ? <a key={key} href={tk.href} target="_blank" rel="noopener">{inner(tk.c, key)}</a>
      : <a key={key} href={tk.href}>{inner(tk.c, key)}</a>
  })
}
const textOf = (list) => list.map((tk) => (tk.t === 'text' ? tk.v : tk.c ? textOf(tk.c) : '')).join('')

/** Split a parsed line into clauses, keeping bold / italic / link runs intact across the cut. */
function clauses(tokens) {
  const out = []
  let cur = []
  tokens.forEach((tk, pi) => {
    if (tk.t !== 'text') {
      // A bold run (or a link) is never split: the emphasis is on the whole phrase.
      cur.push(inner([tk], 'r' + pi)[0])
      const t = textOf([tk])
      if (CLOSERS.includes(t[t.length - 1])) { out.push(cur); cur = [] }
      return
    }
    const text = tk.v
    if (!text) return
    let from = 0
    for (let i = 0; i < text.length; i++) {
      if (!CLOSERS.includes(text[i])) continue
      // Keep any run of closers together: 「です。」「ます、」 and 「ね！？」.
      while (i + 1 < text.length && CLOSERS.includes(text[i + 1])) i++
      cur.push(<Fragment key={pi + ':' + from}>{phrases(text.slice(from, i + 1), pi + ':' + from)}</Fragment>)
      out.push(cur)
      cur = []
      from = i + 1
    }
    if (from < text.length) cur.push(<Fragment key={pi + ':end'}>{phrases(text.slice(from), pi + ':end')}</Fragment>)
  })
  if (cur.length) out.push(cur)
  return out
}

/** 文の中の書式（太字・斜体・リンク・改行）。行は句読点で区切って、変な所で折れないように。 */
export function rich(text) {
  const src = String(text ?? '')
  return src.split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {clauses(inlineTokens(line)).map((cl, ci) => (
        <span className="cl" key={ci}>{cl}</span>
      ))}
    </Fragment>
  ))
}

/** 短い文（見出し・ボタン・ラベル）用。太字・斜体・リンク・改行だけを読み、
 *  印の無い文章は文字のまま返します（見た目も中身も、前と同じ）。 */
export function ink(text) {
  const src = String(text ?? '')
  if (!/[*\n[]/.test(src)) return src
  const list = inlineTokens(src)
  if (list.length === 1 && list[0].t === 'text') return list[0].v
  return list.map((tk, i) => {
    const key = 'k' + i
    if (tk.t === 'text') return <Fragment key={key}>{tk.v}</Fragment>
    if (tk.t === 'br') return <br key={key} />
    const c = ink(textOfRaw(tk))
    if (tk.t === 'b') return <strong key={key}>{c}</strong>
    if (tk.t === 'i') return <em key={key}>{c}</em>
    return isExternal(tk.href) ? <a key={key} href={tk.href} target="_blank" rel="noopener">{c}</a> : <a key={key} href={tk.href}>{c}</a>
  })
}
// 入れ子の中身を、印の付いた元の形に戻します（ink の中でもう一度読むため）。
function textOfRaw(tk) {
  return (tk.c || []).map((x) => (x.t === 'text' ? x.v : x.t === 'br' ? '\n' : x.t === 'b' ? '**' + textOfRaw(x) + '**' : x.t === 'i' ? '*' + textOfRaw(x) + '*' : '[' + textOfRaw(x) + '](' + x.href + ')')).join('')
}

/** 段落の書式（見出し・箇条書き・番号・表・画像）まで読む文章欄。
 *  段落の書式が無ければ、これまでどおり as（既定は p）の中に rich() で出します。
 *  あれば、同じ className の div の中に段落ごとの部品を並べます（p の中に表や
 *  箇条書きは置けないため）。h: いちばん上の見出し（##）の番号。 */
export function Rich({ text, as: Tag = 'p', className, h = 3, ...rest }) {
  if (!hasBlock(text)) return <Tag className={className} {...rest}>{rich(text)}</Tag>
  return (
    <div className={(className ? className + ' ' : '') + 'mk-blocks'} {...rest}>
      {blocks(text).map((b, i) => {
        if (b.t === 'h') { const H = 'h' + Math.min(6, h + b.level - 2); return <H key={i}>{rich(b.text)}</H> }
        if (b.t === 'ul') return <ul key={i}>{b.items.map((x, j) => <li key={j}>{rich(x)}</li>)}</ul>
        if (b.t === 'ol') return <ol key={i}>{b.items.map((x, j) => <li key={j}>{rich(x)}</li>)}</ol>
        if (b.t === 'img') return <figure key={i} className="mk-img"><img src={b.src} alt={b.alt} loading="lazy" decoding="async" />{b.alt ? <figcaption>{b.alt}</figcaption> : null}</figure>
        if (b.t === 'table') {
          return (
            <div key={i} className="mk-table"><table>
              {b.head ? <thead><tr>{b.head.map((c, j) => <th key={j}>{rich(c)}</th>)}</tr></thead> : null}
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{rich(c)}</td>)}</tr>)}</tbody>
            </table></div>
          )
        }
        return <p key={i}>{rich(b.text)}</p>
      })}
    </div>
  )
}
