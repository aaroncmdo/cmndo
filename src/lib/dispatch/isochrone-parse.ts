// AAR-521: Normalisiert Isochrone-Polygone aus DB (sachverstaendige.isochrone_polygon)
// in ein einheitliches Format [lng, lat][] fuer pointInPolygon().
//
// Historisch kennt die DB drei Formate:
//   Format A: [{ lat, lng }, ...]                       (alte Mapbox-Route)
//   Format B: { coordinates: [[[lng, lat], ...]] }      (GeoJSON MultiPolygon-artig)
//   Format C: { coordinates: [[lng, lat], ...] }        (GeoJSON-Ring flat)
// Alles andere -> null, dann greift der Radius-Fallback in findBestSV.

type Point = [number, number]

export function parseIsochrone(raw: unknown): Point[] | null {
  if (!raw) return null

  // Format A: Array von { lat, lng }
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    typeof raw[0] === 'object' &&
    raw[0] !== null &&
    'lat' in raw[0] &&
    'lng' in raw[0]
  ) {
    const pts = raw as { lat: number; lng: number }[]
    const mapped: Point[] = []
    for (const p of pts) {
      if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
        mapped.push([p.lng, p.lat])
      }
    }
    return mapped.length >= 3 ? mapped : null
  }

  // Format B/C: { coordinates: ... }
  if (typeof raw === 'object' && raw !== null && 'coordinates' in raw) {
    const coords = (raw as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords) && coords.length > 0) {
      // Format B: coordinates[0] ist ein Array von [lng, lat]-Tupeln
      if (Array.isArray(coords[0]) && coords[0].length > 0 && Array.isArray(coords[0][0])) {
        const ring = coords[0] as unknown[]
        const mapped: Point[] = []
        for (const pt of ring) {
          if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
            mapped.push([pt[0], pt[1]])
          }
        }
        return mapped.length >= 3 ? mapped : null
      }
      // Format C: coordinates ist direkt ein Array von [lng, lat]-Tupeln
      if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
        const mapped: Point[] = []
        for (const pt of coords as unknown[]) {
          if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
            mapped.push([pt[0], pt[1]])
          }
        }
        return mapped.length >= 3 ? mapped : null
      }
    }
  }

  return null
}
