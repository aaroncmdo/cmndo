// P2d-3 (dispatch-config-unify): welche lead-erfassung-Sektionen (phase_key) im
// flachen Dispatcher-Form bespoke Panels NACH den Feldern bekommen (Mechanismus B).
// Pure (keine Component-Imports) -> unit-testbar (das .tsx-Modul zieht
// UnfallskizzeCard & Co. nach und ist im vitest-Env nicht leichtgewichtig).
// phase_keys aus dem lead-erfassung-Phasen-Seed (20260601194200):
//   'unfall'    = "Unfallhergang"        -> Unfallskizze + (bedingt) Zeugen-Editor
//   'termin_sv' = "Termin & Besichtigung" -> Wunschtag-Pills
//   'schaden'   = "Schaden"              -> (bedingt) Personenschaden-Editor (Phase1PersonenForm)

export const DISPATCH_SECTION_PANEL_KEYS = ['unfall', 'termin_sv', 'schaden'] as const
export type DispatchSectionPanelKey = (typeof DISPATCH_SECTION_PANEL_KEYS)[number]

export function hasDispatchSectionPanels(phaseKey: string): boolean {
  return (DISPATCH_SECTION_PANEL_KEYS as readonly string[]).includes(phaseKey)
}
