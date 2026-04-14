// AAR-132: HERE API Isoline statt OSRM + seeded-random Fallback.
//
// Ruft HERE's Isoline-Endpoint auf und gibt das echte Fahr-Isochronen-Polygon
// zurück. Kein manuelles Ray-Skalieren mehr, kein seeded-random Fallback.
// Bei API-Problemen wirft die Funktion IsochroneError — der Caller entscheidet
// was damit passiert (typischerweise: loggen + Polygon-Speicherung überspringen,
// findBestSV fällt auf Radius-Check zurück).

import { decode } from '@here/flexpolyline'

const HERE_API_URL = 'https://isoline.router.hereapi.com/v8/isolines'
const REQUEST_TIMEOUT_MS = 8000

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
 * Berechnet ein Fahr-Isochronen-Polygon via HERE API.
 *
 * @param lat       Start-Breitengrad
 * @param lng       Start-Längengrad
 * @param radiusKm  Einsatzradius in Kilometern (wird zu Metern konvertiert)
 * @returns Polygon als Array von IsoPoints (>=3 Punkte)
 * @throws IsochroneError wenn HERE_API_KEY fehlt, die API nicht antwortet oder
 *   kein gültiges Polygon liefert. NIE als NEXT_PUBLIC_* setzen — Server-only.
 */
export async function calculateIsochrone(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<IsoPoint[]> {
  const apiKey = process.env.HERE_API_KEY
  if (!apiKey) {
    throw new IsochroneError(
      'HERE_API_KEY environment variable nicht gesetzt. Siehe AAR-132.',
    )
  }

  const rangeMeters = Math.round(radiusKm * 1000)

  const url = new URL(HERE_API_URL)
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('transportMode', 'car')
  url.searchParams.set('origin', `${lat},${lng}`)
  url.searchParams.set('range[type]', 'distance')
  url.searchParams.set('range[values]', String(rangeMeters))
  url.searchParams.set('routingMode', 'fast')
  url.searchParams.set('shape', 'simple')

  let response: Response
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new IsochroneError('HERE API nicht erreichbar (Netzwerk/Timeout)', err)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new IsochroneError(
      `HERE API Fehler ${response.status}: ${body.slice(0, 200)}`,
    )
  }

  const data = (await response.json()) as {
    isolines?: Array<{
      polygons?: Array<{ outer: string }>
    }>
  }

  const outerEncoded = data.isolines?.[0]?.polygons?.[0]?.outer
  if (!outerEncoded) {
    throw new IsochroneError('HERE API lieferte kein Polygon zurück')
  }

  const decoded = decode(outerEncoded)
  if (!decoded.polyline || decoded.polyline.length < 3) {
    throw new IsochroneError(
      `HERE API Polygon hat nur ${decoded.polyline?.length ?? 0} Punkte (min 3 nötig)`,
    )
  }

  return decoded.polyline.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng }))
}
