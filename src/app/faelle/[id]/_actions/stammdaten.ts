'use server'

// AAR-162 / W2: Fallakte Stammdaten — Generic Inline-Edit-Action.
// Analog zu src/app/dispatch/leads/[id]/_actions/stammdaten.ts (AAR-140 / W6):
// Allowlist-basierter Update-Endpoint, damit Consumer (InlineEditField) nicht
// einzeln 15 dedizierte Actions aufrufen müssen. Systemfelder + Status-Felder
// sind gesperrt — diese gehen über dedizierte Workflows (Webhooks, state-
// machine) nicht über diese Action.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { canEditField, type FallakteRolle } from '@/lib/fall/field-permissions'
import {
  splitOrKeepFaelleUpdate,
  CLUSTER1_RENAMED_TO_CLAIMS,
  CLUSTER2_RENAMED_TO_CLAIMS,
  CLUSTER3_RENAMED_TO_CLAIMS,
} from '@/lib/faelle/claim-duplicate-columns'

/**
 * Allowlist der editierbaren Fall-Felder.
 *
 * WICHTIG: Diese Liste wurde gegen das echte faelle-Schema verifiziert
 * (information_schema.columns). Frühere Versionen enthielten zahlreiche
 * Felder die auf faelle gar nicht existieren (kernwert_*, gegner_vorname/
 * nachname, fin) — Saves wären serverseitig still mit „column does not
 * exist"-Fehler ausgestiegen. AAR-575 (kunde_*) und AAR-576 (hsn/tsn)
 * haben die passenden Spalten inzwischen angelegt.
 *
 * Kunde-Stammdaten leben auf profiles bzw. leads — das fall-Objekt liefert
 * sie via JOIN, Inline-Edit der Kunde-Felder läuft daher gegen profiles
 * (separater Endpoint, nicht hier).
 */
const FALL_EDITABLE_FIELDS = new Set<string>([
  // Kunden-Snapshot (einmalig vom Lead kopiert, danach hier editierbar)
  'kunde_vorname',
  'kunde_nachname',
  'kunde_email',
  'kunde_telefon',
  'kunde_plz',
  'kunde_strasse',
  'kunde_stadt',
  // Fahrzeug (echte Spalten auf faelle)
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'fahrzeug_baujahr',
  'fahrzeug_farbe',
  // CMM-32: lackfarbe_code für Imagin-Render-Mapping (12 Standard-Farben)
  'lackfarbe_code',
  'fahrzeug_typ',
  'kennzeichen',
  'fin_vin',
  // AAR-576 (A2): HSN/TSN aus ZB1-OCR, Admin-Override für DAT-API.
  'hsn',
  'tsn',
  'erstzulassung',
  'kilometerstand',
  // Halter (ZB1-OCR) — AAR-548 D7: halter_name ist GENERATED (nicht editierbar).
  'halter_vorname',
  'halter_nachname',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'halter_email',
  'halter_telefon',
  // Unfall
  'schadens_datum',
  'schadens_adresse',
  'schadens_plz',
  'schadens_ort',
  'schadens_ursache',
  'schadens_beschreibung',
  'schadens_hergang',
  // AAR-665-Follow: getrennte Felder
  //  - sachschaden_beschreibung = Drittschaden (Leitplanke, Handy), Phase 1 Lead
  //  - fahrzeugschaden_beschreibung = Eigenschaden am Auto, Phase 4 + Haiku-Vision
  'sachschaden_beschreibung',
  'fahrzeugschaden_beschreibung',
  'schadens_art',
  // Gegner / Versicherung
  'gegner_name',
  'gegner_kennzeichen',
  'gegner_versicherung',
  'gegner_versicherung_id',
  'gegner_fahrzeugtyp',
  'gegner_schadennummer',
  'gegner_versicherungsnummer',
  // Vorschäden
  'hat_vorschaeden',
  'vorschaden_anzahl',
  // Besichtigung (DB-verifiziert: Adresse + Lat/Lng/PlaceID)
  // AAR-552 Cluster E: besichtigung_datum ersatzlos entfernt (kein Daten-Konsument).
  'besichtigungsort_adresse',
  'besichtigungsort_lat',
  'besichtigungsort_lng',
  'besichtigungsort_place_id',
  // Kernwerte (LexDrive-Webhook schreibt; Admin-Override)
  'reparaturkosten',
  'wiederbeschaffungswert',
  'restwert',
  'wertminderung',
  'schadens_hoehe_netto',
  // VS-Status-Felder (AAR-161 W1 neu)
  'vs_kuerzung_grund',
  'geschlossen_grund',
  'nachbesichtigung_ergebnis',
  'kuerzungs_betrag',
  'regulierung_betrag',
  // Notizen
  'notizen',
  // AAR-313: Nutzungsausfall + Mietwagen-Kanzlei-Kommunikation
  'fahrzeug_fahrbereit',
  'mietwagen_flag',
  'nutzungsausfall',
  'mietwagen_kanzlei_informiert',
  // AAR-629 (1a): 12 weitere bereits existierende faelle-Spalten die nach
  // AAR-49 editierbar sein sollten, aber aus der Allowlist rausgefallen sind.
  // DB-Check 2026-04-20 bestätigt: alle Spalten sind auf `faelle` vorhanden.
  //
  // Finanzierung/Leasing + Steuer-Status (vorher nur auf leads editierbar):
  'finanzierung_leasing',
  'vorsteuerabzugsberechtigt',
  // Gegner-Kenntnis + Anfrage-Tracking (Auslandskennzeichen-Workflow):
  'gegner_bekannt',
  'gegner_versicherung_anfrage_datum',
  // Halter-Geburtsdatum + Flag „Halter = Kunde":
  'halter_geburtsdatum',
  'ist_fahrzeughalter',
  // Unfallort strukturiert (Dispatch legt es an, Admin-Override möglich):
  'unfallort',
  'unfallort_kategorie',
  // Vorschäden-Details:
  'vorschaeden_beschreibung',
  // Werkstatt-Kontext:
  'werkstatt_seit_datum',
  // Kundensprache für Portal-Übersetzungen (war bisher nur über Lead-Edit):
  'sprache',
  // Zeugen-Kontaktdaten (JSONB-Array):
  'zeugen_kontakte',
  // AAR-630 (1b): 7 neue Fall-Spalten (Migration 20260420211923).
  // Auto-Flags (fahrerflucht, auslandskennzeichen) sind read-only im UI —
  // werden vom Kennzeichen-Analyse-Trigger gesetzt, aber Admin-Override
  // via Allowlist moeglich falls falsch geflaggt.
  'fahrerflucht',
  'auslandskennzeichen',
  'polizeibericht_status',
  'zb1_status',
  'unfall_uhrzeit',
  'unfallort_lat',
  'unfallort_lng',
])

// CMM-57: Felder aus der Allowlist, die nicht auf faelle/claims leben, sondern
// in der gutachten-Sub-Tabelle (F+G-Cluster). updateFallField routet sie
// dorthin. restwert + wiederbeschaffungswert wurden von #1322 aus faelle
// gedroppt — ein faelle-Write lief seither still ins Leere.
const GUTACHTEN_ROUTED_FIELDS = new Set<string>(['restwert', 'wiederbeschaffungswert'])

// CMM-44 SP-A2 (Cluster 1+2): Semantik-Duplikat-Felder routet updateFallField
// direkt mit dem neuen claims-Namen auf claims (NICHT ueber splitOrKeepFaelle-
// Update — der Helper kann nur gleichnamige Spalten). Das Mapping liegt zentral
// in lib/faelle/claim-duplicate-columns.ts (CLUSTER1_RENAMED_TO_CLAIMS +
// CLUSTER2_RENAMED_TO_CLAIMS), damit alle Caller dieselbe Quelle nutzen.

export async function updateFallField(
  fallId: string,
  field: string,
  value: unknown,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  if (!FALL_EDITABLE_FIELDS.has(field)) {
    return { success: false, error: `Feld "${field}" nicht in Allowlist` }
  }

  // Rollen-Check — sollte schon clientseitig gesperrt sein, Server ist die
  // Source of Truth.
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = (profile?.rolle as FallakteRolle | undefined) ?? 'kunde'

  const { data: fall } = await supabase
    .from('faelle')
    .select('status, claim_id')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  if (!canEditField(rolle, field, fall.status)) {
    return { success: false, error: 'Keine Berechtigung' }
  }

  // Null bei leerem String (explizites Löschen)
  const normalized = typeof value === 'string' && value.trim() === '' ? null : value

  // CMM-57: restwert + wiederbeschaffungswert leben seit dem F+G-Cluster in der
  // gutachten-Sub-Tabelle (#1322 hat sie aus faelle gedroppt). Ein Inline-Edit
  // ist ein manueller Override des OCR-Werts → direkt auf gutachten schreiben
  // + gutachten_ocr_manuell_ueberschrieben=true, damit ein Re-OCR den manuellen
  // Wert nicht ueberschreibt. Admin-Client, weil canEditField() oben bereits
  // autorisiert hat (analog PR-D).
  if (GUTACHTEN_ROUTED_FIELDS.has(field)) {
    const claimId = (fall as { claim_id?: string | null }).claim_id ?? null
    if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
    const { data: rows, error: gErr } = await createAdminClient()
      .from('gutachten')
      .update({ [field]: normalized, gutachten_ocr_manuell_ueberschrieben: true })
      .eq('claim_id', claimId)
      .select('id')
    if (gErr) return { success: false, error: gErr.message }
    if (!rows || rows.length === 0) {
      return {
        success: false,
        error: 'Noch kein Gutachten erfasst — der Wert kann erst nach Gutachten-Eingang gesetzt werden.',
      }
    }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-48 PR-D: Duplikat-Spalten gehen auf claims (Single Source of Truth).
  // canEditField() hat die Autorisierung bereits geprüft → der claims-Write
  // läuft über den Admin-Client (RLS-Bypass gerechtfertigt). Workflow-/
  // faelle-only-Felder bleiben auf faelle (RLS-Client wie bisher).
  // Das SP-A-Sync-Trigger-Paar ist gedroppt — ein faelle-Write der Duplikat-
  // Spalten ginge verloren, deshalb gehen sie direkt auf claims.
  // Legacy-Fall ohne claim_id: alles bleibt auf faelle.
  const claimId = (fall as { claim_id?: string | null }).claim_id ?? null

  // CMM-44 SP-A2: Semantik-Duplikat-Felder (anderer claims-Name) direkt mit dem
  // neuen Spaltennamen auf claims schreiben. splitOrKeepFaelleUpdate kann das
  // nicht (gleichnamig-Annahme). Cluster 1 (PR1a) = Schadenort + Datum,
  // Cluster 2 (PR1b) = Hergang/Art/Typ/Flags, Cluster 3 (PR1c) = Rest
  // (gegner_schadennummer/regulierung_betrag in der Allowlist) — alle Maps
  // liefern denselben { faelle/UI-Name: claimsSpalte }-Shape, gleicher Pfad.
  const renamedClaimsColumn =
    CLUSTER1_RENAMED_TO_CLAIMS[field] ??
    CLUSTER2_RENAMED_TO_CLAIMS[field] ??
    CLUSTER3_RENAMED_TO_CLAIMS[field]
  if (renamedClaimsColumn) {
    if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
    const { error: claimErr } = await createAdminClient()
      .from('claims')
      .update({ [renamedClaimsColumn]: normalized })
      .eq('id', claimId)
    if (claimErr) return { success: false, error: claimErr.message }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(
    { [field]: normalized, updated_at: new Date().toISOString() },
    claimId,
  )

  if (Object.keys(faelleUpdate).length > 0) {
    const { error } = await supabase.from('faelle').update(faelleUpdate).eq('id', fallId)
    if (error) return { success: false, error: error.message }
  }

  if (claimId && Object.keys(claimsUpdate).length > 0) {
    const { error: claimErr } = await createAdminClient()
      .from('claims')
      .update(claimsUpdate)
      .eq('id', claimId)
    if (claimErr) return { success: false, error: claimErr.message }
  }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

// AAR-684 Phase 2: zwei weitere Stammdaten-Actions aus dem Monolith.
// - updateSchadensAdresse: dedizierte Adresse-Update-Action mit Timeline
// - saveFinVin: FIN-Validierung + Cardentity-Enrichment-Trigger
//
// 13.05.2026: updateFall (Bulk-Update mit BLOCKED_FIELDS-Filter) entfernt —
// hatte 0 Caller in src/, Full-Patch-Pattern (siehe CMM-Phase-1.5 Sync-Bug-Fix
// 20260513082948). Wer Bulk-Updates braucht: einzeln per updateFallField
// oder eigene Action mit explizitem Field-Whitelist schreiben.

export async function updateSchadensAdresse(
  fallId: string,
  data: { adresse: string; plz: string; ort?: string },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // CMM-44 SP-A2 (Cluster 1): schadenort_* leben auf claims (SSoT). Der
  // Schreibpfad braucht die claim_id; das SP-A-Sync-Trigger-Paar ist gedroppt.
  const { data: fall } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .single()
  const claimId = (fall as { claim_id?: string | null } | null)?.claim_id ?? null
  if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }

  const { error } = await createAdminClient()
    .from('claims')
    .update({
      schadenort_adresse: data.adresse || null,
      schadenort_plz: data.plz || null,
      schadenort_ort: data.ort || null,
    })
    .eq('id', claimId)

  if (error) return { success: false, error: error.message }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Schadensadresse aktualisiert',
    beschreibung: [data.adresse, data.plz, data.ort].filter(Boolean).join(', '),
    erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

export async function saveFinVin(
  fallId: string,
  finVin: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // FIN-Format: 17 alphanumerisch, ohne I/O/Q
  const cleaned = finVin.trim().toUpperCase()
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) {
    return { success: false, error: 'Ungültige FIN. Muss 17 alphanumerische Zeichen lang sein.' }
  }

  const { error } = await supabase
    .from('faelle')
    .update({
      fin_vin: cleaned,
      fin_quelle: 'manuell',
      fin_extrahiert_am: new Date().toISOString(),
    })
    .eq('id', fallId)

  if (error) return { success: false, error: error.message }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'FIN manuell eingegeben',
    beschreibung: `FIN/VIN: ${cleaned}`,
    erstellt_von: user.id,
  })

  // AAR-90: direkter Cardentity-Lib-Aufruf statt internem fetch
  try {
    const { enrichFallByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
    enrichFallByFin(fallId).catch(() => {})
  } catch (err) { console.error('[AAR-90] enrichFallByFin:', err) }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}
