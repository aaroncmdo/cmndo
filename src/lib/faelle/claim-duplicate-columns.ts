// CMM-48 Phase 3 — Writer-Migration: faelle-Duplikat-Spalten -> claims.
//
// Es gab 34 Spalten die auf `faelle` UND `claims` existierten und vom
// DB-Trigger-Paar sync_faelle_to_claims / sync_claims_to_faelle gespiegelt
// wurden. Ziel der CMM-48-Migration: jeder Writer schreibt die Duplikat-Spalten
// auf `claims` (Single Source of Truth), nicht mehr auf `faelle`.
//
// CMM-44 SP-A: das Sync-Trigger-Paar wurde gedroppt (Migration
// 20260517012837_cmm44_spa_drop_34_dup_columns.sql). Es gibt KEINE
// faelle<->claims-Propagierung mehr — ein Write der Duplikat-Spalten muss
// direkt auf `claims` zielen, sonst geht der Wert verloren.
//
// Dieser Helper routet nur die namens-GLEICHEN Duplikat-Spalten. Semantik-
// Duplikate mit abweichendem claims-Namen (CMM-44 SP-A2) routet der jeweilige
// Caller selbst direkt auf claims — NICHT ueber diesen Helper.

/**
 * Duplikat-Spalten, deren Writer bereits auf `claims` migriert wurden.
 * Wird pro CMM-48-PR erweitert.
 *
 * Stand PR-D (state-machine, lexdrive/process-event, kanzlei-paket,
 * stammdaten/updateFallField).
 */
export const CLAIM_OWNED_DUPLICATE_COLUMNS = new Set<string>([
  // PR-C — state-machine + lexdrive/process-event (Status-Timestamps)
  'abgeschlossen_am',
  'kanzlei_uebergeben_am',
  // PR-D — Fallakte-Edit-Writer (kanzlei-paket saveKanzleiAnsprechpartner
  // + stammdaten updateFallField). Die Duplikat-Spalten der updateFallField-
  // Allowlist FALL_EDITABLE_FIELDS plus die 3 Kanzlei-Ansprechpartner-Felder.
  'kanzlei_ansprechpartner_name',
  'kanzlei_ansprechpartner_email',
  'kanzlei_ansprechpartner_telefon',
  'kunde_email',
  'sachschaden_beschreibung',
  'gegner_versicherung_id',
  'gegner_versicherungsnummer',
  'finanzierung_leasing',
  'vorsteuerabzugsberechtigt',
  'gegner_bekannt',
  'zeugen_kontakte',
  'fahrerflucht',
  'auslandskennzeichen',
  'polizeibericht_status',
  // PR2a (SP-B) — Cluster a Workflow/Zuweisung: gleichnamige Spalten die jetzt
  // auf claims liegen. splitOrKeepFaelleUpdate routet sie automatisch auf claims.
  'status_changed_at',
  'geschlossen_grund',
  'ist_aktiv',
  'deaktiviert_am',
  'deaktiviert_grund',
  'deaktiviert_notiz',
  'eskaliert_an_admin_id',
  'eskaliert_am',
  'eskaliert_grund',
  'google_review_gesendet',
  'google_review_prompt_gezeigt_am',
  'bevorzugter_kanal',
  'onboarding_complete',
  'szenario',
  'service_typ',
  'sprache',
  'notizen',
  'interne_notizen',
  'prioritaet',
  'betreuungspaket',
  'makler_id',
  'datenschutz_akzeptiert',
  'datenschutz_akzeptiert_am',
  'fallakte_angelegt_am',
  'sv_zugewiesen_am',
  'kundenbetreuer_fallback_flag',
  'kundenbetreuer_zugewiesen_am',
  // PR2c (SP-B) — Cluster c Mietwagen/Unfall-Rest: gleichnamige Spalten die
  // jetzt auf claims liegen. splitOrKeepFaelleUpdate routet sie automatisch.
  'mietwagen_seit_datum',
  'mietwagen_limit_tage',
  'mietwagen_limit_grund',
  'mietwagen_rechnung_vorhanden',
  'mietwagen_rechnung_url',
  'mietwagen_argumentations_puffer',
  'mietwagen_vermieter',
  'schadens_hoehe_netto',
  'schadens_ursache',
  'zeugen_vorhanden',
  'bkat_unfallart',
  'werkstatt_seit_datum',
  'fahrzeug_fahrbereit',
  'fahrzeugschaden_beschreibung',
  'abrechnungsart_besprochen',
  'abrechnungsart_notiz',
  'abrechnungsart_besprochen_am',
  'unfallmitteilung_status',
  'dokumente_vollstaendig_fuer_phase',
  'dokumente_vollstaendig_am_phase',
  'dokumente_reminder_whatsapp_letzte_sendung',
  'zb1_status',
  'kanzlei_ansprechpartner_position',
  'leasinggeber_informiert',
  // CMM-44 SP-J Bucket B — Abrechnung/Auszahlung claims-native (1:1, namens-
  // gleich). splitOrKeepFaelleUpdate routet sie automatisch auf claims. NICHT
  // die 3 zahlung_*-Bucket-A-Spalten (die gehen auf claim_payments, nicht
  // claims — manueller Reroute via upsertCurrentClaimPayment).
  'guthaben_verrechnet_netto',
  'schlussabrechnung_am',
  'auszahlung_gutachter_betrag',
  'auszahlung_gutachter_eingegangen_am',
  'auszahlung_zahlungsweg',
  'sv_nachzahlung_netto',
  'abrechnung_id',
  'kanzlei_abrechnung_id',
])

/**
 * CMM-44 SP-H — Auftrag-Lifecycle-Spalten, die auf die `auftraege`-Sub-Tabelle
 * gewandert sind (1:N pro Claim — gilt der "aktuelle" Auftrag,
 * `ORDER BY reihenfolge DESC LIMIT 1`). Anders als die claims-Duplikate oben
 * gibt es KEINEN DB-Sync — ein Writer, der eine dieser Spalten auf `faelle`
 * schreibt, geht ins Leere (Reader lesen seit SP-H PR2 aus `auftraege`).
 *
 * Diese Spalten existieren namens-gleich auf `auftraege`. Writer peelen sie via
 * `peelAuftraegeColumns` aus dem faelle-Update heraus und schreiben sie separat
 * auf den aktuellen Auftrag des Claims. `faelle` behaelt die Spalten bis Phase 6.
 */
export const AUFTRAEGE_OWNED_COLUMNS = new Set<string>([
  'filmcheck_ok',
  'filmcheck_am',
  'filmcheck_notizen',
  'storniert_am',
  'storno_grund',
  'storno_durch_user_id',
  'besichtigung_gestartet_am',
  'sv_briefing_text',
  'sv_briefing_generated_at',
  'sv_briefing_model',
  'sv_briefing_version',
  'sv_briefing_struktur',
  'sv_notizen_vor_ort',
  'technische_stellungnahme_status',
  'technische_stellungnahme_notiz_sv',
  'technische_stellungnahme_beauftragt_am',
  'technische_stellungnahme_hochgeladen_am',
  'technische_stellungnahme_freigabe_am',
])

/**
 * Trennt die SP-H-Auftrag-Lifecycle-Spalten aus einem Update-Objekt heraus.
 * `rest` enthaelt alle Nicht-SP-H-Spalten (gehen weiter durch
 * `splitOrKeepFaelleUpdate` ihren faelle/claims-Weg), `auftraegeUpdate` enthaelt
 * die SP-H-Spalten, die der Caller auf den aktuellen Auftrag schreiben muss.
 *
 * Aufruf-Reihenfolge im Writer: ZUERST peelAuftraegeColumns, DANN
 * splitOrKeepFaelleUpdate(rest, claimId) — so landet keine SP-H-Spalte mehr im
 * faelle- oder claims-Update.
 */
export function peelAuftraegeColumns(update: Record<string, unknown>): {
  rest: Record<string, unknown>
  auftraegeUpdate: Record<string, unknown>
} {
  const rest: Record<string, unknown> = {}
  const auftraegeUpdate: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(update)) {
    if (AUFTRAEGE_OWNED_COLUMNS.has(key)) {
      auftraegeUpdate[key] = value
    } else {
      rest[key] = value
    }
  }
  return { rest, auftraegeUpdate }
}

/**
 * CMM-44 SP-A2 — Semantik-Duplikat-Spalten: der alte `faelle`-Spalten-/UI-Feld-
 * name unterscheidet sich vom `claims`-Zielnamen (anders als bei den namens-
 * gleichen Duplikaten oben). Writer, die ein solches Feld setzen, schreiben es
 * direkt mit dem neuen Namen auf `claims` — NICHT ueber splitOrKeepFaelleUpdate
 * (der Helper kann nur gleichnamige Spalten spiegeln).
 *
 * Format: { alterFeldname (faelle/UI): claimsSpaltenname }.
 * Cluster 1 (PR1a): Schadenort + Datum. Cluster 2/3 erweitern die Map in
 * PR1b/PR1c.
 */
export const CLUSTER1_RENAMED_TO_CLAIMS: Record<string, string> = {
  schadens_datum: 'schadentag',
  schadens_adresse: 'schadenort_adresse',
  schadens_plz: 'schadenort_plz',
  schadens_ort: 'schadenort_ort',
  unfallort: 'schadenort_adresse',
  unfallort_kategorie: 'schadenort_kategorie',
  unfall_uhrzeit: 'schadenzeit',
  unfallort_lat: 'schadenort_lat',
  unfallort_lng: 'schadenort_lng',
}

/**
 * CMM-44 SP-A2 Cluster 2 (PR1b) — Hergang-/Art-/Typ-/Flag-Semantik-Duplikate.
 * Gleiche Logik wie CLUSTER1_RENAMED_TO_CLAIMS: alter faelle/UI-Feldname →
 * claims-Zielname. Kollision A: schadens_beschreibung/unfallhergang/
 * schadens_hergang → hergang_kunde_text. Kollision D: mietwagen_flag/
 * mietwagen_hat → hat_mietwagen.
 */
export const CLUSTER2_RENAMED_TO_CLAIMS: Record<string, string> = {
  schadens_beschreibung: 'hergang_kunde_text',
  unfallhergang: 'hergang_kunde_text',
  schadens_hergang: 'hergang_kunde_text',
  schadens_art: 'schadenart',
  schadens_fall_typ: 'fall_typ',
  personenschaden_flag: 'hat_personenschaden',
  halter_ungleich_fahrer_flag: 'halter_ungleich_fahrer',
  sachschaden_flag: 'hat_sachschaden',
  mietwagen_flag: 'hat_mietwagen',
  mietwagen_hat: 'hat_mietwagen',
  nutzungsausfall: 'hat_nutzungsausfall',
}

/**
 * CMM-44 SP-A2 Cluster 3 (PR1c) — die letzten 6 Semantik-Duplikate.
 * Gleiche Logik wie CLUSTER1/2: alter faelle/UI-Feldname -> claims-Zielname.
 *
 * no_show_count-Sonderfall: claims hat ZWEI deckungsgleiche Zaehler
 * (kunde_no_show_count + sv_no_show_count). Beide Cluster-3-Call-Sites haben
 * Kunde-No-Show-Kontext (storno-actions.meldeNoShow = "SV meldet Kunde
 * No-Show"; gutachter/fall-Banner = verpasste Kunden-Termine) — daher mappt
 * die zentrale Map auf kunde_no_show_count. Schreibt ein Caller einen
 * SV-No-Show, muss er sv_no_show_count direkt waehlen (nicht ueber die Map).
 *
 * konvertiert_von_lead -> lead_id: die Lead-Konversions-Verknuepfung lebt
 * claims-seitig als claims.lead_id (NICHT faelle.lead_id). Diese Map ist fuer
 * Writer/Reader, die das Feld bewusst als Konversions-Anker behandeln.
 */
export const CLUSTER3_RENAMED_TO_CLAIMS: Record<string, string> = {
  gegner_schadennummer: 'gegner_aktenzeichen',
  no_show_count: 'kunde_no_show_count',
  aktuelle_phase: 'phase',
  konvertiert_von_lead: 'lead_id',
  regulierung_betrag: 'regulierungs_betrag',
  vs_ablehnungsgrund: 'vs_ablehnungs_grund',
}

/**
 * Splittet ein `faelle`-Update-Objekt in den faelle-Teil (Workflow-Spalten,
 * bleiben auf faelle) und den claims-Teil (bereits migrierte Duplikat-Spalten).
 *
 * Der Caller schreibt `faelleUpdate` auf `faelle` und `claimsUpdate` via
 * `faelle.claim_id` auf `claims`. Bei einem Fall ohne `claim_id` (Legacy)
 * sollte der Caller das ungesplittete Update auf faelle schreiben — siehe
 * `splitOrKeepFaelleUpdate`.
 */
export function splitFaelleUpdate(update: Record<string, unknown>): {
  faelleUpdate: Record<string, unknown>
  claimsUpdate: Record<string, unknown>
} {
  const faelleUpdate: Record<string, unknown> = {}
  const claimsUpdate: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(update)) {
    if (CLAIM_OWNED_DUPLICATE_COLUMNS.has(key)) {
      claimsUpdate[key] = value
    } else {
      faelleUpdate[key] = value
    }
  }
  return { faelleUpdate, claimsUpdate }
}

/**
 * Wie `splitFaelleUpdate`, faellt aber bei fehlendem `claimId` (Legacy-Fall
 * ohne verknuepften Claim) auf das alte Verhalten zurueck: das komplette
 * Update bleibt auf `faelle`. So gehen Status-Timestamps bei claim-losen
 * Faellen nicht verloren.
 */
export function splitOrKeepFaelleUpdate(
  update: Record<string, unknown>,
  claimId: string | null,
): { faelleUpdate: Record<string, unknown>; claimsUpdate: Record<string, unknown> } {
  if (!claimId) {
    return { faelleUpdate: update, claimsUpdate: {} }
  }
  return splitFaelleUpdate(update)
}
