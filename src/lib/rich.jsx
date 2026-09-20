import { Fragment } from 'react'

// Editable copy is stored as plain strings so the admin page can present it
// in a textarea. These two markers are all the markup that copy needs:
//   \n       -> line break
//   **bold** -> <strong>
// Anything else is rendered as text, so an editor cannot inject markup.
//
// Lines are also cut into clauses at 。、！？ and each clause is rendered as
// one inline block. Japanese wraps anywhere by default, so a sentence that
// did not fit came apart in the middle of a phrase — 「…すべて自分のもの /
// になります。」. Breaking between clauses means a line can only end where the
// punctuation already ends one. A clause too long for the width on its own
// falls back to auto-phrase, which breaks between phrases, never mid-word.
const CLOSERS = '。、！？'

/** Split a parsed line into clauses, keeping bold runs intact across the cut. */
function clauses(parts) {
  const out = []
  let cur = []
  parts.forEach((part, pi) => {
    const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4
    const text = bold ? part.slice(2, -2) : part
    if (!text) return
    if (bold) {
      // A bold run is never split: the emphasis is on the whole phrase.
      cur.push(<strong key={pi}>{text}</strong>)
      if (CLOSERS.includes(text[text.length - 1])) { out.push(cur); cur = [] }
      return
    }
    let from = 0
    for (let i = 0; i < text.length; i++) {
      if (!CLOSERS.includes(text[i])) continue
      // Keep any run of closers together: 「です。」「ます、」 and 「ね！？」.
      while (i + 1 < text.length && CLOSERS.includes(text[i + 1])) i++
      cur.push(<Fragment key={pi + ':' + from}>{text.slice(from, i + 1)}</Fragment>)
      out.push(cur)
      cur = []
      from = i + 1
    }
    if (from < text.length) cur.push(<Fragment key={pi + ':end'}>{text.slice(from)}</Fragment>)
  })
  if (cur.length) out.push(cur)
  return out
}

export function rich(text) {
  const src = String(text ?? '')
  return src.split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {clauses(line.split(/(\*\*[^*]+\*\*)/g)).map((cl, ci) => (
        <span className="cl" key={ci}>{cl}</span>
      ))}
    </Fragment>
  ))
}
