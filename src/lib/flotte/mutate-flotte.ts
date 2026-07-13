// Geteilte Fleet-Mutation (kunde + flottenmanager). Reuse createVehicleStub + N:M-Insert.
// db = Admin/Service-Role (personen/firmen/flotten_fahrzeuge sind deny-all fuer Clients).
import type { SupabaseClient } from '@supabase/supabase-js'
import { createVehicleStub } from '@/lib/vehicles/ensure-vehicle'
import type { FahrzeugForm } from '@/lib/kunde/firma-flotte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

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
  const { error } = await db.from('flotten_fahrzeuge').insert({
    firma_id: firmaId, vehicle_id: veh.vehicleId, added_by_user_id: userId, notiz: form.notiz?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieses Fahrzeug ist bereits in der Flotte.' }
    return { ok: false, error: error.message }
  }
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
