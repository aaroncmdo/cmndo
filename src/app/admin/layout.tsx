import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboardIcon, FolderOpenIcon, UsersIcon, BadgeEuroIcon, ClipboardListIcon, HardHatIcon, MapIcon, LogOutIcon } from 'lucide-react'
import NotificationBell from './_components/NotificationBell'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/admin/faelle', label: 'Fälle', icon: FolderOpenIcon },
  { href: '/admin/leads', label: 'Leads', icon: UsersIcon },
  { href: '/admin/sachverstaendige', label: 'Sachverständige', icon: HardHatIcon },
  { href: '/admin/karte', label: 'Karte', icon: MapIcon },
  { href: '/admin/tasks', label: 'Tasks', icon: ClipboardListIcon },
  { href: '/admin/finance', label: 'Finanzen', icon: BadgeEuroIcon },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="px-5 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Claimondo</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>
          </div>
          <NotificationBell />
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 pb-4">
          <form action="/api/auth/logout" method="POST">
            <button
              type="button"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-zinc-800/40 transition-colors w-full"
            >
              <LogOutIcon className="w-4 h-4" />
              Abmelden
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Claimondo</h2>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
              >
                <item.icon className="w-4 h-4" />
              </Link>
            ))}
            <NotificationBell />
          </nav>
        </header>

        {/* Content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
