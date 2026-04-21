// AAR-121 / AAR-246 / AAR-249 / AAR-612: Shared responsive content wrapper.
//
// Desktop-Content ist 96% breit und zentriert → 2% Abstand zur Sidebar und
// 2% zum rechten Rand. Mobile bleibt voll (kein Inset). Pages, die einen
// Full-Width-Header brauchen (z. B. Kanban-Title-Bar), brechen via
// `md:w-[104.17%] md:-ml-[2.08%]` aus dem 96%-Rahmen aus — 104.17 % von
// 96 % = 100 % der Main-Breite, -2.08 % von 96 % = -2 % (zieht den Header
// bis zur linken Main-Kante zurück).

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: Props) {
  return (
    <div className={`w-full md:w-[96%] md:mx-auto ${className}`}>
      {children}
    </div>
  )
}
