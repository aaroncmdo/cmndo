// AAR-kanzlei-portal Layout — SV-Komposition: durchgehender Navy-Canvas +
// Glas-Sidebar (dark PortalNav) + schwebende Content-Karte.
// Guard: Rolle 'kanzlei' (Admin fuer Testing erlaubt).

import KanzleiNav from './_components/KanzleiNav'
import { requirePortalAccess } from '@/lib/auth/portal-guard'

export default async function KanzleiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, displayName } = await requirePortalAccess(['kanzlei', 'admin'])

  return (
    <div className="h-screen bg-claimondo-bg md:bg-claimondo-navy overflow-hidden">
      <KanzleiNav userId={user.id} displayName={displayName} />
      {/* md:pl-60/md:py-4/md:pr-4 = Navy-Rand um die schwebende Content-Karte. */}
      <main className="h-screen overflow-hidden md:pl-60 md:py-4 md:pr-4">
        {/* pb-24 mobile: Platz fuer die PortalNav-Bottom-Bar. */}
        <div className="h-full overflow-y-auto md:rounded-ios-lg md:bg-claimondo-bg md:shadow-ios-lg px-4 md:px-8 py-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>
    </div>
  )
}
