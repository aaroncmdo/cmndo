import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboardIcon, FolderOpenIcon, BadgeEuroIcon, ClipboardListIcon, HardHatIcon, MapIcon, LogOutIcon, GitBranchIcon, CalendarIcon, BarChart3Icon, UsersIcon } from 'lucide-react'
import NotificationBell from './_components/NotificationBell'

const NAV_MAIN = [
  { href: '/admin/dispatch', label: 'Dispatch', icon: GitBranchIcon },
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/admin/faelle', label: 'Fälle', icon: FolderOpenIcon },
  { href: '/admin/sachverstaendige', label: 'Sachverständige', icon: HardHatIcon },
  { href: '/admin/karte', label: 'Karte', icon: MapIcon },
  { href: '/admin/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/admin/tasks', label: 'Tasks', icon: ClipboardListIcon },
]

const NAV_SECONDARY = [
  { href: '/admin/finance', label: 'Finanzen', icon: BadgeEuroIcon },
  { href: '/admin/statistiken', label: 'Statistiken', icon: BarChart3Icon },
  { href: '/admin/team', label: 'Team', icon: UsersIcon },
]

const NAV = [...NAV_MAIN, ...NAV_SECONDARY]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Extract initials from user email for avatar
  const initials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U'

  return (
    <div className="min-h-screen glass-bg flex relative">
      {/* Ambient light overlays */}
      <div className="glass-ambient" aria-hidden="true" />
      <div className="glass-ambient-indigo" aria-hidden="true" />

      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col glass-sidebar relative z-10">
        <div className="px-5 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Claimondo</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{user.email}</p>
          </div>
          <NotificationBell />
        </div>

        <nav className="flex-1 px-3 space-y-0.5 glass-scroll overflow-y-auto">
          {/* Main section */}
          <p className="glass-label px-3 pt-4 pb-2">Navigation</p>
          {NAV_MAIN.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                item.href === '/admin/dispatch'
                  ? 'glass-nav-active font-semibold'
                  : 'hover:bg-white/[0.04]'
              }`}
              style={item.href !== '/admin/dispatch' ? { color: 'rgba(255,255,255,0.4)' } : undefined}
            >
              <item.icon style={{ width: 17, height: 17 }} />
              {item.label}
            </Link>
          ))}

          {/* Secondary section */}
          <p className="glass-label px-3 pt-5 pb-2">Verwaltung</p>
          {NAV_SECONDARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-white/[0.04]"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              <item.icon style={{ width: 17, height: 17 }} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 pb-4 space-y-2">
          {/* User avatar */}
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{user.email}</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="button"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full hover:bg-white/[0.04]"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              <LogOutIcon style={{ width: 17, height: 17 }} />
              Abmelden
            </button>
          </form>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Mobile header (minimal) */}
        <header className="md:hidden flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 className="text-base font-semibold text-white tracking-tight">Claimondo</h2>
          <NotificationBell />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden md:pb-0 glass-mobile-padded">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden glass-bottom-nav">
          {NAV_MAIN.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="glass-touch"
            >
              <item.icon style={{ width: 20, height: 20 }} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
