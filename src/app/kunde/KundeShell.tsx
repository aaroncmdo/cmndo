'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, MessageSquareIcon, UserIcon, BellIcon, HelpCircleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ProblemMeldenModal from '@/components/ProblemMeldenModal'

const NAV_ITEMS = [
  { href: '/kunde', label: 'Start', icon: HomeIcon },
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

  const [showProblem, setShowProblem] = useState(false)

  function isActive(href: string) {
    if (href === '/kunde') return pathname === '/kunde' || pathname?.startsWith('/kunde/fall/')
    return pathname?.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col relative">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-3 bg-[#0D1B3E]">
        <Link href="/kunde">
          <span className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
        </Link>
        <button aria-label="Benachrichtigungen" className="relative p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
          <BellIcon className="w-5 h-5 text-white" aria-hidden="true" />
        </button>
      </header>

      {/* Content */}
      <main id="main-content" role="main" className="flex-1 relative z-10 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-[#0D1B3E]"
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
                active ? 'text-white bg-[#1E3A5F]' : 'text-[#7BA3CC]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Floating Help Button */}
      <button onClick={() => setShowProblem(true)}
        className="fixed bottom-24 right-4 z-40 w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 flex items-center justify-center shadow-md transition-colors"
        aria-label="Problem melden">
        <HelpCircleIcon className="w-5 h-5" />
      </button>

      {showProblem && <ProblemMeldenModal onClose={() => setShowProblem(false)} />}
    </div>
  )
}
