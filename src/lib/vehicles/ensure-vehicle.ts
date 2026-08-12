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
// current_owner_id, aktueller_kilometerstand[_at]). Den reicheren Snapshot
// (Farbe/Farbcode/Bauart/Baujahr/Erstzulassung/Ausstattung/Provenance) zieht
// CMM-50.1 per Secondary-UPDATE nach der RPC nach (s. unten) — die RPC selbst
// bleibt unveraendert. Nur gesetzte Felder werden geschrieben (kein NULL-Clobber);
// unparsebare Datums-Texte bleiben NULL (50.3 COALESCE-Fallback auf faelle greift).

import type { SupabaseClient } from '@supabase/supabase-js'

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/** Jahr (int) -> 'YYYY-01-01' fuer vehicles.baujahr_monat (date). Null wenn unplausibel. */
export function yearToDateStr(y?: number | null): string | null {
  if (y == null || !Number.isInteger(y) || y < 1900 || y > 2100) return null
  return `${y}-01-01`
}

/** Freitext-Erstzulassung -> ISO-date-String (best-effort) fuer vehicles.erstzulassung (date).
 *  Unterstuetzt YYYY-MM-DD, YYYY, DD.MM.YYYY, MM/YYYY. Unparsebar/ungueltig -> null. */
export function textToDateStr(t?: string | null): string | null {
  if (!t) return null
  const s = String(t).trim()
  const mk = (y: string | number, mo: string | number, d: string | number): string | null => {
    const Y = Number(y), M = Number(mo), D = Number(d)
    if (!Number.isInteger(Y) || Y < 1900 || Y > 2100 || M < 1 || M > 12 || D < 1 || D > 31) return null
    const iso = `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`
    // Kalender-Gueltigkeit gegenpruefen: 31.02 / 30.02 / 31.04 / Nicht-Schaltjahr-29.02
    // sind format-valid aber Postgres-invalid (ERRCODE 22008). Da der Secondary-UPDATE
    // alle Felder in EINEM .update() batcht, wuerde ein ungueltiges Datum den ganzen
    // Snapshot killen -> hier auf null abbilden (50.3 COALESCE-Fallback auf faelle greift).
    const dt = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() + 1 !== M || dt.getUTCDate() !== D) return null
    return iso
  }
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/))) return mk(m[1], m[2], m[3] ?? 1)
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)))          return mk(m[3], m[2], m[1])
  if ((m = s.match(/^(\d{1,2})[./](\d{4})$/)))                   return mk(m[2], m[1], 1)
  if ((m = s.match(/^(\d{4})$/)))                                return mk(m[1], 1, 1)
  return null
}

/** Snapshot-Felder fuer den vehicles-Upsert. Die ersten 6 gehen in die RPC (Kern-
 *  Identitaet); die CMM-50.1-Felder darunter werden per Secondary-UPDATE gesetzt. */
export type VehicleSnapshot = {
  kennzeichen?: string | null
  hersteller?: string | null
  modell?: string | null
  hsn?: string | null
  tsn?: string | null
  kilometerstand?: number | null
  // CMM-50.1: Snapshot-Restfelder (Secondary-UPDATE, nicht in der RPC)
  kennzeichenBuchstaben?: string | null
  farbe?: string | null            // -> vehicles.farbe_klartext
  farbcode?: string | null         // <- faelle.lackfarbe_code (Entscheidung 3)
  bauart?: string | null           // <- faelle.fahrzeug_typ
  baujahr?: number | null          // <- faelle.fahrzeug_baujahr (int) -> baujahr_monat (date)
  erstzulassung?: string | null    // faelle.erstzulassung (text) -> date (best-effort)
  ausstattung?: unknown            // -> vehicles.fahrzeug_ausstattung (jsonb)
  finQuelle?: string | null        // -> vehicles.fin_quelle
  finExtrahiertAm?: string | null  // -> vehicles.fin_extrahiert_am (timestamptz)
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
  /** Hing der aufrufende Record vorher an einem FIN-losen Stub, wird dieser nach dem FIN-Upsert
   *  absorbiert (alle Referenzen umhaengen + Stub loeschen via merge_stub_vehicle). Contextual,
   *  kein Fuzzy-Matching — der Caller liefert die Stub-id. */
  supersedesVehicleId?: string
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

  // CMM-50.1: Snapshot-Restfelder per Secondary-UPDATE nachziehen (die RPC kennt
  // sie nicht). Nur gesetzte Felder -> kein NULL-Clobber bestehender Daten.
  // Bewusst last-write-wins (FIN-keyed): ein non-null Wert ueberschreibt den
  // bestehenden — inkl. fin_quelle (z.B. ein erneuter zb1_ocr-Lauf nach einer
  // gutachter_manuell-Eingabe), da die juengste FIN-Gewinnung als aktuellste gilt.
  // Non-critical: die Kern-Identitaet steht; ein Fehler hier bricht nichts.
  const update: Record<string, unknown> = {}
  if (s.kennzeichenBuchstaben != null) update.kennzeichen_buchstaben = s.kennzeichenBuchstaben
  if (s.farbe != null) update.farbe_klartext = s.farbe
  if (s.farbcode != null) update.farbcode = s.farbcode
  if (s.bauart != null) update.bauart = s.bauart
  const baujahrMonat = yearToDateStr(s.baujahr)
  if (baujahrMonat) update.baujahr_monat = baujahrMonat
  const erstzulassungDate = textToDateStr(s.erstzulassung)
  if (erstzulassungDate) update.erstzulassung = erstzulassungDate
  if (s.ausstattung != null) update.fahrzeug_ausstattung = s.ausstattung
  if (s.finQuelle != null) update.fin_quelle = s.finQuelle
  if (s.finExtrahiertAm != null) update.fin_extrahiert_am = s.finExtrahiertAm
  if (Object.keys(update).length > 0) {
    const { error: updErr } = await params.db.from('vehicles').update(update).eq('id', vehicleId)
    if (updErr) console.warn('[CMM-50.1] vehicles Snapshot-UPDATE (non-fatal):', updErr.message)
  }

  // Vehicle-Unifikation: hing der aufrufende Record vorher an einem FIN-losen Stub (!= dieser
  // FIN-Row), alle Referenzen auf den Stub umhaengen + Stub loeschen. Non-critical (bricht die
  // FIN-Gewinnung/OCR nie). Nur wenn supersedes wirklich ein Stub ist (fin IS NULL).
  if (params.supersedesVehicleId && params.supersedesVehicleId !== vehicleId) {
    const { data: alt } = await params.db
      .from('vehicles').select('fin').eq('id', params.supersedesVehicleId).maybeSingle()
    if (alt && (alt as { fin: string | null }).fin === null) {
      const { error: mergeErr } = await params.db.rpc('merge_stub_vehicle', {
        p_stub: params.supersedesVehicleId,
        p_target: vehicleId,
      })
      if (mergeErr) console.warn('[vehicle-unifikation] merge_stub_vehicle:', mergeErr.message)
    }
  }

  return { ok: true, vehicleId }
}

/** Mappt einen VehicleSnapshot auf vehicles-Spalten (ALLE Felder, inkl. Kern-Identitaet).
 *  Nur gesetzte (non-null) Felder -> kein NULL-Clobber. Datums-Felder best-effort geparst;
 *  ungueltige werden ausgelassen. Geteilt von createVehicleStub + ensureVehicleForClaim. */
function mapSnapshotToVehicleColumns(s: VehicleSnapshot): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (s.kennzeichen != null) row.kennzeichen_aktuell = s.kennzeichen
  if (s.kennzeichenBuchstaben != null) row.kennzeichen_buchstaben = s.kennzeichenBuchstaben
  if (s.hersteller != null) row.hersteller = s.hersteller
  if (s.modell != null) row.modell_haupttyp = s.modell
  if (s.hsn != null) row.hsn = s.hsn
  if (s.tsn != null) row.tsn = s.tsn
  if (s.kilometerstand != null) row.aktueller_kilometerstand = s.kilometerstand
  if (s.farbe != null) row.farbe_klartext = s.farbe
  if (s.farbcode != null) row.farbcode = s.farbcode
  if (s.bauart != null) row.bauart = s.bauart
  const baujahrMonat = yearToDateStr(s.baujahr)
  if (baujahrMonat) row.baujahr_monat = baujahrMonat
  const erstzulassungDate = textToDateStr(s.erstzulassung)
  if (erstzulassungDate) row.erstzulassung = erstzulassungDate
  if (s.ausstattung != null) row.fahrzeug_ausstattung = s.ausstattung
  if (s.finQuelle != null) row.fin_quelle = s.finQuelle
  if (s.finExtrahiertAm != null) row.fin_extrahiert_am = s.finExtrahiertAm
  return row
}

/**
 * CMM-68: Legt eine FIN-LOSE vehicles-Row an (Stub) und liefert deren UUID.
 *
 * Fuer Eingabepunkte OHNE FIN: das Fahrzeug existiert physisch, die FIN steht aber
 * (noch) nicht fest — Kennzeichen kommt frueh (Unfallmeldung), die FIN erst spaeter
 * via ZB1/Fahrzeugschein (oder nie). `vehicles.fin` ist nullable + unique → mehrere
 * FIN-lose Rows sind erlaubt (NULLs sind in Postgres distinct). Sobald spaeter eine
 * FIN reinkommt, dedupliziert `ensureVehicleFromFin` (ON CONFLICT(fin)) und der Caller
 * haengt claims.vehicle_id auf die FIN-Row um → "ein Fahrzeug, mehrere Claims".
 *
 * Non-critical: wirft nie. Legt KEINE leere Row an (leerer Snapshot -> ok:false).
 * @param db Admin- (service_role) Client — direkter vehicles-Insert (wie der
 *           Secondary-UPDATE in ensureVehicleFromFin) laeuft service-role.
 */
export async function createVehicleStub(params: {
  snapshot?: VehicleSnapshot
  db: SupabaseClient
}): Promise<EnsureVehicleResult> {
  const row = mapSnapshotToVehicleColumns(params.snapshot ?? {})
  if (Object.keys(row).length === 0) {
    return { ok: false, error: 'createVehicleStub: leerer Snapshot (kein Fahrzeugdatum)' }
  }
  row.fin = null
  const { data, error } = await params.db.from('vehicles').insert(row).select('id').single()
  if (error) return { ok: false, error: error.message }
  const vehicleId = typeof (data as { id?: unknown } | null)?.id === 'string' ? (data as { id: string }).id : null
  if (!vehicleId) return { ok: false, error: 'createVehicleStub lieferte keine vehicle-id' }
  return { ok: true, vehicleId }
}

/**
 * CMM-68: Stellt sicher, dass `claims.vehicle_id` auf ein Fahrzeug zeigt — auch OHNE FIN.
 *
 * - Hat der Claim bereits ein Fahrzeug (z.B. via vorheriger FIN-Anlage): nur den
 *   Snapshot non-clobber nachziehen, bestehende vehicle-id zurueck.
 * - Sonst: FIN-losen Stub anlegen (createVehicleStub) + claims.vehicle_id setzen.
 *
 * Der Caller, der spaeter eine FIN gewinnt, ruft ensureVehicleFromFin und setzt
 * claims.vehicle_id auf die FIN-deduplizierte Row um (verwaist den Stub; Cleanup = Folge).
 * Non-critical: wirft nie.
 * @param db Admin- (service_role) Client.
 */
export async function ensureVehicleForClaim(params: {
  claimId: string
  snapshot?: VehicleSnapshot
  db: SupabaseClient
}): Promise<EnsureVehicleResult> {
  const { data: claim, error: claimErr } = await params.db
    .from('claims').select('vehicle_id').eq('id', params.claimId).maybeSingle()
  if (claimErr) return { ok: false, error: claimErr.message }
  const existingVid = (claim?.vehicle_id as string | null) ?? null

  if (existingVid) {
    const snapCols = mapSnapshotToVehicleColumns(params.snapshot ?? {})
    if (Object.keys(snapCols).length > 0) {
      const { error: updErr } = await params.db.from('vehicles').update(snapCols).eq('id', existingVid)
      if (updErr) console.warn('[CMM-68] vehicles Snapshot-Nachzug (non-fatal):', updErr.message)
    }
    return { ok: true, vehicleId: existingVid }
  }

  const created = await createVehicleStub({ snapshot: params.snapshot, db: params.db })
  if (!created.ok) return created
  const { error: linkErr } = await params.db
    .from('claims').update({ vehicle_id: created.vehicleId }).eq('id', params.claimId)
  if (linkErr) return { ok: false, error: linkErr.message }
  return created
}
