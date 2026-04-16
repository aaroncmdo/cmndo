// AAR-121 / AAR-246 / AAR-249: Shared responsive content wrapper.
//
// AAR-246/249: Horizontale Marge komplett auf 0 — Content nutzt volle
// Breite. Die Seiten selbst setzen ihr eigenes Innen-Padding falls
// nötig (z.B. p-4 im Content-Container). Vorher hatten wir px-4/6/8
// als Sicherheits-Padding, das aber Aaron als "5% Marge" wahrnahm.

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: Props) {
  return (
    <div className={`w-full ${className}`}>
      {children}
    </div>
  )
}
