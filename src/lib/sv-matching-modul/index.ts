// AAR-941: Self-Service SV-Matching-Modul — oeffentlicher Barrel.
// Konsumenten importieren NUR von hier (eine Wahrheit).

export type {
  OeffentlichesSvProfil,
  SlotVorschlag,
  SvBewertung,
  SvProfilFelder,
  ProjektionInput,
} from './types'
export { toOeffentlichesSvProfil, rundeDistanz } from './projection'
export { rankSlots, classifySlot, type TagSlotsInput } from './ranking'
export { matchAndSlots, type MatchAndSlotsInput } from './match-and-slots'
export {
  planeTerminOeffentlich,
  verteile2plus1Counts,
  type PlaneTerminOeffentlichInput,
} from './plane-termin-oeffentlich'
// AAR-956 (Aaron 12.06.): diskriminierte Partner-vs-Dead-Pin-Planung (Engine-verankert,
// EINE Quelle für Karte + Buchung). Combinator über planeTerminOeffentlich + ladeDeadPinFallback.
export { planeTerminMitFallback, type PlaneTerminMitFallbackResult } from './plane-termin-mit-fallback'
// AAR-956 Dead-Pin-Fallback — Vertrag (Typen + Signaturen; Bodies folgen separat).
export type {
  DeadPinOeffentlich,
  LadeDeadPinFallbackInput,
  LadeDeadPinFallback,
  BucheDeadPinTerminInput,
  BucheDeadPinTerminResult,
  BucheDeadPinTermin,
} from './fallback'
export { ladeDeadPinFallback, generischeDeadPinSlots } from './lade-deadpin-fallback'
export { bucheDeadPinTermin } from './buche-deadpin-termin'
