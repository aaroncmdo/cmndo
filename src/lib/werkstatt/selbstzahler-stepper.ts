// SP-D — Reine Schritt-Ableitung fuer den Selbstzahler-Reparatur-Stepper (Kunde-Portal).
// Eigene Strecke fuer abrechnungsweg='selbstzahler' (kein SV/Gutachten/Regulierung):
//   Schaden gemeldet -> Werkstatt gewaehlt -> Termin -> Freigabe (KVA) -> Reparatur.
// Bewusst NICHT ueber die Kern-Lifecycle/v_claim_phase (Parity-Gate unberuehrt) —
// abgeleitet direkt aus dem Claim-Zustand (reparatur_werkstatt_id + reparatur_termine +
// reparatur_freigegeben_am). Client-safe, keine Server-/DB-Imports.
//
// W1/K1-Audit-Fix (23.07.): frueher sprang der Stepper bei Termin='bestaetigt' sofort auf
// "Reparatur" — OBWOHL der Kunde den KVA erst per Unterschrift freigeben muss, damit die
// Werkstatt beginnen darf. Der Kunde sah "Reparatur laeuft", waehrend es an SEINER Signatur
// haengt. Jetzt: eigene "Freigabe"-Stufe; "Reparatur" (4) NUR wenn kvaFreigegeben.

export type SelbstzahlerStep = 'schaden' | 'werkstatt' | 'termin' | 'freigabe' | 'reparatur'

export const SELBSTZAHLER_STEPS: SelbstzahlerStep[] = [
  'schaden',
  'werkstatt',
  'termin',
  'freigabe',
  'reparatur',
]

/**
 * Aktiver Schritt (0..4) der Selbstzahler-Strecke; alles davor gilt als erledigt.
 * - keine Werkstatt                                  -> 1 (Werkstatt waehlen)
 * - Werkstatt, Termin offen/angefragt/abgelehnt      -> 2 (Termin)
 * - Termin bestaetigt, KVA noch NICHT freigegeben     -> 3 (Freigabe — wartet auf Unterschrift)
 * - Termin bestaetigt, KVA freigegeben               -> 4 (Reparatur laeuft)
 * - Termin erledigt ODER Claim terminal              -> 4, abgeschlossen
 *
 * Invariante: "Reparatur" (4) wird NIE gezeigt, solange der Kunde den KVA nicht freigegeben hat.
 */
export function selbstzahlerStepIndex(input: {
  hatWerkstatt: boolean
  terminStatus: string | null
  kvaFreigegeben: boolean
  abgeschlossen: boolean
}): { currentIndex: number; abgeschlossen: boolean } {
  if (input.abgeschlossen || input.terminStatus === 'erledigt') {
    return { currentIndex: 4, abgeschlossen: true }
  }
  if (input.terminStatus === 'bestaetigt') {
    return input.kvaFreigegeben
      ? { currentIndex: 4, abgeschlossen: false } // Reparatur laeuft
      : { currentIndex: 3, abgeschlossen: false } // Freigabe — wartet auf KVA-Unterschrift
  }
  if (input.hatWerkstatt) {
    return { currentIndex: 2, abgeschlossen: false }
  }
  return { currentIndex: 1, abgeschlossen: false }
}
