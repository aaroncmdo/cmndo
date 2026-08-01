import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma, getFlottenmanagerWhatsapp } from '@/lib/flotte/konto-firma'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import FlotteClient from '@/components/flotte/FlotteClient'
import { SchadenkarteBindenSection } from '@/components/flotte/SchadenkarteBindenSection'
import { WhatsappNummerPrompt } from '@/components/flotte/WhatsappNummerPrompt'
import { SectionCard } from '@/components/shared/SectionCard'
import { getGebundeneFahrzeugIds } from '@/lib/schadenkarte/schadenkarte'
import { fuegeFahrzeugHinzu, entferneFahrzeug, scanZb1Karte, legeZb1Fahrzeuge, setzeMeineWhatsappNummer } from './actions'
import { bindeKarte } from './schadenkarte-actions'

export const dynamic = 'force-dynamic'

export default async function FlottePage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  const flotte = firma ? await getKundeFlotte(db, firma.id) : []

  // Zustandsdoku-Ampel (B): letzter abgeschlossener Scan je Fahrzeug (eine Query, latest-per-vehicle).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const scanAmByVehicleId: Record<string, string | null> = {}
  if (flotte.length > 0) {
    const { data: scans } = await anyDb
      .from('vehicle_scans')
      .select('vehicle_id, erstellt_am')
      .in(
        'vehicle_id',
        flotte.map((f) => f.vehicleId),
      )
      .eq('status', 'abgeschlossen')
      .order('erstellt_am', { ascending: false })
    for (const s of (scans ?? []) as Array<{ vehicle_id: string; erstellt_am: string }>) {
      if (!(s.vehicle_id in scanAmByVehicleId)) scanAmByVehicleId[s.vehicle_id] = s.erstellt_am
    }
  }

  // Nur ungebundene Fahrzeuge zum Binden anbieten — gebundene haben schon eine Karte.
  const gebundene = firma ? await getGebundeneFahrzeugIds(db, firma.id) : new Set<string>()
  const ungebundeneFlotte = flotte.filter((f) => !gebundene.has(f.vehicleId))
  // T2: FM-WhatsApp-Nummer (Schaden-Benachrichtigung) — Erst-Login-Prompt wenn NULL.
  const whatsappNummer = firma ? await getFlottenmanagerWhatsapp(db, user.id) : null

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">Flotte</h1>
        <p className="mt-1 text-sm text-claimondo-shield">Ihre Firmenfahrzeuge — Grundlage für die Netzwerkkarten.</p>
      </div>
      {firma ? <WhatsappNummerPrompt nummer={whatsappNummer} onSpeichern={setzeMeineWhatsappNummer} /> : null}
      {/* onSpeichereFirma bewusst weggelassen: firma ist admin-provisioniert, kein Setup-Formular. */}
      <FlotteClient firma={firma} flotte={flotte} onFuegeHinzu={fuegeFahrzeugHinzu} onEntferne={entferneFahrzeug} detailBasePath="/flotte/fahrzeug" onScanZb1={scanZb1Karte} onLegeZb1={legeZb1Fahrzeuge} scanAmByVehicleId={scanAmByVehicleId} />
      {ungebundeneFlotte.length > 0 || flotte.length === 0 ? (
        <SchadenkarteBindenSection flotte={ungebundeneFlotte} onBinde={bindeKarte} />
      ) : (
        <SectionCard title="Netzwerkkarten binden">
          <p className="text-body-sm text-claimondo-ondo">Alle Fahrzeuge haben bereits eine Netzwerkkarte.</p>
        </SectionCard>
      )}
    </div>
  )
}
