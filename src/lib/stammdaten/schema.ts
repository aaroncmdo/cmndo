// AAR-frontend-konsolidierung-p2 (P2-T4): Kanonische Stammdaten-Feld-Liste.
// Single Source für Label / Typ / Options / Hint / Sichtbarkeit aller Fall-
// Stammdaten-Felder. Konsumiert von shared/stammdaten/SchemaFields (Admin-Edit)
// + StammdatenReadSection + StammdatenDetail + (Folge) Phase4Stammdaten.
// Pure Daten + Typen — KEINE React/Tailwind-Importe (analog lib/statusLabels.ts).

export type StammdatenBlock =
  | 'kunde' | 'fahrzeug' | 'halter' | 'unfall' | 'gegner'
  | 'vorschaeden' | 'kernwerte' | 'besichtigung' | 'nutzungsausfall' | 'notizen'

export type StammdatenFieldType =
  | 'text' | 'email' | 'tel' | 'date' | 'time' | 'number' | 'textarea' | 'select'

export type StammdatenFieldDef = {
  block: StammdatenBlock
  /** DB-Spaltenname (= InlineEditField.fieldName). */
  key: string
  label: string
  type?: StammdatenFieldType
  /** Bei type='select' nötig. */
  options?: { value: string; label: string }[]
  hint?: string
  placeholder?: string
  /** Optionaler Eingabe-Transform (= InlineEditField.transform), z.B. Kennzeichen uppercase. */
  transform?: (raw: string) => string
  /** Im 2-Spalten-Grid über beide Spalten — entspricht dem <div className="sm:col-span-2"> in Sections.tsx. */
  fullWidth?: boolean
  /**
   * Liest den Anzeige-/Edit-Wert aus dem Fall-Objekt (+ optional Lead-Fallback,
   * + optional Claim-Fallback für CMM-Felder die noch nicht namens-synchron
   * zu faelle gespiegelt sind, siehe Sync-Trigger
   * `20260505134954_cmm_phase_1_5a_claims_faelle_sync_triggers.sql`).
   * Default wenn nicht gesetzt: `(fall) => fallToDisplay(fall[key])`.
   */
  getValue?: (
    fall: Record<string, unknown>,
    lead?: Record<string, unknown> | null,
    claim?: Record<string, unknown> | null,
  ) => string | number | null
  /** Feld nur rendern wenn true. Default: immer. */
  visibleWhen?: (fall: Record<string, unknown>) => boolean
}

/**
 * Default-Wert-Getter — spiegelt `f()` aus faelle/[id]/_stammdaten/Sections.tsx:
 * string|number durchreichen, Boolean → 'Ja'/'Nein' (sonst rendert InlineEditField
 * `"true"`/`"false"`), null bei leer.
 */
export function fallToDisplay(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein'
  return String(v)
}

const dateOnly = (v: unknown): string | null =>
  typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null

// CMM-32: Lackfarbe-Codes — steuern das Imagin-Render-Bild. Verbatim aus
// faelle/[id]/_stammdaten/Sections.tsx (FahrzeugdatenSection).
const LACKFARBE_OPTIONS: { value: string; label: string }[] = [
  { value: 'schwarz', label: 'Schwarz' },
  { value: 'weiss', label: 'Weiß' },
  { value: 'silber', label: 'Silber' },
  { value: 'grau', label: 'Grau' },
  { value: 'blau', label: 'Blau' },
  { value: 'rot', label: 'Rot' },
  { value: 'gruen', label: 'Grün' },
  { value: 'gelb', label: 'Gelb' },
  { value: 'orange', label: 'Orange' },
  { value: 'braun', label: 'Braun' },
  { value: 'beige', label: 'Beige' },
  { value: 'sonstige', label: 'Sonstige' },
]

export const STAMMDATEN_FIELD_SCHEMA: StammdatenFieldDef[] = [
  // ── Kundendaten ──────────────────────────────────────────────────────────
  {
    block: 'kunde', key: 'kunde_vorname', label: 'Vorname',
    getValue: (f, l) => (f.kunde_vorname as string | null) ?? (l?.vorname as string | null) ?? null,
  },
  {
    block: 'kunde', key: 'kunde_nachname', label: 'Nachname',
    getValue: (f, l) => (f.kunde_nachname as string | null) ?? (l?.nachname as string | null) ?? null,
  },
  {
    block: 'kunde', key: 'kunde_email', label: 'E-Mail',
    getValue: (f, l) => (f.kunde_email as string | null) ?? (l?.email as string | null) ?? null,
  },
  {
    block: 'kunde', key: 'kunde_telefon', label: 'Telefon',
    getValue: (f, l) => (f.kunde_telefon as string | null) ?? (l?.telefon as string | null) ?? null,
  },
  { block: 'kunde', key: 'kunde_strasse', label: 'Straße' },
  { block: 'kunde', key: 'kunde_plz', label: 'PLZ' },
  { block: 'kunde', key: 'kunde_stadt', label: 'Stadt' },
  {
    block: 'kunde', key: 'sprache',
    label: 'Sprache (de/tr/ar/ru/pl/en/other)',
    hint: 'AAR-316: Portal-Übersetzung',
  },

  // ── Fahrzeugdaten ────────────────────────────────────────────────────────
  { block: 'fahrzeug', key: 'kennzeichen', label: 'Kennzeichen' },
  { block: 'fahrzeug', key: 'fahrzeug_hersteller', label: 'Hersteller' },
  { block: 'fahrzeug', key: 'fahrzeug_modell', label: 'Modell' },
  { block: 'fahrzeug', key: 'fin_vin', label: 'FIN/VIN' },
  {
    block: 'fahrzeug', key: 'hsn', label: 'HSN', hint: 'AAR-576: DAT-API',
    getValue: (f, l) => (f.hsn as string | null) ?? (l?.hsn as string | null) ?? null,
  },
  {
    block: 'fahrzeug', key: 'tsn', label: 'TSN', hint: 'AAR-576: DAT-API',
    getValue: (f, l) => (f.tsn as string | null) ?? (l?.tsn as string | null) ?? null,
  },
  {
    block: 'fahrzeug', key: 'fahrzeug_baujahr', label: 'Baujahr *',
    type: 'number', hint: 'AAR-181: Pflichtfeld',
  },
  {
    block: 'fahrzeug', key: 'lackfarbe_code', label: 'Lackfarbe',
    type: 'select', options: LACKFARBE_OPTIONS,
    hint: 'CMM-32: Steuert das Imagin-Render-Bild. Detail-Bezeichnung im Feld darunter.',
  },
  {
    block: 'fahrzeug', key: 'fahrzeug_farbe', label: 'Farb-Detail (Freitext)',
    placeholder: 'z.B. Saphirschwarz Metallic',
  },
  {
    block: 'fahrzeug', key: 'fahrzeug_typ', label: 'Karosserie-Typ',
    hint: 'PKW, Transporter, Motorrad …',
  },
  { block: 'fahrzeug', key: 'erstzulassung', label: 'Erstzulassung', type: 'date' },
  { block: 'fahrzeug', key: 'kilometerstand', label: 'Kilometerstand', type: 'number' },
  {
    block: 'fahrzeug', key: 'finanzierung_leasing', label: 'Finanzierung / Leasing',
    hint: 'finanzierung / leasing / weder',
  },
  {
    block: 'fahrzeug', key: 'vorsteuerabzugsberechtigt', label: 'Vorsteuerabzugsberechtigt?',
    placeholder: 'Ja / Nein',
  },

  // ── Halter ───────────────────────────────────────────────────────────────
  { block: 'halter', key: 'halter_vorname', label: 'Halter Vorname' },
  { block: 'halter', key: 'halter_nachname', label: 'Halter Nachname' },
  {
    block: 'halter', key: 'halter_geburtsdatum', label: 'Halter Geburtsdatum',
    type: 'date', hint: 'AAR-318: Halter-Info',
    getValue: (f) => dateOnly(f.halter_geburtsdatum),
  },
  { block: 'halter', key: 'halter_email', label: 'Halter E-Mail' },
  { block: 'halter', key: 'halter_telefon', label: 'Halter Telefon' },
  { block: 'halter', key: 'halter_strasse', label: 'Halter Straße' },
  { block: 'halter', key: 'halter_plz', label: 'Halter PLZ' },
  { block: 'halter', key: 'halter_stadt', label: 'Halter Stadt' },
  {
    block: 'halter', key: 'ist_fahrzeughalter', label: 'Halter = Kunde?',
    placeholder: 'Ja / Nein', hint: 'AAR-318: Flag',
  },
  {
    block: 'halter', key: 'werkstatt_seit_datum', label: 'Werkstatt seit (Datum)',
    type: 'date', hint: 'AAR-305',
    getValue: (f) => dateOnly(f.werkstatt_seit_datum),
  },

  // ── Unfall ───────────────────────────────────────────────────────────────
  {
    block: 'unfall', key: 'schadens_datum', label: 'Schadensdatum', type: 'date',
    getValue: (f) => dateOnly(f.schadens_datum),
  },
  { block: 'unfall', key: 'schadens_art', label: 'Schadensart' },
  {
    block: 'unfall', key: 'schadens_adresse', label: 'Schadens-Adresse', fullWidth: true,
    // CMM-Brücke: claims.schadenort_adresse → faelle.schadens_adresse ist nicht
    // im Sync-Trigger (Spalten-Namen weichen ab). Bis der Trigger erweitert
    // ist, Claim-Fallback fürs Anzeigen.
    getValue: (f, _l, c) => fallToDisplay(f.schadens_adresse ?? c?.schadenort_adresse ?? null),
  },
  {
    block: 'unfall', key: 'schadens_plz', label: 'PLZ',
    getValue: (f, _l, c) => fallToDisplay(f.schadens_plz ?? c?.schadenort_plz ?? null),
  },
  {
    block: 'unfall', key: 'schadens_ort', label: 'Ort',
    getValue: (f, _l, c) => fallToDisplay(f.schadens_ort ?? c?.schadenort_ort ?? null),
  },
  {
    block: 'unfall', key: 'unfallort', label: 'Unfallort (strukturiert)',
    hint: 'von Dispatch in Phase 1 gesetzt', fullWidth: true,
  },
  {
    block: 'unfall', key: 'unfallort_kategorie', label: 'Unfallort-Kategorie',
    hint: 'Autobahn / Stadt / Land / Parkplatz',
  },
  { block: 'unfall', key: 'unfall_uhrzeit', label: 'Unfall-Uhrzeit', hint: 'z.B. 14:30' },
  { block: 'unfall', key: 'unfallort_lat', label: 'Unfallort Lat', type: 'number' },
  { block: 'unfall', key: 'unfallort_lng', label: 'Unfallort Lng', type: 'number' },
  {
    block: 'unfall', key: 'polizeibericht_status', label: 'Polizeibericht-Status',
    hint: 'abgelehnt / offen / hochgeladen',
  },
  {
    block: 'unfall', key: 'zb1_status', label: 'ZB1-Status',
    hint: 'abgelehnt / offen / hochgeladen',
  },
  {
    block: 'unfall', key: 'fahrerflucht', label: 'Fahrerflucht?',
    placeholder: 'Ja / Nein', hint: 'AAR-135 Auto-Flag, Admin-Override',
  },
  {
    block: 'unfall', key: 'auslandskennzeichen', label: 'Auslandskennzeichen?',
    placeholder: 'Ja / Nein', hint: 'AAR-135 Auto-Flag, Admin-Override',
  },
  {
    block: 'unfall', key: 'schadens_ursache', label: 'Schadens-Ursache',
    type: 'textarea', fullWidth: true,
    // AAR-Stufe-0-Final (14.05.2026): claims.ursache gedropped — kein
    // Fallback mehr nötig, faelle.schadens_ursache ist Single-Source.
  },
  {
    block: 'unfall', key: 'schadens_hergang', label: 'Unfallhergang (wie passiert)',
    type: 'textarea', fullWidth: true,
  },
  {
    block: 'unfall', key: 'fahrzeugschaden_beschreibung',
    label: 'Fahrzeugschaden (was am Auto kaputt ist)', type: 'textarea', fullWidth: true,
    hint: 'Wird automatisch aus Unfallfotos gefüllt (Claude Vision)',
  },
  {
    block: 'unfall', key: 'sachschaden_beschreibung',
    label: 'Drittschaden (Leitplanke, Handy etc.)', type: 'textarea', fullWidth: true,
  },
  {
    block: 'unfall', key: 'schadens_beschreibung', label: 'Weitere Anmerkungen',
    type: 'textarea', fullWidth: true,
  },

  // ── Gegner & Versicherung ────────────────────────────────────────────────
  {
    block: 'gegner', key: 'gegner_bekannt', label: 'Gegner bekannt?',
    placeholder: 'Ja / Nein',
  },
  { block: 'gegner', key: 'gegner_name', label: 'Gegner Name', fullWidth: true },
  { block: 'gegner', key: 'gegner_kennzeichen', label: 'Gegner-Kennzeichen' },
  { block: 'gegner', key: 'gegner_fahrzeugtyp', label: 'Gegner-Fahrzeugtyp' },
  { block: 'gegner', key: 'gegner_versicherung', label: 'Gegner Versicherung' },
  { block: 'gegner', key: 'gegner_versicherungsnummer', label: 'Gegner-Versicherungsnummer' },
  {
    block: 'gegner', key: 'gegner_schadennummer', label: 'Gegner-Schadennummer',
    // CMM-26 / CMM-Brücke: lead.gegner_schadennummer → claim.gegner_aktenzeichen
    // (anderer Spalten-Name auf claims). Sync-Trigger covered das nicht
    // zurück, daher Claim-Fallback fürs Anzeigen.
    getValue: (f, _l, c) => fallToDisplay(f.gegner_schadennummer ?? c?.gegner_aktenzeichen ?? null),
  },
  {
    block: 'gegner', key: 'gegner_versicherung_anfrage_datum', label: 'Grüne-Karte-Anfrage',
    type: 'date', hint: 'AAR-314: Auslands-KZ',
    getValue: (f) => dateOnly(f.gegner_versicherung_anfrage_datum),
  },

  // ── Vorschäden ───────────────────────────────────────────────────────────
  {
    block: 'vorschaeden', key: 'hat_vorschaeden', label: 'Vorschäden vorhanden?',
    placeholder: 'Ja / Nein',
  },
  { block: 'vorschaeden', key: 'vorschaden_anzahl', label: 'Anzahl', type: 'number' },
  {
    block: 'vorschaeden', key: 'vorschaeden_beschreibung', label: 'Beschreibung',
    type: 'textarea', fullWidth: true,
  },

  // ── Besichtigung ─────────────────────────────────────────────────────────
  {
    block: 'besichtigung', key: 'besichtigungsort_adresse',
    label: 'Besichtigungsort-Adresse', fullWidth: true,
  },

  // ── Gutachten-Kernwerte ──────────────────────────────────────────────────
  { block: 'kernwerte', key: 'reparaturkosten', label: 'Reparaturkosten (€)', type: 'number' },
  {
    block: 'kernwerte', key: 'wiederbeschaffungswert', label: 'Wiederbeschaffungswert (€)',
    type: 'number',
  },
  { block: 'kernwerte', key: 'restwert', label: 'Restwert (€)', type: 'number' },
  { block: 'kernwerte', key: 'wertminderung', label: 'Wertminderung (€)', type: 'number' },
  {
    block: 'kernwerte', key: 'schadens_hoehe_netto', label: 'Schadenshöhe netto (€)',
    type: 'number',
  },

  // ── Notizen ──────────────────────────────────────────────────────────────
  {
    block: 'notizen', key: 'notizen', label: 'Interne Notiz', type: 'textarea', fullWidth: true,
    hint: 'Freitext — für KB/Admin interne Kommunikation',
  },

  // Hinweis: Der Block 'nutzungsausfall' hat in der heutigen Sections.tsx keine
  // <InlineEditField>s (nur Custom-Toggles/Checkbox) — daher (noch) leer. Die
  // Section-Sichtbarkeit (mietwagen_flag === true || nutzungsausfall === true)
  // wird vom Consumer gesteuert, nicht über visibleWhen einzelner Felder.
]

export function fieldsForBlock(block: StammdatenBlock): StammdatenFieldDef[] {
  return STAMMDATEN_FIELD_SCHEMA.filter((f) => f.block === block)
}
