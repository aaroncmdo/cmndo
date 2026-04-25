'use client'

// AAR-778: Migriert auf shared PortalNav (light variant, desktop-only).

import {
  LayoutDashboardIcon, FolderOpenIcon, CheckSquareIcon, CalendarIcon,
  MessageCircleIcon, BarChart3Icon, AlertCircleIcon, UserIcon,
  MapIcon, UsersRoundIcon,
} from 'lucide-react'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

const ITEMS: PortalNavItem[] = [
  { href: '/mitarbeiter', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/mitarbeiter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
  { href: '/mitarbeiter/tasks', label: 'Tasks', icon: CheckSquareIcon },
  { href: '/mitarbeiter/termine', label: 'Termine', icon: CalendarIcon },
  { href: '/mitarbeiter/kundentermine', label: 'Kundentermine', icon: UsersRoundIcon },
  { href: '/mitarbeiter/isochrone', label: 'Gebiet', icon: MapIcon },
  { href: '/mitarbeiter/nachrichten', label: 'Nachrichten', icon: MessageCircleIcon },
  { href: '/mitarbeiter/reklamationen', label: 'Reklamationen', icon: AlertCircleIcon },
  { href: '/mitarbeiter/performance', label: 'Performance', icon: BarChart3Icon },
  { href: '/mitarbeiter/profil', label: 'Mein Profil', icon: UserIcon },
]

export default function MitarbeiterNav({ unreadNachrichten }: { unreadNachrichten?: number }) {
  return (
    <PortalNav
      variant="light"
      ariaLabel="Mitarbeiter-Navigation"
      className="hidden md:flex md:flex-col min-h-[calc(100vh-60px)]"
      sections={[{ items: ITEMS }]}
      renderBadge={(item) => {
        if (item.href === '/mitarbeiter/nachrichten' && (unreadNachrichten ?? 0) > 0) {
          return (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
              {unreadNachrichten}
            </span>
          )
        }
        return null
      }}
    />
  )
}
