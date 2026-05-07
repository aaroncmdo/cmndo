// 2026-05-07: Mapbox Directions API helper für echte Routen-Polyline statt
// Luftlinie. Aaron-Smoke MAP3.jpg: bisher zog `upsertRouteLayer` eine
// gerade Linie zwischen SV-Position und Stop — sah aus wie eine Luftlinie
// quer durch Häuser.
//
// Mapbox-Standard-Plan: 100k Directions-Requests/Monat gratis. Wir cachen
// pro start-end-Paar in-memory damit Hot-Reloads/Re-Renders nicht
// zusätzlich kosten.

const cache = new Map<string, { coords: Array<[number, number]>; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving'

function cacheKey(start: [number, number], end: [number, number]): string {
  return `${start[0].toFixed(5)},${start[1].toFixed(5)}|${end[0].toFixed(5)},${end[1].toFixed(5)}`
}

/**
 * Holt eine echte Auto-Routen-Polyline zwischen zwei Koordinaten via Mapbox
 * Directions API. Bei Fehler/kein Token: returnt Luftlinie als Fallback.
 *
 * Precision auf 5 Nachkommastellen für Cache-Key — Mapbox-Routing toleriert
 * kleine Position-Drifts (Live-GPS jittert).
 */
export async function fetchDrivingRoute(
  start: [number, number],
  end: [number, number],
  options: { signal?: AbortSignal } = {},
): Promise<Array<[number, number]>> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const fallback = [start, end] as Array<[number, number]>

  if (!token) return fallback

  const key = cacheKey(start, end)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.coords
  }

  try {
    const url = `${DIRECTIONS_URL}/${start[0]},${start[1]};${end[0]},${end[1]}?access_token=${token}&geometries=geojson&overview=full`
    const res = await fetch(url, { signal: options.signal })
    if (!res.ok) {
      console.warn('[mapbox-directions] HTTP', res.status)
      return fallback
    }
    const data = (await res.json()) as {
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>
    }
    const coords = data.routes?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) {
      return fallback
    }
    cache.set(key, { coords, ts: Date.now() })
    return coords
  } catch (err) {
    if ((err as { name?: string })?.name !== 'AbortError') {
      console.warn('[mapbox-directions] fetch error:', err)
    }
    return fallback
  }
}
