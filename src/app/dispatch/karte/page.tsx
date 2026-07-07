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
  // svs zuerst awaiten, dann als preloadedSvs an getUnterwegsRouten uebergeben (spart doppelten DB-Call)
  const svs = await getLiveOpsSvs(scope)
  const [termine, routen, tagesrouten, deadPins, leads] = await Promise.all([
    getOffeneTermine(scope),
    getUnterwegsRouten(scope, svs),
    getTagesrouten(scope),
    getDeadPins(scope),
    getLeads(scope),
  ])

  return (
    // Aaron 07.07.: Karte full-bleed — bricht via dokumentiertem PageContainer-
    // Escape (104.17% von 96% = 100% Main-Breite) aus dem 96%-Wrapper aus.
    <div className="flex flex-col h-full md:w-[104.17%] md:-ml-[2.08%]">
      {/* Karte — flex-1 + min-h-0 gibt der LiveOpsMap (h-full) eine definierte Hoehe */}
      <div className="flex-1 min-h-0">
        <DispatchLiveOpsClient data={{ svs, termine, routen, tagesrouten, deadPins, leads }} />
      </div>
    </div>
  )
}
