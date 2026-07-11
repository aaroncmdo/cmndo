'use client'

// AAR-531 → Aufgaben-Hub: Pill-Leiste (KI-Vorschlaege / Alle / Meine). Kein PageHeader.
import { usePathname } from 'next/navigation'
import { AufgabenPills } from './_components/AufgabenPills'

export default function AufgabenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6 py-2.5">
        <AufgabenPills activePath={pathname} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
