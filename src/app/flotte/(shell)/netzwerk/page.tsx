import { NetzwerkPortalPage } from '@/components/netzwerk/NetzwerkPortalPage'

export const dynamic = 'force-dynamic'

export default async function FlotteNetzwerkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  return <NetzwerkPortalPage portal="flotte" searchParams={await searchParams} />
}
