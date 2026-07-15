// Batch-Anlage nach dem ZB1-Sammel-Review (Task 3 der ZB1-Batch-Spec). Iteriert ueber
// die vom Nutzer bestaetigten/editierten Zeilen und legt pro Zeile EIN Fahrzeug an.
// Bewusst NICHT atomar: ein Fehler in Zeile N stoppt Zeile N+1..M nicht -- der Nutzer
// scannt ggf. 10 ZB1s auf einmal, und ein kaputter Datensatz soll die anderen 9 nicht
// blockieren.
//
// Task 6: `fahrzeugklasse` wird nach der Anlage best-effort auf vehicles nachgezogen
// (der Ensure-/Stub-Snapshot kennt das Feld nicht, aber der Werkstatt-Matching-Filter
// braucht es). Das ZB1-BILD wird bewusst NICHT abgelegt: fall_dokumente.claim_id ist
// NOT NULL, ein Flottenfahrzeug bei der Anlage hat aber keinen Claim -- und
// vehicles.zb1_dokument_id (FK -> fall_dokumente) hat 0 Reader. Eine claimlose
// Bild-Ablage waere ein eigenes Slice (Storage-Bucket + DDL), kein Detail hier.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureVehicleFromFin, createVehicleStub } from '@/lib/vehicles/ensure-vehicle'
import { bindeVehicleAnFlotte } from './mutate-flotte'
import { felderToSnapshot, type EditierbareFahrzeugFelder } from './zb1-vehicle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type BatchAnlageZeile = { felder: EditierbareFahrzeugFelder; bereitsInFlotte: boolean }
export type BatchAnlageErgebnis = {
  zeileIndex: number
  kennzeichen: string | null
  status: 'angelegt' | 'aktualisiert' | 'stub' | 'fehler'
  error?: string
}

const FIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/**
 * Zieht `fahrzeugklasse` best-effort auf das Vehicle nach. Der Ensure-/Stub-Snapshot
 * (VehicleSnapshot) kennt das Feld nicht, der Werkstatt-Matching-Filter braucht es aber.
 * Bewusst nicht-kritisch: ein Fehler hier bricht die Zeilen-Anlage NICHT.
 */
async function persistiereFahrzeugklasse(
  db: AnyDb,
  vehicleId: string,
  fahrzeugklasse: string | null,
): Promise<void> {
  if (!fahrzeugklasse) return
  try {
    const { error } = await db.from('vehicles').update({ fahrzeugklasse }).eq('id', vehicleId)
    if (error) console.error('[zb1-batch] fahrzeugklasse-Persistenz fehlgeschlagen:', error.message)
  } catch (err) {
    console.error('[zb1-batch] fahrzeugklasse-Persistenz Exception:', err)
  }
}

/** Batch-Anlage, NICHT atomar: jede Zeile wird einzeln versucht, ein Fehler stoppt die anderen nicht. */
export async function legeFlottenFahrzeugeAn(
  db: AnyDb,
  zeilen: BatchAnlageZeile[],
  firmaId: string,
  userId: string,
): Promise<BatchAnlageErgebnis[]> {
  const out: BatchAnlageErgebnis[] = []
  for (let i = 0; i < zeilen.length; i++) {
    const { felder, bereitsInFlotte } = zeilen[i]
    const kennzeichen = felder.kennzeichen
    try {
      const fin = felder.fin?.trim().toUpperCase() || null
      const hatFin = !!fin && FIN_REGEX.test(fin)

      if (hatFin) {
        const veh = await ensureVehicleFromFin({ fin, snapshot: felderToSnapshot(felder), db })
        if (!veh.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: veh.error }); continue }
        await persistiereFahrzeugklasse(db, veh.vehicleId, felder.fahrzeugklasse)
        if (bereitsInFlotte) { out.push({ zeileIndex: i, kennzeichen, status: 'aktualisiert' }); continue }
        const bind = await bindeVehicleAnFlotte(db, { firmaId, vehicleId: veh.vehicleId, userId })
        if (bind.bereitsVorhanden) { out.push({ zeileIndex: i, kennzeichen, status: 'aktualisiert' }); continue }
        if (!bind.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: bind.error }); continue }
        out.push({ zeileIndex: i, kennzeichen, status: 'angelegt' })
      } else {
        // Kein/ungueltiges FIN -> Stub (kein FIN-Dedup, aber fahrzeugklasse wird nachgezogen).
        const veh = await createVehicleStub({ snapshot: felderToSnapshot(felder), db })
        if (!veh.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: veh.error }); continue }
        await persistiereFahrzeugklasse(db, veh.vehicleId, felder.fahrzeugklasse)
        const bind = await bindeVehicleAnFlotte(db, { firmaId, vehicleId: veh.vehicleId, userId })
        if (bind.bereitsVorhanden) { out.push({ zeileIndex: i, kennzeichen, status: 'aktualisiert' }); continue }
        if (!bind.ok) { out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: bind.error }); continue }
        out.push({ zeileIndex: i, kennzeichen, status: 'stub' })
      }
    } catch (err) {
      out.push({ zeileIndex: i, kennzeichen, status: 'fehler', error: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }
  return out
}
