'use client'

// AAR-778: Migriert auf shared PortalNav (dark variant, 2 Sektionen).

import {
  LayoutDashboardIcon, UsersIcon, PhoneIcon,
  MapIcon, CarFrontIcon, TargetIcon, CalendarIcon, CalendarClockIcon, SearchIcon, ShieldCheckIcon,
  ClipboardListIcon,
} from 'lucide-react'
import TasksPill from '@/components/shared/TasksPill'
import { DispatchNeueRueckrufeBadge } from '@/components/shared/NeueTermineBadge'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'
import { PortalUserFooter } from '@/components/shared/portal-nav/PortalUserFooter'
import UpdatesNav from '@/components/shared/updates'

const NAV_ARBEIT: PortalNavItem[] = [
  { href: '/dispatch/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  // Ops-Test 13.08.: eigener Einstieg. Das Dashboard-Widget zeigt 10 nach Datum --
  // bei 347 offenen Aufgaben war alles Liegengebliebene unsichtbar.
  { href: '/dispatch/tasks', label: 'Aufgaben', icon: ClipboardListIcon },
  { href: '/dispatch/leads', label: 'Leads', icon: UsersIcon },
  { href: '/dispatch/rueckrufe', label: 'Rückrufe', icon: PhoneIcon },
  { href: '/dispatch/terminwuensche', label: 'Terminwünsche', icon: CalendarClockIcon },
  { href: '/dispatch/gutachter-finder', label: 'Gutachter-Finder', icon: SearchIcon },
  { href: '/dispatch/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/dispatch/karte', label: 'Karte', icon: MapIcon },
]

const NAV_NACHSCHLAGEN: PortalNavItem[] = [
  { href: '/dispatch/sachverstaendige', label: 'Sachverständige', icon: CarFrontIcon },
  { href: '/dispatch/isochrone', label: 'Isochrone', icon: TargetIcon },
  { href: '/dispatch/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
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
      mobileSheetTop={<UpdatesNav variant="dark" />}
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
            <TasksPill userId={userId} href="/dispatch/tasks" />
          </div>
          <p className="text-[10px] mt-1 uppercase tracking-wider text-claimondo-light-blue bg-claimondo-shield inline-block px-2 py-0.5 rounded">
            Dispatch
          </p>
          <p className="text-xs mt-1 text-claimondo-light-blue">{email}</p>
        </>
      }
      footerSlot={
        // Kein profilHref: dispatch hat keine /mitarbeiter/profil-Seite (das ist
        // die KB-Route) — der Link bouncte dispatch auf /dispatch/dashboard.
        // Das Konto (Passwort/2FA) ist ueber die "Sicherheit"-Nav (/dispatch/konto)
        // erreichbar; alle anderen Portale (admin/sv/kb/werkstatt) setzen ebenfalls
        // keinen Footer-Profil-Link.
        <PortalUserFooter
          rolle="dispatch"
          supportUserName={email}
          initials={initials}
          primaryText={email}
        />
      }
    />
  )
}
