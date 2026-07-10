// AAR-61: Mitarbeiter-Portal Layout — SV-Komposition: durchgehender Navy-Canvas +
// Glas-Sidebar (dark PortalNav) + schwebende Content-Karte.
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
    <div className="h-screen bg-claimondo-bg md:bg-claimondo-navy overflow-hidden">
      <MitarbeiterNav userId={user.id} displayName={displayName} unreadNachrichten={unread} />
      {/* md:pl-60/md:py-4/md:pr-4 = Navy-Rand um die schwebende Content-Karte. */}
      <main className="h-screen overflow-hidden md:pl-60 md:py-4 md:pr-4">
        <div className="h-full overflow-y-auto md:rounded-ios-lg md:bg-claimondo-bg md:shadow-ios-lg px-4 md:px-6 py-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>
      {/* Globaler Posteingang + Pinned-Chats — gleicher FAB den Admin/SV nutzen. */}
      <GlobalPosteingangFab currentUserId={user.id} />
    </div>
  )
}
