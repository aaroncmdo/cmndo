// Intercepting-Route fuer /admin/vertrieb/firmen-flotte/<uuid>: rendert die Firmen-Flotten-Akte
// als Drawer ueber dem Cockpit (Reuse des Full-Page-RSC, kein Rewrite). Direkter URL-Aufruf /
// Hard-Nav matcht NICHT -> Next rendert die Full-Page. Muster: (.)sachverstaendige/[id].
import FirmenFlotteDetailPage from '@/app/admin/vertrieb/firmen-flotte/[id]/page'
import DrawerShell from '@/app/admin/sachverstaendige/@drawer/DrawerShell'

export default async function InterceptedFirmenFlotteDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <DrawerShell title="Firmen-Flotten-Akte" width={900}>
      <div className="px-6 py-6">
        <FirmenFlotteDetailPage params={params} />
      </div>
    </DrawerShell>
  )
}
