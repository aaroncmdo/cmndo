'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function KundeShell({
  displayName,
  email,
  children,
}: {
  displayName: string
  email: string
  children: React.ReactNode
}) {
  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <Link href="/kunde">
              <h2 className="text-white font-semibold text-lg leading-tight">Claimondo</h2>
              <p className="text-zinc-500 text-xs">Kundenportal</p>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-zinc-300 text-sm font-medium">{displayName}</p>
              <p className="text-zinc-600 text-xs">{email}</p>
            </div>
            <Link
              href="/kunde/profil"
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-2"
              aria-label="Profil"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </Link>
            <button
              onClick={handleLogout}
              className="text-zinc-500 hover:text-red-400 transition-colors p-2 -mr-2"
              aria-label="Abmelden"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
