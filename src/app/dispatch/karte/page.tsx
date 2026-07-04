// AAR-956 (SV-Live-Ops Chunk 3b-2): /dispatch/karte rendert jetzt <LiveOpsMap role="dispatch">.
// Auth/RBAC kommt vom dispatch-Layout (requirePortalAccess(['dispatch','admin'])).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  resolveLiveOpsScope,
  getLiveOpsSvs,
  getOffeneTermine,
  getUnterwegsRouten,
  getTagesrouten,
  getDeadPins,
  getLeads,
} from '@/lib/live-ops'
import DispatchLiveOpsClient from './DispatchLiveOpsClient'

export const dynamic = 'force-dynamic'

export default async function DispatchKartePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const scope = await resolveLiveOpsScope('dispatch', user.id)
  const [svs, termine, routen, tagesrouten, deadPins, leads] = await Promise.all([
    getLiveOpsSvs(scope),
    getOffeneTermine(scope),
    getUnterwegsRouten(scope),
    getTagesrouten(scope),
    getDeadPins(scope),
    getLeads(scope),
  ])

  return (
    <div className="flex flex-col h-full">
      {/* Karte — flex-1 + min-h-0 gibt der LiveOpsMap (h-full) eine definierte Hoehe */}
      <div className="flex-1 min-h-0">
        <DispatchLiveOpsClient data={{ svs, termine, routen, tagesrouten, deadPins, leads }} />
      </div>
    </div>
  )
}
