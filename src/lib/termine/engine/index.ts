// Public API der Termin-Engine.
export type {
  AssigneeTyp,
  Assignee,
  BelegungTyp,
  BezugTyp,
  BelegungsFenster,
  VBelegungRow,
} from './types'
export { rowToFenster, ladeBelegung, pruefeBelegung, ladeBelegungStrict, pruefeBelegungStrict } from './belegung'
export type { BelegungStrict } from './belegung'
export type { TagSlot, TagVerfuegbarkeit, FreieSlotsOpts } from './types'
export { freieSlots, slotsFuerTag, zeitZuMin, minZuZeit } from './slots'
// P2.3a — Write-Ops (Reservierungs-Kern).
export { reserviere, assigneeLegacyPatch } from './writes'
export type { ReserviereInput, ReserviereResult, TerminTyp, Quelle } from './writes'
export { RESERVIERUNG_TTL_MIN } from './constants'
// P2.3b — Geocoding-Garantie + bestaetige.
export { geocodeMitFallback, makeGeocodeMitFallback } from './geocode'
export type { Geocoder, GeoTreffer } from './geocode'
export { resolveBesichtigungsort } from './besichtigungsort'
export type { ResolvedOrt, OrtQuelle, TerminOrtInput } from './besichtigungsort'
export { bestaetige } from './bestaetige'
export type { BestaetigeResult } from './bestaetige'
