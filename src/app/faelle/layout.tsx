// AAR-628: Rolle-abhängige Shell für die Fallakte-Route.
// SV-Komposition (2026-07-10): alle Rollen-Shells = durchgehender Navy-Canvas +
// Glas-Sidebar (dark PortalNav) + schwebende Content-Karte, analog admin/kanzlei/
// mitarbeiter.
//
// Die Fallakte wird von vier internen Rollen genutzt:
//   - admin           → Admin-Shell (AdminNav + Spotlight)
//   - kundenbetreuer  → Mitarbeiter-Shell (MitarbeiterNav)
//   - kanzlei         → Kanzlei-Shell (KanzleiNav, read-only via field-permissions)
//   - dispatch        → Mitarbeiter-Shell

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import AdminNav from '@/app/admin/_components/AdminNav'
import MitarbeiterNav from '@/app/mitarbeiter/_components/MitarbeiterNav'
import KanzleiNav from '@/app/kanzlei/_components/KanzleiNav'
import UpdatesNav from '@/components/shared/updates'
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

  // AAR-718: Rollen die hier nichts zu suchen haben → eigenes Portal.
  if (!rolle || !['admin', 'kanzlei', 'kundenbetreuer', 'dispatch'].includes(rolle)) {
    redirect(rolle ? roleToPath(rolle) : '/login')
  }

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'U'
  const displayName =
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || user.email || ''

  // Kanzlei → eigene Shell (KanzleiNav). Read-only via field-permissions +
  // FALL_PERMISSIONS + RLS-Policy (Migration 20260421151144).
  if (rolle === 'kanzlei') {
    return (
      <div className="h-screen bg-claimondo-bg md:bg-claimondo-navy overflow-hidden">
        <KanzleiNav userId={user.id} displayName={displayName} />
        <main className="h-screen overflow-hidden md:pl-60 md:py-4 md:pr-4">
          <div className="h-full overflow-y-auto md:rounded-ios-lg md:bg-claimondo-bg md:shadow-ios-lg px-4 md:px-8 py-6 pb-24 md:pb-6">
            {children}
          </div>
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
      <div className="h-screen bg-claimondo-bg md:bg-claimondo-navy overflow-hidden">
        <MitarbeiterNav userId={user.id} displayName={displayName} unreadNachrichten={unread} />
        <main className="h-screen overflow-hidden md:pl-60 md:py-4 md:pr-4">
          <div className="h-full overflow-y-auto md:rounded-ios-lg md:bg-claimondo-bg md:shadow-ios-lg px-4 md:px-6 py-6 pb-24 md:pb-6">{children}</div>
        </main>
      </div>
    )
  }

  // admin → Admin-Shell (Kopie der /admin/layout.tsx-Logik).
  const { count: meineTasksCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('zugewiesen_an', user.id)
    .in('status', ['offen', 'in-bearbeitung'])

  return (
    <>
    <div className="h-screen bg-claimondo-bg md:bg-claimondo-navy relative overflow-hidden">
      <Spotlight />
      <AdminNav
        email={user.email ?? ''}
        initials={initials}
        userId={user.id}
        meineTasksCount={meineTasksCount ?? 0}
      />
      <div className="md:pl-60 md:py-4 md:pr-4 h-screen flex flex-col relative z-10">
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
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-hidden pb-16 md:pb-0 has-corner-pill">
          <div className="h-full overflow-y-auto md:rounded-ios-lg md:bg-claimondo-bg md:shadow-ios-lg">
            <PageContainer fullBleed className="min-h-full">{children}</PageContainer>
          </div>
        </main>
      </div>
    </div>
    </>
  )
}
