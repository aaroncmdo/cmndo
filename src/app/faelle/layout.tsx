// AAR-628: Rolle-abhängige Shell für die Fallakte-Route.
//
// Die Fallakte wird von vier internen Rollen genutzt:
//   - admin           → volle Admin-Shell (AdminNav + NotificationBell + Spotlight)
//   - kundenbetreuer  → Mitarbeiter-Shell (MitarbeiterNav + reduzierte Header)
//   - kanzlei         → Kanzlei-Shell (KanzleiNav, read-only) — PR 2b
//   - dispatch  → Mitarbeiter-Shell
//
// AAR-kanzlei-portal (PR 2b): Kanzlei bekommt eigene Shell mit KanzleiNav,
// damit sie nicht in der Admin-UI landen. Read-only ist über
// field-permissions + FALL_PERMISSIONS (kanzlei → READONLY_PERMISSIONS)
// abgesichert, plus RLS-Policy aus Migration 20260421151144.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogOutIcon } from 'lucide-react'
import { roleToPath } from '@/lib/auth/role-redirect'
import AdminNav from '@/app/admin/_components/AdminNav'
import MitarbeiterNav from '@/app/mitarbeiter/_components/MitarbeiterNav'
import KanzleiNav from '@/app/kanzlei/_components/KanzleiNav'
import UpdatesNav from '@/components/shared/updates'
import { MitteilungenProvider } from '@/components/mitteilungszentrale/MitteilungenProvider'
import Spotlight from '@/components/Spotlight'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'

export default async function FaelleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined

  // AAR-718: Rollen die hier nichts zu suchen haben — per zentrale
  // roleToPath-Funktion in ihr eigenes Portal. Vorher hardcoded-Switch.
  // Admin/Kanzlei/KB/Dispatcher dürfen drin bleiben.
  if (!rolle || !['admin', 'kanzlei', 'kundenbetreuer', 'dispatch'].includes(rolle)) {
    redirect(rolle ? roleToPath(rolle) : '/login')
  }

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'U'
  const displayName =
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || user.email || ''

  // AAR-kanzlei-portal: Kanzlei → eigene Shell (KanzleiNav + Navy-Header).
  // Read-only-Verhalten wird NICHT hier, sondern in field-permissions.ts
  // + FALL_PERMISSIONS gesetzt (kanzlei → READONLY_PERMISSIONS). Die RLS-
  // Policy in Migration 20260421151144 limitiert die sichtbaren Fälle
  // zusätzlich auf service_typ='komplett'.
  if (rolle === 'kanzlei') {
    // AAR-676: h-screen + overflow-hidden, nur Main scrollt. max-w-Cap weg.
    return (
      <div className="h-screen bg-claimondo-bg flex flex-col overflow-hidden">
        <header className="bg-claimondo-navy px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span className="text-claimondo-light-blue">ondo</span>
            </span>
            <span className="text-[11px] uppercase tracking-wider text-claimondo-light-blue border border-claimondo-light-blue/30 rounded px-2 py-0.5">
              Kanzlei
            </span>
          </div>
          <div className="flex items-center gap-3">
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
        <div className="flex flex-1 min-h-0">
          <KanzleiNav />
          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto px-4 md:px-8 py-6">
            {children}
          </main>
        </div>
      </div>
    )
  }

  // KB / Dispatcher → Mitarbeiter-Shell
  if (rolle === 'kundenbetreuer' || rolle === 'dispatch') {
    let unread = 0
    try {
      const { count } = await supabase
        .from('nachrichten')
        .select('id', { count: 'exact', head: true })
        .eq('gelesen', false)
        .neq('sender_id', user.id)
      unread = count ?? 0
    } catch { /* non-critical */ }

    return (
      <div className="min-h-screen bg-claimondo-bg">
        <header className="bg-claimondo-navy px-4 py-3 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-claimondo-light-blue text-sm">{displayName}</span>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="text-claimondo-light-blue hover:text-white transition-colors">
                <LogOutIcon className="w-4 h-4" />
              </button>
            </form>
          </div>
        </header>
        <div className="flex">
          <MitarbeiterNav unreadNachrichten={unread} />
          <main className="flex-1 px-4 py-6 md:w-[96%] md:mx-auto md:px-0">{children}</main>
        </div>
      </div>
    )
  }

  // admin → Admin-Shell (Kopie der /admin/layout.tsx-Logik). AAR-727:
  // unreadNachrichten entfernt — Posteingang läuft jetzt über GlobalPosteingangFab.
  const { count: meineTasksCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('zugewiesen_an', user.id)
    .in('status', ['offen', 'in-bearbeitung'])

  return (
    <MitteilungenProvider>
    <div className="h-screen bg-claimondo-bg relative overflow-hidden">
      <Spotlight />
      <AdminNav
        email={user.email ?? ''}
        initials={initials}
        userId={user.id}
        meineTasksCount={meineTasksCount ?? 0}
      />
      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-claimondo-navy shrink-0">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span>
          </span>
          <UpdatesNav variant="dark" />
        </header>
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <OutboxBadge />
          <UpdatesNav variant="light" />
        </div>
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <PageContainer className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
    </MitteilungenProvider>
  )
}
