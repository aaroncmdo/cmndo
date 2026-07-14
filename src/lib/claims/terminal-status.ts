// FG5 Cluster 1: Shared terminal-status helper.
// Pure, no 'use server' imports — safe to use in Client-Components and libs.
//
// keep in sync with lifecycle.ts ABSCHLUSS_SUBSTATE keys.
// Writer = endzustand-actions.ts (operative_status) + state-machine.ts (abgeschlossen_am).
// Note: operative_status uses { abgeschlossen, storniert }; terminal claims.status uses
// the full ABSCHLUSS_SUBSTATE set. istClaimGeschlossen accepts BOTH axes.

/** Terminal claims.status values that mark an abschluss-Substate.
 *  Mirrors ABSCHLUSS_SUBSTATE keys from lifecycle.ts (keep in sync). */
export const TERMINAL_CLAIM_STATUS: ReadonlySet<string> = new Set([
  'reguliert_vollstaendig',
  'storniert',
  'klage_rechtsstreit',
  'verjaehrt',
  'abgelehnt_final',
  'an_externe_kanzlei_uebergeben',
  'termin_durchgefuehrt',
])

/** Closed/terminal values on the operative_status axis (claims.operative_status / faelle.status mirror).
 *  Status-Achsen-Konsolidierung B2: operative_status traegt jetzt die feinen Terminal-Outcomes
 *  DIREKT (reguliert_vollstaendig etc.), nicht mehr nur die coarse 'abgeschlossen'. 'abgeschlossen'
 *  bleibt gueltig (state-machine-Auto-Close + werkstatt-close schreiben es weiter), 'storniert'
 *  ebenso. Die 5 feinen Terminals kommen ueber endzustand-actions (die manuellen KB/Admin-Setter).
 *  Behavior-preserving bis endzustand-actions die feinen Werte tatsaechlich schreibt (B2b-2) —
 *  bis dahin haelt operative_status nie einen feinen Terminal, die 5 Extra-Werte matchen 0 Rows. */
export const CLOSED_OPERATIVE_STATUS_VALUES = [
  'abgeschlossen',
  'storniert',
  'reguliert_vollstaendig',
  'klage_rechtsstreit',
  'verjaehrt',
  'abgelehnt_final',
  'an_externe_kanzlei_uebergeben',
] as const

export const CLOSED_OPERATIVE_STATUS: ReadonlySet<string> = new Set(CLOSED_OPERATIVE_STATUS_VALUES)

/** PostgREST-`in`-Listen-Literal fuer Negativ-/Positiv-Filter auf `operative_status`:
 *  `.not('operative_status','in', CLOSED_OPERATIVE_STATUS_PG)` = "nur aktive Faelle".
 *  Single source of truth — loest die verstreuten Inline-`'("abgeschlossen","storniert")'` ab. */
export const CLOSED_OPERATIVE_STATUS_PG = `(${CLOSED_OPERATIVE_STATUS_VALUES.map((s) => `"${s}"`).join(',')})`

/** "Abgeschlossene" (nicht-stornierte) operative_status-Terminals — exakt die Menge, die vor der
 *  Achsen-Konsolidierung alle auf coarse 'abgeschlossen' kollabierte. Fuer "completed"-Counts
 *  (z.B. Provision/abgeschlossene Faelle), die 'storniert' ausschliessen. Behavior-preserving zum
 *  frueheren `.eq('operative_status','abgeschlossen')`, sobald endzustand die feinen Werte schreibt. */
export const COMPLETED_OPERATIVE_STATUS_VALUES: string[] = CLOSED_OPERATIVE_STATUS_VALUES.filter(
  (s) => s !== 'storniert',
)

/**
 * Returns true if the claim is in a closed/terminal state by ANY of the three axes:
 *   - status: terminal claims.status (ABSCHLUSS_SUBSTATE key)
 *   - operativeStatus: claims.operative_status / faelle.status mirror ({ abgeschlossen, storniert })
 *   - abgeschlossenAm: claims.abgeschlossen_am timestamp (set by state-machine on normal close)
 *
 * FG5 fix: storniert claims set via endzustand-actions never set abgeschlossen_am,
 * so the old boolean-closed check (abgeschlossen_am || status==='abgeschlossen') was
 * insufficient. This helper treats any terminal status as closed, regardless of the timestamp.
 */
export function istClaimGeschlossen(args: {
  status?: string | null
  operativeStatus?: string | null
  abgeschlossenAm?: string | null
}): boolean {
  if (args.abgeschlossenAm) return true
  if (args.status && TERMINAL_CLAIM_STATUS.has(args.status)) return true
  if (args.operativeStatus && CLOSED_OPERATIVE_STATUS.has(args.operativeStatus)) return true
  return false
}
