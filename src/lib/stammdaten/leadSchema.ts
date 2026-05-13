// AAR-frontend-konsolidierung-p2 (P2-T4.7): Kanonische Stammdaten-Feld-Liste
// für die `leads`-Tabelle (Pendant zu schema.ts für `faelle`). Single Source
// für Label / Typ / Options / Hint / Sichtbarkeit der Trivial-Felder, die in
// Phase4Stammdaten aktuell als handgeschriebene <InlineField …>-Listen leben.
//
// Pure Daten + Typen — KEINE React/Tailwind-Importe. Konsumiert von
// shared/stammdaten/LeadSchemaFields.tsx.
//
// SCOPE (Phase A) — bewusst NUR Trivial-Felder, die direkt 1:1 auf eine Spalte
// in der `leads`-Tabelle gehen, in der saveStammdaten-Allowlist stehen und
// ohne Spezial-Komponente auskommen. Komponiert / autocomplete-getrieben /
// button-toggle: siehe Hinweis am Ende.

export type LeadStammdatenBlock =
  | 'kunde'
  | 'halter'
  | 'unfall'
  | 'gegner'
  | 'vorschaeden'
  | 'zeugen'

export type LeadFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'time'
  | 'number'
  | 'textarea'
  | 'select'

export type LeadFieldDef = {
  block: LeadStammdatenBlock
  /** DB-Spaltenname in `leads` (= InlineField.fieldName). */
  key: string
  label: string
  type?: LeadFieldType
  /** Bei type='select' nötig. */
  options?: { value: string; label: string }[]
  hint?: string
  placeholder?: string
  /** Optionaler Eingabe-Transform (z.B. Kennzeichen uppercase). */
  transform?: (raw: string) => string
  /** Im 2-Spalten-Grid über beide Spalten (Textareas, lange Adressen). */
  fullWidth?: boolean
  /**
   * Liest den Anzeige-/Edit-Wert aus dem Lead-Objekt.
   * Default wenn nicht gesetzt: `(lead) => leadFieldToDisplay(lead[key])`.
   */
  getValue?: (lead: Record<string, unknown>) => string | number | null
  /** Feld nur rendern wenn true. Default: immer. */
  visibleWhen?: (lead: Record<string, unknown>) => boolean
}

/**
 * Default-Wert-Getter — spiegelt `fallToDisplay()` aus schema.ts:
 * string|number durchreichen, Boolean → 'Ja'/'Nein' (sonst rendert InlineField
 * `"true"`/`"false"` im Select-Modus), null bei leer.
 */
export function leadFieldToDisplay(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein'
  return String(v)
}

const dateOnly = (v: unknown): string | null =>
  typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null

// AAR-318 / AAR-298 etc.: Ja/Nein-Booleans werden als Select gerendert. Der
// String 'Ja'/'Nein' kommt aus leadFieldToDisplay, das Boolean-Mapping
// zurück in true/false beim Save passiert zentral in InlineField.commit()
// (type='select' + final∈{Ja,Nein} → payload=Boolean).
const JA_NEIN_OPTIONS: { value: string; label: string }[] = [
  { value: 'Ja', label: 'Ja' },
  { value: 'Nein', label: 'Nein' },
]

export const LEAD_STAMMDATEN_FIELD_SCHEMA: LeadFieldDef[] = [
  // ── Kunde — Kontakt ───────────────────────────────────────────────────────
  { block: 'kunde', key: 'vorname', label: 'Vorname' },
  { block: 'kunde', key: 'nachname', label: 'Nachname' },
  { block: 'kunde', key: 'telefon', label: 'Telefon', type: 'tel' },
  { block: 'kunde', key: 'email', label: 'E-Mail', type: 'email' },

  // ── Halter ────────────────────────────────────────────────────────────────
  // Labels wörtlich aus Phase4Stammdaten.tsx (Halter-Block).
  { block: 'halter', key: 'halter_vorname', label: 'Halter Vorname', placeholder: 'Vorname' },
  { block: 'halter', key: 'halter_nachname', label: 'Halter Nachname', placeholder: 'Nachname' },
  {
    block: 'halter', key: 'halter_geburtsdatum', label: 'Geburtsdatum',
    type: 'date', placeholder: 'JJJJ-MM-TT',
    getValue: (l) => dateOnly(l.halter_geburtsdatum),
  },
  { block: 'halter', key: 'halter_strasse', label: 'Straße', placeholder: 'Straße + Hausnummer' },
  { block: 'halter', key: 'halter_plz', label: 'PLZ', placeholder: 'PLZ' },
  { block: 'halter', key: 'halter_stadt', label: 'Ort', placeholder: 'Ort' },
  // ist_fahrzeughalter ist in Phase4 ein dedizierter Toggle-Button („Gleich wie
  // Kunde?") mit Halter-Auto-Fill aus Kundendaten — NICHT als Select-Feld
  // gerendert. Kommt in Phase C als Custom-Renderer ins Schema.

  // ── Unfall — Trivial-Felder ───────────────────────────────────────────────
  // Hinweis: Unfalldatum/Uhrzeit/Ort werden in Phase 1 (Erstkontakt) gesetzt
  // — hier nur als editierbare Trivial-Felder für Korrekturen ohne Spezial-UI.
  {
    block: 'unfall', key: 'unfalldatum', label: 'Unfalldatum', type: 'date',
    getValue: (l) => dateOnly(l.unfalldatum),
  },
  { block: 'unfall', key: 'unfall_uhrzeit', label: 'Unfall-Uhrzeit', hint: 'z.B. 14:30' },
  {
    block: 'unfall', key: 'unfallort_kategorie', label: 'Unfallort-Kategorie',
    hint: 'Autobahn / Stadt / Land / Parkplatz',
  },

  // ── Gegner — Trivial-Felder ───────────────────────────────────────────────
  // gegner_versicherung_id + gegner_versicherung kommen in Phase C
  // (VersicherungAutocomplete). Hier nur die freien Text-Felder.
  { block: 'gegner', key: 'gegner_kennzeichen', label: 'Gegner-Kennzeichen' },
  { block: 'gegner', key: 'gegner_schadennummer', label: 'Schadennummer (optional)' },
  { block: 'gegner', key: 'gegner_versicherungsnummer', label: 'Gegner-Versicherungsnummer' },

  // ── Vorschäden ────────────────────────────────────────────────────────────
  // hat_vorschaeden + Beschreibung. vorschaden_anzahl / vorschaden_letzter_datum
  // existieren NICHT in der leads-Tabelle (nur in Type-Annotation) — daher
  // bewusst weggelassen.
  {
    block: 'vorschaeden', key: 'hat_vorschaeden', label: 'Vorschäden vorhanden?',
    type: 'select', options: JA_NEIN_OPTIONS,
  },
  {
    block: 'vorschaeden', key: 'vorschaeden_beschreibung', label: 'Beschreibung',
    type: 'textarea', fullWidth: true,
    placeholder: 'Welche Vorschäden? (Bereich / Schadenhöhe)',
  },

  // ── Zeugen ────────────────────────────────────────────────────────────────
  // Anmerkung: In Phase4 ist `zeugen` ein Button-Toggle, nicht ein Select.
  // Schema enthält das Feld als Select damit es als shared-Schema-Eintrag
  // existiert; die Phase4-Migration entscheidet aktuell GEGEN die Schema-
  // Variante und behält den Button-Toggle (Render-Bruch wäre sonst). Bei
  // Phase C wird der Toggle ggf. als Custom-Renderer eingehängt.
  {
    block: 'zeugen', key: 'zeugen', label: 'Zeugen vorhanden?',
    type: 'select', options: JA_NEIN_OPTIONS,
  },

  // Hinweis — bewusst NICHT in diesem Schema (Phase B+C kommen separat):
  //   • Kennzeichen-Parts (kennzeichen_kreis/_buchstaben/_zahl/_suffix)
  //     → komponierte Custom-Component mit live-Format
  //   • fahrzeug_hersteller / _modell / _baujahr / fin / hsn / tsn
  //     → CarQuery-Autocomplete + formatBaujahr-Validation
  //   • lackfarbe_code / fahrzeug_farbe → Imagin-Render-Abhängigkeit
  //   • gegner_versicherung_id / gegner_versicherung → VersicherungAutocomplete
  //   • kunde_adresse / _strasse / _plz / _stadt / _lat / _lng → GooglePlace
  //   • fahrerflucht / auslandskennzeichen → KZ-Live-Flag (checkKZFlags)
  //   • finanzierung_leasing / vorsteuerabzugsberechtigt → Button-Toggles
  //   • parkplatz_kamera → Button-Toggle (eigener saveParkplatzKamera-Pfad
  //     außerhalb der saveStammdaten-Allowlist)
]

export function leadFieldsForBlock(block: LeadStammdatenBlock): LeadFieldDef[] {
  return LEAD_STAMMDATEN_FIELD_SCHEMA.filter((f) => f.block === block)
}
