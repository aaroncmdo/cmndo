// AAR-651: Zentrale Fall-Loader-Lib — Single Source of Truth pro Rolle.
//
// Hintergrund: Bis hierhin hatte jede Fall-Detail-Route (Admin/KB/Kanzlei,
// SV, Kunde) eigene Supabase-Queries mit leicht abweichenden Selects.
// Beispiel: AAR-626 hat den Admin-Lead-Select gefixt, der SV-Lead-Select
// blieb kaputt (→ PR #100). Jeder neue Schema-Change an 4+ Stellen nachziehen.
//
// Diese Lib kapselt die Queries pro Rolle:
//   - getFallForAdmin()   → alle Spalten, RLS macht den Role-Gate
//   - getFallForSv()      → all + explizite sv_id-Filter (Defense-in-Depth)
//   - getFallForKunde()   → kunde_id-Filter + explizite Spalten-Liste
//     (Kunde sieht nicht alle internen Admin-Felder)
//   - getFallForMakler()  → lebt weiter in src/lib/makler/queries.ts
//     (andere Shape wegen Consent-Scope + Minimal-View)
//
// Die Lib nutzt durchgängig `v_faelle_mit_aktuellem_termin` als View —
// diese joint den „aktuellen gutachter_termin" als Flat-Felder (sv_termin,
// gutachter_termin_status, etc.) an den Fall-Row.

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Select-Konstanten ─────────────────────────────────────────────────────

/**
 * Vollständiger SELECT — Admin/KB/Kanzlei + SV. Alle Spalten + View-Computed.
 * Äquivalent zu `.select('*')`, nur expliziter für Review-Lesbarkeit.
 */
export const FALL_SELECT_FULL = '*'

/**
 * Kunden-Subset (52 Felder) — nur was der Kunde im Portal sehen darf.
 *
 * Bewusst restriktiv: SV-Interne (dispatch_gruende, ablehnungs-Tracking,
 * interne Notizen), Admin-Briefing, LexDrive-OCR-Rohdaten etc. bleiben außen
 * vor. `kunde_id` + `lead_id` + `sv_id` + `kundenbetreuer_id` drin damit
 * der Client die FKs für Ownership-Checks nutzen kann.
 */
export const FALL_SELECT_KUNDE =
  'id,claim_nummer,status,szenario,aktuelle_phase,' +
  'kunde_id,lead_id,sv_id,kundenbetreuer_id,' +
  'schadens_beschreibung,schadens_datum,schadens_hoehe_netto,' +
  'schadens_adresse,schadens_plz,schadens_ort,' +
  'kennzeichen,fahrzeug_hersteller,fahrzeug_modell,fahrzeug_baujahr,' +
  'unfallort,besichtigungsort_adresse,' +
  // AAR-711: gutachter_termin_bestaetigt_am existiert nicht auf faelle —
  // semantisch identisch mit dem View-Computed final_verbindlich_ab.
  'sv_termin,gutachter_termin_status,gutachter_termin_bestaetigt_am:aktueller_termin_final_verbindlich_ab,' +
  'gutachten_eingegangen_am,' +
  'onboarding_complete,sa_unterschrieben,vollmacht_signiert_am,vollmacht_status,' +
  'anschlussschreiben_am,regulierung_am,' +
  'vs_ablehnungsgrund,vs_kuerzung_grund,storno_grund,' +
  'abgeschlossen_am,google_review_gesendet,' +
  'gegner_versicherung,kanzlei_ansprechpartner_name,' +
  // AAR-711: mandatstyp lebt auf leads, nicht auf faelle — Caller lädt bei Bedarf nach.
  'service_typ,polizei_vor_ort,' +
  'bankdaten_hinterlegt_am,zahlungsweg,totalschaden,zahlung_eingegangen_am,' +
  'nachbesichtigung_status,nachbesichtigung_termin_datum,nachbesichtigung_angefordert_am,' +
  'aktueller_termin_id,aktueller_termin_start,aktueller_termin_end,' +
  'aktueller_termin_status,aktueller_termin_sv_id,aktueller_termin_kanal,' +
  'aktueller_termin_typ,aktueller_termin_final_verbindlich_ab'

// ─── Loader pro Rolle ──────────────────────────────────────────────────────

/**
 * Admin/Kundenbetreuer/Kanzlei-Loader. RLS macht den Role-Gate
 * (`is_admin()` oder `is_kundenbetreuer()`). Rückgabe: komplette Fall-Row
 * mit View-Computed-Feldern.
 */
export async function getFallForAdmin(
  supabase: SupabaseClient,
  fallId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(FALL_SELECT_FULL)
    .eq('id', fallId)
    .single()
  if (error) {
    console.error('[fall-queries] getFallForAdmin:', error.message)
    return null
  }
  return data as unknown as Record<string, unknown>
}

/**
 * SV-Loader. Zusätzlich explizit `sv_id = svId` gefiltert als Defense-in-Depth
 * über RLS hinaus. RLS allein würde auch greifen, aber der explizite Filter
 * macht die Intention klar und verhindert versehentliches Leaken wenn RLS
 * mal lockerer wird.
 */
export async function getFallForSv(
  supabase: SupabaseClient,
  fallId: string,
  svId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(FALL_SELECT_FULL)
    .eq('id', fallId)
    .eq('sv_id', svId)
    .single()
  if (error) {
    console.error('[fall-queries] getFallForSv:', error.message)
    return null
  }
  return data as unknown as Record<string, unknown>
}

/**
 * Kunden-Loader. Explizit `kunde_id = kundeId` + restrictiver SELECT.
 * Ownership-Ambivalenz: Alte Fälle konnten vor der Auth-Migration `kunde_id`
 * über die Lead-Email matchen — das wird im Kunde-Portal als Post-Query-Check
 * behandelt (Fallback über leads.email wenn kunde_id nicht direkt matcht).
 * Hier laden wir mit kunde_id-Filter, der Caller macht den Email-Fallback.
 */
export async function getFallForKunde(
  supabase: SupabaseClient,
  fallId: string,
  kundeId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(FALL_SELECT_KUNDE)
    .eq('id', fallId)
    .eq('kunde_id', kundeId)
    .single()
  if (error) {
    console.error('[fall-queries] getFallForKunde:', error.message)
    return null
  }
  return data as unknown as Record<string, unknown>
}

/**
 * Admin-Fall ohne Ownership-Gate (für Routes die bereits eine Admin-Rolle
 * verifiziert haben). Unterschied zu `getFallForAdmin`: gibt null zurück bei
 * Not-Found statt zu loggen. Wird in der zentralen Shell genutzt damit der
 * Error-Boundary saubere Entscheidungen trifft.
 */
export async function getFallById(
  supabase: SupabaseClient,
  fallId: string,
  select: string = FALL_SELECT_FULL,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(select)
    .eq('id', fallId)
    .maybeSingle()
  return (data as unknown as Record<string, unknown>) ?? null
}
