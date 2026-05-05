// CMM-32-mapbox: Feldmodus läuft wieder im normalen GutachterShell-Wrapper.
// Vorher (AAR-382) gab es hier einen `fixed inset-0 z-[1200]` Full-Screen-
// Overlay — Aaron will ihn raus, Karte gehört in den normalen Wrapper.

import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function FeldmodusLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
