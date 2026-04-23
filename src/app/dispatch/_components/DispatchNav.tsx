'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboardIcon, UsersIcon, PhoneIcon, LogOutIcon,
  MapIcon, CarFrontIcon, TargetIcon,
} from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'
import TasksPill from '@/components/shared/TasksPill'

// AAR-63: /dispatch/einstellungen Link entfernt (Route existiert nicht → 404)
// AAR-112: Karte + Sachverständige + Isochrone ergänzt
// AAR-514: Nav in 2 Sektionen splitten — „Arbeit" (täglich) + „Nachschlagen"
// (Stammdaten, Read-Only). SV/Isochrone sind Datenhubs, keine Dispatch-Arbeit,
// deshalb visuell separiert damit der Dispatcher sie nicht als operative
// Tätigkeit missversteht.
const NAV_ARBEIT = [
  { href: '/dispatch/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/dispatch/leads', label: 'Leads', icon: UsersIcon },
  { href: '/dispatch/rueckrufe', label: 'Rückrufe', icon: PhoneIcon },
  { href: '/dispatch/karte', label: 'Karte', icon: MapIcon },
]

const NAV_NACHSCHLAGEN = [
  { href: '/dispatch/sachverstaendige', label: 'Sachverständige', icon: CarFrontIcon },
  { href: '/dispatch/isochrone', label: 'Isochrone', icon: TargetIcon },
]

// Mobile bottom-nav bleibt bei den 4 Arbeits-Items — Nachschlagen ist Desktop-
// only, auf Mobile im Dispatch-Kontext nicht praktikabel (SV-Kartenansicht +
// Isochrone-Polygon brauchen Bildschirmfläche).
const NAV_MOBILE = NAV_ARBEIT

type NavItem = { href: string; label: string; icon: typeof LayoutDashboardIcon }

export default function DispatchNav({ email, initials, userId }: { email: string; initials: string; userId: string }) {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + '/')
  }

  function renderLink(item: NavItem) {
    const active = isActive(item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-500 ${
          active ? 'bg-[#1E3A5F] text-white font-semibold' : 'text-[#7BA3CC] hover:bg-white/5 hover:text-white'
        }`}
      >
        <item.icon style={{ width: 17, height: 17 }} />
        {item.label}
      </Link>
    )
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside role="navigation" aria-label="Dispatch-Navigation" className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-56 z-40 bg-[#0D1B3E]">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
            {/* AAR-723: Globale Tasks-Pill neben dem Logo. */}
            <TasksPill userId={userId} href="/dispatch/dashboard" />
          </div>
          <p className="text-[10px] mt-1 uppercase tracking-wider text-[#7BA3CC] bg-[#1E3A5F] inline-block px-2 py-0.5 rounded">Dispatch</p>
          <p className="text-xs mt-1 text-[#7BA3CC]">{email}</p>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto">
          <div className="space-y-0.5 pb-3">
            <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-[#7BA3CC]/70 font-semibold">
              Arbeit
            </p>
            {NAV_ARBEIT.map(renderLink)}
          </div>
          <div className="space-y-0.5 pt-3 border-t border-white/10">
            <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-[#7BA3CC]/70 font-semibold">
              Nachschlagen
            </p>
            {NAV_NACHSCHLAGEN.map(renderLink)}
          </div>
        </nav>

        <div className="px-3 pb-4 space-y-2 border-t border-white/10 pt-3">
          <SupportButton userName={email} rolle="dispatch" />
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

      {/* Mobile bottom nav — nur die 4 Arbeits-Items */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-[#0D1B3E]"
        style={{ paddingTop: 8, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
      >
        {NAV_MOBILE.map((item) => {
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
    </>
  )
}
