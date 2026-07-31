// Werkstatt-Onboarding-Drip — reine Advance-Entscheidung nach einem sendeStep()-Versuch
// (DB-frei, testbar). Trennt "was passiert mit Cursor/next_send_at" von der IO
// (sendeStep-Aufruf + DB-Update), die in route.ts bleibt.
//
// Review-Fix Task 13 (FIX 1): vorher advancte die Route den Cursor VOR der res.ok-Pruefung —
// ein echter sendeStep-Fehlschlag (SMTP down etc.) verlor den Step dadurch PERMANENT. Jetzt
// gilt: der Cursor ruecht NUR vor, wenn der Step gesendet ODER legitim uebersprungen wurde.
// Ein echter Fehlschlag haelt die Position (kein Patch) -> die Zeile bleibt faellig und der
// naechste Cron-Tick versucht denselben Step erneut. Mirror des send-lead-reminders-Musters
// (`if(!ok){failed++; return}` VOR dem Update).
import { naechsterAktiverStep, berechneNextSendAt, type StepLite } from './advance'
import type { SendeStepResult } from './send-step'

export type StepAdvanceDecision = {
  /** Patch fuer die Enrollment-Zeile, oder null = nichts schreiben (Position haelt, naechster Tick retryt denselben Step). */
  patch: Record<string, unknown> | null
  /** true nur bei skipped='kein_sv': im selben Tick sofort den naechsten Step versuchen. */
  retryNextStep: boolean
  /** Welcher Beobachtbarkeits-Zaehler in der Cron-Response hochgezaehlt wird. */
  counter: 'gesendet' | 'fehler' | null
}

function advancePatch<T extends StepLite>(steps: T[], step: T, ankerAm: Date): Record<string, unknown> {
  // Anker ist IMMER enrollment.erstellt_am (Sequenz-Start) — NICHT werkstaetten.aktiviert_am
  // (sonst wuerden Backfill-Enrollments alle Offsets rueckwirkend auf einmal abfeuern).
  const naechster = naechsterAktiverStep(steps, step.position)
  return naechster
    ? { aktueller_step: step.position, next_send_at: berechneNextSendAt(ankerAm, naechster).toISOString() }
    : { aktueller_step: step.position, status: 'fertig', next_send_at: null }
}

/**
 * Entscheidet, was nach einem sendeStep()-Versuch mit dem Enrollment-Cursor passiert.
 * `step` ist der gerade versuchte Step, `steps` die volle (aktiv+inaktiv) Liste fuer die
 * naechster-Step-Suche, `ankerAm` = enrollment.erstellt_am.
 */
export function entscheideStepAdvance<T extends StepLite>(
  res: SendeStepResult,
  step: T,
  steps: T[],
  ankerAm: Date,
): StepAdvanceDecision {
  // sv_vorstellung ohne SV-Match im Umkreis: kein Send moeglich, kein Fehlschlag —
  // sofort (im selben Tick) den naechsten Step versuchen statt einen Tag zu verlieren.
  if (res.skipped === 'kein_sv') {
    return { patch: advancePatch(steps, step, ankerAm), retryNextStep: true, counter: null }
  }
  // Invalide Copy: ein Retry wuerde nie erfolgreich sein (derselbe kaputte Zod-Payload,
  // schon in send-step.ts geloggt) — ueber den Step hinweg vorruecken, aber NICHT im
  // selben Tick weitermachen (naechster Step wartet auf seinen eigenen next_send_at).
  if (res.skipped === 'copy_invalid') {
    return { patch: advancePatch(steps, step, ankerAm), retryNextStep: false, counter: null }
  }
  // Echter Sende-Erfolg.
  if (res.ok) {
    return { patch: advancePatch(steps, step, ankerAm), retryNextStep: false, counter: 'gesendet' }
  }
  // Echter Sende-Fehlschlag (SMTP/…, ok:false ohne skipped) — NICHT vorruecken: kein Patch,
  // next_send_at bleibt unangetastet, die Zeile bleibt faellig fuer den naechsten Cron-Tick.
  return { patch: null, retryNextStep: false, counter: 'fehler' }
}
