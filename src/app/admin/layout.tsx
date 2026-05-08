import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import AdminNav from './_components/AdminNav'
import UpdatesNav from '@/components/shared/updates'
import Spotlight from '@/components/Spotlight'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // KFZ-203 + AAR-628: Rollen-Guard für /admin/*.
  // Dispatch → eigenes Portal /dispatch/dashboard.
  // Kundenbetreuer → eigenes Portal /mitarbeiter (Fallakte-Detail teilen
  //   sich admin/kb/kanzlei unter /faelle/[id], aber die restlichen
  //   /admin/*-Seiten sind Admin-only).
  // Sachverständiger / Kunde / Makler sollten hier sowieso nicht ankommen,
  //   Login-Redirect fängt das ab — zur Sicherheit trotzdem explizit.
  // AAR-658 Silent-Error-Audit: Query-Error nicht still schlucken — sonst ist
  // `profileCheck` undefined, keiner der Role-Redirects greift, ein User ohne
  // Admin-Rolle würde /admin sehen. Defensiv zurück zum Login werfen.
  const { data: profileCheck, error: profileErr } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).single()
  if (profileErr || !profileCheck) {
    console.error('[admin/layout] Profil-Query:', profileErr?.message ?? 'keine Row')
    redirect('/login?error=Profil+nicht+ladbar')
  }
  // AAR-718: Dupliziertes Hardcoded-Mapping durch zentrale roleToPath
  // ersetzt — sonst droht Drift wenn eine neue Rolle nur dort, aber nicht
  // hier ergänzt wird.
  const profileRolle = profileCheck.rolle as string | undefined
  if (profileRolle && profileRolle !== 'admin') {
    redirect(roleToPath(profileRolle))
  }

  const initials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U'

  // AAR-531: Meine offene Tasks für Aufgaben-Badge.
  // AAR-727: unreadNachrichten-Count entfällt — Posteingang läuft über den
  // GlobalPosteingangFab (eigener Badge-Counter via /api/chat/inbox-threads).
  const { count: meineTasksCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('zugewiesen_an', user.id)
    .in('status', ['offen', 'in-bearbeitung'])

  return (
    <div className="h-screen bg-[#f8f9fb] relative overflow-hidden">
      {/* Spotlight search (Cmd+K) */}
      <Spotlight />

      {/* Client-side nav with usePathname for active state */}
      <AdminNav email={user.email ?? ''} initials={initials} userId={user.id} meineTasksCount={meineTasksCount ?? 0} />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        {/* AAR-725: UpdatesNav ersetzt MitteilungszentralePanel + alte
            NotificationBell. Tasks haben jetzt eigene Pill (AAR-723). */}
        {/* Mobile header — AAR-727 Glass-Dark mit subtilem Shadow */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 glass-dark shadow-ios-md shrink-0">
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <UpdatesNav variant="dark" />
        </header>

        {/* Desktop: Updates-Nav + Outbox badge top-right */}
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <OutboxBadge />
          <UpdatesNav variant="light" />
        </div>

        {/* Content — each page decides its own scroll behavior.
            BUG-98: PageContainer gibt Desktop ~15-20 % horizontale Marge,
            Tablet quer großflächig, Mobile fast volle Breite. Kein py,
            damit Sticky-Header-Pattern in Pages weiter funktionieren. */}
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <PageContainer className="h-full">{children}</PageContainer>
        </main>
      </div>
      <GlobalPosteingangFab currentUserId={user.id} />
    </div>
  )
}
