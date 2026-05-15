'use client'

// AAR-528 (A4): Tab-Nav für den Finanzen-Hub.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/finance', label: 'Übersicht' },
  { href: '/admin/finance/abrechnungen', label: 'Abrechnungen' },
  { href: '/admin/finance/saeumige-svs', label: 'Säumige SVs' },
  { href: '/admin/finance/offene-faelle', label: 'Offene Berechnungen' },
  { href: '/admin/finance/per-sv-balance', label: 'Per-SV Balance' },
  { href: '/admin/finance/kanzlei', label: 'Kanzlei-Abr.' },
  { href: '/admin/finance/provisionen', label: 'Provisionen' },
]

export default function FinanceHubTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-0 overflow-x-auto" aria-label="Finanzen-Tabs">
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin/finance'
            ? pathname === '/admin/finance'
            : pathname === tab.href || pathname?.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
