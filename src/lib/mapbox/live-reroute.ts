'use client'

// 2026-05-08 PR B2: Live-Reroute-Logik für den Feldmodus.
//
// Zweck: Während der SV unterwegs ist, prüfen wir alle 30 s ob eine
// alternative Route schneller wäre (Stau auf der primary, weniger
// Verkehr auf der Alternative). Plus: bei jedem Hazard-Update prüfen wir,
// ob ein Hindernis (Unfall, Sperrung) auf der primary-polyline liegt.
//
// Beide Pfade triggern denselben „proposed Reroute"-State im Caller, der
// dann eine Toast-UI zeigt mit Auto-Accept nach 10 s.

import { haversineMetersLngLat, pointToPolylineDistanceMLngLat } from './turn-by-turn'
import type { TrafficRoute } from './directions'
import type { HazardFeature } from './hazards'

/** Wie viel Sekunden eine Alternative schneller sein muss damit wir
 * Reroute vorschlagen. 2 min ist Standard — kürzer wäre flackrig. */
export const REROUTE_FASTER_THRESHOLD_SEC = 120

/** Wenn ein Hazard innerhalb dieses Radius zu einem polyline-Punkt liegt,
 * gilt er als ON-route. 50 m matched die Geofence-Größe für „angekommen". */
export const HAZARD_ON_ROUTE_RADIUS_M = 50

/** Polling-Frequenz für den Reroute-Check während TbT aktiv ist.
 * 30 s + 60-s-Cache im directions-Module → Mapbox sieht ~1 Call/30 s,
 * aber nur einmal pro Cache-Window. */
export const REROUTE_POLL_INTERVAL_MS = 30_000

/** Wie lange der „Schnellere Route"-Toast offen bleibt bevor er sich
 * auto-akzeptiert. 10 s gibt dem SV Zeit zu reagieren ohne ihn aus dem
 * Fahr-Fokus zu reißen. */
export const REROUTE_AUTO_ACCEPT_MS = 10_000

export type RerouteReason = 'faster' | 'hazard'

export type ProposedReroute = {
  route: TrafficRoute
  reason: RerouteReason
  /** Bei `faster`: Sekunden die eingespart würden. Bei `hazard`: 0. */
  etaSavedSec: number
  /** Bei `hazard`: kurze Beschreibung des Hindernisses. */
  hazardLabel?: string
}

/**
 * Wählt aus einer Liste von Alternativen die schnellste, die mindestens
 * `thresholdSec` schneller als die primary ist. null wenn keine Alt
 * deutlich besser ist.
 *
 * Zusatz-Filter: die Alternative darf nicht „mikro-anders" sein —
 * Mindestabweichung von 200 m an mindestens einem Punkt, sonst bietet
 * sie keinen echten Wert (gleiche Strecke, andere Annotation).
 */
export function pickFasterAlternative(
  primary: TrafficRoute,
  alternatives: TrafficRoute[],
  thresholdSec = REROUTE_FASTER_THRESHOLD_SEC,
): TrafficRoute | null {
  let best: TrafficRoute | null = null
  let bestSaved = thresholdSec
  for (const alt of alternatives) {
    const saved = primary.duration - alt.duration
    if (saved < bestSaved) continue
    if (!isMeaningfullyDifferent(primary, alt)) continue
    best = alt
    bestSaved = saved
  }
  return best
}

/**
 * Heuristik: zwei Routen sind „bedeutsam unterschiedlich" wenn
 * mindestens ein Coord-Sample-Punkt der Alternative > 200 m von der
 * nächsten Stelle der primary entfernt ist. Verhindert Flicker zwischen
 * zwei nahezu identischen Routen die durch Lane-Annotation-Updates
 * kippen.
 */
function isMeaningfullyDifferent(primary: TrafficRoute, alt: TrafficRoute): boolean {
  if (alt.coords.length === 0) return false
  // Sample 5 äquidistante Punkte aus der Alt-Route
  const N_SAMPLES = 5
  for (let i = 0; i < N_SAMPLES; i++) {
    const t = (i + 1) / (N_SAMPLES + 1)
    const idx = Math.floor(t * alt.coords.length)
    const p = alt.coords[Math.min(idx, alt.coords.length - 1)]
    const d = pointToPolylineDistanceMLngLat(p, primary.coords)
    if (d > 200) return true
  }
  return false
}

/**
 * Findet das erste Hazard das auf der primary-polyline liegt (innerhalb
 * `radiusM`). Sortiert primary nach Distanz vom Anfang ist NICHT
 * gegeben — wir nehmen einfach den ersten Match weil ein einziger Hazard
 * reicht um Reroute-Toast zu triggern.
 */
export function findHazardOnRoute(
  hazards: HazardFeature[],
  primary: TrafficRoute,
  radiusM = HAZARD_ON_ROUTE_RADIUS_M,
): HazardFeature | null {
  if (primary.coords.length < 2) return null
  for (const h of hazards) {
    const coords = h.geometry.coordinates as [number, number]
    const d = pointToPolylineDistanceMLngLat(coords, primary.coords)
    if (d <= radiusM) return h
  }
  return null
}

/**
 * Distanz vom SV zum nächsten Punkt einer Hazard-on-Route. Wird nur
 * verwendet damit der Toast-Text sinnvoll lautet („Unfall in 800 m").
 */
export function distanceToHazardM(
  svPos: [number, number],
  hazard: HazardFeature,
): number {
  return haversineMetersLngLat(
    svPos,
    hazard.geometry.coordinates as [number, number],
  )
}
