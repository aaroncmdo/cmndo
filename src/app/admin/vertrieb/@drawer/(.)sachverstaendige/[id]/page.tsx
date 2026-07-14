// Intercepting-Route fuer /admin/vertrieb/sachverstaendige/<uuid>: rendert den SV-Detail-RSC
// als Drawer ueber dem Cockpit (Reuse des bestehenden ~592-LOC-RSC, kein Rewrite). Ein direkter
// URL-Aufruf / Hard-Nav matcht NICHT -> Next rendert die Full-Page (Re-Export
// /admin/vertrieb/sachverstaendige/[id]). Externe Links zeigen weiter auf
// /admin/sachverstaendige/<uuid> (Full-Page) und bleiben unberuehrt.
import SvDetailPage from '@/app/admin/sachverstaendige/[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedCockpitSvDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  return (
    <DrawerShell title="Sachverständigen-Profil" width={860}>
      <div className="px-6 py-6">
        {/* variant="drawer": kein Zurueck-Link (der Drawer liegt ueber dem Cockpit). */}
        <SvDetailPage params={params} searchParams={searchParams} variant="drawer" />
      </div>
    </DrawerShell>
  )
}
