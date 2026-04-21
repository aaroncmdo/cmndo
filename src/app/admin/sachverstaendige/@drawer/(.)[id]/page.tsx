// AAR-691: Intercepting-Route für /admin/sachverstaendige/<uuid>.
// Rendert dieselbe Server-Page wie die Full-Page-Route, wrappt sie aber
// in einer Drawer-Shell. Bei direktem URL-Aufruf (Deep-Link) matcht dieser
// Intercept NICHT — stattdessen rendert Next.js die Full-Page `[id]/page.tsx`.

import SvDetailPage from '../../[id]/page'
import DrawerShell from '../DrawerShell'

type SvSearchParams = { tab?: string }

export default async function InterceptedSvDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SvSearchParams>
}) {
  return (
    <DrawerShell title="Sachverständigen-Profil" widthClass="sm:w-[860px]">
      <div className="px-6 py-6">
        <SvDetailPage params={params} searchParams={searchParams} />
      </div>
    </DrawerShell>
  )
}
