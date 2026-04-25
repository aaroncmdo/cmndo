'use client'

// AAR-778: Migriert auf shared PortalNav (dark variant).
// Vorher: 187-Zeilen Self-Contained-Sidebar mit dupliziertem isActive + Item-Rendering.
// Jetzt: Thin Wrapper — nur Portal-spezifische Config (Items, Slots, Badges).

import {
  LayoutDashboardIcon, FolderOpenIcon, BadgeEuroIcon,
  CarFrontIcon, LogOutIcon, GitBranchIcon, CalendarIcon,
  UsersIcon, Building2Icon, SettingsIcon, ClipboardListIcon,
} from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'
import TasksPill from '@/components/shared/TasksPill'
import { AdminNeueRueckrufeBadge } from '@/components/shared/NeueTermineBadge'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

const NAV_ITEMS: PortalNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/dispatch/dashboard', label: 'Dispatch', icon: GitBranchIcon, external: true },
  { href: '/admin/faelle', label: 'Fälle', icon: FolderOpenIcon },
  { href: '/admin/aufgaben', label: 'Aufgaben', icon: ClipboardListIcon },
  { href: '/admin/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/admin/sachverstaendige', label: 'Sachverständige', icon: CarFrontIcon },
  { href: '/admin/partner', label: 'Partner', icon: Building2Icon },
  { href: '/admin/finance', label: 'Finanzen', icon: BadgeEuroIcon },
  { href: '/admin/team', label: 'Team', icon: UsersIcon },
  { href: '/admin/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

const MOBILE_HREFS = ['/admin', '/admin/faelle', '/admin/aufgaben', '/admin/kalender', '/admin/sachverstaendige']
const MOBILE_ITEMS = MOBILE_HREFS.map(h => NAV_ITEMS.find(i => i.href === h)!).filter(Boolean)

export default function AdminNav({
  email,
  initials,
  userId,
  meineTasksCount,
}: {
  email: string
  initials: string
  userId: string
  meineTasksCount?: number
}) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="Admin-Navigation"
      sections={[{ items: NAV_ITEMS }]}
      mobileItems={MOBILE_ITEMS}
      renderBadge={(item) => {
        if (item.label === 'Aufgaben' && (meineTasksCount ?? 0) > 0) {
          return (
            <span className="ml-auto bg-claimondo-ondo text-white text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
              {meineTasksCount! > 99 ? '99+' : meineTasksCount}
            </span>
          )
        }
        if (item.label === 'Kalender') {
          return <span className="ml-auto"><AdminNeueRueckrufeBadge /></span>
        }
        return null
      }}
      headerSlot={
        <>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span className="text-[#7BA3CC]">ondo</span>
            </span>
            <TasksPill userId={userId} href="/admin/meine-tasks" initialCount={meineTasksCount ?? 0} />
          </div>
          <p className="text-xs mt-0.5 text-[#7BA3CC]">{email}</p>
        </>
      }
      footerSlot={
        <>
          <SupportButton userName={email} rolle="admin" />
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-[#7BA3CC] hover:bg-white/5 hover:text-white"
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
