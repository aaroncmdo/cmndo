// AAR-128: Zentrales Mapping von Lead-Feldern zu Fall-Feldern.
//
// CMM-3 (Phase 0.5): TEILWEISE DEPRECATED. Die Lead → Fall Mapping-Logik
// wird intern von `convertLeadToClaim` (src/lib/leads/convert-lead-to-claim.ts)
// noch wiederverwendet, weil die `faelle`-Tabelle bis Phase 6 weiterhin mit
// allen Schadensdaten gefüllt werden muss (das Frontend liest sie noch).
// In Phase 6 wird diese Datei zusammen mit allen `faelle`-Schadensdaten-
// Spalten gelöscht und die Mapping-Logik bleibt nur in convertLeadToClaim
// für `claims` und Sub-Entities übrig.
//
// Single Source of Truth für das Lead→Fall-Mapping in signSAandCreateFall.
// Wenn du ein neues Feld in `leads` hinzufügst das beim Fall-Erzeugen
// kopiert werden soll, ergänze es HIER — nicht inline in actions.ts.
//
// Menschen-lesbare Doku: ../../docs/lead-fall-handoff-mapping.md (AAR-584 C1).
// Diese enthält alle 5 Kategorien als Tabelle inkl. Defaults, Renames,
// Transforms, Computed-Felder, Entity-Resolver und Lead-only/Fallakte-only
// Abgrenzung. Bei Code-Änderung hier → die Doku parallel nachziehen.
//
// Vier Kategorien:
//   1. DIRECT_FIELDS         — Feldname identisch in leads + faelle, kein Default,
//                               wird übernommen wenn Lead-Wert !== undefined ist
//   2. DEFAULT_FIELDS        — Feldname identisch, aber mit explizitem Default für
//                               NOT-NULL-Spalten (z.B. gegner_bekannt: true)
//   3. RENAMED_FIELDS        — Fall-Spalte heißt anders als Lead-Spalte
//                               (z.B. faelle.schadens_datum ← leads.unfalldatum)
//   4. TRANSFORM_FIELDS      — Wert wird vor Übernahme transformiert
//                               (z.B. kilometerstand → Number())
//
// FALL_COMPUTED_FIELDS liefert konstante / option-basierte Werte
// (fall_nummer, status, sv_id, kundenbetreuer_id usw.).

export type LeadRow = Record<string, unknown>

// ─── 1. DIRECT — Feldname gleich, lead[field] ?? null ───────────────────────
export const LEAD_TO_FALL_DIRECT_FIELDS = [
  // CMM-44 SP-A: kunden_konstellation, spezifikation, unfall_konstellation
  // sind DUP-Spalten — werden nur noch in claims geschrieben (convertLeadToClaim).
  // CMM-44 SP-A2 (Cluster 2): schadens_fall_typ + schadens_art sind Semantik-
  // Duplikate — claims.fall_typ / claims.schadenart sind SSoT (convertLeadToClaim
  // schreibt sie dort). Aus der faelle-COPY-Liste entfernt.
  // KFZ-153 Unfall + Gegner Detaildaten
  'gegner_anzahl_beteiligte',
  'gegner_fahrzeugtyp',
  // Fahrzeug
  'kennzeichen', 'kennzeichen_kreis', 'kennzeichen_buchstaben', 'kennzeichen_zahl', 'kennzeichen_suffix',
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'fahrzeug_farbe',
  'lackfarbe_code',
  'erstzulassung',
  // AAR-181: Baujahr wird jetzt in Phase 4 als Pflichtfeld erfasst und muss
  // beim Fall-Erstellen übernommen werden
  'fahrzeug_baujahr',
  // AAR-576 (A2): HSN/TSN aus ZB1-OCR — DAT-API-Blocker. Gleicher Spaltenname
  // in leads + faelle.
  'hsn',
  'tsn',
  // Gegner
  'gegner_name',
  'gegner_versicherung',
  // CMM-44 SP-A: gegner_versicherung_id ist DUP-Spalte — nur noch in claims.
  'gegner_kennzeichen',
  // Hergang
  // CMM-44 SP-A2 (Cluster 2): unfallhergang + schadens_hergang sind Semantik-
  // Duplikate — claims.hergang_kunde_text ist SSoT (convertLeadToClaim schreibt
  // dort, Kollision A: beide fallen auf dieselbe claims-Spalte zusammen).
  // CMM-44 SP-A: polizei_aktenzeichen + polizei_vor_ort sind DUP-Spalten — nur claims.
  // CMM-44 SP-A2 (Cluster 1): unfallort_kategorie ist Semantik-Duplikat —
  // claims.schadenort_kategorie ist SSoT (convertLeadToClaim schreibt dort).
  // BUG-73 Schadens-Detaildaten
  // AAR-548 D4 / AAR-Stufe-0 14.05.2026: leads.schadensursache + leads.firma_ustid
  // wurden gedropped — Coverage 0, keine Writer, keine Funktion.
  'firma_name',
  // AAR-548 D7: halter_name ist GENERATED aus halter_vorname + halter_nachname —
  // kein manueller Write mehr. Die Einzelfelder werden weiter unten gemappt.
  'wunschtermin',
  'source_channel',
  'source_domain',
  // KFZ-208 Mandantenfragebogen-Detaildaten
  // (schadens_hergang siehe Hergang-Block oben — CMM-44 SP-A2 entfernt)
  'halter_vorname',
  'halter_nachname',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'halter_telefon',
  'halter_email',
  // CMM-44 SP-A: finanzierungsgeber_name/_adresse/_vertragsnr sind DUP-Spalten — nur claims.
  // KFZ-202 Vorschäden
  'vorschaeden_beschreibung',
  // CMM-44 SP-A: zeugen_kontakte ist DUP-Spalte — nur claims.
  // AAR-305 Werkstatt-seit-wann + fahrzeug_fahrbereit für Dispatch-Banner
  'werkstatt_seit_datum',
  'fahrzeug_fahrbereit',
  // AAR-318: Halter-Geburtsdatum (Vor-/Nachname/Adresse sind oben schon)
  'halter_geburtsdatum',
  // AAR-314: Deutsche Büro Grüne Karte — Anfrage-Datum bei Auslandskennzeichen
  'gegner_versicherung_anfrage_datum',
  // AAR-316: Kundensprache — wird auch an flow_links.sprache weitergereicht
  'sprache',
  // CMM-44 SP-A: unfallskizze_svg/_url/_ablehnung_grund/_generiert_am/_bestaetigt
  // sowie sachschaden_beschreibung sind DUP-Spalten — nur noch in claims.
  // AAR-575 (A1): Kunde-Anschrift retten, wenn Kunde ≠ Halter.
  // Gleicher Spaltenname in leads + faelle — Lead-Converter füllt sie nur,
  // wenn `ist_fahrzeughalter=false` im Lead gesetzt war (bei Halter=Kunde
  // bleiben die Felder null, weil lead.kunde_* dann auch null ist).
  'kunde_strasse',
  'kunde_plz',
  'kunde_stadt',
  'kunde_adresse',
  'kunde_lat',
  'kunde_lng',
  // AAR-581 (N4): Besichtigungsort ist strukturiert (Adresse + Koordinaten +
  // Google-place_id) statt vorher `sv_treffpunkt`-Freitext. Gleicher Spaltenname
  // in leads + faelle — wird direkt beim Fall-Erzeugen übernommen.
  'besichtigungsort_adresse',
  'besichtigungsort_lat',
  'besichtigungsort_lng',
  'besichtigungsort_place_id',
  'besichtigungsort_notiz',
  // CMM-48 (15.05.2026): Dispatch-Qualifizierungs-Felder, die bis zur Mini-PR
  // ausschließlich der Legacy-Pfad `convertLeadToFall` geschrieben hat.
  // CMM-44 SP-A: fahrerflucht, auslandskennzeichen, polizeibericht_status sind
  // DUP-Spalten — nur noch in claims (convertLeadToClaim).
  // CMM-44 SP-A2 (Cluster 1): unfall_uhrzeit, unfallort_lat, unfallort_lng sind
  // Semantik-Duplikate — claims.schadenzeit / schadenort_lat / schadenort_lng
  // sind SSoT (convertLeadToClaim schreibt dort).
  // CMM-44 SP-A2 (Cluster 2): nutzungsausfall ist Semantik-Duplikat —
  // claims.hat_nutzungsausfall ist SSoT (convertLeadToClaim schreibt dort).
  'bkat_unfallart',
  'fahrzeugschaden_beschreibung',
  'zb1_status',
] as const

// ─── 2. DEFAULT — Feldname gleich, NOT-NULL fallback ────────────────────────
export const LEAD_TO_FALL_DEFAULT_FIELDS: Record<string, unknown> = {
  // CMM-44 SP-A: gegner_bekannt, gewerbe_flag, finanzierung_leasing,
  // vorsteuerabzugsberechtigt, unfallskizze_bestaetigt sind DUP-Spalten —
  // nur noch in claims (convertLeadToClaim setzt Defaults dort).
  // CMM-44 SP-A2 (Cluster 2): personenschaden_flag, sachschaden_flag,
  // mietwagen_flag, nutzungsausfall, halter_ungleich_fahrer_flag sind
  // Semantik-Duplikate — claims.hat_personenschaden / hat_sachschaden /
  // hat_mietwagen / hat_nutzungsausfall / halter_ungleich_fahrer sind SSoT
  // (convertLeadToClaim setzt die Defaults dort). Aus der faelle-Map entfernt.
  // KFZ-208
  ist_fahrzeughalter: true,
  // KFZ-202
  hat_vorschaeden: false,
  // AAR-321/322 Audit-Fix: zeugen_vorhanden wird beim Fall-Anlegen vom Lead
  // übernommen — essenziell, weil die Katalog-Rule für `zeugenbericht` auf
  // fall.zeugen_vorhanden ODER lead.zeugen_vorhanden schaut. Ohne Mapping
  // bliebe der zeugenbericht-Slot nie freigeschaltet.
  zeugen_vorhanden: false,
}

// ─── 3. RENAMED — Fall-Spalte ≠ Lead-Spalte ────────────────────────────────
// Format: { fallSpalte: leadSpalte } — übernimmt mit `?? null`
export const LEAD_TO_FALL_RENAMED_FIELDS: Record<string, string> = {
  // BUG-58: Spalten die in faelle anders heißen
  leasinggeber_name: 'leasing_geber',
  bank_name: 'finanzierung_bank',
  // AAR-Stufe-0 (14.05.2026): ust_id (← firma_ustid) und schadens_ursache
  // (← schadensursache) gedropped vom Mapping. leads.firma_ustid +
  // leads.schadensursache existieren nicht mehr (Coverage 0, keine Writer).
  // CMM-44 SP-A2 (Cluster 1): schadens_datum/_adresse/_plz/_ort sind
  // Semantik-Duplikat-Spalten — claims ist SSoT (claims.schadentag /
  // schadenort_adresse/_plz/_ort). convertLeadToClaim schreibt sie dort;
  // der faelle-Insert (buildFallInsertFromLead) befuellt sie nicht mehr.
  fin_vin: 'fin',
  // AAR-575 (A1): Kunden-Identität wird auf Lead in `vorname/nachname/email/
  // telefon` geführt (dort unabhängig von `ist_fahrzeughalter`); in faelle
  // prefixen wir mit `kunde_` um sie klar von halter_* abzugrenzen.
  kunde_vorname: 'vorname',
  kunde_nachname: 'nachname',
  // CMM-44 SP-A: kunde_email ist DUP-Spalte — nur noch in claims.
  kunde_telefon: 'telefon',
}

// ─── 3b. RENAMED + DEFAULT — Fall-Spalte ≠ Lead-Spalte mit NOT-NULL-Fallback
// Format: { fallSpalte: { leadField, default } }
// CMM-44 SP-A: polizei_bericht_vorhanden ist DUP-Spalte — nur noch in claims
// (convertLeadToClaim setzt polizei_bericht_vorhanden aus leads.polizeibericht_pflicht).
// Aktuell leer; bleibt als Erweiterungspunkt für faelle-eigene Renamed-Defaults.
export const LEAD_TO_FALL_RENAMED_DEFAULT_FIELDS: Record<
  string,
  { leadField: string; default: unknown }
> = {}

// ─── 4. TRANSFORM — Wert wird konvertiert ──────────────────────────────────
export const LEAD_TO_FALL_TRANSFORM_FIELDS: Record<
  string,
  { leadField: string; transform: (v: unknown) => unknown }
> = {
  kilometerstand: {
    leadField: 'kilometerstand',
    transform: (v) => (v ? Number(v) : null),
  },
}

// ─── 5. COMPUTED — option-basierte / konstante Werte ───────────────────────
export type BuildFallOptions = {
  // CMM-44 SP-A3: fallNummer entfernt — claims.claim_nummer ist kanonisch,
  // vom DB-Trigger set_claim_nummer befuellt; faelle.fall_nummer wird nicht
  // mehr geschrieben.
  kundenbetreuerId: string | null
  svIdFromTermin: string | null
  signatureUrl: string
  // AAR-155: Entity-FK-IDs, resolved via resolveFallEntityFks() BEVOR
  // buildFallInsertFromLead synchron aufgerufen wird.
  kanzleiId?: string | null
  organisationId?: string | null
  dispatchId?: string | null
}

export function fallComputedFields(lead: LeadRow, options: BuildFallOptions): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    // CMM-44 SP-A3: fall_nummer aus dem faelle-Insert entfernt.
    lead_id: lead.id,
    status: options.svIdFromTermin ? 'sv-termin' : 'ersterfassung',
    sv_id: options.svIdFromTermin,
    sv_zugewiesen_am: options.svIdFromTermin ? now : null,
    // AAR-552: gutachter_termin_status und sv_termin ersatzlos entfernt —
    // spiegelt die View v_faelle_mit_aktuellem_termin aus gutachter_termine.
    // KFZ-192: service_typ aus Lead kopieren
    service_typ: lead.service_typ ?? 'komplett',
    // CMM-44 SP-A: kundenbetreuer_id ist DUP-Spalte — nur noch in claims
    // (convertLeadToClaim setzt claims.kundenbetreuer_id). options.kundenbetreuerId
    // wird weiterhin durchgereicht (Caller braucht ihn fuer claims + Side-Effects).
    konvertiert_am: now,
    // CMM-44 SP-A2 (Cluster 3): konvertiert_von_lead aus dem faelle-Insert
    // entfernt — die Lead-Konversions-Verknuepfung ist claims.lead_id (SSoT),
    // convertLeadToClaim setzt sie bereits (claims-Insert). Kein Write verloren.
    abtretung_pdf: options.signatureUrl,
    abtretung_signiert_am: now,
    sa_unterschrieben: true,
    // AAR-607 A1: Timestamp war NULL → Subphase-Resolver + Automations-Trigger
    // die auf sa_unterschrieben_am warten, haben nie gefeuert.
    sa_unterschrieben_am: now,
    // AAR-155: Entity-FKs — resolveFallEntityFks() muss vorher laufen.
    // Bei Lookup-Miss bleibt der Wert null (nicht-blockierend).
    // CMM-44 SP-A: gegner_versicherung_id ist DUP-Spalte und wird nur noch in
    // claims geschrieben; der Fuzzy-Match-Fallback lebt in convert-lead-to-claim.ts.
    kanzlei_id: options.kanzleiId ?? null,
    organisation_id: options.organisationId ?? null,
    dispatch_id: options.dispatchId ?? null,
  }
}

// ─── 6. ENTITY-RESOLVER (AAR-155) ──────────────────────────────────────────
// Löst die 4 FK-IDs für den Fall auf: Versicherung (Fuzzy-Match auf
// gegner_versicherung), Kanzlei (bei Pfad A = LexDrive), Organisation
// (via SV-Mitgliedschaft), Dispatcher (lead.zugewiesen_an oder Fallback).
// Non-blocking: jeder Miss → null.
// Der admin-Parameter ist bewusst `any` — Supabase-Client-Generics sind bei
// Lookup-Queries über mehrere Tabellen schwer exakt zu typen (TS2589); die
// Resolver-Funktion ist klein, try/catch-umhüllt und die Rückgabewerte sind
// strikt getypt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export async function resolveFallEntityFks(
  admin: AdminClient,
  lead: LeadRow,
  svIdFromTermin: string | null,
): Promise<{
  gegnerVersicherungId: string | null
  kanzleiId: string | null
  organisationId: string | null
  dispatchId: string | null
}> {
  const gegnerVs = typeof lead.gegner_versicherung === 'string' ? lead.gegner_versicherung.trim() : ''
  const serviceTyp = typeof lead.service_typ === 'string' ? lead.service_typ : 'komplett'
  const zugewiesenAn = typeof lead.zugewiesen_an === 'string' ? lead.zugewiesen_an : null

  // 1. Versicherung — Fuzzy ILIKE-Match auf Namen (erste Treffer gewinnt).
  // Spec fordert „Fuzzy-Match" — wir nutzen ILIKE %pattern% weil die
  // versicherungen-Tabelle kurze Kanonische Namen hat (z.B. „Allianz",
  // „HUK-Coburg") und der Dispatcher oft nur „allianz" tippt.
  // AAR-155 Audit-Fix #4: LIKE-Wildcards im User-Input escapen damit
  // „Allianz % Co" nicht als Pattern sondern als Literal gesucht wird.
  let gegnerVersicherungId: string | null = null
  if (gegnerVs.length >= 3) {
    try {
      const escaped = gegnerVs.replace(/[\\%_]/g, '\\$&')
      const { data } = await admin
        .from('versicherungen')
        .select('id, name')
        .ilike('name', `%${escaped}%`)
        .limit(1)
        .maybeSingle()
      gegnerVersicherungId = data?.id ?? null
      if (!gegnerVersicherungId) {
        console.warn('[AAR-155] Gegner-Versicherung nicht gefunden:', gegnerVs)
      }
    } catch { /* non-blocking */ }
  }

  // 2. Kanzlei — bei Pfad A (Komplett) LexDrive zuweisen. Wir suchen per
  // ILIKE 'lexdrive%' damit wir keine Hardcoded-UUID pflegen müssen.
  let kanzleiId: string | null = null
  if (serviceTyp === 'komplett') {
    try {
      const { data } = await admin
        .from('kanzleien')
        .select('id, name')
        .ilike('name', 'LexDrive%')
        .limit(1)
        .maybeSingle()
      kanzleiId = data?.id ?? null
    } catch { /* non-blocking — falls Kanzleien-Tabelle leer */ }
  }

  // 3. Organisation — SV-Mitgliedschaft via sachverstaendige.organisation_id
  let organisationId: string | null = null
  if (svIdFromTermin) {
    try {
      const { data } = await admin
        .from('sachverstaendige')
        .select('organisation_id')
        .eq('id', svIdFromTermin)
        .maybeSingle()
      organisationId = (data as { organisation_id?: string | null } | null)?.organisation_id ?? null
    } catch { /* non-blocking */ }
  }

  // 4. Dispatcher — lead.zugewiesen_an (gesetzt vom Dispatcher bei
  // Qualifizierung) oder null. Wir setzen zugewiesen_an jetzt aus
  // sendFlowLinkMultiChannel automatisch.
  const dispatchId = zugewiesenAn

  return { gegnerVersicherungId, kanzleiId, organisationId, dispatchId }
}

/**
 * Baut das komplette Insert-Objekt für die `faelle`-Tabelle aus einem Lead.
 * Nutzung in `signSAandCreateFall`:
 *
 * ```ts
 * const fallInsert = buildFallInsertFromLead(lead, { kundenbetreuerId, svIdFromTermin, signatureUrl })
 * await admin.from('faelle').insert(fallInsert).select('id').single()
 * ```
 */
export function buildFallInsertFromLead(
  lead: LeadRow,
  options: BuildFallOptions,
): Record<string, unknown> {
  const insert: Record<string, unknown> = {
    ...fallComputedFields(lead, options),
  }

  // 1. DIRECT — lead[field] ?? null
  for (const field of LEAD_TO_FALL_DIRECT_FIELDS) {
    insert[field] = lead[field] ?? null
  }

  // 2. DEFAULT — lead[field] mit explizitem Fallback (NOT-NULL-Spalten)
  for (const [field, defaultValue] of Object.entries(LEAD_TO_FALL_DEFAULT_FIELDS)) {
    insert[field] = lead[field] ?? defaultValue
  }

  // 3. RENAMED — fallField ← lead[leadField] ?? null
  for (const [fallField, leadField] of Object.entries(LEAD_TO_FALL_RENAMED_FIELDS)) {
    insert[fallField] = lead[leadField] ?? null
  }

  // 3b. RENAMED + DEFAULT — fallField ← lead[leadField] ?? defaultValue
  for (const [fallField, cfg] of Object.entries(LEAD_TO_FALL_RENAMED_DEFAULT_FIELDS)) {
    insert[fallField] = lead[cfg.leadField] ?? cfg.default
  }

  // 4. TRANSFORM
  for (const [fallField, { leadField, transform }] of Object.entries(LEAD_TO_FALL_TRANSFORM_FIELDS)) {
    insert[fallField] = transform(lead[leadField])
  }

  // CMM-44 SP-A: gegner_versicherung_id ist DUP-Spalte und wird nicht mehr in
  // faelle geschrieben. Der Fuzzy-Match-Fallback (resolveFallEntityFks ->
  // options.gegnerVersicherungId) wird in convertLeadToClaim auf der claims-Seite
  // angewendet — siehe convert-lead-to-claim.ts.

  // Semantik-Fix 2026-04-21 (jetzt zentral, war vorher nur in convertLeadToFall):
  // Wenn lead.besichtigungsort_* leer ist, auf unfallort zurückfallen — Default-
  // Annahme „Auto steht am Unfallort". Der SV braucht eine Adresse für Navi,
  // ICS und Reminder; bevor der Dispatcher den Besichtigungsort setzt, ist
  // unfallort die einzige plausible Quelle.
  if (!insert.besichtigungsort_adresse) {
    insert.besichtigungsort_adresse = (lead.unfallort as string | null) ?? null
  }
  if (insert.besichtigungsort_lat == null) {
    insert.besichtigungsort_lat = (lead.unfallort_lat as number | null) ?? null
  }
  if (insert.besichtigungsort_lng == null) {
    insert.besichtigungsort_lng = (lead.unfallort_lng as number | null) ?? null
  }

  return insert
}
