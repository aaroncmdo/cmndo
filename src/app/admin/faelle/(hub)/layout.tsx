// AAR-526 → F0: Fälle-Hub Layout. EIN Chrome-Block (FaelleHubHeader) über 5 Sub-Views.
// Route Group `(hub)` damit /admin/faelle/[id] und /admin/faelle/anlegen das Layout NICHT erben.
import { createAdminClient } from '@/lib/supabase/admin'
import FaelleHubHeader from './FaelleHubHeader'

export const dynamic = 'force-dynamic'

async function fetchReklamationenBadge(): Promise<number> {
  const db = createAdminClient()
  const { count } = await db
    .from('reklamationen')
    .select('id', { count: 'exact', head: true })
    .in('status', ['eingereicht', 'pruefung'])
  return count ?? 0
}

export default async function FaelleHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const offeneReklamationen = await fetchReklamationenBadge()

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6">
        <FaelleHubHeader offeneReklamationen={offeneReklamationen} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
