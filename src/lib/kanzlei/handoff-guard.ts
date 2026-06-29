// Kanzlei-Handoff-Guard — idempotente Entscheidung, ob ein Claim den operativen
// Kanzlei-Handoff (operative_status -> kanzlei-uebergeben + Mails + AS-Task) noch braucht.
//
// Filmcheck-Audit 29.06.2026: Es gibt zwei KB-Approve-Buttons (VollstaendigkeitsCheckCard
// -> gibKanzleipaketFrei UND QcChecklisteBlock -> qcBestanden). Nur qcBestanden advancte
// bisher operative_status; gibKanzleipaketFrei schrieb nur kanzlei_faelle+auftrag -> der
// Fall tauchte in den operative_status-gegateten Kanzlei-Portalen nie auf. Beide loesen
// jetzt denselben Handoff aus; dieser Guard verhindert den Doppel-Handoff (idempotent).

// Status ab/nach dem Handoff + Terminal-Zustaende: kein (weiterer) Handoff noetig.
const HANDOFF_ERLEDIGT_ODER_TERMINAL = new Set<string>([
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'regulierung-laeuft',
  'vs-kuerzt',
  'vs-abgelehnt',
  'nachbesichtigung-laeuft',
  'klage',
  'zahlung-eingegangen',
  'abgeschlossen',
  'storniert',
])

/** True nur fuer komplett-Claims, die noch VOR dem Kanzlei-Handoff stehen. */
export function brauchtKanzleiHandoff(
  operativeStatus: string | null | undefined,
  serviceTyp: string | null | undefined,
): boolean {
  if (serviceTyp !== 'komplett') return false
  if (!operativeStatus) return false
  return !HANDOFF_ERLEDIGT_ODER_TERMINAL.has(operativeStatus)
}

/**
 * True wenn der Claim den Kanzlei-Handoff bereits hinter sich hat ODER terminal ist.
 * Idempotenz-Guard fuer saveFilmcheck: beide KB-Approve-Buttons (qcBestanden +
 * gibKanzleipaketFrei) routen durch saveFilmcheck — ohne diesen Check wuerfe ein
 * zweiter Klick transitionFallStatus (kanzlei-uebergeben -> kanzlei-uebergeben ungueltig).
 */
export function kanzleiHandoffBereitsErfolgt(operativeStatus: string | null | undefined): boolean {
  return !!operativeStatus && HANDOFF_ERLEDIGT_ODER_TERMINAL.has(operativeStatus)
}
