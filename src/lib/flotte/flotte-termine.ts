// Fleet-Fan-out: firma -> Flotten-Fahrzeuge -> claims -> v_claim_full -> getKundeTermine.
// Reiner Admin/Service-Role-Read; Ownership-Gate = Firma-Zugehoerigkeit (getKundeFlotte).
// Pure loader — kein throw, kein revalidatePath.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import { getKundeTermine, type KundeTerminEntry } from '@/lib/claims/kunde-termine'
import type { FallInfo } from '@/components/termine/TermineRow'

export async function getFlotteTermine(
  admin: SupabaseClient,
  firmaId: string,
): Promise<{ termine: KundeTerminEntry[]; fallMap: Record<string, FallInfo>; vehicleByClaim: Record<string, string> }> {
  const flotte = await getKundeFlotte(admin, firmaId)
  const vehicleIds = flotte.map((v) => v.vehicleId).filter(Boolean)
  if (vehicleIds.length === 0) return { termine: [], fallMap: {}, vehicleByClaim: {} }

  // claims des Fuhrparks (via claims.vehicle_id — Muster wie getFahrzeugSchaeden).
  const { data: claims } = await admin.from('claims').select('id, vehicle_id').in('vehicle_id', vehicleIds)
  const claimIds = (claims ?? []).map((c) => c.id as string)
  const vehicleByClaim: Record<string, string> = {}
  for (const c of claims ?? []) vehicleByClaim[c.id as string] = c.vehicle_id as string
  if (claimIds.length === 0) return { termine: [], fallMap: {}, vehicleByClaim: {} }

  // fall_id + Anzeige-Meta NUR aus v_claim_full (claim-anchored SSoT).
  const { data: faelle } = await admin
    .from('v_claim_full')
    .select('id, fall_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claim_nummer')
    .in('id', claimIds)

  const fallIds = (faelle ?? []).map((f) => f.fall_id as string).filter(Boolean)
  const fallMap: Record<string, FallInfo> = {}
  for (const f of faelle ?? []) {
    const info: FallInfo = {
      id: f.fall_id as string,
      claimId: f.id as string,
      claim_nummer: (f.claim_nummer as string | null) ?? null,
      fahrzeug:
        [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') ||
        (f.kennzeichen as string | null) ||
        '—',
    }
    if (f.fall_id) fallMap[f.fall_id as string] = info
    fallMap[f.id as string] = info
  }

  const termine = await getKundeTermine(admin, { fallIds, claimIds })
  return { termine, fallMap, vehicleByClaim }
}
