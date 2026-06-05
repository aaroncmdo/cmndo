// CMM Entity (Spec §4): Schaden/Vorschaden = fahrzeug-gebundene Damage-Entitaet auf
// vehicle_vorschaeden. recordVehicleDamage = find-or-create einer Damage-Row;
// markClaimDamagesAsVorschaden = State-Uebergang Schaden->Vorschaden beim Claim-Close.
// Non-throwing Result-Object; db untyped (wie ensure-person.ts) — DB-Types hinken den
// frischen Spalten hinterher (AGENTS.md Regel 2 Schritt 6).
import type { SupabaseClient } from '@supabase/supabase-js'

export type VehicleDamageInput = {
  vehicleId: string
  claimId?: string | null
  state?: 'aktuell' | 'vorschaden'
  art?: string | null
  schwere?: string | null
  schadenDatum?: string | null
  beschreibung?: string | null
  quelle?: string | null
  rohdaten?: unknown
}
export type RecordVehicleDamageResult =
  | { ok: true; damageId: string; created: boolean }
  | { ok: false; error: string }

/**
 * find-or-create eine Damage-Row. Idempotent NUR fuer den aktuellen Schaden pro
 * (vehicle_id, claim_id, state='aktuell') — damit eine Konversion nicht doppelt
 * denselben Claim-Schaden anlegt. Historie/Vorschaeden (claim-los) sind additiv.
 */
export async function recordVehicleDamage(params: {
  db: SupabaseClient
  damage: VehicleDamageInput
}): Promise<RecordVehicleDamageResult> {
  const { db } = params
  const d = params.damage
  if (!d.vehicleId) return { ok: false, error: 'vehicleId leer' }
  const state: 'aktuell' | 'vorschaden' = d.state ?? (d.claimId ? 'aktuell' : 'vorschaden')
  try {
    if (d.claimId && state === 'aktuell') {
      const { data: existing, error } = await db
        .from('vehicle_vorschaeden').select('id')
        .eq('vehicle_id', d.vehicleId).eq('claim_id', d.claimId).eq('state', 'aktuell')
        .limit(1).maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (existing?.id) return { ok: true, damageId: existing.id as string, created: false }
    }
    const { data: created, error: insErr } = await db.from('vehicle_vorschaeden').insert({
      vehicle_id: d.vehicleId,
      claim_id: d.claimId ?? null,
      state,
      art: d.art ?? null,
      schwere: d.schwere ?? null,
      schaden_datum: d.schadenDatum ?? null,
      beschreibung: d.beschreibung ?? null,
      quelle: d.quelle ?? 'claim',
      rohdaten: (d.rohdaten ?? null) as never,
    }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'vehicle_vorschaeden-insert lieferte keine id' }
    return { ok: true, damageId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}

/**
 * Schaden->Vorschaden beim Claim-Close: alle 'aktuell'-Damages dieses Claims auf
 * 'vorschaden' setzen. Damit erscheinen sie fuer kuenftige Claims am selben Fahrzeug
 * als Vorschaden. Non-throwing.
 */
export async function markClaimDamagesAsVorschaden(params: {
  db: SupabaseClient
  claimId: string
}): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const { db } = params
  if (!params.claimId) return { ok: false, error: 'claimId leer' }
  try {
    const { data, error } = await db
      .from('vehicle_vorschaeden').update({ state: 'vorschaden' })
      .eq('claim_id', params.claimId).eq('state', 'aktuell').select('id')
    if (error) return { ok: false, error: error.message }
    return { ok: true, updated: data?.length ?? 0 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
