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

// Robustheit (Filmcheck-Audit 01.07.2026): der Handoff-Zielstatus 'kanzlei-uebergeben' ist
// laut State-Machine (FALL_STATUS_TRANSITIONS in state-machine.ts) NUR aus 'filmcheck' und
// 'qc-pruefung' erreichbar. Hier gespiegelt (analog HANDOFF_ERLEDIGT_ODER_TERMINAL oben) statt
// die server-only state-machine.ts (createAdminClient) in dieses pure Modul zu ziehen. Beim
// Erweitern der Quell-Status DORT diese Menge mitziehen.
const HANDOFF_QUELL_STATUS = new Set<string>(['filmcheck', 'qc-pruefung'])

/**
 * True nur wenn der Kanzlei-Handoff (transitionFallStatus -> 'kanzlei-uebergeben') aus dem
 * aktuellen operativen Status laut State-Machine GUELTIG ist. saveFilmcheck prueft das vor
 * dem Transition-Call: ein komplett-Claim, der noch VOR dem Filmcheck haengt (z.B. ohne
 * Gutachten in 'begutachtung-laeuft'), wuerfe sonst einen ungueltigen Uebergang -> rohe 500.
 */
export function kanzleiHandoffMoeglich(operativeStatus: string | null | undefined): boolean {
  return !!operativeStatus && HANDOFF_QUELL_STATUS.has(operativeStatus)
}
