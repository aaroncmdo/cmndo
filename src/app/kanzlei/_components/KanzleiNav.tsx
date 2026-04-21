'use client'

// AAR-kanzlei-portal Sidebar-Nav. Minimal-Set für MVP (PR 2a):
//   /kanzlei/dashboard — Fall-Liste
//   /kanzlei/abrechnung — kommt später (Magic-Link-Flow existiert schon)
//
// Die Kanban-Ansicht + Termin-Buchung + Dokumenten-Download werden in
// Folge-PRs ergänzt.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboardIcon,
  KanbanSquareIcon,
  CalendarIcon,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/kanzlei/dashboard', label: 'Mandate', icon: LayoutDashboardIcon },
  // AAR-kanzlei-portal PR 3: Kanban-Ansicht nach 10 Phasen.
  { href: '/kanzlei/kanban', label: 'Pipeline', icon: KanbanSquareIcon },
  // AAR-kanzlei-termin PR 4: Termin-Buchung mit Admin.
  { href: '/kanzlei/termin', label: 'Termin buchen', icon: CalendarIcon },
]

export default function KanzleiNav() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 border-r border-[#e4e7ef] bg-white overflow-y-auto">
      <nav className="flex flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#4573A2] text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
