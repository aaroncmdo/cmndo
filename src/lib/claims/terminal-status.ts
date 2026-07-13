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

/** Closed values on the operative_status axis (claims.operative_status / faelle.status mirror).
 *  operative_status collapses the full terminal set into two: 'abgeschlossen' (normal flow)
 *  and 'storniert' (endzustand-actions). */
export const CLOSED_OPERATIVE_STATUS: ReadonlySet<string> = new Set([
  'abgeschlossen',
  'storniert',
])

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
