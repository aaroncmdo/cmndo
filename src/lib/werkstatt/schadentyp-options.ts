// Kanonische leads.schadentyp-Domaene. Die DB-CHECK-Constraint `leads_schadentyp_check`
// erlaubt genau diese 5 Werte (+ NULL). Plain-Konstante ohne server-only-Deps -> von der
// Client-Component (Select) UND der Server-Action (Validierung) importierbar. Labels aus
// dem etablierten Sprachgebrauch (dispatch/BkatAnalysePanel, unfallskizze/TYP_LABELS).

export type SchadentypOption = { value: string; label: string }

export const SCHADENTYP_OPTIONS: readonly SchadentypOption[] = [
  { value: 'auffahrunfall', label: 'Auffahrunfall' },
  { value: 'spurwechsel', label: 'Spurwechsel' },
  { value: 'vorfahrtsverletzung', label: 'Vorfahrtsverletzung' },
  { value: 'parkplatz', label: 'Parkplatz-Schaden' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const

/** Erlaubte schadentyp-Werte (== DB-CHECK leads_schadentyp_check). */
export const SCHADENTYP_VALUES: readonly string[] = SCHADENTYP_OPTIONS.map((o) => o.value)

/** Deutsches Label fuer einen schadentyp-Wert; '–' bei null, roher Wert bei Unbekanntem. */
export function schadentypLabel(value: string | null | undefined): string {
  if (!value) return '–'
  return SCHADENTYP_OPTIONS.find((o) => o.value === value)?.label ?? value
}
