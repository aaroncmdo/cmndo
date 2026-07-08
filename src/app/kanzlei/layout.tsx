// AAR-kanzlei-portal Layout — PortalShell (Navy-Canvas + schwebende Content-Card
// + Full-Height-Sidebar). Frueher Top-Bar + in-flow Light-Sidebar; die Top-Bar-
// Aktionen leben jetzt in den KanzleiNav-Slots. Desktop-only (Mobile = PortalNav-
// Bottom-Bar via mobileNav=self).
//
// Guard: Rolle muss 'kanzlei' sein. Admin darf ebenfalls rein (Testing).

import KanzleiNav from './_components/KanzleiNav'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { PortalShell } from '@/components/shared/portal-shell'

export default async function KanzleiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, displayName } = await requirePortalAccess(['kanzlei', 'admin'])

  return (
    <PortalShell
      breakpoint="md"
      contentOffsetClass="md:pl-56"
      mobileNav="self"
      sidebar={<KanzleiNav userId={user.id} displayName={displayName} />}
      mobileHeader={
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/claimondo-shield.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
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
