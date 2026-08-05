// Geteilte Fleet-Mutation (kunde + flottenmanager). Reuse createVehicleStub + N:M-Insert.
// db = Admin/Service-Role (personen/firmen/flotten_fahrzeuge sind deny-all fuer Clients).
import type { SupabaseClient } from '@supabase/supabase-js'
import { createVehicleStub, ensureVehicleFromFin, VIN_REGEX } from '@/lib/vehicles/ensure-vehicle'
import { normalizeName } from '@/lib/entities/normalize'
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

/** Fahrzeug anlegen/finden + N:M-Zuordnung zur firma. Mit gültiger FIN dedupliziert
 *  ensureVehicleFromFin (kanonische Row), sonst FIN-loser Stub. Muster wie zb1-batch-anlage. */
export async function addFahrzeugToFlotte(
  db: AnyDb, firmaId: string, form: FahrzeugForm, userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const kennzeichen = (form.kennzeichen ?? '').trim()
  if (!kennzeichen) return { ok: false, error: 'Bitte ein Kennzeichen angeben.' }

  const fin = form.fin?.trim().toUpperCase() || null
  const hatFin = !!fin && VIN_REGEX.test(fin)
  const snapshot = {
    kennzeichen,
    hersteller: form.hersteller?.trim() || null,
    modell: form.modell?.trim() || null,
    hsn: form.hsn?.trim() || null,
    tsn: form.tsn?.trim() || null,
  }
  const veh = hatFin
    ? await ensureVehicleFromFin({ fin: fin as string, snapshot, db })
    : await createVehicleStub({ snapshot, db })
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

/** Editierbare Stammdaten eines Flotten-Fahrzeugs (Detail-Ansicht Flottenmanager).
 *  Text-Rohwerte aus dem Formular — Parsing/Validierung passiert in updateFahrzeugStammdaten. */
export type FahrzeugStammdatenForm = {
  kennzeichen: string
  hersteller?: string
  modell?: string
  fin?: string
  hsn?: string
  tsn?: string
  farbe?: string
  kilometerstand?: string
  notiz?: string
}

/** Trim -> non-empty-String | null (leeres Feld loescht den Wert). */
function leerZuNull(v?: string): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/**
 * Stammdaten eines Flotten-Fahrzeugs bearbeiten: Fahrzeug-Felder auf `vehicles`
 * (geteilte, FIN-deduplizierte SSoT — wie addFahrzeugToFlotte sie schon schreibt)
 * + die flotten-spezifische `notiz` auf der N:M-Verknuepfung `flotten_fahrzeuge`.
 *
 * Ownership-Gate: das Fahrzeug muss zur Firma gehoeren (flotten_fahrzeuge firma_id+vehicle_id) —
 * sonst duerfte ein FM fremde vehicles-Rows editieren. db = Admin/Service-Role (deny-all Clients).
 *
 * Semantik = Voll-Ersetzung der editierbaren Felder: das Formular ist mit den aktuellen Werten
 * vorbelegt, ein unberuehrtes Feld bleibt also erhalten; ein bewusst geleertes Feld wird NULL.
 * Nur die hier gelisteten Spalten werden angefasst — angereicherte DAT-/Cardentity-Felder
 * (Leistung, Masse, …) bleiben unberuehrt.
 */
export async function updateFahrzeugStammdaten(
  db: AnyDb,
  p: { firmaId: string; vehicleId: string; form: FahrzeugStammdatenForm },
): Promise<{ ok: boolean; error?: string }> {
  const kennzeichen = (p.form.kennzeichen ?? '').trim()
  if (!kennzeichen) return { ok: false, error: 'Bitte ein Kennzeichen angeben.' }

  // Ownership: Fahrzeug muss zur Firma gehoeren (gleiches Gate wie bindeSchadenkarteAnFahrzeug).
  const { data: owner } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', p.firmaId)
    .eq('vehicle_id', p.vehicleId)
    .maybeSingle()
  if (!owner) return { ok: false, error: 'Fahrzeug gehört nicht zu Ihrer Flotte.' }

  // FIN optional; wenn gesetzt, Format wie ensureVehicleFromFin pruefen.
  const fin = p.form.fin?.trim().toUpperCase() || ''
  if (fin && !VIN_REGEX.test(fin)) {
    return { ok: false, error: 'Die FIN muss 17 Zeichen haben (ohne die Buchstaben I, O, Q).' }
  }

  // Kilometerstand optional; Punkte/Leerzeichen als Tausender-Trenner erlaubt ("12.000").
  const kmRaw = (p.form.kilometerstand ?? '').trim()
  let kilometerstand: number | null = null
  if (kmRaw) {
    const parsed = Number(kmRaw.replace(/[.\s]/g, ''))
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'Der Kilometerstand muss eine ganze Zahl sein.' }
    }
    kilometerstand = parsed
  }

  const vehUpdate: Record<string, unknown> = {
    kennzeichen_aktuell: kennzeichen,
    // kennzeichen_normalized ist der (schwache) Matching-Key — bit-identisch zu
    // ensureVehicleFromKennzeichen halten (kein Trigger pflegt ihn).
    kennzeichen_normalized: normalizeName(kennzeichen),
    hersteller: leerZuNull(p.form.hersteller),
    modell_haupttyp: leerZuNull(p.form.modell),
    fin: fin || null,
    hsn: leerZuNull(p.form.hsn),
    tsn: leerZuNull(p.form.tsn),
    farbe_klartext: leerZuNull(p.form.farbe),
    aktueller_kilometerstand: kilometerstand,
  }
  if (kilometerstand != null) vehUpdate.aktueller_kilometerstand_at = new Date().toISOString()

  const { error: vehErr } = await db.from('vehicles').update(vehUpdate).eq('id', p.vehicleId)
  if (vehErr) {
    // 23505 = UNIQUE(fin): die eingegebene FIN gehoert schon zu einem anderen Fahrzeug.
    if ((vehErr as { code?: string }).code === '23505') {
      return { ok: false, error: 'Diese FIN ist bereits einem anderen Fahrzeug zugeordnet.' }
    }
    return { ok: false, error: vehErr.message }
  }

  // Notiz liegt auf der N:M-Verknuepfung (flotten-spezifisch), nicht auf vehicles.
  const { error: notizErr } = await db
    .from('flotten_fahrzeuge')
    .update({ notiz: leerZuNull(p.form.notiz) })
    .eq('firma_id', p.firmaId)
    .eq('vehicle_id', p.vehicleId)
  if (notizErr) return { ok: false, error: notizErr.message }

  return { ok: true }
}
