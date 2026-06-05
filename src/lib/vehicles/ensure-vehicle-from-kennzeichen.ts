// CMM Entity Resolver-Foundation: find-or-create Fahrzeug OHNE FIN (Gegner-Auto, oft nur
// Kennzeichen). PROVISORISCH: kennzeichen_normalized ist ein schwacher Key (KZ wird neu
// vergeben) -> mergebar auf die FIN-Zeile, sobald die FIN bekannt wird (spaeterer Merge,
// nicht hier). Ergaenzt ensureVehicleFromFin (FIN = kanonisch). Non-throwing, db untyped.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from '@/lib/entities/normalize'

export type EnsureVehicleFromKennzeichenResult =
  | { ok: true; vehicleId: string; created: boolean }
  | { ok: false; error: string }

export async function ensureVehicleFromKennzeichen(params: {
  db: SupabaseClient
  kennzeichen: string | null | undefined
  klartext?: string | null
}): Promise<EnsureVehicleFromKennzeichenResult> {
  const { db } = params
  const kz = params.kennzeichen?.trim() ?? ''
  if (!kz) return { ok: false, error: 'kennzeichen leer' }
  const normalized = normalizeName(kz)
  if (!normalized) return { ok: false, error: 'kennzeichen normalized leer' }
  try {
    const { data: existing, error: selErr } = await db
      .from('vehicles').select('id').eq('kennzeichen_normalized', normalized).limit(1).maybeSingle()
    if (selErr) return { ok: false, error: selErr.message }
    if (existing?.id) return { ok: true, vehicleId: existing.id as string, created: false }

    const { data: created, error: insErr } = await db.from('vehicles').insert({
      kennzeichen_aktuell: kz,
      kennzeichen_normalized: normalized,
      // vehicles.hersteller ist NOT NULL ohne Default (Pre-Execution-Check 05.06.); beim
      // FIN-losen, kennzeichen-only Insert ist der Hersteller unbekannt -> Bestands-Sentinel
      // 'Unbekannt' (Konvention der einen vorhandenen Row). Wird beim FIN-Merge ueberschrieben.
      hersteller: 'Unbekannt',
      bauart: params.klartext ?? null,
      fin_quelle: 'kennzeichen_provisorisch',
    }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'vehicles-insert lieferte keine id' }
    return { ok: true, vehicleId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
