// AAR-kanzlei-portal Layout — Navy-Header + Sidebar, spiegelt das
// Mitarbeiter-Layout damit der Look konsistent ist. Design-Tokens laut
// Design & Daten Philosophie (Notion 11.04.2026):
//   Navy #0D1B3E — Header
//   Light-Blue #7BA3CC — Logo-Akzent + Sub-Labels auf dunkel
//   Bg #f8f9fb — Main-Surface
//
// Guard: Rolle muss 'kanzlei' sein. Admin darf ebenfalls rein, damit wir
// das Portal im Admin-Modus testen können ohne Rollen-Switch.

import { LogOutIcon } from 'lucide-react'
import KanzleiNav from './_components/KanzleiNav'
import TasksPill from '@/components/shared/TasksPill'
import UpdatesNav from '@/components/shared/updates'
import { requirePortalAccess } from '@/lib/auth/portal-guard'

export default async function KanzleiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // K5: Auth + Rollen-Guard zentralisiert. Admin bleibt erlaubt für Testing.
  const { user, displayName } = await requirePortalAccess(['kanzlei', 'admin'])

  // AAR-676: h-screen + overflow-hidden damit die komplette Kanzlei-Shell
  // nicht das Fenster scrollt. Sidebar + Header bleiben fix, nur der Main-
  // Content scrollt innen. Das Main hat keinen max-width-Cap mehr — sonst
  // entsteht rechts ein grauer Balken auf breiten Screens.
  return (
    <div className="h-screen flex flex-col overflow-hidden relative" style={{ background: '#f2f3f7' }}>
      {/* Atmosphärische Hintergrund-Spotlights — identisch mit Admin-Layout */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0" style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.10), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.06), transparent 70%)',
          ].join(', '),
        }} />
      </div>
      <header className="glass-dark shadow-ios-md px-4 py-3 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/claimondo-shield.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span className="text-claimondo-light-blue">ondo</span>
            </span>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-claimondo-light-blue border border-claimondo-light-blue/30 rounded px-2 py-0.5">
            Kanzlei
          </span>
          {/* AAR-723: Globale Tasks-Pill neben dem Logo. */}
          <TasksPill userId={user.id} href="/kanzlei/dashboard" />
        </div>
        <div className="flex items-center gap-3">
          <UpdatesNav variant="dark" />
          <span className="text-claimondo-light-blue text-sm">{displayName}</span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-claimondo-light-blue hover:text-white transition-colors"
              aria-label="Abmelden"
            >
              <LogOutIcon className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 relative z-10">
        <KanzleiNav />
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto px-4 md:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
