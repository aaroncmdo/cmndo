import AdminNav from './_components/AdminNav'
import UpdatesNav from '@/components/shared/updates'
import Spotlight from '@/components/Spotlight'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'
import { requirePortalAccess } from '@/lib/auth/portal-guard'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // KFZ-203 + AAR-628 / K5: Auth + Rollen-Guard zentralisiert.
  const { supabase, user, initials } = await requirePortalAccess(['admin'])

  // AAR-531: Meine offene Tasks für Aufgaben-Badge.
  const { count: meineTasksCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('zugewiesen_an', user.id)
    .in('status', ['offen', 'in-bearbeitung'])

  return (
    <>
    {/* SV-Komposition: durchgehender Navy-Canvas (md:bg-claimondo-navy), auf dem
        die Glas-Sidebar UND der Content (als schwebende graue Karte) schweben —
        der Canvas ist rings um alles sichtbar (= "Sidebar schwebt vollstaendig
        frei", analog zum SV-Portal). Mobile bleibt heller bg-claimondo-bg. */}
    <div className="h-screen relative overflow-hidden bg-claimondo-bg md:bg-claimondo-navy">
      {/* Atmosphärische Hintergrund-Spotlights */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0" style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.10), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.06), transparent 70%)',
          ].join(', '),
        }} />
      </div>
      {/* Spotlight search (Cmd+K) */}
      <Spotlight />

      {/* Client-side nav with usePathname for active state */}
      <AdminNav email={user.email ?? ''} initials={initials} userId={user.id} meineTasksCount={meineTasksCount ?? 0} />

      {/* md:pl-56 = Gap zur fixed Glas-Sidebar; md:py-2/md:pr-2 = Navy-Rand
          oben/rechts/unten → die Content-Karte schwebt auf dem Navy-Canvas. */}
      <div className="md:pl-60 md:py-4 md:pr-4 h-screen flex flex-col relative z-10">
        {/* Mobile header — AAR-727 Glass-Dark */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 glass-dark shadow-ios-md shrink-0">
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
          <UpdatesNav variant="dark" />
        </header>

        {/* Desktop: Updates-Nav + Outbox badge top-right */}
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <OutboxBadge />
          <UpdatesNav variant="light" />
        </div>

        {/* Content-Karte: schwebende graue Karte auf dem Navy-Canvas (md+).
            AAR-911 v2: `.has-corner-pill` haelt nur die PageHeader-Action-Zeile
            rechts frei. Mobile: kein Karten-Chrome (voller heller bg). */}
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-hidden pb-16 md:pb-0 has-corner-pill">
          <div className="h-full overflow-y-auto md:rounded-ios-lg md:bg-claimondo-bg md:shadow-ios-lg">
            <PageContainer fullBleed className="min-h-full">{children}</PageContainer>
          </div>
        </main>
      </div>
      <GlobalPosteingangFab currentUserId={user.id} />
    </div>
    </>
  )
}
