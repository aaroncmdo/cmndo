import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import FlotteClient from '@/components/flotte/FlotteClient'
import { SchadenkarteBindenSection } from '@/components/flotte/SchadenkarteBindenSection'
import { SectionCard } from '@/components/shared/SectionCard'
import { getGebundeneFahrzeugIds } from '@/lib/schadenkarte/schadenkarte'
import { fuegeFahrzeugHinzu, entferneFahrzeug, scanZb1Karte, legeZb1Fahrzeuge } from './actions'
import { bindeKarte } from './schadenkarte-actions'

export const dynamic = 'force-dynamic'

export default async function FlottePage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  const flotte = firma ? await getKundeFlotte(db, firma.id) : []
  // Nur ungebundene Fahrzeuge zum Binden anbieten — gebundene haben schon eine Karte.
  const gebundene = firma ? await getGebundeneFahrzeugIds(db, firma.id) : new Set<string>()
  const ungebundeneFlotte = flotte.filter((f) => !gebundene.has(f.vehicleId))
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">Flotte</h1>
        <p className="mt-1 text-sm text-claimondo-shield">Ihre Firmenfahrzeuge — Grundlage für die Schadenkarten.</p>
      </div>
      {/* onSpeichereFirma bewusst weggelassen: firma ist admin-provisioniert, kein Setup-Formular. */}
      <FlotteClient firma={firma} flotte={flotte} onFuegeHinzu={fuegeFahrzeugHinzu} onEntferne={entferneFahrzeug} detailBasePath="/flotte/fahrzeug" onScanZb1={scanZb1Karte} onLegeZb1={legeZb1Fahrzeuge} />
      {ungebundeneFlotte.length > 0 || flotte.length === 0 ? (
        <SchadenkarteBindenSection flotte={ungebundeneFlotte} onBinde={bindeKarte} />
      ) : (
        <SectionCard title="Schadenkarten binden">
          <p className="text-body-sm text-claimondo-ondo">Alle Fahrzeuge haben bereits eine Schadenkarte.</p>
        </SectionCard>
      )}
    </div>
  )
}
