// AAR-956 — Pure Geometrie fuer die Gesamt-Abdeckungs-Ansicht des Gutachter-Finders.
// Kein turf-Dependency (nicht installiert) — self-contained + testbar. Wird client-
// seitig in FinderMap genutzt, um (a) Dead-Pin-Reichweite als 15-km-Kreise zu einer
// Flaeche zu rendern und (b) sofort zu pruefen, ob ein eingegebener Ort in der
// gerenderten Abdeckung liegt ("in Ihrem Gebiet" vs. "ueberregional").

export type LngLat = [number, number] // [lng, lat] — Mapbox/GeoJSON-Reihenfolge

// 1 Grad Breite ~ 111.32 km. Laenge skaliert mit cos(lat). Equirectangular-
// Naeherung — fuer eine Abdeckungs-Flaeche auf Stadt-/Regions-Skala genau genug.
const KM_PER_DEG_LAT = 111.32

/**
 * Approximiert einen geografischen Kreis (radiusKm) um [lng,lat] als GeoJSON-Polygon
 * (geschlossener Ring, `steps` Segmente). Fuer die Dead-Pin-Abdeckung.
 */
export function kmCircle(lng: number, lat: number, radiusKm: number, steps = 48): GeoJSON.Polygon {
  const dLat = radiusKm / KM_PER_DEG_LAT
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const dLng = radiusKm / (KM_PER_DEG_LAT * (cosLat === 0 ? 1e-6 : cosLat))
  const ring: LngLat[] = []
  for (let i = 0; i < steps; i++) {
    const theta = (2 * Math.PI * i) / steps
    ring.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)])
  }
  ring.push(ring[0]) // Ring schliessen
  return { type: 'Polygon', coordinates: [ring] }
}

/**
 * Ray-Casting Punkt-in-Ring-Test ([lng,lat]-Paare, Ring darf geschlossen sein).
 */
export function pointInRing(pt: LngLat, ring: LngLat[]): boolean {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * True, wenn pt im aeusseren Ring IRGENDEINES der Polygone liegt. Ignoriert Loecher
 * (fuer eine Abdeckungs-Flaeche unerheblich). Robust gegen leere/kaputte Geometrien.
 */
export function pointInAnyPolygon(pt: LngLat, polygons: GeoJSON.Polygon[]): boolean {
  for (const poly of polygons) {
    const ring = poly?.coordinates?.[0] as LngLat[] | undefined
    if (ring && ring.length >= 4 && pointInRing(pt, ring)) return true
  }
  return false
}
