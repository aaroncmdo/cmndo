'use client'

// Mobile-Drawer: zeigt alle Sidebar-Inhalte (KB-Card, SV-Card, LexDrive,
// Profil, Support, Logout) hinter einem Hamburger-Icon im Mobile-Header.
// Auf Desktop wird die Sidebar links direkt gerendert — der Drawer ist
// reine Mobile-Lösung und hidden lg:hidden.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MenuIcon, XIcon, LogOutIcon } from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'

export type KundeMobileDrawerProps = {
  initials: string
  displayName: string
  accentBg: string
  /** Komplette Sidebar-Cards als ReactNode rein-gereicht (KB / SV / Admin / LexDrive). */
  cards: React.ReactNode
}

export default function KundeMobileDrawer({
  initials,
  displayName,
  accentBg,
  cards,
}: KundeMobileDrawerProps) {
  const [open, setOpen] = useState(false)

  // Body-Scroll-Lock + Escape
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = original
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden text-[#7BA3CC] hover:text-white p-1.5"
        aria-label="Menü öffnen"
      >
        <MenuIcon style={{ width: 20, height: 20 }} />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label="Menü schließen"
          />
          {/* Drawer */}
          <div
            className="absolute right-0 top-0 bottom-0 w-[88vw] max-w-sm bg-[#0D1B3E] flex flex-col shadow-2xl animate-slide-in-right"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-white text-sm font-semibold">Menü</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#7BA3CC] hover:text-white p-1"
                aria-label="Schließen"
              >
                <XIcon style={{ width: 20, height: 20 }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {cards}
            </div>

            {/* Profil + Support + Logout */}
            <div className="px-3 pb-4 space-y-1 border-t border-white/10 pt-3">
              <Link
                href="/kunde/profil"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: accentBg }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{displayName}</p>
                  <p className="text-[10px] text-[#7BA3CC] leading-tight">Profil ansehen</p>
                </div>
              </Link>
              <div className="pt-2">
                <SupportButton userName={displayName} />
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
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        :global(.animate-slide-in-right) {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    </>
  )
}
