'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, FolderOpenIcon, MessageSquareIcon, UserIcon, BellIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/kunde', label: 'Start', icon: HomeIcon },
  { href: '/kunde/dokumente', label: 'Dokumente', icon: FolderOpenIcon },
  { href: '/kunde/chat', label: 'Chat', icon: MessageSquareIcon },
  { href: '/kunde/profil', label: 'Profil', icon: UserIcon },
]

export default function KundeShell({
  displayName,
  email,
  children,
}: {
  displayName: string
  email: string
  children: React.ReactNode
}) {
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(href: string) {
    if (href === '/kunde') return pathname === '/kunde' || pathname?.startsWith('/kunde/fall/')
    return pathname?.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col relative">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200">
        <Link href="/kunde">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <span className="text-gray-900 font-semibold text-base tracking-tight">Claimondo</span>
          </div>
        </Link>
        <button className="relative p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors">
          <BellIcon className="w-5 h-5 text-gray-400" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 relative z-10 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-white border-t border-gray-200"
        style={{
          paddingTop: '8px',
          paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        }}
      >
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-3 py-1 rounded-xl transition-all ${
                active ? 'text-blue-600 bg-blue-50' : 'text-gray-400'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
