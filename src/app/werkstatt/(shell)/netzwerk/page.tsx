import { NetzwerkPortalPage } from '@/components/netzwerk/NetzwerkPortalPage'

export const dynamic = 'force-dynamic'

export default async function WerkstattNetzwerkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  return <NetzwerkPortalPage portal="werkstatt" searchParams={await searchParams} />
}
