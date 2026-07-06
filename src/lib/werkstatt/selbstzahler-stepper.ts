// SP-D — Reine Schritt-Ableitung fuer den Selbstzahler-Reparatur-Stepper (Kunde-Portal).
// Eigene Strecke fuer abrechnungsweg='selbstzahler' (kein SV/Gutachten/Regulierung):
//   Schaden gemeldet -> Werkstatt gewaehlt -> Termin -> Reparatur.
// Bewusst NICHT ueber die Kern-Lifecycle/v_claim_phase (Parity-Gate unberuehrt) —
// abgeleitet direkt aus dem Claim-Zustand (reparatur_werkstatt_id + reparatur_termine).
// Client-safe, keine Server-/DB-Imports. Konsumiert von SelbstzahlerReparaturStepper.

export type SelbstzahlerStep = 'schaden' | 'werkstatt' | 'termin' | 'reparatur'

export const SELBSTZAHLER_STEPS: SelbstzahlerStep[] = ['schaden', 'werkstatt', 'termin', 'reparatur']

/**
 * Aktiver Schritt (0..3) der Selbstzahler-Strecke; alles davor gilt als erledigt.
 * - keine Werkstatt                       -> 1 (Werkstatt waehlen)
 * - Werkstatt, Termin offen/angefragt/abgelehnt -> 2 (Termin)
 * - Termin bestaetigt                     -> 3 (Reparatur laeuft)
 * - Termin erledigt ODER Claim terminal   -> 3, abgeschlossen
 */
export function selbstzahlerStepIndex(input: {
  hatWerkstatt: boolean
  terminStatus: string | null
  abgeschlossen: boolean
}): { currentIndex: number; abgeschlossen: boolean } {
  if (input.abgeschlossen || input.terminStatus === 'erledigt') {
    return { currentIndex: 3, abgeschlossen: true }
  }
  if (input.terminStatus === 'bestaetigt') {
    return { currentIndex: 3, abgeschlossen: false }
  }
  if (input.hatWerkstatt) {
    return { currentIndex: 2, abgeschlossen: false }
  }
  return { currentIndex: 1, abgeschlossen: false }
}
