'use client'

// AAR-526 (A2): Client-Component für das Tab-Nav. Liest pathname um den
// aktiven Tab zu markieren. Reklamations-Badge kommt vom Server-Layout.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  href: string
  label: string
  badge?: number
}

export default function FaelleHubTabs({
  offeneReklamationen,
}: {
  offeneReklamationen: number
}) {
  const pathname = usePathname()

  const tabs: Tab[] = [
    { href: '/admin/faelle', label: 'Liste' },
    { href: '/admin/faelle/sla', label: 'SLA' },
    { href: '/admin/faelle/statistiken', label: 'Statistiken' },
    { href: '/admin/faelle/kanzlei', label: 'Kanzlei-Board' },
    {
      href: '/admin/faelle/reklamationen',
      label: 'Reklamationen',
      badge: offeneReklamationen > 0 ? offeneReklamationen : undefined,
    },
  ]

  return (
    <nav className="flex gap-0 overflow-x-auto" aria-label="Fälle-Hub-Tabs">
      {tabs.map((tab) => {
        const active =
          tab.href === '/admin/faelle'
            ? pathname === '/admin/faelle'
            : pathname === tab.href || pathname?.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              active
                ? 'border-[#0D1B3E] text-[#0D1B3E]'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-semibold ${
                  active
                    ? 'bg-[#0D1B3E] text-white'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
