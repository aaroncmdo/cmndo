// CMM-50.0: Vehicle-Write-Path-Helper.
//
// Bisher (Befund CMM-50): die `vehicles`-SSoT war LEER, weil der Write-Path nie
// verdrahtet wurde — `upsert_vehicle_by_fin` (AAR-773) hatte 0 Caller. Dieser
// Helper ist der zentrale Einstiegspunkt: alle FIN-Gewinnungs-Punkte (ZB1-OCR,
// Cardentity-Enrich, manuelle FIN-Eingabe, Lead-Konversion) rufen ihn, statt die
// RPC 4x inline zu duplizieren.
//
// Verhaltens-additiv: legt eine vehicles-Row an (ON CONFLICT(fin) DO UPDATE) und
// gibt deren UUID zurueck. Die Caller setzen damit `leads.vehicle_id` (Lead-
// Kontext) bzw. `claims.vehicle_id` (Fall-Kontext). Non-critical: Fehler werden
// als Result-Object zurueckgegeben, NIE geworfen — ein Vehicle-Upsert darf eine
// Konversion / einen OCR-Lauf nicht brechen.
//
// vehicle_id-Konvention (so wie convert-lead-to-claim es bereits handhabt):
//   - Geschaedigten-Fahrzeug  -> claims.vehicle_id (1:1) + claim_parties(geschaedigter).vehicle_id
//                                + claim_vehicle_involvements(rolle='geschaedigter') (1:N)
//   - Gegner/weitere          -> claim_parties(rolle).vehicle_id + claim_vehicle_involvements(other rolle)
//   Caller, die das Geschaedigten-Fahrzeug schreiben, halten alle drei Surfaces synchron.
//
// owner_id (Halterwechsel-Tracking via vehicle_ownership_history) ist in 50.0
// bewusst NICHT verdrahtet: zum ZB1-/Lead-Zeitpunkt existiert oft noch kein
// Account, und ein falscher Owner erzeugt Ghost-Rows in vehicle_ownership_history.
// Der Parameter ist vorhanden (50.1-Refinement), wird in 50.0 aber von keinem
// Call-Site gesetzt.
//
// RPC-Einschraenkung (Spec §2): upsert_vehicle_by_fin schreibt nur 8 Felder
// (fin, kennzeichen_aktuell, hsn, tsn, hersteller, modell_haupttyp,
// current_owner_id, aktueller_kilometerstand[_at]). Der reichere Snapshot
// (Farbe/Bauart/Baujahr/Erstzulassung) folgt in 50.1 (RPC-Erweiterung oder
// Secondary-UPDATE) — 50.0 setzt nur die FIN-Kern-Identitaet.

import type { SupabaseClient } from '@supabase/supabase-js'

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/** Snapshot-Felder, die `upsert_vehicle_by_fin` heute entgegennimmt (Kern-Identitaet). */
export type VehicleSnapshot = {
  kennzeichen?: string | null
  hersteller?: string | null
  modell?: string | null
  hsn?: string | null
  tsn?: string | null
  kilometerstand?: number | null
}

export type EnsureVehicleResult =
  | { ok: true; vehicleId: string }
  | { ok: false; error: string }

/**
 * Legt eine vehicles-Row aus einer FIN an (idempotent) und liefert deren UUID.
 * Non-critical: wirft nie, sondern liefert `{ ok: false, error }`.
 *
 * @param db  Admin- (service_role) Supabase-Client — die RPC ist SECURITY DEFINER,
 *            der Caller hat zuvor autorisiert.
 */
export async function ensureVehicleFromFin(params: {
  fin: string | null | undefined
  snapshot?: VehicleSnapshot
  /** 50.1-Refinement; in 50.0 von keinem Call-Site gesetzt (s. Datei-Kommentar). */
  ownerId?: string | null
  db: SupabaseClient
}): Promise<EnsureVehicleResult> {
  const fin = params.fin?.trim().toUpperCase() ?? ''
  // Defensiv vorvalidieren — sonst wirft die RPC eine RAISE-Exception (ERRCODE 22023),
  // die als roher Fehler durchschlaegt. Format == das der RPC/saveFinVin/enrich.
  if (!VIN_REGEX.test(fin)) {
    return { ok: false, error: 'FIN-Format ungueltig (17 Zeichen, ohne I/O/Q)' }
  }

  const s = params.snapshot ?? {}
  const args: Record<string, unknown> = {
    p_fin: fin,
    p_kennzeichen: s.kennzeichen ?? null,
    p_hsn: s.hsn ?? null,
    p_tsn: s.tsn ?? null,
    p_hersteller: s.hersteller ?? null,
    p_modell: s.modell ?? null,
    p_kilometerstand: s.kilometerstand ?? null,
  }
  // p_owner_id / p_quelle nur setzen, wenn ein Owner uebergeben wird — sonst
  // SQL-Defaults (NULL / 'manual'), kein vehicle_ownership_history-Insert.
  if (params.ownerId) {
    args.p_owner_id = params.ownerId
    args.p_quelle = 'write_path'
  }

  const { data, error } = await params.db.rpc('upsert_vehicle_by_fin', args)
  if (error) return { ok: false, error: error.message }

  // RETURNS UUID (Skalar) -> supabase-js liefert `data` als uuid-String.
  const vehicleId = typeof data === 'string' ? data : null
  if (!vehicleId) {
    return { ok: false, error: 'upsert_vehicle_by_fin lieferte keine vehicle-id' }
  }
  return { ok: true, vehicleId }
}
