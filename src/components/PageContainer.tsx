// AAR-121: Shared responsive content wrapper.
//
// Minimaler horizontaler Padding-Wrapper. BUG-98 hatte einen Hard-Cap
// `max-w-[1600px]` plus `lg:px-16 xl:px-24` eingefuehrt, das auf grossen
// Monitors ~15-20 % leeren Rand links+rechts erzeugt hat. Aaron wollte
// das zurueck auf volle Breite mit nur minimalem Sicherheits-Padding.
//
// Padding-Skala:
//   default (<640): px-4    → Mobile
//   sm  (>=640):    px-6
//   md  (>=768):    px-8    → Tablet + Desktop, konsistent
//
// Kein `py-*`, weil das die Sticky-Header-Logik der Pages stoeren wuerde.
// Kein `max-w`, weil Aaron die volle Breite will. Falls eine einzelne
// Page einen zentrierten Lese-Modus braucht, kann sie das per eigenem
// `max-w-...` innerhalb ihres Contents regeln.

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: Props) {
  return (
    <div className={`w-full px-4 sm:px-6 md:px-8 ${className}`}>
      {children}
    </div>
  )
}
