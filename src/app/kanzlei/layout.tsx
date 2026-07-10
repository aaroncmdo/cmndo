// AAR-kanzlei-portal Layout — Detached-Navy-Panel-Sidebar (dark PortalNav),
// KEINE Top-Bar mehr (Aktionen in den KanzleiNav-Slots), konsistent mit admin.
// h-screen + inner-scroll; Content per md:ml-56 am fixed Panel vorbei.
//
// Guard: Rolle muss 'kanzlei' sein. Admin darf ebenfalls rein (Testing).

import KanzleiNav from './_components/KanzleiNav'
import { requirePortalAccess } from '@/lib/auth/portal-guard'

export default async function KanzleiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, displayName } = await requirePortalAccess(['kanzlei', 'admin'])

  return (
    <div className="h-screen bg-claimondo-bg overflow-hidden">
      <KanzleiNav userId={user.id} displayName={displayName} />
      {/* pb-24 mobile: Platz fuer die PortalNav-Bottom-Bar (md:hidden). */}
      <main className="h-screen overflow-y-auto md:ml-56 px-4 md:px-8 py-6 pb-24 md:pb-6">
        {children}
      </main>
    </div>
  )
}
