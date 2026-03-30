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
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-56 z-40 bg-white border-r border-gray-200">
        <div className="px-5 py-5">
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Claimondo</h2>
          <p className="text-xs mt-0.5 text-gray-400">{email}</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 px-3 pt-4 pb-2">Navigation</p>
          {NAV_MAIN.map((item) => {
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <item.icon style={{ width: 17, height: 17 }} />
                {item.label}
              </Link>
            )
          })}

          <p className="text-[10px] uppercase tracking-wider text-gray-400 px-3 pt-5 pb-2">Verwaltung</p>
          {NAV_SECONDARY.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <item.icon style={{ width: 17, height: 17 }} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pb-4 space-y-2 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 truncate">{email}</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              <LogOutIcon style={{ width: 17, height: 17 }} />
              Abmelden
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-white border-t border-gray-200"
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
                active ? 'text-blue-600 bg-blue-50' : 'text-gray-400'
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
