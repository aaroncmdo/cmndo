'use client'

// AAR-527 (A3): Tab-Nav für den Partner-Hub.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/partner', label: 'Organisationen' },
  { href: '/admin/partner/versicherer', label: 'Versicherer' },
  { href: '/admin/partner/communities', label: 'Communities' },
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
                ? 'border-[#0D1B3E] text-[#0D1B3E]'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
