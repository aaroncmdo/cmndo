// AAR-61: Mitarbeiter-Portal Layout — PortalShell (Navy-Canvas + schwebende
// Content-Card + Full-Height-Sidebar). Frueher Top-Bar + in-flow Light-Sidebar;
// die Top-Bar-Aktionen leben jetzt in den MitarbeiterNav-Slots. Mobile-Drawer
// folgt in Phase 3 (mobileNav bis dahin 'self' = PortalNav-Bottom-Bar).
import MitarbeiterNav from './_components/MitarbeiterNav'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'
import { PortalShell } from '@/components/shared/portal-shell'

export default async function MitarbeiterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // K5 / AAR-frontend-konsolidierung-p1: Auth + Rollen-Guard zentralisiert.
  // Audit-Fix #1: dispatch hat eigenes /dispatch/* Portal — gehört NICHT ins
  // KB-Portal (sah Leads die er nicht sehen sollte). Admin bleibt erlaubt.
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
    <>
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
      {/* Globaler Posteingang + Pinned-Chats — gleicher FAB den Admin/SV nutzen. */}
      <GlobalPosteingangFab currentUserId={user.id} />
    </>
  )
}
