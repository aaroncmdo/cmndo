import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import FlotteClient from '@/components/flotte/FlotteClient'
import { SchadenkarteBindenSection } from '@/components/flotte/SchadenkarteBindenSection'
import { fuegeFahrzeugHinzu, entferneFahrzeug } from './actions'
import { bindeKarte } from './schadenkarte-actions'

export const dynamic = 'force-dynamic'

export default async function FlottePage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  const flotte = firma ? await getKundeFlotte(db, firma.id) : []
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">Flotte</h1>
        <p className="mt-1 text-sm text-claimondo-shield">Ihre Firmenfahrzeuge — Grundlage für die Schadenkarten.</p>
      </div>
      {/* onSpeichereFirma bewusst weggelassen: firma ist admin-provisioniert, kein Setup-Formular. */}
      <FlotteClient firma={firma} flotte={flotte} onFuegeHinzu={fuegeFahrzeugHinzu} onEntferne={entferneFahrzeug} detailBasePath="/flotte/fahrzeug" />
      <SchadenkarteBindenSection flotte={flotte} onBinde={bindeKarte} />
    </div>
  )
}
