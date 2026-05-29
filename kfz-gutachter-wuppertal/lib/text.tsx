import { Fragment, type ReactNode } from 'react'

// Rendert **fett**-Marker aus Content-Strings (lib/content.ts) als <strong>.
// z.B. "wir melden uns **innerhalb einer Stunde**." → React-Nodes mit <strong>.
export function renderRich(text: string, strongClassName = 'text-petrol'): ReactNode {
  const parts = text.split('**')
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className={strongClassName}>
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}
