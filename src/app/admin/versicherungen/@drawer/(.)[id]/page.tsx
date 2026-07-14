// P1: Intercepting-Route fuer /admin/versicherungen/<uuid>.
// Deep-Link/Hard-Nav matcht NICHT -> Full-Page [id]/page.tsx.

import VersichererDetailPage from '../../[id]/page'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedVersichererDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  return (
    <DrawerShell title="Versicherer" width={900}>
      <VersichererDetailPage params={params} searchParams={searchParams} variant="drawer" />
    </DrawerShell>
  )
}
