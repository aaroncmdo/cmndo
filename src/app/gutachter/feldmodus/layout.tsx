// AAR-382: Eigenständiges Layout für den Fokus-Modus.
// Technisch sitzt dieser Layout noch unter /gutachter/layout.tsx (GutachterShell).
// Wir überlagern den Shell mit einem `fixed inset-0 z-50` Full-Screen-Overlay,
// damit der SV den Modus als „eigener Screen" wahrnimmt. Backdrop-Blur über
// dem darunterliegenden Shell sorgt für den Uber-artigen Fokus-Eindruck.

import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function FeldmodusLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1200] h-screen w-screen bg-[var(--brand-primary)] text-white overflow-hidden">
      {children}
    </div>
  )
}
