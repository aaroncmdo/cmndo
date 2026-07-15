// FG7: Pure SV-SLA completion derivation.
// No DB, no side effects — safe to call from cron without any supabase context.
import { CLOSED_OPERATIVE_STATUS } from '@/lib/claims/terminal-status'

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
  // B4-slice-1b: die zwei Non-Terminal-Outcomes. Sie MUESSEN hier stehen — `indexOf` liefert
  // sonst -1 und deriveSvSlaCompletion meldet fuer ALLE vier SV-SLA-Typen "nicht erfuellt".
  // Folge waere ein kritischer Eskalations-Task ("SLA-Verletzung: Gutachten-Upload") fuer einen
  // Fall, dessen Gutachten laengst da ist und der schon bei der Versicherung verhandelt wird.
  // Rang analog zu ihren Vorgaengern: in_kommunikation_vs == regulierung(-laeuft), abgelehnt == vs-abgelehnt.
  'in_kommunikation_vs',
  'vs-kuerzt',
  'nachbesichtigung-laeuft',
  'vs-abgelehnt',
  'abgelehnt',
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
  // B4-slice-2a-i-b: gegen die SSoT CLOSED_OPERATIVE_STATUS pruefen statt nur abgeschlossen/
  // storniert. Sonst liefern die FEINEN Terminals (reguliert_vollstaendig/klage_rechtsstreit/
  // verjaehrt/abgelehnt_final/an_externe_kanzlei_uebergeben — seit B2 direkt in operative_status —
  // UND termin_durchgefuehrt seit dieser Slice) rank -1 und deriveSvSlaCompletion meldet fuer
  // einen ABGESCHLOSSENEN Claim faelschlich "nicht erfuellt" -> Falsch-Eskalation. Ein
  // geschlossener Claim hat nichts mehr zu eskalieren, egal welcher Terminal.
  if (operativeStatus !== null && CLOSED_OPERATIVE_STATUS.has(operativeStatus)) {
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
