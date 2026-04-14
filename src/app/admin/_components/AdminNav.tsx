'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboardIcon, FolderOpenIcon, BadgeEuroIcon, ClipboardListIcon,
  HardHatIcon, MapIcon, LogOutIcon, GitBranchIcon, CalendarIcon,
  BarChart3Icon, UsersIcon, BuildingIcon, Building2Icon, ReceiptIcon,
  ShieldCheckIcon, MessageCircleIcon, SettingsIcon, AlertCircleIcon,
  LifeBuoyIcon, UserPlusIcon, ListChecksIcon, CheckSquareIcon,
} from 'lucide-react'

// AAR-57: 4 Sektionen — Navigation, Operations, Stammdaten, Verwaltung
type NavItem = { href: string; label: string; icon: typeof LayoutDashboardIcon; exact?: boolean }

const NAV_NAVIGATION: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/admin/dispatch', label: 'Dispatch', icon: GitBranchIcon },
  { href: '/admin/faelle', label: 'Fälle', icon: FolderOpenIcon },
  { href: '/admin/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/admin/nachrichten', label: 'Nachrichten', icon: MessageCircleIcon },
  { href: '/admin/sachverstaendige', label: 'Sachverständige', icon: HardHatIcon },
  { href: '/admin/karte', label: 'Karte', icon: MapIcon },
  { href: '/admin/meine-tasks', label: 'Meine Tasks', icon: CheckSquareIcon },
]

const NAV_OPERATIONS: NavItem[] = [
  { href: '/admin/tasks', label: 'Alle Tasks', icon: ListChecksIcon },
  { href: '/admin/reklamationen', label: 'Reklamationen', icon: AlertCircleIcon },
  { href: '/admin/support', label: 'Support', icon: LifeBuoyIcon },
]

const NAV_STAMMDATEN: NavItem[] = [
  { href: '/admin/sv-onboarding', label: 'SV-Onboarding', icon: UserPlusIcon },
  { href: '/admin/organisationen', label: 'Organisationen', icon: Building2Icon },
  { href: '/admin/team', label: 'Team', icon: UsersIcon },
  { href: '/admin/versicherungen', label: 'Versicherer', icon: BuildingIcon },
  { href: '/admin/communities', label: 'Communities', icon: ShieldCheckIcon },
]

const NAV_VERWALTUNG: NavItem[] = [
  { href: '/admin/finance', label: 'Finanzen', icon: BadgeEuroIcon },
  { href: '/admin/abrechnungen', label: 'Abrechnungen', icon: ReceiptIcon },
  { href: '/admin/kanzlei-abrechnungen', label: 'Kanzlei-Abr.', icon: ReceiptIcon },
  { href: '/admin/statistiken', label: 'Statistiken', icon: BarChart3Icon },
  { href: '/admin/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

const SECTIONS: { label: string; items: NavItem[]; showBorder?: boolean }[] = [
  { label: 'Navigation', items: NAV_NAVIGATION },
  { label: 'Operations', items: NAV_OPERATIONS, showBorder: true },
  { label: 'Stammdaten', items: NAV_STAMMDATEN, showBorder: true },
  { label: 'Verwaltung', items: NAV_VERWALTUNG, showBorder: true },
]

export default function AdminNav({ email, initials, unreadNachrichten }: { email: string; initials: string; unreadNachrichten?: number }) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname?.startsWith(href + '/')
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href, item.exact)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          active ? 'bg-[#1E3A5F] text-white font-semibold' : 'text-[#7BA3CC] hover:bg-white/5 hover:text-white'
        }`}
      >
        <item.icon style={{ width: 17, height: 17 }} />
        {item.label}
        {item.label === 'Nachrichten' && (unreadNachrichten ?? 0) > 0 && (
          <span className="ml-auto bg-[#4573A2] text-white text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
            {unreadNachrichten! > 99 ? '99+' : unreadNachrichten}
          </span>
        )}
      </Link>
    )
  }

  // AAR-72: Mobile-Items per href-Lookup (nicht Array-Index)
  const MOBILE_HREFS = ['/admin', '/admin/dispatch', '/admin/faelle', '/admin/nachrichten', '/admin/karte']
  const mobileItems: NavItem[] = MOBILE_HREFS
    .map(h => NAV_NAVIGATION.find(i => i.href === h))
    .filter((i): i is NavItem => !!i)

  return (
    <>
      {/* Desktop Sidebar — Navy */}
      <aside role="navigation" aria-label="Admin-Navigation" className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-56 z-40 bg-[#0D1B3E]">
        <div className="px-5 py-5">
          <span className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <p className="text-xs mt-0.5 text-[#7BA3CC]">{email}</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
          {SECTIONS.map((section, idx) => (
            <div key={section.label} className={section.showBorder ? 'mt-5 pt-4 border-t border-white/10' : idx === 0 ? '' : 'mt-3'}>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60 px-3 pb-2">{section.label}</p>
              {section.items.map(renderItem)}
            </div>
          ))}
        </nav>

        <div className="px-3 pb-4 space-y-2 border-t border-white/10 pt-3">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-[#4573A2] text-white">
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
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-[#0D1B3E]"
        style={{
          paddingTop: 8,
          paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        }}
      >
        {mobileItems.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-2 py-1 rounded-xl transition-all ${
                active ? 'text-white bg-[#1E3A5F]' : 'text-[#7BA3CC]'
              }`}
            >
              <item.icon style={{ width: 20, height: 20 }} />
              <span className="text-[9px] font-medium">{item.label}</span>
              {item.label === 'Nachrichten' && (unreadNachrichten ?? 0) > 0 && (
                <span className="absolute top-0 right-1 bg-[#4573A2] text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full">
                  {unreadNachrichten! > 9 ? '9+' : unreadNachrichten}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
