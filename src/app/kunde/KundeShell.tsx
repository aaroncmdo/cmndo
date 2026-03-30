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

  // Check if the current path is a specific fall detail (keep bottom nav visible)
  function isActive(href: string) {
    if (href === '/kunde') return pathname === '/kunde' || pathname?.startsWith('/kunde/fall/')
    return pathname?.startsWith(href)
  }

  return (
    <div className="min-h-screen glass-bg flex flex-col relative">
      {/* Ambient overlays */}
      <div className="glass-ambient" aria-hidden="true" />
      <div className="glass-ambient-indigo" aria-hidden="true" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Link href="/kunde">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <span className="text-white font-semibold text-base tracking-tight">Claimondo</span>
          </div>
        </Link>
        <button className="relative p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <BellIcon className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 relative z-10 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center"
        style={{
          background: 'rgba(8,12,24,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
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
              className="flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[48px] px-3 py-1 rounded-xl transition-all"
              style={active ? { color: '#93bbfc', background: 'rgba(59,130,246,0.1)' } : { color: 'rgba(255,255,255,0.35)' }}
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
