// AAR-661: Mapbox Isochrone API ersetzt HERE.
//
// Der HERE-Key in Vercel war ein OAuth-Credential (base64-Blob), kein
// REST-Key — Aufrufe gaben 401. Mapbox liefert direkt GeoJSON-Polygon zurück
// und der MAPBOX_ACCESS_TOKEN war schon gesetzt.
//
// Rückgabe-Kontrakt bleibt: IsoPoint[] für Backward-Compat mit
// `recalculateIsochrone`; der Caller baut daraus das GeoJSON-Polygon.

const MAPBOX_ISO_URL = 'https://api.mapbox.com/isochrone/v1/mapbox/driving'
const REQUEST_TIMEOUT_MS = 8000
const MAX_METERS = 100_000 // Mapbox-Limit

export type IsoPoint = { lat: number; lng: number }

export class IsochroneError extends Error {
  cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'IsochroneError'
    this.cause = cause
  }
}

/**
 * Berechnet ein Fahr-Isochronen-Polygon via Mapbox Isochrone API.
 *
 * @param lat       Start-Breitengrad
 * @param lng       Start-Längengrad
 * @param radiusKm  Einsatzradius in Kilometern (Mapbox-Limit: 100 km)
 * @returns Polygon als Array von IsoPoints (>=3 Punkte)
 * @throws IsochroneError wenn MAPBOX_ACCESS_TOKEN fehlt, die API nicht
 *   antwortet oder kein gültiges Polygon liefert.
 */
export async function calculateIsochrone(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<IsoPoint[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) {
    throw new IsochroneError('MAPBOX_ACCESS_TOKEN nicht gesetzt (server-only env).')
  }

  const meters = Math.min(MAX_METERS, Math.round(radiusKm * 1000))
  const url = new URL(`${MAPBOX_ISO_URL}/${lng},${lat}`)
  url.searchParams.set('contours_meters', String(meters))
  url.searchParams.set('polygons', 'true')
  url.searchParams.set('denoise', '1')
  url.searchParams.set('generalize', '0')
  url.searchParams.set('access_token', token)

  let response: Response
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new IsochroneError('Mapbox API nicht erreichbar (Netzwerk/Timeout)', err)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new IsochroneError(`Mapbox API Fehler ${response.status}: ${body.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    features?: Array<{
      geometry?: { type: string; coordinates: number[][][] }
    }>
  }

  const geom = data.features?.[0]?.geometry
  if (!geom || geom.type !== 'Polygon') {
    throw new IsochroneError('Mapbox API lieferte kein Polygon zurück')
  }
  const ring = geom.coordinates?.[0]
  if (!Array.isArray(ring) || ring.length < 3) {
    throw new IsochroneError(`Mapbox Polygon hat nur ${ring?.length ?? 0} Punkte (min 3 nötig)`)
  }

  // GeoJSON liefert [lng, lat] — zurück in IsoPoint-Shape für Caller-Kompatibilität
  const raw = ring.map(([pLng, pLat]) => ({ lat: pLat, lng: pLng }))

  // AAR-isochrone-resolution: Mapbox liefert typischerweise 50-200 Punkte.
  // ~1500 Punkte = deutlich präzisere Point-in-Polygon-Tests in findBestSV,
  // der Gutachter-Finder-Map und allen Isochrone-Overlays. Lineare Interpolation
  // entlang der Polygon-Kanten — kein Vertex-Shift, nur Dichte erhöhen.
  return densifyPolygon(raw, 1500)
}

/**
 * Erhöht die Punkt-Dichte eines geschlossenen Polygons auf target_n Punkte
 * via linearer Interpolation entlang der Kanten. Gibt das Polygon ohne den
 * doppelten Schlusspunkt zurück (erster = letzter Punkt aus GeoJSON).
 */
function densifyPolygon(points: IsoPoint[], targetN: number): IsoPoint[] {
  // Schlusspunkt entfernen wenn identisch mit erstem (GeoJSON-Konvention)
  const pts = points.length > 1 &&
    points[0].lat === points[points.length - 1].lat &&
    points[0].lng === points[points.length - 1].lng
    ? points.slice(0, -1)
    : [...points]

  if (pts.length < 2) return pts

  // Gesamtumfang berechnen (Haversine wäre exakter, aber Euler-Distanz reicht
  // für relative Gewichtung pro Kante auf dieser Skala)
  const edges: number[] = []
  let totalLen = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const d = Math.sqrt((b.lng - a.lng) ** 2 + (b.lat - a.lat) ** 2)
    edges.push(d)
    totalLen += d
  }

  if (totalLen === 0) return pts

  const result: IsoPoint[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    // Wie viele Punkte entfallen auf diese Kante (proportional zur Länge)?
    const segPts = Math.max(1, Math.round((edges[i] / totalLen) * targetN))
    for (let j = 0; j < segPts; j++) {
      const t = j / segPts
      result.push({
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng),
      })
    }
  }

  return result
}
