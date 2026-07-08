// AAR-628: Rolle-abhängige Shell für die Fallakte-Route (PortalShell-Adoption).
//
// Die Fallakte wird von vier internen Rollen genutzt:
//   - admin           → Admin-Shell (AdminNav + Spotlight + Corner-Pill)
//   - kundenbetreuer  → Mitarbeiter-Shell (MitarbeiterNav)
//   - kanzlei         → Kanzlei-Shell (KanzleiNav, read-only) — PR 2b
//   - dispatch        → Mitarbeiter-Shell
//
// Alle drei Zweige nutzen jetzt die geteilte PortalShell (Navy-Canvas +
// schwebende Content-Card + Full-Height-Sidebar) — konsistent mit den
// Standalone-Portal-Layouts. Read-only (kanzlei) bleibt über field-permissions
// + FALL_PERMISSIONS + RLS-Policy (Migration 20260421151144) abgesichert.

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
import { PortalShell } from '@/components/shared/portal-shell'

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
  if (!rolle || !['admin', 'kanzlei', 'kundenbetreuer', 'dispatch'].includes(rolle)) {
    redirect(rolle ? roleToPath(rolle) : '/login')
  }

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'U'
  const displayName =
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || user.email || ''

  // Kanzlei → eigene Shell (read-only via field-permissions, nicht hier).
  if (rolle === 'kanzlei') {
    return (
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="self"
        sidebar={<KanzleiNav userId={user.id} displayName={displayName} />}
        mobileHeader={
          <>
            <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-claimondo-light-blue border border-claimondo-light-blue/30 rounded px-2 py-0.5">Kanzlei</span>
          </>
        }
        contentClassName="px-4 md:px-8 py-6 pb-24 md:pb-6"
      >
        {children}
      </PortalShell>
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
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="shell-drawer"
        sidebar={<MitarbeiterNav userId={user.id} displayName={displayName} unreadNachrichten={unread} />}
        mobileHeader={
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
        }
        contentClassName="px-4 py-6 pb-24 md:px-6 md:pb-6"
      >
        {children}
      </PortalShell>
    )
  }

  // admin → Admin-Shell (analog /admin/layout.tsx).
  const { count: meineTasksCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('zugewiesen_an', user.id)
    .in('status', ['offen', 'in-bearbeitung'])

  return (
    <>
      <Spotlight />
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="shell-drawer"
        sidebar={<AdminNav email={user.email ?? ''} initials={initials} userId={user.id} meineTasksCount={meineTasksCount ?? 0} />}
        mobileHeader={
          <>
            <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
            <div className="ml-auto">
              <UpdatesNav variant="dark" />
            </div>
          </>
        }
        desktopTopRight={
          <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
            <OutboxBadge />
            <UpdatesNav variant="light" />
          </div>
        }
        contentClassName="has-corner-pill pb-16 md:pb-0"
      >
        <PageContainer className="h-full">{children}</PageContainer>
      </PortalShell>
    </>
  )
}
