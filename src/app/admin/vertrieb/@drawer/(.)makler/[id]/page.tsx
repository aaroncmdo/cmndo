// Intercepting-Route fuer /admin/vertrieb/makler/<uuid>: rendert die Makler-Akte als
// Drawer ueber dem Cockpit — B3 des CRM-Drawer-Programms (Phase-A-Befund a3: der
// PartnerCockpit-CTA dumpte bisher in die Makler-LISTE, es gab keine Detail-View).
// Hard-Nav/Deep-Link matcht NICHT -> Next rendert die Full-Page
// /admin/vertrieb/makler/[id].
import MaklerAkteDetailPage from '../../../makler/[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedCockpitMaklerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  return (
    <DrawerShell title="Makler-Akte" width={860}>
      <div className="px-6 py-6">
        {/* variant="drawer": kein Zurueck-Link (der Drawer liegt ueber dem Cockpit). */}
        <MaklerAkteDetailPage params={params} searchParams={searchParams} variant="drawer" />
      </div>
    </DrawerShell>
  )
}
