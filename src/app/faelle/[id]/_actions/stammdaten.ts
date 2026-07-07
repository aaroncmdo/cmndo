'use server'

// AAR-162 / W2: Fallakte Stammdaten — Generic Inline-Edit-Action.
// Analog zu src/app/dispatch/leads/[id]/_actions/stammdaten.ts (AAR-140 / W6):
// Allowlist-basierter Update-Endpoint, damit Consumer (InlineEditField) nicht
// einzeln 15 dedizierte Actions aufrufen müssen. Systemfelder + Status-Felder
// sind gesperrt — diese gehen über dedizierte Workflows (Webhooks, state-
// machine) nicht über diese Action.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureVehicleFromFin, ensureVehicleForClaim } from '@/lib/vehicles/ensure-vehicle'
import { FALL_VEHICLE_COL, fallVehicleWriteValue } from '@/lib/vehicles/fall-vehicle-field'
import { revalidatePath } from 'next/cache'
import { canEditField, type FallakteRolle } from '@/lib/fall/field-permissions'
import { getClaimPhaseMap } from '@/lib/claims/claim-phase-map'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import {
  splitOrKeepFaelleUpdate,
  CLUSTER1_RENAMED_TO_CLAIMS,
  CLUSTER2_RENAMED_TO_CLAIMS,
  CLUSTER3_RENAMED_TO_CLAIMS,
} from '@/lib/faelle/claim-duplicate-columns'
import { KANZLEI_FAELLE_COLS, upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import { upsertClaimPayment, type ClaimPaymentFields } from '@/lib/faelle/claim-payments'
import { ensurePersonForData } from '@/lib/personen/ensure-person'
import { findVerursacherParty, insertVerursacherParty } from '@/lib/claims/verursacher-party'
import { coerceJaNein, splitPersonName } from '@/lib/stammdaten/field-coercion'

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
  // Vorschäden (vorschaden_anzahl = abgeleitete Zaehl-Aggregation vv.anzahl -> read-only, raus)
  'hat_vorschaeden',
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
  // CMM-49: SV-Honorar lebt auf gutachten.gutachten_sv_honorar_netto (faelle-Spalte gedroppt);
  // routet via GUTACHTEN_FIELD_MAP dorthin (Admin-Override des OCR/AI-Werts).
  'gutachter_honorar',
  'schadens_hoehe_netto',
  // VS-Status-Felder (AAR-161 W1 neu)
  'vs_kuerzung_grund',
  'geschlossen_grund',
  'nachbesichtigung_ergebnis',
  'kuerzungs_betrag',
  'regulierung_betrag',
  // KB-Prozess-Tab-Inputs: fehlten in der Allowlist -> die Inline-Edits in AsSection/
  // VsReaktionSection/AuszahlungSection brachen mit "nicht in Allowlist" ab (Save = roter
  // Fehler, nichts gespeichert). Routing + Berechtigung DB-verifiziert:
  //   as_geforderte_summe/anschlussschreiben_am/vs_quote_grund/vs_kuerzungs_typ
  //     -> kanzlei_faelle (KANZLEI_FAELLE_COLS -> upsertKanzleiFall, stammdaten.ts:573)
  //   auszahlung_gutachter_eingegangen_am -> claims (CLAIM_OWNED_DUPLICATE_COLUMNS -> split)
  // canEditField: KB/Admin haben kein Field-Whitelist (helpers.ts:97) -> ok.
  // NICHT hier: auszahlung_kunde_betrag/_eingegangen_am = KEINE DB-Spalte (gehoeren als
  // claim_payments-Row empfaenger='kunde') -> eigener Fix (Payment-Routing + View-Read).
  'as_geforderte_summe',
  'anschlussschreiben_am',
  'vs_quote_grund',
  'vs_kuerzungs_typ',
  'auszahlung_gutachter_eingegangen_am',
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
  // Gegner-Kenntnis (Auslandskennzeichen-Workflow). gegner_versicherung_anfrage_datum
  // (Gruene-Karte-Anfrage) ist in der Fallakte vestigial — v_faelle NULLt es hart, kein
  // claims-Home (lebt nur auf leads) -> der Edit versickerte -> raus aus der Allowlist.
  'gegner_bekannt',
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
  // Reparaturwunsch (Intent) + operativer Vermittlungs-Status (Reparaturwunsch-Feature):
  'reparaturwunsch',
  'reparatur_vermittlung_status',
  'reparatur_werkstatt_extern',
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

// CMM-57: Felder aus der Allowlist, die nicht auf faelle/claims leben, sondern in der
// gutachten-Sub-Tabelle (F+G-Cluster). updateFallField routet sie dorthin (Admin-Override
// des OCR-Werts). Map = UI-Feld -> gutachten-Spalte (gleichnamig ODER Rename).
// - restwert/wiederbeschaffungswert: gleichnamig (von #1322 aus faelle gedroppt).
// - CMM-49: reparaturkosten/wertminderung sind 0-populated dead-legacy auf faelle; der
//   Reader exponiert v_faelle.reparaturkosten = gutachten.reparaturkosten_netto und
//   v_faelle.wertminderung = gutachten.minderwert -> Admin-Override dorthin (Rename, netto)
//   statt toten faelle-Write. Behebt den bislang ins Leere laufenden Override.
const GUTACHTEN_FIELD_MAP: Record<string, string> = {
  restwert: 'restwert',
  wiederbeschaffungswert: 'wiederbeschaffungswert',
  reparaturkosten: 'reparaturkosten_netto',
  wertminderung: 'minderwert',
  // CMM-49: SV-Honorar — Reader v_faelle_mit_aktuellem_termin.gutachter_honorar
  // == gutachten.gutachten_sv_honorar_netto; Inline-Edit ist Admin-Override (Rename) dorthin.
  gutachter_honorar: 'gutachten_sv_honorar_netto',
}

// CMM-49/AAR-552: Felder, deren SSoT der "aktuelle Termin" (gutachter_termine) ist —
// Reader lesen sie aus dem t-LATERAL von v_faelle_mit_aktuellem_termin, NICHT aus faelle.
// updateFallField routet sie via get_aktueller_gt_termin_id (kanonischer Selektor =
// exakt die View-t-Selektion) auf den aktuellen Termin; sonst landeten Inline-Edits auf
// faelle und wuerden nirgends gelesen (Divergenz, gleiche Klasse wie mietwagen #2928).
const GT_ROUTED_FIELDS = new Set<string>([
  'besichtigungsort_adresse',
  'besichtigungsort_lat',
  'besichtigungsort_lng',
  'besichtigungsort_place_id',
  'nachbesichtigung_ergebnis',
])

// CMM-49: Ja/Nein-Felder, deren Zielspalte boolean ist (claim_parties.ist_halter +
// 5 claims-Flags). InlineEditField sendet "Ja"/"Nein" als Text; Postgres castet das
// nicht nach boolean (22P02) -> updateFallField coerct sie zentral via coerceJaNein,
// BEVOR sie ihre jeweilige Route nehmen (ist_fahrzeughalter-Branch bzw. claims-Flag).
const JA_NEIN_BOOLEAN_FIELDS = new Set<string>([
  'ist_fahrzeughalter',
  'gegner_bekannt',
  'fahrerflucht',
  'auslandskennzeichen',
  'vorsteuerabzugsberechtigt',
  'hat_vorschaeden',
])

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

  // CMM-49 PURE_BRIDGE: fall_id->claim_id via resolveClaimId (bridge-basiert, faelle-Drop-sicher).
  // Guard auf claimId statt fall-Existenz (bridge 1:1, verhaltensgleich).
  const gateClaimId = await resolveClaimId(supabase, fallId)
  if (!gateClaimId) return { success: false, error: 'Fall nicht gefunden' }

  // CMM-49 T1.2 (CMM-69): Edit-Lock aus abgeleiteter sub_phase (v_claim_phase) statt
  // faelle.status. claim_id → getClaimPhaseMap (Service-Read; fallId oben ist RLS-geprüft).
  const gateSubPhase = gateClaimId
    ? (await getClaimPhaseMap([gateClaimId])).get(gateClaimId)?.subPhase ?? null
    : null
  if (!canEditField(rolle, field, gateSubPhase)) {
    return { success: false, error: 'Keine Berechtigung' }
  }

  // Null bei leerem String (explizites Löschen)
  let normalized: unknown = typeof value === 'string' && value.trim() === '' ? null : value

  // CMM-49: Ja/Nein -> boolean fuer die boolean-Zielfelder (s. JA_NEIN_BOOLEAN_FIELDS).
  // Danach fliesst der boolean in die jeweilige Route (ist_fahrzeughalter-Branch / claims-Flag).
  if (JA_NEIN_BOOLEAN_FIELDS.has(field)) {
    const c = coerceJaNein(normalized)
    if (!c.ok) return { success: false, error: c.error }
    normalized = c.value
  }

  // CMM-57: restwert + wiederbeschaffungswert leben seit dem F+G-Cluster in der
  // gutachten-Sub-Tabelle (#1322 hat sie aus faelle gedroppt). Ein Inline-Edit
  // ist ein manueller Override des OCR-Werts → direkt auf gutachten schreiben
  // + gutachten_ocr_manuell_ueberschrieben=true, damit ein Re-OCR den manuellen
  // Wert nicht ueberschreibt. Admin-Client, weil canEditField() oben bereits
  // autorisiert hat (analog PR-D).
  const gutachtenCol = GUTACHTEN_FIELD_MAP[field]
  if (gutachtenCol) {
    const claimId = gateClaimId
    if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
    const { data: rows, error: gErr } = await createAdminClient()
      .from('gutachten')
      .update({ [gutachtenCol]: normalized, gutachten_ocr_manuell_ueberschrieben: true })
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

  // CMM-49/AAR-552: besichtigungsort_*/nachbesichtigung_ergebnis leben auf dem aktuellen
  // Termin (gutachter_termine). Auf den kanonisch selektierten Termin schreiben
  // (get_aktueller_gt_termin_id == View-t-Selektion), damit Writer und Reader denselben
  // Termin treffen. Admin-Client: canEditField() hat oben bereits autorisiert.
  if (GT_ROUTED_FIELDS.has(field)) {
    const claimId = gateClaimId
    if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
    const admin = createAdminClient()
    const { data: terminId, error: rpcErr } = await admin.rpc('get_aktueller_gt_termin_id', {
      p_claim_id: claimId,
    })
    if (rpcErr) return { success: false, error: rpcErr.message }
    if (!terminId) {
      return {
        success: false,
        error:
          'Noch kein aktueller Termin — Besichtigungsort/Nachbesichtigung kann erst nach Terminvergabe gesetzt werden.',
      }
    }
    const { error: gtErr } = await admin
      .from('gutachter_termine')
      .update({ [field]: normalized })
      .eq('id', terminId as string)
    if (gtErr) return { success: false, error: gtErr.message }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-49: die kunde_*-Stammdaten leben in der geschaedigter-Party->personen (SSoT).
  // v_claim_full/v_faelle sourcen sie von dort (kunde_p/cp_g-LATERAL, #2982/#2984); ein
  // Inline-Edit muss personen der geschaedigter-Party schreiben — sonst maskiert die
  // party-first-Sicht den Edit (er landete sonst auf faelle.kunde_* / claims.kunde_email,
  // die niemand mehr liest). Mapping UI-Feld -> personen-Spalte; Selektion == v_claim_full.kunde_p
  // (reihenfolge, created_at). Admin-Client: canEditField() hat oben bereits autorisiert.
  const KUNDE_PERSON_COL: Record<string, string> = {
    kunde_email: 'email',
    kunde_vorname: 'vorname',
    kunde_nachname: 'nachname',
    kunde_telefon: 'telefon',
    kunde_strasse: 'adresse_strasse',
    kunde_plz: 'adresse_plz',
    kunde_stadt: 'adresse_ort',
  }
  const personCol = KUNDE_PERSON_COL[field]
  if (personCol) {
    const admin = createAdminClient()
    const { data: party } = await admin
      .from('claim_parties')
      .select('person_id')
      .eq('claim_id', gateClaimId)
      .eq('rolle', 'geschaedigter')
      .order('reihenfolge', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const personId = (party?.person_id as string | null) ?? null
    if (!personId) {
      return {
        success: false,
        error: 'Kein verknuepfter Kunde (geschaedigter-Party ohne Person) — Feld kann nicht gesetzt werden.',
      }
    }
    const { error: pErr } = await admin.from('personen').update({ [personCol]: normalized }).eq('id', personId)
    if (pErr) return { success: false, error: pErr.message }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-49 Residual-Kanonisierung: halter_* leben kanonisch auf der ist_halter-claim_party ->
  // personen. v_claim_full.halter_* sourct genau diese Person (halter_p-LATERAL: ist_halter=true,
  // reihenfolge/created_at). Der Inline-Edit schrieb bisher faelle.halter_* (reader-frei -> der Edit
  // versickerte = gebrochenes Feld) -> jetzt auf personen routen. Konsistent mit ocr-trigger (#3047,
  // das halter_geburtsdatum bereits dorthin schreibt). Admin-Client: canEditField() hat oben autorisiert.
  const HALTER_PERSON_COL: Record<string, string> = {
    halter_vorname: 'vorname',
    halter_nachname: 'nachname',
    halter_strasse: 'adresse_strasse',
    halter_plz: 'adresse_plz',
    halter_stadt: 'adresse_ort',
    halter_email: 'email',
    halter_telefon: 'telefon',
    halter_geburtsdatum: 'geburtsdatum',
  }
  const halterPersonCol = HALTER_PERSON_COL[field]
  if (halterPersonCol) {
    const admin = createAdminClient()
    const { data: party } = await admin
      .from('claim_parties')
      .select('person_id')
      .eq('claim_id', gateClaimId)
      .eq('ist_halter', true)
      .order('reihenfolge', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const personId = (party?.person_id as string | null) ?? null
    if (!personId) {
      return {
        success: false,
        error: 'Kein Halter mit verknuepfter Person — Feld kann nicht gesetzt werden.',
      }
    }
    const { error: pErr } = await admin.from('personen').update({ [halterPersonCol]: normalized }).eq('id', personId)
    if (pErr) return { success: false, error: pErr.message }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-49 Residual: ist_fahrzeughalter ("Halter = Kunde?") = das ist_halter-Flag der
  // geschaedigter-Party. v_faelle/v_claim_full lesen cp_g.ist_halter (rolle='geschaedigter').
  // Der Inline-Edit schrieb bisher faelle.ist_fahrzeughalter (reader-frei -> versickert) ->
  // jetzt auf die Party. normalized ist hier bereits via coerceJaNein ein boolean.
  // Selektion == cp_g (geschaedigter, reihenfolge/created_at wie KUNDE_PERSON_COL).
  if (field === 'ist_fahrzeughalter') {
    const admin = createAdminClient()
    const { data: party } = await admin
      .from('claim_parties')
      .select('id')
      .eq('claim_id', gateClaimId)
      .eq('rolle', 'geschaedigter')
      .order('reihenfolge', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const partyId = (party?.id as string | null) ?? null
    if (!partyId) {
      return { success: false, error: 'Keine geschaedigter-Party — "Halter = Kunde?" kann nicht gesetzt werden.' }
    }
    const { error: upErr } = await admin
      .from('claim_parties')
      .update({ ist_halter: normalized })
      .eq('id', partyId)
    if (upErr) return { success: false, error: upErr.message }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-49 Tier-2: gegner_versicherungsnummer/gegner_schadennummer leben in der
  // verursacher-claim_party (versicherungsnummer/versicherungs_aktenzeichen, SSoT).
  // v_claim_full sourct sie von dort (gp-LATERAL, #3004); ein Inline-Edit muss die
  // verursacher-Party schreiben — sonst maskiert die party-first-Sicht den Edit (er
  // landete sonst auf claims.gegner_*, das nach dem Cutover niemand mehr liest).
  // Anders als kunde_*: meist existiert noch KEINE verursacher-Party (1/84) -> on-demand
  // anlegen (Option A, volle Kanonisierung). Selektion == v_claim_full.gp (reihenfolge, created_at).
  // Admin-Client: canEditField() hat oben bereits autorisiert.
  const GEGNER_PARTY_COL: Record<string, string> = {
    gegner_versicherungsnummer: 'versicherungsnummer',
    gegner_schadennummer: 'versicherungs_aktenzeichen',
    // CMM-49 Residual-Kanonisierung: gegner_kennzeichen / gegner_versicherung (Freitext) /
    // gegner_fahrzeugtyp leben kanonisch auf der verursacher-Party. v_claim_full liest:
    //   gegner_kennzeichen  = COALESCE(gveh.kennzeichen_aktuell, gp.kennzeichen)
    //   gegner_versicherung = COALESCE(gv.name, gp.versicherung_klartext)   [gv via claims.gegner_versicherung_id]
    //   gegner_fahrzeugtyp  = COALESCE(gveh.bauart, gp.fahrzeugtyp_klartext)
    // -> die Freitext-Edits auf die Party-Spalten routen (sonst versickern sie reader-frei auf
    // faelle.gegner_*). gegner_versicherung_id (FK auf versicherungen) bleibt claims-owned (CLUSTER-Map).
    gegner_kennzeichen: 'kennzeichen',
    gegner_versicherung: 'versicherung_klartext',
    gegner_fahrzeugtyp: 'fahrzeugtyp_klartext',
  }
  const gegnerCol = GEGNER_PARTY_COL[field]
  if (gegnerCol) {
    const admin = createAdminClient()
    const found = await findVerursacherParty(admin, gateClaimId)
    if (!found.ok) return { success: false, error: found.error }
    if (found.party) {
      const { error: upErr } = await admin
        .from('claim_parties')
        .update({ [gegnerCol]: normalized })
        .eq('id', found.party.id)
      if (upErr) return { success: false, error: upErr.message }
    } else if (normalized != null) {
      // Option A: keine verursacher-Party vorhanden -> on-demand anlegen (kanonisches Home; quelle
      // 'manuell_kb' = KB/Admin-Edit, claim_parties_quelle_check-konform via insertVerursacherParty).
      const ins = await insertVerursacherParty(admin, gateClaimId, 'manuell_kb', { [gegnerCol]: normalized })
      if (!ins.ok) return { success: false, error: ins.error }
    }
    // normalized == null && keine Party: No-op (keine leere verursacher-Party anlegen).
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-49 Residual: gegner_name lebt kanonisch auf der verursacher-Party -> firmen.name ODER
  // personen.vorname/nachname. v_claim_full/v_faelle lesen COALESCE(gf.name, gpp.vorname||gpp.nachname).
  // Freitext-Name -> Firma (wenn die Party eine firma_id hat — sonst maskiert gf.name den Person-Edit),
  // sonst Person (split). Bisher faelle.gegner_name (reader-frei -> versickert). splitPersonName =
  // reine, getestete lib-Funktion. Selektion == gp/vp_g (verursacher, reihenfolge/created_at).
  if (field === 'gegner_name') {
    const admin = createAdminClient()
    const found = await findVerursacherParty(admin, gateClaimId)
    if (!found.ok) return { success: false, error: found.error }
    const party = found.party
    const firmaId = party?.firma_id ?? null
    if (firmaId) {
      const { error } = await admin.from('firmen').update({ name: normalized }).eq('id', firmaId)
      if (error) return { success: false, error: error.message }
      revalidatePath(`/faelle/${fallId}`)
      return { success: true }
    }
    const { vorname, nachname } = splitPersonName(normalized as string | null)
    const personId = party?.person_id ?? null
    if (personId) {
      const { error } = await admin.from('personen').update({ vorname, nachname }).eq('id', personId)
      if (error) return { success: false, error: error.message }
    } else if (normalized != null) {
      // Keine Person an der Party -> on-demand anlegen (userId=null => immer neue Person, kein Auto-Merge).
      const ensured = await ensurePersonForData({ db: admin, userId: null, snapshot: { vorname, nachname } })
      if (!ensured.ok) return { success: false, error: ensured.error }
      if (ensured.personId) {
        if (party?.id) {
          const { error: linkErr } = await admin
            .from('claim_parties')
            .update({ person_id: ensured.personId })
            .eq('id', party.id)
          if (linkErr) return { success: false, error: linkErr.message }
        } else {
          // Keine verursacher-Party -> mit Person anlegen (kanonische Defaults via Helper).
          const ins = await insertVerursacherParty(admin, gateClaimId, 'manuell_kb', { person_id: ensured.personId })
          if (!ins.ok) return { success: false, error: ins.error }
        }
      }
    }
    // normalized == null && keine Person: No-op (nichts zu loeschen).
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-49 Vehicle-Tier: Fahrzeug-Stammdaten leben kanonisch auf vehicles (via claims.vehicle_id).
  // v_claim_full sourct sie aus dem veh-LATERAL (z.B. fahrzeug_baujahr = EXTRACT(year FROM
  // veh.baujahr_monat)); der Inline-Edit schrieb bisher faelle.* (reader-frei -> versickerte).
  // ensureVehicleForClaim resolved/erzeugt das claim-Fahrzeug; FALL_VEHICLE_COL + fallVehicleWriteValue
  // (reine, getestete lib-Funktion) liefern Zielspalte + Transform. Admin-Client: canEditField()
  // hat oben bereits autorisiert.
  const vehicleCol = FALL_VEHICLE_COL[field]
  if (vehicleCol) {
    const admin = createAdminClient()
    const ensured = await ensureVehicleForClaim({ claimId: gateClaimId, db: admin })
    if (!ensured.ok) return { success: false, error: ensured.error }
    const wv = fallVehicleWriteValue(field, normalized)
    if (!wv.ok) return { success: false, error: wv.error }
    const { error: vErr } = await admin
      .from('vehicles')
      .update({ [vehicleCol]: wv.value })
      .eq('id', ensured.vehicleId)
    if (vErr) return { success: false, error: vErr.message }
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
  const claimId = gateClaimId

  // CMM-44 SP-A2: Semantik-Duplikat-Felder (anderer claims-Name) direkt mit dem
  // neuen Spaltennamen auf claims schreiben. splitOrKeepFaelleUpdate kann das
  // nicht (gleichnamig-Annahme). Cluster 1 (PR1a) = Schadenort + Datum,
  // Cluster 2 (PR1b) = Hergang/Art/Typ/Flags, Cluster 3 (PR1c) = Rest
  // (gegner_schadennummer/regulierung_betrag in der Allowlist) — alle Maps
  // liefern denselben { faelle/UI-Name: claimsSpalte }-Shape, gleicher Pfad.
  // Payment-Ledger Phase 3 (Collapse): die Auszahlungs-Felder der AuszahlungSection
  // schreiben NUR noch den (claim_id, partei)-Ledger — kein claims-Cache mehr.
  // auszahlung_gutachter_betrag (sv-Ist) ergaenzt: war zuvor cache-only OHNE Ledger-Writer
  // (Normalisierungs-Luecke, 0 prod-Daten) -> jetzt symmetrisch zu auszahlung_kunde_betrag.
  // gutachter_honorar (Soll) laeuft weiter ueber GUTACHTEN_FIELD_MAP.
  const auszahlungLedger = {
    auszahlung_kunde_betrag:             { partei: 'kunde' as const, betrag: true  },
    auszahlung_kunde_eingegangen_am:     { partei: 'kunde' as const, betrag: false },
    auszahlung_gutachter_betrag:         { partei: 'sv' as const,    betrag: true  },
    auszahlung_gutachter_eingegangen_am: { partei: 'sv' as const,    betrag: false },
  }[field]
  if (auszahlungLedger) {
    if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
    const cpFields: ClaimPaymentFields = auszahlungLedger.betrag
      ? { erhaltener_betrag: normalized as number | null }
      : { zahlungseingang_am: normalized as string | null }
    const cpRes = await upsertClaimPayment(createAdminClient(), claimId, auszahlungLedger.partei, cpFields)
    if (!cpRes.ok) return { success: false, error: cpRes.error ?? 'claim_payments Update fehlgeschlagen' }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

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

  // CMM-44 SP-I3 (+SP-I2): kanzlei_faelle-Spalten (1:1 pro Claim, z.B. kuerzungs_betrag,
  // vs_kuerzung_grund) leben auf kanzlei_faelle — NICHT faelle (Reader lesen sie seit SP-I3
  // von dort). canEditField() hat autorisiert -> upsertKanzleiFall via Admin-Client.
  if ((KANZLEI_FAELLE_COLS as readonly string[]).includes(field)) {
    if (!claimId) return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
    const kfRes = await upsertKanzleiFall(createAdminClient(), claimId, { [field]: normalized })
    if (!kfRes.ok) return { success: false, error: kfRes.error ?? 'kanzlei_faelle Update fehlgeschlagen' }
    revalidatePath(`/faelle/${fallId}`)
    return { success: true }
  }

  // CMM-49 Phase 2b: updated_at NICHT mehr mitschreiben — trigger-redundant
  // (update_faelle_updated_at) + reader-frei. So feuert der faelle-Write nur noch
  // fuer echte faelle-only-Felder; CLAIM_OWNED-Felder gehen ohne faelle-Write auf claims.
  // CMM-49 faelle-DROP: faelle ist gedroppt — nur noch der claims-Anteil wird geschrieben.
  // Das faelleUpdate-Residual (noch nicht ent-routete Entity-Felder: halter_*/vehicle_*/
  // gegner_name/besichtigungsort_*/vorschaeden) war schon vor dem DROP reader-frei (0 Views
  // lesen faelle; Display liest Entities/v_claim_full) — das Inline-Editing dieser Felder ist
  // bereits heute ein No-op. Die kanonische Ent-Routung (HALTER_PERSON_COL etc. / Vehicle-Tier)
  // ist ein eigener CMM-49-Schritt und kein DROP-Blocker.
  const { claimsUpdate } = splitOrKeepFaelleUpdate(
    { [field]: normalized },
    claimId,
  )

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
  // CMM-49 PURE_BRIDGE: fall_id->claim_id via resolveClaimId (bridge-basiert, faelle-Drop-sicher).
  const claimId = await resolveClaimId(supabase, fallId)
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

  // CMM-50 Phase-B (Write-Retire): Die FIN gehoert auf vehicles (SSoT) — KEIN faelle.fin_vin-Write
  // mehr. Alle Reader lesen via v_claim_full aus vehicles (Reader-Migration #2836/#2842 live). Die
  // vehicles-Anlage ist damit der PRIMAERE, kritische Persistenz-Write (vorher non-critical neben
  // dem faelle.update) — schlaegt er fehl, ist die FIN nirgends gespeichert => Form-Fehler statt
  // stillem Verlust. Snapshot aus dem existierenden Fahrzeug (vcf, vehicles-sourced); finQuelle/-Am
  // literal 'manuell'/now (manuelle Eingabe). v_claim_full.id == claim_id, .fall_id == faelle.id.
  try {
    const admin = createAdminClient()
    const { data: snap } = await admin
      .from('v_claim_full')
      .select('id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, hsn, tsn, kilometerstand, fahrzeug_typ, fahrzeug_baujahr, fahrzeug_farbe, lackfarbe_code, erstzulassung, fahrzeug_ausstattung, kennzeichen_buchstaben')
      .eq('fall_id', fallId)
      .single()
    const fr = snap as Record<string, unknown> | null
    const claimId = (fr?.id as string | null) ?? null
    const veh = await ensureVehicleFromFin({
      fin: cleaned,
      snapshot: {
        kennzeichen: (fr?.kennzeichen as string | null) ?? null,
        hersteller: (fr?.fahrzeug_hersteller as string | null) ?? null,
        modell: (fr?.fahrzeug_modell as string | null) ?? null,
        hsn: (fr?.hsn as string | null) ?? null,
        tsn: (fr?.tsn as string | null) ?? null,
        kilometerstand: (fr?.kilometerstand as number | null) ?? null,
        // CMM-50.1: Snapshot-Restfelder — jetzt aus vehicles (vcf)
        kennzeichenBuchstaben: (fr?.kennzeichen_buchstaben as string | null) ?? null,
        farbe: (fr?.fahrzeug_farbe as string | null) ?? null,
        farbcode: (fr?.lackfarbe_code as string | null) ?? null,
        bauart: (fr?.fahrzeug_typ as string | null) ?? null,
        baujahr: (fr?.fahrzeug_baujahr as number | null) ?? null,
        erstzulassung: (fr?.erstzulassung as string | null) ?? null,
        ausstattung: fr?.fahrzeug_ausstattung ?? null,
        finQuelle: 'manuell',
        finExtrahiertAm: new Date().toISOString(),
      },
      db: admin,
    })
    if (!veh.ok) return { success: false, error: veh.error ?? 'Fahrzeug konnte nicht gespeichert werden' }
    if (claimId) await admin.from('claims').update({ vehicle_id: veh.vehicleId }).eq('id', claimId)
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Fahrzeug-Speicherung fehlgeschlagen' }
  }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'FIN manuell eingegeben',
    beschreibung: `FIN/VIN: ${cleaned}`,
    erstellt_von: user.id,
  })

  // Cardentity-Enrich feuert NICHT mehr automatisch bei manueller FIN-Eingabe —
  // kostenpflichtiger Abruf ist manuell ueber den Cardentity-Button abrufbar
  // (2026-05-31). Die vehicles-Anlage oben (ensureVehicleFromFin) bleibt gratis.
  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}
