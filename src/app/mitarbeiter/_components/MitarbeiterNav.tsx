'use client'

// Shared PortalNav (dark = detached Navy-Panel). Header-/Footer-Slots tragen die
// frueher im Top-Bar gerenderten Aktionen (Logo + TasksPill / Updates + Logout).

import {
  LayoutDashboardIcon, FolderOpenIcon, CheckSquareIcon, CalendarIcon,
  MessageCircleIcon, BarChart3Icon, AlertCircleIcon, UserIcon,
  MapIcon, UsersRoundIcon, MapPinnedIcon, LogOutIcon,
} from 'lucide-react'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'
import TasksPill from '@/components/shared/TasksPill'
import UpdatesNav from '@/components/shared/updates'

const ITEMS: PortalNavItem[] = [
  { href: '/mitarbeiter', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
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
const MOBILE_HREFS = ['/mitarbeiter', '/faelle', '/mitarbeiter/termine', '/mitarbeiter/nachrichten']
const MOBILE_ITEMS = MOBILE_HREFS.map((h) => ITEMS.find((i) => i.href === h)!).filter(Boolean)

export default function MitarbeiterNav({
  userId,
  displayName,
  unreadNachrichten,
}: {
  userId: string
  displayName: string
  unreadNachrichten?: number
}) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="Mitarbeiter-Navigation"
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
      headerSlot={
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span>
          </span>
          <TasksPill userId={userId} href="/mitarbeiter/tasks" />
        </div>
      }
      footerSlot={
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <UpdatesNav variant="dark" placement="up-right" />
            <span className="min-w-0 flex-1 truncate text-sm text-white/90">{displayName}</span>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-ios-lg px-3 py-2.5 text-sm text-claimondo-light-blue transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOutIcon style={{ width: 17, height: 17 }} /> Abmelden
            </button>
          </form>
        </>
      }
    />
  )
}
