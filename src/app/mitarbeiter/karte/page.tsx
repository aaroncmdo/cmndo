// SV-Live-Ops Chunk 3c: KB-Karten-Route /mitarbeiter/karte
// Spiegelt das Admin-Muster (admin/sachverstaendige/page.tsx), scoped auf
// betreute Faelle/SVs des eingeloggten Kundenbetreuers.

import { requirePortalAccess } from '@/lib/auth/portal-guard'
import {
  resolveLiveOpsScope,
  getLiveOpsSvs,
  getOffeneTermine,
  getUnterwegsRouten,
  getTagesrouten,
  getDeadPins,
  getLeads,
} from '@/lib/live-ops'
import MitarbeiterLiveOpsClient from './MitarbeiterLiveOpsClient'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterKartePage() {
  const { user } = await requirePortalAccess(['kundenbetreuer', 'admin'])

  const scope = await resolveLiveOpsScope('kundenbetreuer', user.id)
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
    // Aaron 07.07.: Karte full-bleed — bricht via dokumentiertem 96%-Escape
    // (104.17% von 96% = 100% Main-Breite) aus dem Wrapper aus.
    <div className="flex flex-col h-full md:w-[104.17%] md:-ml-[2.08%]">
      <div className="flex items-center px-4 py-2.5 border-b border-claimondo-border bg-claimondo-bg/60 shrink-0">
        <h1 className="text-sm font-semibold text-claimondo-navy">Karte</h1>
      </div>

      {/* Karte — flex-1 + min-h-0 gibt der LiveOpsMap (h-full) eine definierte Hoehe */}
      <div className="flex-1 min-h-0">
        <MitarbeiterLiveOpsClient data={{ svs, termine, routen, tagesrouten, deadPins, leads }} />
      </div>
    </div>
  )
}
