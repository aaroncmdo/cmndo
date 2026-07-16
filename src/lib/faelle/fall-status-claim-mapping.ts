// T1.2-b (CMM-49 §D3) -> T3-S4: Diese Schicht mappte frueher faelle-Status auf claims.status
// (Dual-Write-Bridge; mapFallStatusToClaimStatus + FALL_STATUS_TO_CLAIM_STATUS). claims.status
// wird seit T3-S4 NICHT mehr geschrieben (Spalte faellt in S5) — uebrig bleibt die
// operative_status-Cursor-Aufloesung fuer die state-machine: Klage-Feinterminal-Konvergenz +
// Terminal-Clobber-Guard, beides jetzt direkt auf der operative-Achse.

/**
 * Feine Terminal-Werte (Spiegel der frueheren claims.status-Terminals; identisch zu den
 * fein-terminalen Werten in CLOSED_OPERATIVE_STATUS). `abgeschlossen` ist bewusst NICHT
 * enthalten: der abgeschlossen-Happy-Path darf einen bereits gesetzten FEINEN Terminal
 * (z.B. klage_rechtsstreit beim Pfad klage -> abgeschlossen, oder storniert) nicht
 * ueberschreiben — abgeschlossen -> abgeschlossen bleibt dagegen idempotent erlaubt.
 */
export const CLAIMS_TERMINAL_STATES: ReadonlySet<string> = new Set([
  'reguliert_vollstaendig',
  'storniert',
  'klage_rechtsstreit',
  'verjaehrt',
  'abgelehnt_final',
  'an_externe_kanzlei_uebergeben',
  'termin_durchgefuehrt',
])

/**
 * Welchen operative_status schreibt ein state-machine-Uebergang?
 *
 * Normalfall: der Ziel-fall_status selbst (Cursor-Semantik). Zwei Ausnahmen:
 *
 * 1. Klage-Feinterminal (B4-slice-2a-i): `klage` traegt auf der Achse den feinen Terminal
 *    'klage_rechtsstreit' (statt des groben Cursors 'klage', dessen OPERATIVE_PHASE
 *    'nachforderung' waere) — konvergent mit endzustand markClaimAsKlage.
 * 2. Terminal-Clobber-Guard (T3-S4, ersetzt den frueheren claims.status-Guard aus
 *    mapFallStatusToClaimStatus): fuehrt der Happy-Path `abgeschlossen` ueber einen Claim,
 *    der bereits einen FEINEN Terminal traegt (klage_rechtsstreit, storniert, ...), bleibt
 *    dieser erhalten. (Delta zum Altverhalten: frueher konnte der op-Cursor hier auf
 *    'abgeschlossen' vergroebern, waehrend claims.status den feinen Terminal hielt — beide
 *    leiten dieselbe Phase ab, aber die feine Info ging auf der op-Achse verloren. Jetzt
 *    bleibt sie erhalten — gewollt, da operative_status die einzige Achse ist.)
 *
 * @param newStatus  Ziel-fall_status des Uebergangs (was transitionFallStatus erhaelt).
 * @param currentOperativeStatus  aktueller claims.operative_status VOR dem Uebergang.
 */
export function resolveCursorOperativeStatus(
  newStatus: string,
  currentOperativeStatus: string | null,
): string {
  if (newStatus === 'klage') return 'klage_rechtsstreit'
  if (
    newStatus === 'abgeschlossen' &&
    currentOperativeStatus !== null &&
    CLAIMS_TERMINAL_STATES.has(currentOperativeStatus)
  ) {
    return currentOperativeStatus
  }
  return newStatus
}
