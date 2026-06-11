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

// Verlinkt eine Claimondo-Marken-Referenz auf claimondo.de (Aaron 04.06.:
// "ueberall wo Claimondo referenziert wird soll das Wort anklickbar sein").
// Erbt die Textfarbe (currentColor) -> funktioniert auf hellem + dunklem Hintergrund.
export function ClaimondoLink({ children }: { children: ReactNode }) {
  return (
    <a
      href="https://claimondo.de"
      target="_blank"
      rel="noopener"
      className="underline underline-offset-2 decoration-1 hover:opacity-75 transition-opacity"
    >
      {children}
    </a>
  )
}
