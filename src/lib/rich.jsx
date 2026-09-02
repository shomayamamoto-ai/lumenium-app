import { Fragment } from 'react'

// Editable copy is stored as plain strings so the admin page can present it
// in a textarea. These two markers are all the markup that copy needs:
//   \n       -> line break
//   **bold** -> <strong>
// Anything else is rendered as text, so an editor cannot inject markup.
export function rich(text) {
  const src = String(text ?? '')
  return src.split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
          ? <strong key={pi}>{part.slice(2, -2)}</strong>
          : <Fragment key={pi}>{part}</Fragment>
      )}
    </Fragment>
  ))
}
