// AAR-128: Zentrales Mapping von Lead-Feldern zu Fall-Feldern.
//
// Single Source of Truth für das Lead→Fall-Mapping in signSAandCreateFall.
// Wenn du ein neues Feld in `leads` hinzufügst das beim Fall-Erzeugen
// kopiert werden soll, ergänze es HIER — nicht inline in actions.ts.
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
  'schadenfall_typ',
  'kunden_konstellation',
  // KFZ-154 Spezifikation + Schadenart für Dispatcher-Match
  'spezifikation',
  'schadenart',
  // KFZ-153 Unfall + Gegner Detaildaten
  'unfall_konstellation',
  'gegner_anzahl_beteiligte',
  'gegner_fahrzeugtyp',
  // Fahrzeug
  'kennzeichen',
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'fahrzeug_farbe',
  'erstzulassung',
  // AAR-181: Baujahr wird jetzt in Phase 4 als Pflichtfeld erfasst und muss
  // beim Fall-Erstellen übernommen werden
  'fahrzeug_baujahr',
  // Gegner
  'gegner_name',
  'gegner_versicherung',
  // AAR-265: FK auf versicherungen-Stammdaten — wird zusätzlich zum
  // Freitext-Namen kopiert. resolveFallEntityFks() bevorzugt diese FK
  // gegenüber dem ILIKE-Fuzzy-Match.
  'gegner_versicherung_id',
  'gegner_kennzeichen',
  // Hergang
  'unfallhergang',
  // BUG-73 / AAR-124 Polizei + Unfallort
  'polizei_aktenzeichen',
  'polizei_vor_ort',
  // AAR-128 Bonus: war im Original-Insert vergessen — exakt der Bug-Typ den
  // dieses Refactoring vermeiden soll. unfallort_kategorie existiert sowohl
  // auf leads als auch auf faelle.
  'unfallort_kategorie',
  // Hinweis: lead.unfallort wird via RENAMED-Mapping auf faelle.schadens_ort
  // geschrieben (BUG-73-Pattern). faelle.unfallort wird bewusst NICHT befüllt
  // — Original-signSAandCreateFall hat das auch nicht getan, vermutlich um
  // schadens_ort (für SV-Dispatch) und unfallort (für Hergangs-Doku) getrennt
  // zu halten. Wenn das geändert werden soll: eigenes Issue.
  // BUG-73 Schadens-Detaildaten
  'schadensursache',
  'firma_name',
  'halter_name',
  'wunschtermin',
  'source_channel',
  'source_domain',
  // KFZ-208 Mandantenfragebogen-Detaildaten
  'schadenhergang',
  'halter_vorname',
  'halter_nachname',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'halter_telefon',
  'halter_email',
  'finanzierungsgeber_name',
  'finanzierungsgeber_adresse',
  'finanzierungsgeber_vertragsnr',
  // KFZ-202 Vorschäden
  'vorschaeden_beschreibung',
  // AAR-298 Zeugen-Kontakte (JSONB-Array)
  'zeugen_kontakte',
  // AAR-305 Werkstatt-seit-wann + fahrzeug_fahrbereit für Dispatch-Banner
  'werkstatt_seit_datum',
  'fahrzeug_fahrbereit',
  // AAR-318: Halter-Geburtsdatum (Vor-/Nachname/Adresse sind oben schon)
  'halter_geburtsdatum',
  // AAR-314: Deutsche Büro Grüne Karte — Anfrage-Datum bei Auslandskennzeichen
  'gegner_versicherung_anfrage_datum',
  // AAR-316: Kundensprache — wird auch an flow_links.sprache weitergereicht
  'sprache',
  // AAR-317: Unfallskizze aus Phase 5 — SVG + Metadaten in den Fall übertragen.
  // bestaetigt lebt separat im DEFAULT_FIELDS-Block damit DB-Default `false`
  // nicht von ?? null überschrieben wird.
  'unfallskizze_svg',
  'unfallskizze_url',
  'unfallskizze_ablehnung_grund',
  'unfallskizze_generiert_am',
] as const

// ─── 2. DEFAULT — Feldname gleich, NOT-NULL fallback ────────────────────────
export const LEAD_TO_FALL_DEFAULT_FIELDS: Record<string, unknown> = {
  gegner_bekannt: true,
  personenschaden_flag: false,
  mietwagen_flag: false,
  // AAR-313: Nutzungsausfall war bisher nicht im Mapping — Lead-Flag verlor sich
  leasing_flag: false,
  nutzungsausfall: false,
  finanzierung_flag: false,
  gewerbe_flag: false,
  halter_ungleich_fahrer_flag: false,
  // KFZ-208
  ist_fahrzeughalter: true,
  finanzierung_leasing: 'keine',
  vorsteuerabzugsberechtigt: false,
  // KFZ-202
  hat_vorschaeden: false,
  // AAR-317 Audit-M2: Default false statt null — DB-Default matcht „nicht bestätigt"
  unfallskizze_bestaetigt: false,
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
  versicherung_name: 'eigene_versicherung',
  versicherung_schaden_nr: 'eigene_policennr',
  leasinggeber_name: 'leasing_geber',
  bank_name: 'finanzierung_bank',
  ust_id: 'firma_ustid',
  // BUG-73
  schadens_datum: 'unfalldatum',
  schadens_adresse: 'fahrzeug_standort_adresse',
  schadens_plz: 'fahrzeug_standort_plz',
  schadens_ort: 'unfallort',
  fin_vin: 'fin',
}

// ─── 3b. RENAMED + DEFAULT — Fall-Spalte ≠ Lead-Spalte mit NOT-NULL-Fallback
// Format: { fallSpalte: { leadField, default } }
export const LEAD_TO_FALL_RENAMED_DEFAULT_FIELDS: Record<
  string,
  { leadField: string; default: unknown }
> = {
  // semantisch fragwürdig (siehe AAR-127-Audit) — "vorhanden" wird mit "pflicht"
  // befüllt. Bestehende Befüllung beibehalten inkl. Default false (matcht
  // DB-Default + Original-signSAandCreateFall-Verhalten). Eigenes Cleanup-Issue.
  polizei_bericht_vorhanden: { leadField: 'polizeibericht_pflicht', default: false },
}

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
  fallNummer: string
  kundenbetreuerId: string | null
  svIdFromTermin: string | null
  signatureUrl: string
  // AAR-155: 4 Entity-FK-IDs, resolved via resolveFallEntityFks() BEVOR
  // buildFallInsertFromLead synchron aufgerufen wird.
  versicherungId?: string | null
  kanzleiId?: string | null
  organisationId?: string | null
  leadbearbeiterId?: string | null
}

export function fallComputedFields(lead: LeadRow, options: BuildFallOptions): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    fall_nummer: options.fallNummer,
    lead_id: lead.id,
    status: options.svIdFromTermin ? 'sv-termin' : 'ersterfassung',
    sv_id: options.svIdFromTermin,
    sv_zugewiesen_am: options.svIdFromTermin ? now : null,
    gutachter_termin_status: lead.gutachter_termin ? 'reserviert' : null,
    // KFZ-192: service_typ aus Lead kopieren
    service_typ: lead.service_typ ?? 'komplett',
    kundenbetreuer_id: options.kundenbetreuerId,
    konvertiert_am: now,
    konvertiert_von_lead: lead.id,
    sv_termin: lead.gutachter_termin,
    abtretung_pdf: options.signatureUrl,
    abtretung_signiert_am: now,
    sa_unterschrieben: true,
    // AAR-155: Entity-FKs — resolveFallEntityFks() muss vorher laufen.
    // Bei Lookup-Miss bleibt der Wert null (nicht-blockierend).
    versicherung_id: options.versicherungId ?? null,
    kanzlei_id: options.kanzleiId ?? null,
    organisation_id: options.organisationId ?? null,
    leadbearbeiter_id: options.leadbearbeiterId ?? null,
  }
}

// ─── 6. ENTITY-RESOLVER (AAR-155) ──────────────────────────────────────────
// Löst die 4 FK-IDs für den Fall auf: Versicherung (Fuzzy-Match auf
// gegner_versicherung), Kanzlei (bei Pfad A = LexDrive), Organisation
// (via SV-Mitgliedschaft), Leadbearbeiter (lead.zugewiesen_an oder Fallback).
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
  versicherungId: string | null
  kanzleiId: string | null
  organisationId: string | null
  leadbearbeiterId: string | null
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
  let versicherungId: string | null = null
  if (gegnerVs.length >= 3) {
    try {
      const escaped = gegnerVs.replace(/[\\%_]/g, '\\$&')
      const { data } = await admin
        .from('versicherungen')
        .select('id, name')
        .ilike('name', `%${escaped}%`)
        .limit(1)
        .maybeSingle()
      versicherungId = data?.id ?? null
      if (!versicherungId) {
        console.warn('[AAR-155] Versicherung nicht gefunden:', gegnerVs)
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

  // 4. Leadbearbeiter — lead.zugewiesen_an (gesetzt vom Dispatcher bei
  // Qualifizierung) oder null. Wir setzen zugewiesen_an jetzt aus
  // sendFlowLinkMultiChannel automatisch.
  const leadbearbeiterId = zugewiesenAn

  return { versicherungId, kanzleiId, organisationId, leadbearbeiterId }
}

/**
 * Baut das komplette Insert-Objekt für die `faelle`-Tabelle aus einem Lead.
 * Nutzung in `signSAandCreateFall`:
 *
 * ```ts
 * const fallInsert = buildFallInsertFromLead(lead, { fallNummer, kundenbetreuerId, svIdFromTermin, signatureUrl })
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

  return insert
}
