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

  // C5 (Doktrin §5, 14.08.): EIN Read statt zwei. Vorher holte ein Vorab-Select auf der
  // Basistabelle `claims` nur `id, vehicle_id`, um die IDs anschliessend per `.in('id', …)`
  // an `v_claim_full` weiterzureichen — die View traegt `vehicle_id` aber selbst, der
  // Umweg war also ein reiner Zusatz-Roundtrip.
  const { data: faelle } = await admin
    .from('v_claim_full')
    .select('id, vehicle_id, fall_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claim_nummer')
    .in('vehicle_id', vehicleIds)

  const vehicleByClaim: Record<string, string> = {}
  for (const f of faelle ?? []) vehicleByClaim[f.id as string] = f.vehicle_id as string
  if ((faelle ?? []).length === 0) return { termine: [], fallMap: {}, vehicleByClaim: {} }

  // claimIds kamen frueher aus dem Vorab-Select auf `claims`; die View traegt dieselben
  // Claim-IDs in `id` (vcf.id == claims.id) — identische Menge, nur ohne Extra-Roundtrip.
  const claimIds = (faelle ?? []).map((f) => f.id as string).filter(Boolean)
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
