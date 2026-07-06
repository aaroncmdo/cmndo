// Isochrone-Containment-Check fuer die LiveOps-Karte.
// Ein offener Lead ist eine Abdeckungsluecke, wenn er in KEINER SV-Isochrone liegt.
// Isochrone-Containment = kanonische Erreichbarkeits-Logik der Engine.
import { pointInPolygon } from '@/lib/termine/engine/matching-score'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import type { LeadPin, SvLiveOps } from './types'

/**
 * Liefert die IDs aller Leads, die in KEINER SV-Isochrone liegen.
 * SVs ohne Isochrone (null) werden ignoriert (kein Radius-Fallback hier —
 * nur Polygon-Containment ist die kanonische Lücken-Logik).
 */
export function computeCoverageGaps(leads: LeadPin[], svs: SvLiveOps[]): Set<string> {
  const polygons = svs
    .map((s) => parseIsochrone(s.isochrone))
    .filter((p): p is [number, number][] => p != null && p.length >= 3)

  const gaps = new Set<string>()
  for (const lead of leads) {
    const covered = polygons.some((poly) => pointInPolygon([lead.lng, lead.lat], poly))
    if (!covered) gaps.add(lead.id)
  }
  return gaps
}
