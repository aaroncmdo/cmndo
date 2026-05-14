// AAR-912: Dispatcher-Karte v2 — Server-Component lädt KarteSnapshot
// (Leads + SVs + Termine) und übergibt ihn an den Mapbox-Client.
// RBAC kommt vom dispatch-Layout.

import { createClient } from '@/lib/supabase/server'
import { getKarteSnapshot } from '@/lib/dispatch/karte/get-karte-snapshot'
import DispatchKarteClient from './DispatchKarteClient'

export const dynamic = 'force-dynamic'

export default async function DispatchKartePage() {
  const supabase = await createClient()
  const snapshot = await getKarteSnapshot(supabase)

  return (
    <div className="h-full w-full">
      <DispatchKarteClient initialSnapshot={snapshot} />
    </div>
  )
}
