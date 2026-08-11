// AAR-61: Mitarbeiter-Portal Layout — Detached-Navy-Panel-Sidebar (dark PortalNav),
// KEINE Top-Bar mehr (Aktionen in den MitarbeiterNav-Slots), konsistent mit admin.
// h-screen + inner-scroll; Content per md:ml-56 am fixed Panel vorbei.
import MitarbeiterNav from './_components/MitarbeiterNav'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'

export default async function MitarbeiterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // K5 / AAR-frontend-konsolidierung-p1: Auth + Rollen-Guard zentralisiert.
  const { supabase, user, displayName } = await requirePortalAccess(['kundenbetreuer', 'admin'])

  // Unread Nachrichten fuer Sidebar-Badge (non-critical)
  let unread = 0
  try {
    const { count } = await supabase
      .from('nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('gelesen', false)
      .neq('sender_id', user.id)
    unread = count ?? 0
  } catch { /* */ }

  return (
    <div className="h-screen bg-claimondo-bg overflow-hidden">
      <MitarbeiterNav userId={user.id} displayName={displayName} unreadNachrichten={unread} />
      {/* pb-24 mobile: Platz fuer die PortalNav-Bottom-Bar (md:hidden). */}
      {/* lg:pb-20 = Safe-Area fuer den GlobalPosteingangFab (siehe globals.css). */}
      <main className="h-screen overflow-y-auto md:ml-56 px-4 md:px-6 py-6 pb-24 md:pb-6 lg:pb-20">
        {children}
      </main>
      {/* Globaler Posteingang + Pinned-Chats — gleicher FAB den Admin/SV nutzen. */}
      <GlobalPosteingangFab currentUserId={user.id} />
    </div>
  )
}
