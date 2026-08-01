// Vehicle-Owner-Setter (P6 / K8): bindet das Fahrzeug eines Falls an den Kunden-Account.
// Aufgerufen aus finalizeKundeSetup (Account-Anlage nach SA) — der Moment, in dem aus dem
// anonymen Lead-Fahrzeug ein "mein Auto" wird. IS-NULL-Guard: ein bereits gesetzter Owner
// (z.B. Flotten-/frueherer Kunde) wird NIE ueberschrieben.

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export async function setVehicleOwnerFuerFall(
  db: AnyDb,
  fallId: string,
  userId: string,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  // Fahrzeug des Falls ueber die kanonische Bridge aufloesen (CMM-49: claims traegt
  // KEIN fall_id — v_claim_full ist die faelle-Drop-sichere Bruecke fall_id -> vehicle_id).
  const { data: claimRows, error: claimErr } = await db
    .from('v_claim_full')
    .select('vehicle_id')
    .eq('fall_id', fallId)
    .not('vehicle_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (claimErr) return { ok: false, updated: 0, error: claimErr.message }

  const vehicleId = ((claimRows?.[0] as { vehicle_id?: string | null } | undefined)?.vehicle_id) ?? null
  if (!vehicleId) return { ok: true, updated: 0 }

  const { error, count } = await db
    .from('vehicles')
    .update({ current_owner_id: userId }, { count: 'exact' })
    .eq('id', vehicleId)
    .is('current_owner_id', null)

  if (error) return { ok: false, updated: 0, error: error.message }
  return { ok: true, updated: count ?? 0 }
}
