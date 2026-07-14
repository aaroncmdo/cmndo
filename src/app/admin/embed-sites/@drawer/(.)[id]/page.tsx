// P1: Intercepting-Route fuer /admin/embed-sites/<uuid>.
// Deep-Link/Hard-Nav matcht NICHT -> Full-Page [id]/page.tsx.

import EmbedSiteDetailPage from '../../[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedEmbedSiteDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  return (
    <DrawerShell title="Embed-Site" width={900}>
      <EmbedSiteDetailPage params={params} searchParams={searchParams} variant="drawer" />
    </DrawerShell>
  )
}
