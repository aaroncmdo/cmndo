// P2d-1 (dispatch-config-unify): Welche lead-erfassung-Felder der Dispatcher
// REICHER sieht (Rich-Komponente statt generischem FieldRenderer). Pure, ohne
// Component-/Server-Imports -> unit-testbar (das .tsx-Renderer-Modul zieht
// SvDispatchPanel & Co. nach und ist im vitest-Env nicht leichtgewichtig).

export const DISPATCH_FIELD_OVERRIDE_KEYS = [
  'termin',
  'gegner_versicherung',
  'besichtigungsort_adresse',
  'unfallort',
  // P2d-2b: Eigen-Kennzeichen als Parts-Editor (Stadt/Kennung/Zahl/Typ).
  // gegner_kennzeichen NICHT — leads hat dafür keine Parts-Spalten.
  'kennzeichen',
  // P4-D kunde-Geocoding: Kundenadresse als Place-Autocomplete (füllt strasse/plz/stadt + lat/lng).
  'kunde_strasse',
  // Kasko-WB Phase 1: Versicherer/Tarif/Bindung als Rich-Feld
  'eigene_kasko_tarif',
] as const
export type DispatchOverrideKey = (typeof DISPATCH_FIELD_OVERRIDE_KEYS)[number]

export function hasDispatchFieldOverride(feldKey: string): boolean {
  return (DISPATCH_FIELD_OVERRIDE_KEYS as readonly string[]).includes(feldKey)
}
