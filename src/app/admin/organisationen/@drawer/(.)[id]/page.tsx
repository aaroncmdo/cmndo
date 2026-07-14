// P1: Intercepting-Route fuer /admin/organisationen/<uuid>.
// Rendert dieselbe Server-Page wie die Full-Page-Route, nur im DrawerShell.
// Deep-Link/Hard-Nav matcht diesen Intercept NICHT -> Full-Page [id]/page.tsx.
// Kein zusaetzliches Padding-Div: EntityDetailShell bringt sein Padding mit.

import OrganisationDetailPage from '../../[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedOrganisationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  return (
    <DrawerShell title="Organisation" width={900}>
      {/* variant="drawer": kein Zurueck-Link — der Drawer liegt ueber der Liste. */}
      <OrganisationDetailPage params={params} searchParams={searchParams} variant="drawer" />
    </DrawerShell>
  )
}
