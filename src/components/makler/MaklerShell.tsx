'use client'

// AAR-483 (M1): Makler-Portal-Shell. Strukturell gespiegelt am DispatchNav
// (fixed Sidebar desktop + mobile Bottom-Nav). Design-Tokens Claimondo
// Navy/Ondo-Blue/Shield. Aktives Nav-Item via usePathname-Prefix-Match.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboardIcon,
  UserPlusIcon,
  FolderOpenIcon,
  ReceiptIcon,
  QrCodeIcon,
  SettingsIcon,
  LogOutIcon,
} from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'
import UpdatesNav from '@/components/updates/UpdatesNav'
import TasksPill from '@/components/shared/TasksPill'

type MaklerShellProps = {
  makler: {
    id: string
    firma: string
    ansprechpartner_vorname: string
    status: string
  }
  email: string
  userId: string
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/makler', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/makler/leads', label: 'Leads', icon: UserPlusIcon },
  { href: '/makler/akten', label: 'Akten', icon: FolderOpenIcon },
  { href: '/makler/abrechnungen', label: 'Abrechnungen', icon: ReceiptIcon },
  { href: '/makler/promo', label: 'Promo & QR', icon: QrCodeIcon },
  { href: '/makler/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

export function MaklerShell({ makler, email, userId, children }: MaklerShellProps) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/makler') return pathname === '/makler'
    return pathname === href || pathname?.startsWith(href + '/')
  }

  const initials = makler.ansprechpartner_vorname
    ? makler.ansprechpartner_vorname.substring(0, 2).toUpperCase()
    : (email?.substring(0, 2).toUpperCase() ?? 'MA')

  return (
    <div className="h-screen bg-[#f8f9fb] relative overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        role="navigation"
        aria-label="Makler-Navigation"
        className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-60 z-40 bg-[#0D1B3E]"
      >
        <div className="px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span className="text-[#7BA3CC]">ondo</span>
            </span>
            {/* AAR-723: Globale Tasks-Pill neben dem Logo. */}
            <TasksPill userId={userId} href="/makler" />
          </div>
          <p className="text-[10px] mt-1 uppercase tracking-wider text-[#7BA3CC] bg-[#1E3A5F] inline-block px-2 py-0.5 rounded">
            Makler
          </p>
          <p className="text-xs mt-1 text-[#7BA3CC] truncate">{makler.firma}</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-500 ${
                  active
                    ? 'bg-[#1E3A5F] text-white font-semibold'
                    : 'text-[#7BA3CC] hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon style={{ width: 17, height: 17 }} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pb-4 space-y-2 border-t border-white/10 pt-3">
          <SupportButton userName={makler.ansprechpartner_vorname} />
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-[#4573A2] text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/90 truncate">
                {makler.ansprechpartner_vorname}
              </p>
              <p className="text-[11px] text-[#7BA3CC] truncate">{email}</p>
            </div>
            <UpdatesNav variant="dark" />
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

      {/* Content-Bereich */}
      <div className="md:ml-60 h-screen flex flex-col relative z-10">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0D1B3E] shrink-0">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-white">Claim</span>
            <span className="text-[#7BA3CC]">ondo</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#7BA3CC] bg-[#1E3A5F] px-2 py-0.5 rounded">
            Makler
          </span>
        </header>

        <main
          id="main-content"
          role="main"
          className="flex-1 min-h-0 overflow-y-auto pb-20 md:pb-0"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav (erste 4 Items) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-[#0D1B3E]"
        style={{ paddingTop: 8, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
      >
        {NAV_ITEMS.slice(0, 4).map((item) => {
          const active = isActive(item.href)
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
    </div>
  )
}
