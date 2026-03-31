'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboardIcon,
  MapIcon,
  FolderOpenIcon,
  CalendarIcon,
  ReceiptIcon,
  UserIcon,
  LogOutIcon,
  ClipboardListIcon,
  BellIcon,
} from 'lucide-react'
import NotificationBell from '@/app/admin/_components/NotificationBell'

const NAV_ITEMS = [
  { href: '/gutachter', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/gutachter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
  { href: '/gutachter/gebiet', label: 'Mein Gebiet', icon: MapIcon },
  { href: '/gutachter/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/gutachter/abrechnung', label: 'Abrechnung', icon: ReceiptIcon },
  { href: '/gutachter/mitteilungen', label: 'Mitteilungen', icon: BellIcon },
]

export default function GutachterShell({
  displayName,
  children,
  logoUrl,
  brandPrimary,
  brandSecondary,
}: {
  displayName: string
  children: React.ReactNode
  logoUrl?: string | null
  brandPrimary?: string | null
  brandSecondary?: string | null
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Apply brand colors as CSS custom properties
  useEffect(() => {
    if (brandPrimary) document.documentElement.style.setProperty('--brand-primary', brandPrimary)
    if (brandSecondary) document.documentElement.style.setProperty('--brand-secondary', brandSecondary)
    return () => {
      document.documentElement.style.removeProperty('--brand-primary')
      document.documentElement.style.removeProperty('--brand-secondary')
    }
  }, [brandPrimary, brandSecondary])
  const [unreadCount, setUnreadCount] = useState(0)

  const loadUnread = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', user.id)
      .single()
    if (!sv) return
    const { count } = await supabase
      .from('gutachter_mitteilungen')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', sv.id)
      .eq('gelesen', false)
    setUnreadCount(count ?? 0)
  }, [])

  useEffect(() => {
    loadUnread()
    const supabase = createClient()
    const channel = supabase
      .channel('gutachter-mitteilungen-count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gutachter_mitteilungen' }, () => loadUnread())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gutachter_mitteilungen' }, () => loadUnread())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadUnread])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(href: string) {
    if (href === '/gutachter') return pathname === '/gutachter'
    return pathname.startsWith(href)
  }

  return (
    <div className="h-screen bg-[#f8f9fb] flex overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-gray-200">
          {logoUrl ? (
            <Link href="/gutachter"><img src={logoUrl} alt="Logo" className="h-8 w-auto max-w-36 object-contain" /></Link>
          ) : (
            <h2 className="text-gray-900 font-semibold text-lg">Claimondo</h2>
          )}
          <p className="text-gray-500 text-xs mt-0.5">Gutachter-Portal</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive(href)
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
              {href === '/gutachter/mitteilungen' && unreadCount > 0 && (
                <span className="ml-auto bg-red-600 text-white text-xs font-bold min-w-[1.25rem] h-5 flex items-center justify-center rounded-full px-1.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-3 py-3 border-t border-gray-200 space-y-2">
          {/* Klickbarer Profil-Bereich */}
          <Link href="/gutachter/profil" onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors group">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 text-sm font-semibold truncate">{displayName}</p>
              <p className="text-gray-400 text-xs">Sachverständiger</p>
            </div>
            <UserIcon className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
          </Link>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-gray-50 transition-colors">
            <LogOutIcon className="w-4 h-4" /> Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Menu oeffnen"
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-gray-900 font-semibold text-sm">Claimondo</span>
          <NotificationBell />
        </header>

        {/* Desktop bell top-right */}
        <div className="hidden lg:block fixed top-3 right-4 z-30"><NotificationBell /></div>

        <main className="h-[calc(100vh-64px)] overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
