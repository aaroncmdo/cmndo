// AAR-894: Dispatcher-Karte v1 — Server-Component lädt Triage-Snapshot
// und übergibt ihn an den Mapbox-Client. RBAC kommt vom dispatch-Layout.

import { createClient } from '@/lib/supabase/server'
import { getTriageLeads } from '@/lib/dispatch/karte/triage-leads'
import DispatchKarteClient from './DispatchKarteClient'

export const dynamic = 'force-dynamic'

export default async function DispatchKartePage() {
  const supabase = await createClient()
  const snapshot = await getTriageLeads(supabase)

  return (
    <div className="h-full w-full">
      <DispatchKarteClient initialSnapshot={snapshot} />
    </div>
  )
}
