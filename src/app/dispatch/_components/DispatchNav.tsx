'use client'

// AAR-778: Migriert auf shared PortalNav (dark variant, 2 Sektionen).

import {
  LayoutDashboardIcon, UsersIcon, PhoneIcon, LogOutIcon,
  MapIcon, CarFrontIcon, TargetIcon, CalendarIcon, SearchIcon,
} from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'
import TasksPill from '@/components/shared/TasksPill'
import { DispatchNeueRueckrufeBadge } from '@/components/shared/NeueTermineBadge'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

const NAV_ARBEIT: PortalNavItem[] = [
  { href: '/dispatch/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/dispatch/leads', label: 'Leads', icon: UsersIcon },
  { href: '/dispatch/rueckrufe', label: 'Rückrufe', icon: PhoneIcon },
  { href: '/dispatch/gutachter-finder', label: 'Gutachter-Finder', icon: SearchIcon },
  { href: '/dispatch/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/dispatch/karte', label: 'Karte', icon: MapIcon },
]

const NAV_NACHSCHLAGEN: PortalNavItem[] = [
  { href: '/dispatch/sachverstaendige', label: 'Sachverständige', icon: CarFrontIcon },
  { href: '/dispatch/isochrone', label: 'Isochrone', icon: TargetIcon },
]

export default function DispatchNav({
  email,
  initials,
  userId,
}: {
  email: string
  initials: string
  userId: string
}) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="Dispatch-Navigation"
      sections={[
        { label: 'Arbeit', items: NAV_ARBEIT },
        { label: 'Nachschlagen', items: NAV_NACHSCHLAGEN },
      ]}
      mobileItems={NAV_ARBEIT}
      renderBadge={(item) => {
        if (item.href === '/dispatch/rueckrufe') {
          return <DispatchNeueRueckrufeBadge userId={userId} className="shrink-0" />
        }
        return null
      }}
      headerSlot={
        <>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span className="text-claimondo-light-blue">ondo</span>
            </span>
            <TasksPill userId={userId} href="/dispatch/dashboard" />
          </div>
          <p className="text-[10px] mt-1 uppercase tracking-wider text-claimondo-light-blue bg-claimondo-shield inline-block px-2 py-0.5 rounded">
            Dispatch
          </p>
          <p className="text-xs mt-1 text-claimondo-light-blue">{email}</p>
        </>
      }
      footerSlot={
        <>
          <SupportButton userName={email} rolle="dispatch" />
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-claimondo-ondo text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 truncate">{email}</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm transition-colors w-full text-claimondo-light-blue hover:bg-white/5 hover:text-white"
            >
              <LogOutIcon style={{ width: 17, height: 17 }} />
              Abmelden
            </button>
          </form>
        </>
      }
    />
  )
}
