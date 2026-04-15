'use client'

// AAR-123: Tab-Bar für den Sachverständige-Hub.
// Wird nur auf den 3 Hub-Seiten angezeigt (Liste / Karte / Neu). Detail-
// Routen wie /[id] oder /anlegen/* sollen die Tab-Bar NICHT zeigen — in
// diesen Fällen rendert der Component null.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ListIcon, MapIcon, UserPlusIcon } from 'lucide-react'

type Tab = {
  href: string
  label: string
  icon: typeof ListIcon
  exact?: boolean
}

const TABS: Tab[] = [
  { href: '/admin/sachverstaendige', label: 'Liste', icon: ListIcon, exact: true },
  { href: '/admin/sachverstaendige/karte', label: 'Karte', icon: MapIcon },
  { href: '/admin/sachverstaendige/neu', label: 'Onboarding', icon: UserPlusIcon },
]

export default function SachverstaendigeTabs() {
  const pathname = usePathname() ?? ''

  // Tab-Bar nur auf den 3 Hub-Routen. Sub-Routen wie /[id] und /anlegen/*
  // haben eigenes Layout und sollen nicht durch die Tabs gestört werden.
  const isHubRoute =
    pathname === '/admin/sachverstaendige' ||
    pathname === '/admin/sachverstaendige/karte' ||
    pathname === '/admin/sachverstaendige/neu'
  if (!isHubRoute) return null

  return (
    <nav aria-label="Sachverständige-Tabs" className="border-b border-gray-200 bg-white">
      <ul className="flex items-center gap-1 px-4">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-[#4573A2] text-[#0D1B3E]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
