// Geteilte Fleet-Mutation (kunde + flottenmanager). Reuse createVehicleStub + N:M-Insert.
// db = Admin/Service-Role (personen/firmen/flotten_fahrzeuge sind deny-all fuer Clients).
import type { SupabaseClient } from '@supabase/supabase-js'
import { createVehicleStub } from '@/lib/vehicles/ensure-vehicle'
import type { FahrzeugForm } from '@/lib/kunde/firma-flotte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

/** Reiner flotten_fahrzeuge-N:M-Insert. 23505 (UNIQUE firma_id,vehicle_id) = "schon gebunden",
 *  NICHT als Fehler, sondern als bereitsVorhanden. */
export async function bindeVehicleAnFlotte(
  db: AnyDb,
  p: { firmaId: string; vehicleId: string; userId: string; notiz?: string | null },
): Promise<{ ok: boolean; bereitsVorhanden?: boolean; error?: string }> {
  const { error } = await db.from('flotten_fahrzeuge').insert({
    firma_id: p.firmaId, vehicle_id: p.vehicleId, added_by_user_id: p.userId, notiz: p.notiz?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, bereitsVorhanden: true }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/** Stub-Fahrzeug anlegen + N:M-Zuordnung zur firma. */
export async function addFahrzeugToFlotte(
  db: AnyDb, firmaId: string, form: FahrzeugForm, userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const kennzeichen = (form.kennzeichen ?? '').trim()
  if (!kennzeichen) return { ok: false, error: 'Bitte ein Kennzeichen angeben.' }
  const veh = await createVehicleStub({
    snapshot: { kennzeichen, hersteller: form.hersteller?.trim() || null, modell: form.modell?.trim() || null },
    db,
  })
  if (!veh.ok) return { ok: false, error: veh.error }
  const bind = await bindeVehicleAnFlotte(db, { firmaId, vehicleId: veh.vehicleId, userId, notiz: form.notiz })
  if (!bind.ok) return { ok: false, error: bind.bereitsVorhanden ? 'Dieses Fahrzeug ist bereits in der Flotte.' : bind.error }
  return { ok: true }
}

/** Flotten-Zuordnung entfernen (nur Eintraege der eigenen firma). */
export async function removeFahrzeugFromFlotte(
  db: AnyDb, flottenId: string, firmaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.from('flotten_fahrzeuge').delete().eq('id', flottenId).eq('firma_id', firmaId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
