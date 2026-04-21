// AAR-664 (Folge): Konstanten getrennt von der `'use server'`-Action.
// Siehe Memory `feedback_use_server_konstanten.md` — non-function Exports
// aus `'use server'`-Modulen landen als undefined im Client-Bundle und
// crashen `.map`/`.find` im SV-Reklamationen-Modal.

export const REKLAMATIONS_GRUENDE = [
  { value: 'kunde-no-show', label: 'Kunde war nicht da (No-Show)' },
  { value: 'schaden-anders', label: 'Schaden anders als beschrieben' },
  { value: 'daten-unvollstaendig', label: 'Daten unvollständig' },
  { value: 'doppel-termin', label: 'Doppel-Termin' },
  { value: 'mehrfach-verschoben', label: 'Termin mehrfach verschoben' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const
