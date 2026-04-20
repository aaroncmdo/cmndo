// AAR-121 / AAR-246 / AAR-249 / AAR-612: Shared responsive content wrapper.
//
// AAR-612: Desktop-Content ist 80% breit und zentriert → 10% Abstand zur
// Sidebar und 10% zum rechten Rand. Mobile bleibt voll (kein Inset). Pages,
// die einen Full-Width-Header brauchen (z. B. Kanban-Title-Bar), brechen
// via `md:w-[125%] md:-ml-[12.5%]` aus dem 80%-Rahmen aus — 125 % von 80 %
// = 100 % der Main-Breite, -12.5 % von 80 % = -10 % (zieht den Header bis
// zur linken Main-Kante zurück).

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: Props) {
  return (
    <div className={`w-full md:w-[80%] md:mx-auto ${className}`}>
      {children}
    </div>
  )
}
