'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboardIcon, FolderOpenIcon, BadgeEuroIcon, ClipboardListIcon,
  HardHatIcon, MapIcon, LogOutIcon, GitBranchIcon, CalendarIcon,
  BarChart3Icon, UsersIcon,
} from 'lucide-react'

const NAV_MAIN = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/admin/dispatch', label: 'Dispatch', icon: GitBranchIcon },
  { href: '/admin/faelle', label: 'Fälle', icon: FolderOpenIcon },
  { href: '/admin/sachverstaendige', label: 'Sachverständige', icon: HardHatIcon },
  { href: '/admin/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/admin/tasks', label: 'Tasks', icon: ClipboardListIcon },
]

const NAV_SECONDARY = [
  { href: '/admin/finance', label: 'Finanzen', icon: BadgeEuroIcon },
  { href: '/admin/statistiken', label: 'Statistiken', icon: BarChart3Icon },
  { href: '/admin/team', label: 'Team', icon: UsersIcon },
]

export default function AdminNav({ email, initials }: { email: string; initials: string }) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname === href || pathname?.startsWith(href + '/')
  }

  return (
    <>
      {/* Desktop Sidebar — Navy */}
      <aside role="navigation" aria-label="Admin-Navigation" className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-56 z-40 bg-[#0D1B3E]">
        <div className="px-5 py-5">
          <span className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <p className="text-xs mt-0.5 text-[#7BA3CC]">{email}</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-[#7BA3CC] px-3 pt-4 pb-2">Navigation</p>
          {NAV_MAIN.map((item) => {
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
              </Link>
            )
          })}

          <p className="text-[10px] uppercase tracking-wider text-[#7BA3CC] px-3 pt-5 pb-2">Verwaltung</p>
          {NAV_SECONDARY.map((item) => {
            const active = isActive(item.href)
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
              </Link>
            )
          })}
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
        {[NAV_MAIN[0], NAV_MAIN[1], NAV_MAIN[2], NAV_MAIN[3], NAV_MAIN[5]].map((item) => {
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
            </Link>
          )
        })}
      </nav>
    </>
  )
}
