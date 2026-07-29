import { NetzwerkPortalPage } from '@/components/netzwerk/NetzwerkPortalPage'

export const dynamic = 'force-dynamic'

export default async function GutachterNetzwerkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  return <NetzwerkPortalPage portal="gutachter" searchParams={await searchParams} />
}
