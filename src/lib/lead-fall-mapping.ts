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
  // Gegner
  'gegner_name',
  'gegner_versicherung',
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
] as const

// ─── 2. DEFAULT — Feldname gleich, NOT-NULL fallback ────────────────────────
export const LEAD_TO_FALL_DEFAULT_FIELDS: Record<string, unknown> = {
  gegner_bekannt: true,
  personenschaden_flag: false,
  mietwagen_flag: false,
  leasing_flag: false,
  finanzierung_flag: false,
  gewerbe_flag: false,
  halter_ungleich_fahrer_flag: false,
  // KFZ-208
  ist_fahrzeughalter: true,
  finanzierung_leasing: 'keine',
  vorsteuerabzugsberechtigt: false,
  // KFZ-202
  hat_vorschaeden: false,
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
  }
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
