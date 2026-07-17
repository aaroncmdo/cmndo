// Intercepting-Route fuer /admin/vertrieb/werkstaetten/<uuid>: rendert die Werkstatt-Akte
// (bestehender RSC+Client, Reuse ohne Rewrite) als Drawer ueber dem Cockpit — B2 des
// CRM-Drawer-Programms (Phase-A-Befund a2: Werkstatt-Detail hatte keinen Drawer-Pfad;
// PartnerCockpit-CTA via detailLink('werkstatt') zielt hierauf). Ein direkter URL-Aufruf /
// Hard-Nav matcht NICHT -> Next rendert die Full-Page (Re-Export
// /admin/vertrieb/werkstaetten/[id]). Externe Links auf /admin/werkstaetten/<uuid>
// (Alt-Route) bleiben unberuehrt.
import WerkstattDetailPage from '@/app/admin/werkstaetten/[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedCockpitWerkstattDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <DrawerShell title="Werkstatt-Akte" width={900}>
      <div className="px-6 py-6">
        {/* variant="drawer": kein Zurueck-Link (der Drawer liegt ueber dem Cockpit). */}
        <WerkstattDetailPage params={params} variant="drawer" />
      </div>
    </DrawerShell>
  )
}
