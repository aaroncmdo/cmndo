// FG4-A (Aaron 13.07. „einheitlich"): Provisions-Release = Completion-Signal + 7-Tage-Hold, EINHEITLICH
// für ALLE partner_provisionen (makler + werkstatt). Ersetzt den blinden `hold_until <= now`-Timer, der
// Provisionen VOR der Fall-Completion freigab (Prod-Bug: makler-Provisionen freigegeben bei operative_status
// ='sv-termin'). Storno hat Vorrang: storniert/abgelehnt → nie freigeben.
//
// Reine Detektions-Helfer (DB-frei, unit-getestet); die Crons sind duenne Fetch-Glue drumherum.

/** Completion-relevanter Claim-Zustand (aus claims + ggf. gutachter_termine geladen). */
export type ClaimCompletionInput = {
  serviceTyp: 'komplett' | 'nur_gutachter' | string | null
  operativeStatus: string | null
  /** claims.status (Lifecycle-Terminal) — 'reguliert_vollstaendig' = Voll-Claim abgeschlossen. */
  claimStatus: string | null
  /** claims.abgeschlossen_am — Completion-Timestamp fuer Voll-Claims. */
  abgeschlossenAm: string | null
  /** gutachter_termine.durchgefuehrt_am (juengster durchgefuehrter Termin) — Completion fuer nur_gutachter. */
  terminDurchgefuehrtAm: string | null
}

/** 7-Tage-Hold nach Completion (Clawback-Fenster), in ms. */
export const RELEASE_HOLD_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Storniert/abgelehnt? → Provision wird storniert, nie freigegeben. Vereinheitlicht die frueher
 * uneinheitlichen Checks (makler: nur 'storniert'; werkstatt: 'storniert'|'abgelehnt').
 */
export function istClaimStorniert(operativeStatus: string | null): boolean {
  return operativeStatus === 'storniert' || operativeStatus === 'abgelehnt'
}

/**
 * Completion-Timestamp des Claims — der Zeitpunkt, ab dem der 7-Tage-Hold laeuft.
 * - nur_gutachter: der Gutachter-Termin ist durchgefuehrt (durchgefuehrt_am). nur_gutachter erreicht
 *   kein operative_status='abgeschlossen' → termin-basiert.
 * - Voll-Claim (komplett/sonst): abgeschlossen (operative_status='abgeschlossen') ODER reguliert
 *   (status='reguliert_vollstaendig') → abgeschlossen_am.
 * null = noch nicht abgeschlossen → HOLD.
 */
export function deriveCompletionTs(c: ClaimCompletionInput): string | null {
  if (c.serviceTyp === 'nur_gutachter') {
    return c.terminDurchgefuehrtAm ?? null
  }
  if (c.operativeStatus === 'abgeschlossen' || c.claimStatus === 'reguliert_vollstaendig') {
    return c.abgeschlossenAm ?? null
  }
  return null
}

/**
 * Ist die Provision freigabe-berechtigt? = Completion vorhanden UND now >= completion + 7 Tage.
 * completionTs null (nicht abgeschlossen / unbekannt) → false (HOLD).
 */
export function istReleaseBerechtigt(completionTs: string | null, nowIso: string): boolean {
  if (!completionTs) return false
  const completionMs = new Date(completionTs).getTime()
  if (Number.isNaN(completionMs)) return false
  return new Date(nowIso).getTime() >= completionMs + RELEASE_HOLD_MS
}
