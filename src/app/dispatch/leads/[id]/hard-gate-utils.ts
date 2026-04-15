// AAR-80 + AAR-114: Dispatch Schritt 0 Hard Gate — Helpers (pure functions).
// AAR-136 / W2: @deprecated — bitte `lib/qualification-engine.ts` nutzen.
// Diese Datei bleibt temporär für Backward-Compat bis W8 alle Consumer migriert
// sind (page.tsx + SvDispatchPanel + LeadDetailActions + Schritt0HardGate).
// Danach löschen.

import {
  computeQualificationStatus,
  type LeadLike,
  type AktiverTerminLike,
} from './lib/qualification-engine'

export type HardGateStatus = {
  q1Complete: boolean
  q2Complete: boolean
  q3Complete: boolean
  allComplete: boolean
  disqualifiziert: boolean
}

/**
 * @deprecated Use `computeQualificationStatus` from `./lib/qualification-engine` instead.
 * Behält die alten Q1/Q2/Q3-Felder als Alias zu den ersten 3 neuen Bedingungen.
 * Der alte Code kannte nur 3 Fragen, der neue 6 — aber `allComplete` hier heißt
 * weiterhin nur "Q1 + Q2 + Q3", damit existing UIs nicht brechen.
 */
export function computeHardGateStatus(lead: LeadLike & {
  hat_haftpflicht?: boolean | null
}): HardGateStatus {
  const r = computeQualificationStatus(lead, null)
  const q3Complete = lead.hat_haftpflicht !== null && lead.hat_haftpflicht !== undefined
  return {
    q1Complete: r.q1_schuldfrage,
    q2Complete: r.q2_schaden,
    q3Complete,
    allComplete: r.q1_schuldfrage && r.q2_schaden && q3Complete && !r.disqualifiziert,
    disqualifiziert: r.disqualifiziert,
  }
}

// Re-Export neue API für Consumer die schon migriert haben
export { computeQualificationStatus }
export type { LeadLike, AktiverTerminLike }
