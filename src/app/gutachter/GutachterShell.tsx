'use client'

import { useState, useEffect, useCallback } from 'react'
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

const NAV_ITEMS = [
  { href: '/gutachter', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/gutachter/route', label: 'Tagesroute', icon: MapIcon },
  { href: '/gutachter/faelle', label: 'Faelle', icon: FolderOpenIcon },
  { href: '/gutachter/tasks', label: 'Meine Tasks', icon: ClipboardListIcon },
  { href: '/gutachter/mitteilungen', label: 'Mitteilungen', icon: BellIcon },
  { href: '/gutachter/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/gutachter/abrechnung', label: 'Abrechnung', icon: ReceiptIcon },
  { href: '/gutachter/profil', label: 'Profil', icon: UserIcon },
]

export default function GutachterShell({
  displayName,
  children,
}: {
  displayName: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
    <div className="min-h-screen bg-[#f8f9fb] flex">
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
          <h2 className="text-gray-900 font-semibold text-lg">Claimondo</h2>
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

        <div className="px-3 py-4 border-t border-gray-200">
          <div className="px-3 mb-3">
            <p className="text-gray-700 text-sm font-medium truncate">{displayName}</p>
            <p className="text-gray-400 text-xs">Sachverstaendiger</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-400 hover:bg-gray-100/50 transition-colors"
          >
            <LogOutIcon className="w-5 h-5" />
            Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
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
          <div className="w-10" />
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
