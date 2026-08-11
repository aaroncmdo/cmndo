import AdminNav from './_components/AdminNav'
import UpdatesNav from '@/components/shared/updates'
import GlobalSearch from '@/components/shared/search/GlobalSearch'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'
import { requirePortalAccess } from '@/lib/auth/portal-guard'

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

  return (
    <>
    <div className="h-screen relative overflow-hidden bg-claimondo-bg">
      {/* Atmosphärische Hintergrund-Spotlights — identisch mit Login-Page */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0" style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.10), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.06), transparent 70%)',
          ].join(', '),
        }} />
      </div>
      {/* Globale Suche (Cmd+K) */}
      <GlobalSearch rolle="admin" />

      {/* Client-side nav with usePathname for active state */}
      <AdminNav email={user.email ?? ''} initials={initials} userId={user.id} meineTasksCount={meineTasksCount ?? 0} />

      {/* Main content area — full-bleed (PageContainer fullBleed = w-full);
          md:pl-56 raeumt das fixe Glass-Panel frei, damit der Content nicht
          dahinter kollidiert. Hintergrund (bg + Spotlights) bleedt unter das
          Panel, der Content laeuft rechts bis zur Kante. */}
      <div className="md:pl-56 h-screen flex flex-col relative z-10">
        {/* AAR-725: UpdatesNav ersetzt MitteilungszentralePanel + alte
            NotificationBell. Tasks haben jetzt eigene Pill (AAR-723). */}
        {/* Mobile-Nav ist bottom-only (MobileNav-Pille + Menü-Sheet inkl. Updates) — kein Top-Bar. */}

        {/* Desktop: Updates-Nav + Outbox badge top-right */}
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <OutboxBadge />
          <UpdatesNav variant="light" />
        </div>

        {/* Content — each page decides its own scroll behavior.
            BUG-98: PageContainer gibt Desktop ~15-20 % horizontale Marge,
            Tablet quer großflächig, Mobile fast volle Breite. Kein py,
            damit Sticky-Header-Pattern in Pages weiter funktionieren. */}
        {/* AAR-911 v2: Statt md:pr-36 die VOLLE Main-Höhe für die fixe Corner-Pill
            zu opfern, hält `.has-corner-pill` (globals.css) nur die PageHeader-
            Action-Zeile rechts frei — Body-Content gewinnt 144px Breite zurück. */}
        {/* lg:pb-20 = Safe-Area fuer den GlobalPosteingangFab (fixed right-4 bottom-4,
            48px -> belegt die untere rechte Ecke, nur lg+). Ohne sie liegt die letzte
            Inhaltszeile am Scroll-Ende unter dem FAB und ist nicht klickbar. Gegenstueck
            zu .has-corner-pill (oben rechts) — siehe globals.css. */}
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0 lg:pb-20 has-corner-pill">
          <PageContainer fullBleed className="h-full">{children}</PageContainer>
        </main>
      </div>
      <GlobalPosteingangFab currentUserId={user.id} />
    </div>
    </>
  )
}
