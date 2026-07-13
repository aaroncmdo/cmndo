// FG7: Pure SV-SLA completion derivation.
// No DB, no side effects — safe to call from cron without any supabase context.

export type SvSlaTyp =
  | 'gutachter_zuweisung'
  | 'termin_bestaetigung'
  | 'besichtigung'
  | 'gutachten_upload'

/** Ordered operative_status progression (mirrors the MAIN axis of FALL_STATUS_TRANSITIONS
 *  in src/lib/faelle/state-machine.ts). Index = rank; higher = further along.
 *  Terminal 'abgeschlossen'/'storniert' handled separately (see below). */
export const OPERATIVE_STATUS_ORDER: readonly string[] = [
  'onboarding',
  'ersterfassung',
  'sv-gesucht',
  'sv-zugewiesen',
  'sv-termin',
  'besichtigung',
  'begutachtung-laeuft',
  'gutachten-eingegangen',
  'filmcheck',
  'qc-pruefung',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'regulierung-laeuft',
  'vs-kuerzt',
  'nachbesichtigung-laeuft',
  'vs-abgelehnt',
  'klage',
  'zahlung-eingegangen',
  'abgeschlossen',
]

/** operative_status a given SV-SLA is considered satisfied at-or-after. */
export const SV_SLA_COMPLETE_AT: Record<SvSlaTyp, string> = {
  gutachter_zuweisung: 'sv-zugewiesen',
  termin_bestaetigung: 'besichtigung', // reaching besichtigung implies the termin was confirmed
  besichtigung: 'besichtigung',
  gutachten_upload: 'gutachten-eingegangen',
}

export interface SvCompletionInputs {
  operativeStatus: string | null
  /** true if ANY gutachter_termine row for the fall has status in {bestaetigt, abgeschlossen}. */
  hasConfirmedTermin: boolean
}

/** Pure: is this SV-SLA already satisfied by the live claim/termin state?
 *  - terminal operativeStatus in {abgeschlossen, storniert} -> true (nothing left to escalate)
 *  - termin_bestaetigung -> true if hasConfirmedTermin OR rank(operativeStatus) >= rank('besichtigung')
 *  - others -> rank(operativeStatus) >= rank(SV_SLA_COMPLETE_AT[typ])
 *  Unknown/NULL operativeStatus -> rank -1 -> NOT complete (conservative; never suppress a real breach). */
export function deriveSvSlaCompletion(typ: SvSlaTyp, inputs: SvCompletionInputs): boolean {
  const { operativeStatus, hasConfirmedTermin } = inputs

  // Terminal statuses: claim is done, nothing left to escalate.
  // NOTE: 'storniert' is NOT in OPERATIVE_STATUS_ORDER (indexOf -> -1), so we MUST check
  // it here explicitly before the rank comparison. 'abgeschlossen' IS in the array but
  // is included here too for uniform terminal handling.
  if (operativeStatus === 'abgeschlossen' || operativeStatus === 'storniert') {
    return true
  }

  // termin_bestaetigung: completed either via confirmed termin row OR via status proxy
  if (typ === 'termin_bestaetigung') {
    if (hasConfirmedTermin) return true
    // Fall through to rank comparison against 'besichtigung' threshold
  }

  const rank = operativeStatus !== null ? OPERATIVE_STATUS_ORDER.indexOf(operativeStatus) : -1
  const threshold = SV_SLA_COMPLETE_AT[typ]
  const thresholdRank = OPERATIVE_STATUS_ORDER.indexOf(threshold)

  // Defensive: threshold should always be found, but guard against -1 just in case
  if (thresholdRank < 0) return false
  // rank -1 (unknown/null) is never >= any valid thresholdRank -> not complete (conservative)
  return rank >= 0 && rank >= thresholdRank
}
