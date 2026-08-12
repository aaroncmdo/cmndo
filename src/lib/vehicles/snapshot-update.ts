// Ops-Test 11.08. (RC-2): Fahrzeugdaten hatten zwei Quellen ohne Rueckweg.
//
// convert-lead-to-claim kopiert die Fahrzeugdaten EINMALIG bei der Konversion nach
// vehicles (SSoT) und bindet den Claim an die vehicle_id. Der Claim liest danach nur
// noch aus vehicles (via v_claim_full). Der Dispatch-Save schreibt aber weiter nach
// leads — und ein vehicles-Update gab es nur in ensure-vehicle/cardentity, also in
// keinem Pfad, den ein Lead-Save ausloest. Folge: eine Kennzeichen-Korrektur nach der
// Konversion erreichte den Claim nie; die Fallakte zeigte weiter das alte Kennzeichen.
//
// Aaron-Entscheid 12.08.: nachziehen (statt die Lead-Felder zu sperren).
//
// Das Mapping ist bewusst als PURE Funktion herausgezogen — es ist die Stelle, an der
// leads-Spaltennamen auf vehicles-Spaltennamen treffen (kennzeichen -> kennzeichen_aktuell,
// modell -> modell_haupttyp, farbe -> farbe_klartext), und genau solche stillen
// Umbenennungen sind ohne Test fehleranfaellig.

import type { SupabaseClient } from '@supabase/supabase-js'
import { yearToDateStr, textToDateStr, type VehicleSnapshot } from './ensure-vehicle'

/**
 * Snapshot -> vehicles-UPDATE-Payload. Nur GESETZTE Felder landen im Ergebnis:
 * ein Teil-Save im Lead darf die uebrigen Fahrzeugdaten nicht mit null ueberschreiben.
 * Unparsbare Datumswerte werden verworfen statt roh geschrieben (Postgres-Reject).
 */
export function snapshotToVehicleUpdate(s: VehicleSnapshot): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  // Kern-Identitaet (bei ensureVehicleFromFin macht das die RPC — beim Nachzug auf
  // eine bestehende Row muessen wir sie selbst setzen).
  if (s.kennzeichen != null) u.kennzeichen_aktuell = s.kennzeichen
  if (s.hersteller != null) u.hersteller = s.hersteller
  if (s.modell != null) u.modell_haupttyp = s.modell
  if (s.hsn != null) u.hsn = s.hsn
  if (s.tsn != null) u.tsn = s.tsn
  if (s.kilometerstand != null) u.aktueller_kilometerstand = s.kilometerstand
  // Restfelder (CMM-50.1-Mapping, identisch zum Secondary-UPDATE in ensure-vehicle).
  if (s.kennzeichenBuchstaben != null) u.kennzeichen_buchstaben = s.kennzeichenBuchstaben
  if (s.farbe != null) u.farbe_klartext = s.farbe
  if (s.farbcode != null) u.farbcode = s.farbcode
  if (s.bauart != null) u.bauart = s.bauart
  const baujahrMonat = yearToDateStr(s.baujahr)
  if (baujahrMonat) u.baujahr_monat = baujahrMonat
  const erstzulassung = textToDateStr(s.erstzulassung)
  if (erstzulassung) u.erstzulassung = erstzulassung
  if (s.ausstattung != null) u.fahrzeug_ausstattung = s.ausstattung
  return u
}

/**
 * Zieht die Fahrzeugdaten eines konvertierten Leads auf die vehicles-Row seines Claims nach.
 *
 * NON-CRITICAL: liefert immer ein Result-Object und wirft nie — ein fehlgeschlagener
 * Nachzug darf den Lead-Save nicht brechen. `skipped` heisst: es gab nichts zu tun
 * (Lead nicht konvertiert, kein Claim, keine vehicle_id oder keine gesetzten Felder).
 */
export async function ziehVehicleNach(params: {
  leadId: string
  snapshot: VehicleSnapshot
  db: SupabaseClient
}): Promise<{ ok: true; vehicleId?: string; skipped?: string } | { ok: false; error: string }> {
  const update = snapshotToVehicleUpdate(params.snapshot)
  if (Object.keys(update).length === 0) return { ok: true, skipped: 'keine Fahrzeugfelder im Save' }

  try {
    // Der Claim ist die Bruecke Lead -> vehicles. Kein Claim = Lead noch nicht
    // konvertiert -> die Konversion nimmt die Lead-Werte ohnehin frisch mit.
    const { data: claim, error: claimErr } = await params.db
      .from('claims')
      .select('id, vehicle_id')
      .eq('lead_id', params.leadId)
      .not('vehicle_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (claimErr) return { ok: false, error: claimErr.message }
    const vehicleId = (claim?.vehicle_id as string | null) ?? null
    if (!vehicleId) return { ok: true, skipped: 'kein konvertierter Claim mit vehicle_id' }

    const { error: updErr } = await params.db.from('vehicles').update(update).eq('id', vehicleId)
    if (updErr) return { ok: false, error: updErr.message }
    return { ok: true, vehicleId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
