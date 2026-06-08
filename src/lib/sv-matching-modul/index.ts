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
