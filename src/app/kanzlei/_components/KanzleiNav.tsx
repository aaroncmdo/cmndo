'use client'

// AAR-778: Migriert auf shared PortalNav (light variant).

import { LayoutDashboardIcon, KanbanSquareIcon, CalendarIcon, ShieldCheckIcon } from 'lucide-react'
import { PortalNav } from '@/components/shared/portal-nav'

export default function KanzleiNav() {
  return (
    <PortalNav
      variant="light"
      ariaLabel="Kanzlei-Navigation"
      className="hidden md:flex md:flex-col"
      sections={[{
        items: [
          { href: '/kanzlei/mandate', label: 'Mandate', icon: LayoutDashboardIcon },
          { href: '/kanzlei/kanban', label: 'Pipeline', icon: KanbanSquareIcon },
          { href: '/kanzlei/termin', label: 'Termin buchen', icon: CalendarIcon },
          { href: '/kanzlei/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
        ],
      }]}
    />
  )
}
