import type { ReactNode } from 'react'
import SachverstaendigeTabs from './SachverstaendigeTabs'

// AAR-123: Sachverständige-Hub mit Tab-Bar (Liste / Karte / Neu anlegen).
// Tabs werden als eigener Client-Component gerendert damit usePathname
// funktioniert. Kind-Routen — /admin/sachverstaendige, /karte, /neu — werden
// als {children} eingesetzt. Sub-Routen wie /[id] und /anlegen sollen die
// Tab-Bar NICHT zeigen — das regelt der Tabs-Component selbst anhand des
// aktuellen Pfads.

export default function SachverstaendigeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <SachverstaendigeTabs />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
