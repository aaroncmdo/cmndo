'use client'

// AAR-527 (A3): Tab-Nav für den Partner-Hub.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/partner', label: 'Organisationen' },
  { href: '/admin/partner/versicherer', label: 'Versicherer' },
  { href: '/admin/partner/communities', label: 'Communities' },
  { href: '/admin/partner/waitlist', label: 'Gutachter-Warteliste' },
]

export default function PartnerHubTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-0 overflow-x-auto" aria-label="Partner-Tabs">
      {TABS.map((tab) => {
        const active =
          tab.href === '/admin/partner'
            ? pathname === '/admin/partner'
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
