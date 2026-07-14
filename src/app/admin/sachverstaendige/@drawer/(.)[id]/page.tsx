// AAR-691: Intercepting-Route für /admin/sachverstaendige/<uuid>.
// Rendert dieselbe Server-Page wie die Full-Page-Route, wrappt sie aber
// in einer Drawer-Shell. Bei direktem URL-Aufruf (Deep-Link) matcht dieser
// Intercept NICHT — stattdessen rendert Next.js die Full-Page `[id]/page.tsx`.

import SvDetailPage from '../../[id]/page'
import { DrawerShell } from '@/components/shared/detail'

type SvSearchParams = { tab?: string }

export default async function InterceptedSvDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SvSearchParams>
}) {
  return (
    <DrawerShell title="Sachverständigen-Profil" width={860}>
      <div className="px-6 py-6">
        {/* variant="drawer": kein Zurueck-Link — der Drawer liegt ueber der Liste
            und hat bereits Titelzeile + Close-Button. */}
        <SvDetailPage params={params} searchParams={searchParams} variant="drawer" />
      </div>
    </DrawerShell>
  )
}
