import { loadDefaultJapaneseParser } from 'budoux'

// One shared parser for the whole app — kept as a lazy singleton so it is
// only instantiated the first time Japanese text needs phrase-aware wrapping.
let _parser = null
const getParser = () => (_parser ||= loadDefaultJapaneseParser())

/**
 * Wrap Japanese text so lines only break at 文節 (phrase) boundaries.
 *
 * Unlike <wbr> (which is only a HINT to the browser), this wraps each phrase
 * in an inline-block span. Browsers MUST treat each phrase as an atomic unit
 * and can only break between phrases — never inside one. Works on every
 * browser, including older iOS Safari and Android Chrome where
 * `word-break: auto-phrase` is unsupported.
 *
 * Returns a React fragment with one <span> per phrase plus zero-width break
 * opportunities, so it can be rendered anywhere text nodes are valid.
 *
 * @param {string} text
 * @param {string} [keyPrefix]
 * @returns React nodes (array) or the original string if no segmentation happened
 */
export function wrapJp(text, keyPrefix = 'jp') {
  if (!text || typeof text !== 'string') return text
  const parser = getParser()
  const segments = parser.parse(text)
  if (segments.length <= 1) return text
  return segments.map((seg, i) => (
    <span key={`${keyPrefix}-${i}`} className="jp-phrase">{seg}</span>
  ))
}
