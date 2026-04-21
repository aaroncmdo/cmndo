'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboardIcon, FolderOpenIcon, BadgeEuroIcon,
  CarFrontIcon, LogOutIcon, GitBranchIcon, CalendarIcon,
  UsersIcon, Building2Icon,
  MessageCircleIcon, SettingsIcon,
  ClipboardListIcon, ExternalLinkIcon,
} from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'

// AAR-529 (A5): Cutover 21 → 11 flache Items (1 Sektion).
// Hub-URLs sind alle live aus AAR-525/526/527/528/531 — SLA, Kanzlei-Board,
// Reklamationen, Abrechnungen, Kanzlei-Abr., Statistiken, Organisationen,
// Versicherer, Communities, Meine-Tasks, Alle-Tasks sind jetzt Tabs unter
// den Haupt-Hubs und fliegen aus der Sidebar.
//
// Support fällt als Nav-Item raus — der SupportButton unten in der Sidebar
// (AAR-519) übernimmt den Einstieg ins Support-Widget.
type NavItem = { href: string; label: string; icon: typeof LayoutDashboardIcon; exact?: boolean; external?: boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  // AAR-338: Dispatch hat eigenes Full-Screen-Layout — neuer Tab ohne Admin-Chrome
  { href: '/dispatch/dashboard', label: 'Dispatch', icon: GitBranchIcon, external: true },
  // AAR-526: Fälle-Hub mit Tabs (Liste/SLA/Statistiken/Kanzlei-Board/Reklamationen)
  { href: '/admin/faelle', label: 'Fälle', icon: FolderOpenIcon },
  // AAR-531: Aufgaben-Hub (Meine-Tasks + Alle-Tasks)
  { href: '/admin/aufgaben', label: 'Aufgaben', icon: ClipboardListIcon },
  // AAR-525: Nachrichten-Hub (MultiChannelChat pro Fall)
  { href: '/admin/nachrichten', label: 'Nachrichten', icon: MessageCircleIcon },
  { href: '/admin/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/admin/sachverstaendige', label: 'Sachverständige', icon: CarFrontIcon },
  // AAR-527: Partner-Hub (Organisationen/Versicherer/Communities)
  { href: '/admin/partner', label: 'Partner', icon: Building2Icon },
  // AAR-528: Finanzen-Hub (Übersicht/Abrechnungen/Kanzlei-Abr./Provisionen)
  { href: '/admin/finance', label: 'Finanzen', icon: BadgeEuroIcon },
  { href: '/admin/team', label: 'Team', icon: UsersIcon },
  { href: '/admin/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

export default function AdminNav({ email, initials, unreadNachrichten, meineTasksCount }: { email: string; initials: string; unreadNachrichten?: number; meineTasksCount?: number }) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname?.startsWith(href + '/')
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href, item.exact)
    const className = `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-500 ${
      active ? 'bg-[#1E3A5F] text-white font-semibold' : 'text-[#7BA3CC] hover:bg-white/5 hover:text-white'
    }`
    // AAR-338: external öffnet in neuem Tab ohne Next-Link-Prefetch
    if (item.external) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener"
          className={className}
        >
          <item.icon style={{ width: 17, height: 17 }} />
          {item.label}
          <ExternalLinkIcon style={{ width: 12, height: 12 }} className="ml-auto opacity-40" />
        </a>
      )
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={className}
      >
        <item.icon style={{ width: 17, height: 17 }} />
        {item.label}
        {item.label === 'Nachrichten' && (unreadNachrichten ?? 0) > 0 && (
          <span className="ml-auto bg-[#4573A2] text-white text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
            {unreadNachrichten! > 99 ? '99+' : unreadNachrichten}
          </span>
        )}
        {item.label === 'Aufgaben' && (meineTasksCount ?? 0) > 0 && (
          <span className="ml-auto bg-[#4573A2] text-white text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
            {meineTasksCount! > 99 ? '99+' : meineTasksCount}
          </span>
        )}
      </Link>
    )
  }

  // AAR-529 (A5): Mobile-Top-5 — Dashboard, Fälle, Aufgaben, Nachrichten, Sachverständige.
  // Dispatch fällt aus Mobile raus (eigenes Full-Screen-Layout, mobil nicht praktikabel).
  const MOBILE_HREFS = ['/admin', '/admin/faelle', '/admin/aufgaben', '/admin/nachrichten', '/admin/sachverstaendige']
  const mobileItems: NavItem[] = MOBILE_HREFS
    .map(h => NAV_ITEMS.find(i => i.href === h))
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
          {NAV_ITEMS.map(renderItem)}
        </nav>

        <div className="px-3 pb-4 space-y-2 border-t border-white/10 pt-3">
          <SupportButton userName={email} rolle="admin" />
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
          const mobClassName = `flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-2 py-1 rounded-xl transition-all ${
            active ? 'text-white bg-[#1E3A5F]' : 'text-[#7BA3CC]'
          }`
          // AAR-338: external-Links öffnen in neuem Tab
          if (item.external) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener"
                className={mobClassName}
              >
                <item.icon style={{ width: 20, height: 20 }} />
                <span className="text-[9px] font-medium">{item.label}</span>
              </a>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={mobClassName}
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
