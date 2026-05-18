// AAR-811: Dual-Write Helper — erstellt claims-Row für einen neuen fall
// und schreibt claim_id zurück auf faelle. Idempotent: falls claim_id
// bereits gesetzt, wird nichts überschrieben.
//
// CMM-3 (Phase 0.5): DEPRECATED für den Lead-Konvertierungs-Pfad.
// Die Lead → Claim Konvertierung läuft jetzt ÜBER `convertLeadToClaim`
// (src/lib/leads/convert-lead-to-claim.ts), die claims direkt vor dem
// faelle-Insert anlegt — ohne Drift-Quelle. Diese Funktion bleibt nur
// noch für Admin-manuelle-Fall-Anlage (/admin/faelle/anlegen) erhalten,
// wo es keinen Lead gibt. In Phase 6 wird auch dieser Pfad refactored
// und die Funktion gelöscht.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function createClaimForFall(
  db: SupabaseClient,
  fallId: string,
  source: {
    unfalldatum?: string | null
    schadens_datum?: string | null
    created_at?: string
    unfall_uhrzeit?: string | null
    schadens_entdeckt_am?: string | null
    unfallort?: string | null
    schadens_adresse?: string | null
    schadens_plz?: string | null
    schadens_ort?: string | null
    unfallort_lat?: number | null
    unfallort_lng?: number | null
    unfallort_kategorie?: string | null
    unfallhergang?: string | null
    schadens_hergang?: string | null
    fahrzeugschaden_beschreibung?: string | null
    schadens_art?: string | null
    schadens_fall_typ?: string | null
    schadens_ursache?: string | null
    unfall_konstellation?: string | null
    fahrerflucht?: boolean | null
    auslandskennzeichen?: boolean | null
    polizei_aktenzeichen?: string | null
    polizei_bericht_vorhanden?: boolean | null
    polizei_vor_ort?: boolean | null
    polizeibericht_status?: string | null
    kunde_id?: string | null
    gegner_versicherung_id?: string | null
    gegner_versicherungsnummer?: string | null
    gegner_schadennummer?: string | null
    gegner_bekannt?: boolean | null
    gegner_anzahl_beteiligte?: number | null
    personenschaden_flag?: boolean | null
    mietwagen_hat?: boolean | null
    mietwagen_flag?: boolean | null
    nutzungsausfall?: boolean | null
    sachschaden_flag?: boolean | null
    sachschaden_beschreibung?: string | null
    halter_ungleich_fahrer_flag?: boolean | null
    kunden_konstellation?: string | null
    vehicle_id?: string | null
    kundenbetreuer_id?: string | null
    spezifikation?: string | null
    // CMM-44 SP-A2 (Cluster 3): Lead-Konversions-Verknuepfung. claims.lead_id
    // ist SSoT (vorher faelle.konvertiert_von_lead). Optional — der Admin-
    // anlegen-Pfad reicht sie durch, sonst null.
    lead_id?: string | null
  },
  createdVia: 'lead_konvertierung' | 'manuell_admin' | 'sv_anlage' = 'lead_konvertierung',
): Promise<string | null> {
  // Idempotenz-Check: Falls claim_id schon gesetzt, nicht doppelt anlegen
  const { data: existing } = await db
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  if (existing?.claim_id) return existing.claim_id as string

  const schadentag =
    source.unfalldatum ??
    source.schadens_datum ??
    (source.created_at ? source.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))

  const schadenartRaw = (source.schadens_art ?? '').toLowerCase().trim()
  const VALID_SCHADENARTEN = ['haftpflicht', 'vollkasko', 'teilkasko', 'eigenverschulden', 'unbekannt']
  const schadenart = VALID_SCHADENARTEN.includes(schadenartRaw) ? schadenartRaw : 'unbekannt'

  const { data: claim, error } = await db
    .from('claims')
    .insert({
      vehicle_id: source.vehicle_id ?? null,
      schadentag,
      schadenort_adresse: source.unfallort ?? source.schadens_adresse ?? null,
      schadenort_plz: source.schadens_plz ?? null,
      schadenort_ort: source.schadens_ort ?? null,
      schadenort_land: 'DE',
      schadenort_lat: source.unfallort_lat ?? null,
      schadenort_lng: source.unfallort_lng ?? null,
      schadenort_kategorie: source.unfallort_kategorie ?? null,
      hergang_kunde_text: source.unfallhergang ?? source.schadens_hergang ?? source.fahrzeugschaden_beschreibung ?? null,
      schadenart,
      fall_typ: source.schadens_fall_typ ?? null,
      // CMM-44 SP-B PR2c: schadens_ursache lebt auf claims (SSoT) — hier beim
      // Claim-Create aus dem source-Objekt befüllen.
      // Hinweis: claims.ursache + claims.bkat_unfallart wurden in Stufe-0-Final
      // gedroppt; schadens_ursache ist die verbleibende Ursachen-Spalte.
      schadens_ursache: source.schadens_ursache ?? null,
      unfall_konstellation: source.unfall_konstellation ?? null,
      fahrerflucht: source.fahrerflucht ?? null,
      auslandskennzeichen: source.auslandskennzeichen ?? null,
      polizei_aktenzeichen: source.polizei_aktenzeichen ?? null,
      polizei_bericht_vorhanden: source.polizei_bericht_vorhanden ?? false,
      polizei_vor_ort: source.polizei_vor_ort ?? false,
      polizeibericht_status: source.polizeibericht_status ?? null,
      geschaedigter_user_id: source.kunde_id ?? null,
      gegner_versicherung_id: source.gegner_versicherung_id ?? null,
      gegner_versicherungsnummer: source.gegner_versicherungsnummer ?? null,
      gegner_aktenzeichen: source.gegner_schadennummer ?? null,
      gegner_bekannt: source.gegner_bekannt ?? true,
      anzahl_beteiligte_total: (source.gegner_anzahl_beteiligte ?? 0) + 1,
      hat_personenschaden: source.personenschaden_flag ?? false,
      hat_mietwagen: source.mietwagen_hat ?? source.mietwagen_flag ?? false,
      hat_nutzungsausfall: source.nutzungsausfall ?? false,
      hat_sachschaden: source.sachschaden_flag ?? false,
      sachschaden_beschreibung: source.sachschaden_beschreibung ?? null,
      halter_ungleich_fahrer: source.halter_ungleich_fahrer_flag ?? false,
      kunden_konstellation: source.kunden_konstellation ?? null,
      // CMM-44 SP-A: spezifikation ist eine faelle<->claims-Duplikat-Spalte.
      spezifikation: source.spezifikation ?? null,
      // CMM-44 SP-A2 (Cluster 3): Lead-Konversions-Verknuepfung claims-seitig.
      lead_id: source.lead_id ?? null,
      created_by_user_id: source.kundenbetreuer_id ?? null,
      created_via: createdVia,
    })
    .select('id')
    .single()

  if (error || !claim) {
    console.error('[AAR-811] createClaimForFall fehlgeschlagen:', error?.message)
    return null
  }

  // claim_id auf faelle zurückschreiben
  await db.from('faelle').update({ claim_id: claim.id }).eq('id', fallId)

  return claim.id as string
}
