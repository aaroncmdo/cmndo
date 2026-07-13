// Read-only Claim-Detail fuer den flottenmanager — streng firma- UND fahrzeug-gated.
// Security: kein RLS (Admin/Service-Role-Client), daher zwei Gates:
//   (1) Fahrzeug muss zur Firma gehoeren (flotten_fahrzeuge),
//   (2) der Claim muss GENAU zu diesem Fahrzeug gehoeren (claim.vehicle_id === vehicleId).
// Gibt null zurueck sobald ein Gate nicht passt (kein Cross-Firma/Cross-Fahrzeug-Leak).
// Slice 1: nur bestehende Claim-Kernfelder (kein hergang_gegner_text/unfallberichte — Slice 2).

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type FlottenClaimDetail = {
  claimId: string
  claimNummer: string | null
  status: string | null
  schadentag: string | null
  schadensHoeheNetto: number | null
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
}

export async function getFlottenClaimDetail(
  db: AnyDb,
  firmaId: string,
  vehicleId: string,
  claimId: string,
): Promise<FlottenClaimDetail | null> {
  // Gate 1: Fahrzeug gehoert zur Firma?
  const { data: ownerRow } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
  if (!ownerRow) return null

  // Gate 2: Claim gehoert GENAU zu diesem Fahrzeug?
  const { data: claim } = await db
    .from('claims')
    .select('id,claim_nummer,status,schadentag,schadens_hoehe_netto,vehicle_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim || (claim as Record<string, unknown>).vehicle_id !== vehicleId) return null

  const { data: veh } = await db
    .from('vehicles')
    .select('kennzeichen_aktuell,hersteller,modell_haupttyp')
    .eq('id', vehicleId)
    .maybeSingle()

  const c = claim as Record<string, unknown>
  const v = (veh ?? {}) as Record<string, unknown>
  return {
    claimId: c.id as string,
    claimNummer: (c.claim_nummer as string | null) ?? null,
    status: (c.status as string | null) ?? null,
    schadentag: (c.schadentag as string | null) ?? null,
    schadensHoeheNetto: (c.schadens_hoehe_netto as number | null) ?? null,
    kennzeichen: (v.kennzeichen_aktuell as string | null) ?? null,
    hersteller: (v.hersteller as string | null) ?? null,
    modell: (v.modell_haupttyp as string | null) ?? null,
  }
}
