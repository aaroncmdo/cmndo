import AdminNav from './_components/AdminNav'
import UpdatesNav from '@/components/shared/updates'
import Spotlight from '@/components/Spotlight'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { PortalShell } from '@/components/shared/portal-shell'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // KFZ-203 + AAR-628 / K5 / AAR-frontend-konsolidierung-p1: Auth + Rollen-Guard
  // zentralisiert (requirePortalAccess wirft via redirect bei fehlendem Login /
  // falscher Rolle / nicht ladbarem Profil). Dispatch/Kundenbetreuer landen in
  // ihrem eigenen Portal — die /admin/*-Seiten sind Admin-only.
  const { supabase, user, initials } = await requirePortalAccess(['admin'])

  // AAR-531: Meine offene Tasks für Aufgaben-Badge.
  // AAR-727: unreadNachrichten-Count entfällt — Posteingang läuft über den
  // GlobalPosteingangFab (eigener Badge-Counter via /api/chat/inbox-threads).
  const { count: meineTasksCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('zugewiesen_an', user.id)
    .in('status', ['offen', 'in-bearbeitung'])

  // Portal-Shell: Navy-Canvas + schwebende Content-Card + Glass-Pills. Das frühere
  // atmosphärische Radial-Gradient-Ambient entfällt bewusst — der Navy-Canvas ist
  // die neue Umgebung (konsistent mit dem SV-Portal, das ebenfalls einen flachen
  // brand-primary-Canvas nutzt). Spotlight (Cmd+K) + GlobalPosteingangFab bleiben
  // als fixe Overlays Geschwister der Shell.
  return (
    <>
      <Spotlight />
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="self"
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
      <GlobalPosteingangFab currentUserId={user.id} />
    </>
  )
}
