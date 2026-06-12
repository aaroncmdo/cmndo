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
// P2.3c — State-Transitions (Absage + Verlegung). AAR-956: Dead-Pin-Reassign.
export { sageAb, verlege, entscheideVerlegung, reassigniereDeadPin } from './state-transitions'
export type {
  AbsageStatus, VerlegeInput, VerlegeResult, ReassigniereDeadPinInput, ReassigniereDeadPinResult,
} from './state-transitions'
// P2.4 — findeBestePerson (Org-/Region-Level-Matching + Auto-Reservierung).
export { findeBestePerson } from './matching'
export type { FindeBestePersonInput, FindeBestePersonResult, PersonKandidat } from './matching'
// Sub-A2 — universeller 2×2-Buchungs-Router + Kunde-3-Slot-Verteilung.
export { planeTermin, verteile3Slots, verteileAusSlots, passtZuWunschzeit } from './plane-termin'
export type { WunschzeitFilter, SlotVorschlag, PlaneTerminResult, PlaneTerminInput } from './plane-termin'
export {
  bewerteSvKandidat, sortiereKandidaten, vergleicheTenure, istKontingentBlockiert,
  haversineKm, pointInPolygon, ersterFreierSlot,
  PAKET_PRIO, W_PAKET, W_KONTINGENT_GENUTZT, W_ABLEHNUNG, W_ETA_MIN, SCORE_BUCKET,
} from './matching-score'
export type { SvKandidatFeatures, TenureInfo, RankbarerKandidat } from './matching-score'
// P2.5 — externe Kalender-Sync (Google + CalDAV), assignee-generisch.
export { syncTerminToExternalCalendar, entferneTerminAusExternemKalender, googleProvider, caldavProvider } from './kalender-sync'
export type { KalenderProvider, SyncStatus, SyncResult, TerminSyncRow } from './kalender-sync'
export { resolveTerminKontext, buildSummary, buildDescription } from './kalender-kontext'
export type { TerminKontext, KontextFelder } from './kalender-kontext'
export { korrigiereBesichtigungsort, bestaetigeBesichtigungsort } from './besichtigungsort-write'
export type { BestaetigtVon } from './besichtigungsort-write'
