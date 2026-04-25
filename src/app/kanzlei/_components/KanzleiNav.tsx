'use client'

// AAR-778: Migriert auf shared PortalNav (light variant).

import { LayoutDashboardIcon, KanbanSquareIcon, CalendarIcon } from 'lucide-react'
import { PortalNav } from '@/components/shared/portal-nav'

export default function KanzleiNav() {
  return (
    <PortalNav
      variant="light"
      ariaLabel="Kanzlei-Navigation"
      sections={[{
        items: [
          { href: '/kanzlei/dashboard', label: 'Mandate', icon: LayoutDashboardIcon },
          { href: '/kanzlei/kanban', label: 'Pipeline', icon: KanbanSquareIcon },
          { href: '/kanzlei/termin', label: 'Termin buchen', icon: CalendarIcon },
        ],
      }]}
    />
  )
}
