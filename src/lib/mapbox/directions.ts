// 2026-05-07: Mapbox Directions API helper für echte Routen-Polyline statt
// Luftlinie. Aaron-Smoke MAP3.jpg: bisher zog `upsertRouteLayer` eine
// gerade Linie zwischen SV-Position und Stop — sah aus wie eine Luftlinie
// quer durch Häuser.
//
// 2026-05-08 PR B: Migration auf `driving-traffic` mit
// `annotations=congestion,duration` + `alternatives=true`. Liefert pro
// Segment einen Stau-Wert (low/moderate/heavy/severe) damit der Route-
// Layer die Linie wie bei Google Maps farblich segmentieren kann. Plus
// Alternativen für späteren Live-Reroute.
//
// Mapbox-Plan-Quote: driving-traffic kostet 1 Request pro Call, Free-
// Tier 100k/Monat. Wir cachen pro start-end-Paar 60 s in-memory (kürzer
// als das alte 5-min-Profile-Cache, weil Traffic sich schneller ändert).
// Bei Live-Reroute aus FeldmodusMap.tsx wird der Cache via
// `bypassCache: true` umgangen.
//
// Bei Fehler/Token-fehlt: Luftlinie als minimal-Fallback, congestion
// aller Segmente = 'unknown' (Layer rendert in Default-Blau).
//
// Tipp Aaron: wenn die Quote knapp wird, /api/mapbox-directions als
// Server-Proxy mit Server-Cache + CDN-Header bauen.

const cache = new Map<string, { route: TrafficRoute; ts: number }>()
const CACHE_TTL_MS = 60 * 1000 // 1 min — Traffic ändert sich schnell

const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic'

export type CongestionLevel = 'unknown' | 'low' | 'moderate' | 'heavy' | 'severe'

export type RouteSegment = {
  /** Start- und End-Koordinate des Segments */
  coords: [[number, number], [number, number]]
  congestion: CongestionLevel
}

export type TrafficRoute = {
  /** Komplette Polyline der Route — coordinaten in [lng,lat] */
  coords: Array<[number, number]>
  /** Pro Coord-Pair (i → i+1) ein congestion-Wert. Länge = coords.length - 1. */
  congestion: CongestionLevel[]
  /** Gesamt-Strecke in Metern */
  distance: number
  /** Gesamt-Dauer in Sekunden (mit aktuellem Traffic) */
  duration: number
  /** Dauer bei freiem Fluss in Sekunden — fehlt im congestion-only Mode */
  durationTypical?: number
}

export type DirectionsResult = {
  primary: TrafficRoute
  alternatives: TrafficRoute[]
}

function cacheKey(start: [number, number], end: [number, number]): string {
  return `${start[0].toFixed(5)},${start[1].toFixed(5)}|${end[0].toFixed(5)},${end[1].toFixed(5)}`
}

type RawRoute = {
  geometry?: { coordinates?: Array<[number, number]> }
  legs?: Array<{
    annotation?: {
      congestion?: string[]
    }
  }>
  distance?: number
  duration?: number
  duration_typical?: number
}

function parseRoute(raw: RawRoute, fallback: { start: [number, number]; end: [number, number] }): TrafficRoute {
  const coords = raw.geometry?.coordinates ?? [fallback.start, fallback.end]
  const congestionRaw: string[] = []
  for (const leg of raw.legs ?? []) {
    if (Array.isArray(leg.annotation?.congestion)) {
      congestionRaw.push(...(leg.annotation!.congestion ?? []))
    }
  }
  // Wenn Annotations fehlen (Fallback-Case): alle Segmente unknown
  const expectedLen = Math.max(0, coords.length - 1)
  const congestion: CongestionLevel[] = []
  for (let i = 0; i < expectedLen; i++) {
    const v = congestionRaw[i]
    congestion.push(
      v === 'low' || v === 'moderate' || v === 'heavy' || v === 'severe'
        ? v
        : 'unknown',
    )
  }
  return {
    coords,
    congestion,
    distance: raw.distance ?? 0,
    duration: raw.duration ?? 0,
    durationTypical: raw.duration_typical,
  }
}

function makeAirlineRoute(start: [number, number], end: [number, number]): TrafficRoute {
  return {
    coords: [start, end],
    congestion: ['unknown'],
    distance: 0,
    duration: 0,
  }
}

/**
 * Holt eine echte Auto-Routen-Polyline zwischen zwei Koordinaten mit
 * Echtzeit-Traffic + Alternativen. Bei Fehler: Luftlinie + leerer
 * alternatives-Array.
 */
export async function fetchDrivingRoute(
  start: [number, number],
  end: [number, number],
  options: { signal?: AbortSignal; bypassCache?: boolean } = {},
): Promise<DirectionsResult> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) {
    return { primary: makeAirlineRoute(start, end), alternatives: [] }
  }

  const key = cacheKey(start, end)
  if (!options.bypassCache) {
    const cached = cache.get(key)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      // Cache speichert nur die primary-Route; Alternativen werden bei
      // Live-Reroute mit bypassCache:true geholt.
      return { primary: cached.route, alternatives: [] }
    }
  }

  try {
    const params = new URLSearchParams({
      access_token: token,
      geometries: 'geojson',
      overview: 'full',
      annotations: 'congestion,duration',
      alternatives: 'true',
      steps: 'false',
    })
    const url = `${DIRECTIONS_URL}/${start[0]},${start[1]};${end[0]},${end[1]}?${params}`
    const res = await fetch(url, { signal: options.signal })
    if (!res.ok) {
      console.warn('[mapbox-directions] HTTP', res.status)
      return { primary: makeAirlineRoute(start, end), alternatives: [] }
    }
    const data = (await res.json()) as { routes?: RawRoute[] }
    const routes = data.routes ?? []
    if (routes.length === 0) {
      return { primary: makeAirlineRoute(start, end), alternatives: [] }
    }
    const fallback = { start, end }
    const primary = parseRoute(routes[0], fallback)
    const alternatives = routes.slice(1).map((r) => parseRoute(r, fallback))
    cache.set(key, { route: primary, ts: Date.now() })
    return { primary, alternatives }
  } catch (err) {
    if ((err as { name?: string })?.name !== 'AbortError') {
      console.warn('[mapbox-directions] fetch error:', err)
    }
    return { primary: makeAirlineRoute(start, end), alternatives: [] }
  }
}

/**
 * Macht aus einer TrafficRoute eine FeatureCollection von Liniensegmenten,
 * jedes Feature mit `congestion`-Property. Aufeinanderfolgende Segmente
 * mit identischer congestion werden zu einer LineString gemerged, damit
 * Mapbox nicht hunderte Features rendern muss.
 *
 * Konvention: congestion[i] beschreibt das Segment zwischen coords[i] und
 * coords[i+1]. Bei einem Wechsel zwischen Segment i-1 und i wird die
 * Verbindung aus dem vorherigen Run abgeschlossen (slice runStart..i+1
 * inklusive), und der neue Run beginnt bei coord i (so dass coord i in
 * beiden Features vorkommt — kein visueller Gap an der Farbgrenze).
 */
export function routeToCongestionFeatures(route: TrafficRoute): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = []
  const { coords, congestion } = route
  if (coords.length < 2) return features

  let runStart = 0
  let runCongestion: CongestionLevel = congestion[0] ?? 'unknown'

  // Iteriere über die SEGMENT-Indices (0..coords.length-2). Bei einem
  // Farbwechsel ab Segment segIdx → push den bisherigen Run als
  // [runStart..segIdx] (inklusive coord[segIdx] als Bridge) und starte
  // den neuen Run ab coord[segIdx].
  for (let segIdx = 1; segIdx < coords.length - 1; segIdx++) {
    const c = congestion[segIdx] ?? 'unknown'
    if (c !== runCongestion) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords.slice(runStart, segIdx + 1) as Array<[number, number]>,
        },
        properties: { congestion: runCongestion },
      })
      runStart = segIdx
      runCongestion = c
    }
  }

  // Letzter Run bis ans Streckenende.
  features.push({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords.slice(runStart) as Array<[number, number]>,
    },
    properties: { congestion: runCongestion },
  })

  return features
}
