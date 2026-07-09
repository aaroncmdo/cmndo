'use client'
// Vertrieb-Konsole (Ein-Dach): Unter-Navigation über alle Partner-Flächen.
// Übersicht + Karte = eigene Views; Sachverständige/Partner-Leads/Makler/Werkstätten
// mounten die bestehende Verwaltung (Re-Export) unter dem Vertrieb-Dach.
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  // P2: „Übersicht" ist die Switch-Ansicht mit eigenem Liste/Karte-Toggle — kein
  // separater Karte-Tab mehr. Die Rollen-Tabs führen in die tiefe Verwaltung (Mounts).
  { href: '/admin/vertrieb', label: 'Übersicht' },
  { href: '/admin/vertrieb/sachverstaendige', label: 'Sachverständige' },
  { href: '/admin/vertrieb/partner-leads', label: 'Partner-Leads' },
  { href: '/admin/vertrieb/makler', label: 'Makler' },
  { href: '/admin/vertrieb/werkstaetten', label: 'Werkstätten' },
]

export default function VertriebKonsoleTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-0 overflow-x-auto" aria-label="Vertrieb-Navigation">
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin/vertrieb'
            ? pathname === '/admin/vertrieb'
            : pathname === tab.href || pathname?.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-3 text-body-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active
                ? 'border-claimondo-navy text-claimondo-navy'
                : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy hover:border-claimondo-border'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
