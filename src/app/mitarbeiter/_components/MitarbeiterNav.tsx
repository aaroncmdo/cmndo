'use client'

// AAR-778: Migriert auf shared PortalNav (light variant, desktop-only).

import {
  LayoutDashboardIcon, FolderOpenIcon, CheckSquareIcon, CalendarIcon,
  MessageCircleIcon, BarChart3Icon, AlertCircleIcon, UserIcon,
  MapIcon, UsersRoundIcon, MapPinnedIcon,
} from 'lucide-react'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

const ITEMS: PortalNavItem[] = [
  { href: '/mitarbeiter', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/mitarbeiter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
  { href: '/mitarbeiter/tasks', label: 'Tasks', icon: CheckSquareIcon },
  { href: '/mitarbeiter/termine', label: 'Termine', icon: CalendarIcon },
  { href: '/mitarbeiter/kundentermine', label: 'Kundentermine', icon: UsersRoundIcon },
  { href: '/mitarbeiter/karte', label: 'Karte', icon: MapPinnedIcon },
  { href: '/mitarbeiter/isochrone', label: 'Gebiet', icon: MapIcon },
  { href: '/mitarbeiter/nachrichten', label: 'Nachrichten', icon: MessageCircleIcon },
  { href: '/mitarbeiter/reklamationen', label: 'Reklamationen', icon: AlertCircleIcon },
  { href: '/mitarbeiter/performance', label: 'Performance', icon: BarChart3Icon },
  { href: '/mitarbeiter/profil', label: 'Mein Profil', icon: UserIcon },
]

// Primaer-Items fuer die Mobile-Bottom-Nav (4 + "Mehr" -> volle ITEMS-Liste im Sheet).
const MOBILE_HREFS = ['/mitarbeiter', '/mitarbeiter/faelle', '/mitarbeiter/termine', '/mitarbeiter/nachrichten']
const MOBILE_ITEMS = MOBILE_HREFS.map((h) => ITEMS.find((i) => i.href === h)!).filter(Boolean)

export default function MitarbeiterNav({ unreadNachrichten }: { unreadNachrichten?: number }) {
  return (
    <PortalNav
      variant="light"
      ariaLabel="Mitarbeiter-Navigation"
      className="hidden md:flex md:flex-col min-h-[calc(100vh-60px)]"
      sections={[{ items: ITEMS }]}
      mobileItems={MOBILE_ITEMS}
      renderBadge={(item) => {
        if (item.href === '/mitarbeiter/nachrichten' && (unreadNachrichten ?? 0) > 0) {
          return (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger text-white">
              {unreadNachrichten}
            </span>
          )
        }
        return null
      }}
    />
  )
}
