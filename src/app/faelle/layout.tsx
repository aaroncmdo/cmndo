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
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeGetUser } from '@/lib/auth/safe-get-user'
import AdminNav from '@/app/admin/_components/AdminNav'
import MitarbeiterNav from '@/app/mitarbeiter/_components/MitarbeiterNav'
import KanzleiNav from '@/app/kanzlei/_components/KanzleiNav'
import UpdatesNav from '@/components/shared/updates'
import GlobalSearch from '@/components/shared/search/GlobalSearch'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'

export default async function FaelleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // CMM-14: getUser()-Reject nicht ins Layout werfen lassen (→ lila Root-Crash).
  // safeGetUser degradiert transiente Rejects zu null → sauberer /login-Redirect.
  const user = await safeGetUser(() => supabase.auth.getUser())
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
    // Detached-Navy-Panel-Sidebar (KanzleiNav dark), keine Top-Bar (Aktionen in
    // den Nav-Slots). Read-only via field-permissions, nicht hier.
    return (
      <div className="h-screen bg-claimondo-bg overflow-hidden">
        <KanzleiNav userId={user.id} displayName={displayName} />
        <main className="h-screen overflow-y-auto md:ml-56 px-4 md:px-8 py-6 pb-24 md:pb-6">
          {children}
        </main>
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
      <div className="h-screen bg-claimondo-bg overflow-hidden">
        <MitarbeiterNav userId={user.id} displayName={displayName} unreadNachrichten={unread} />
        <main className="h-screen overflow-y-auto md:ml-56 px-4 md:px-6 py-6 pb-24 md:pb-6">{children}</main>
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
    <>
    <div className="h-screen bg-claimondo-bg relative overflow-hidden">
      <GlobalSearch rolle="admin" />
      <AdminNav
        email={user.email ?? ''}
        initials={initials}
        userId={user.id}
        meineTasksCount={meineTasksCount ?? 0}
      />
      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        {/* Mobile-Nav ist bottom-only (MobileNav-Pille + Menü-Sheet inkl. Updates) — kein Top-Bar. */}
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <OutboxBadge />
          <UpdatesNav variant="light" />
        </div>
        {/* AAR-911 v2: Statt md:pr-36 die VOLLE Main-Höhe für die fixe Corner-Pill
            zu opfern, hält `.has-corner-pill` (globals.css) nur die PageHeader-
            Action-Zeile rechts frei — Body-Content gewinnt 144px Breite zurück. */}
        {/* lg:pb-20 = Safe-Area fuer den GlobalPosteingangFab (siehe globals.css). */}
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0 lg:pb-20 has-corner-pill">
          <PageContainer fullBleed className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
    </>
  )
}
