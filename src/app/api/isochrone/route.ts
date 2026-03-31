import { NextRequest, NextResponse } from 'next/server'

const cache = new Map<string, { lat: number; lng: number }[]>()

const NUM_POINTS = 16

/**
 * Generate points around a center at given radius (in km) for each compass direction.
 */
function generateRayPoints(lat: number, lng: number, radiusKm: number): { lat: number; lng: number; angle: number }[] {
  const points: { lat: number; lng: number; angle: number }[] = []
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const dLat = (radiusKm / 111.32) * Math.cos(angle)
    const dLng = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    points.push({ lat: lat + dLat, lng: lng + dLng, angle })
  }
  return points
}

/**
 * Use OSRM table API to get driving distances from center to all ray points.
 * Returns actual driving distances in km, or null if API fails.
 */
async function getOsrmDistances(centerLat: number, centerLng: number, points: { lat: number; lng: number }[]): Promise<number[] | null> {
  try {
    const coords = [[centerLng, centerLat], ...points.map(p => [p.lng, p.lat])]
      .map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`)
      .join(';')

    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null

    const data = await res.json()
    if (data.code !== 'Ok' || !data.distances?.[0]) return null

    // distances[0] = distances from source (center) to all destinations, in meters
    const distances: number[] = data.distances[0].slice(1) // skip self-distance
    return distances.map((d: number) => d / 1000) // convert to km
  } catch {
    return null
  }
}

/**
 * Scale ray points based on actual driving distance vs. air distance.
 * If drive distance is longer than air distance, pull the point closer.
 */
function scalePoints(
  centerLat: number, centerLng: number,
  rayPoints: { lat: number; lng: number; angle: number }[],
  driveDistances: number[],
  targetRadiusKm: number,
): { lat: number; lng: number }[] {
  return rayPoints.map((p, i) => {
    const driveDist = driveDistances[i]
    if (!driveDist || driveDist <= 0) return { lat: p.lat, lng: p.lng }

    // Air distance
    const dLat = p.lat - centerLat
    const dLng = p.lng - centerLng
    const airDist = Math.sqrt((dLat * 111.32) ** 2 + (dLng * 111.32 * Math.cos(centerLat * Math.PI / 180)) ** 2)

    // Scale factor: if drive is 1.5x air, pull point in by 1/1.5
    const scale = airDist > 0 ? targetRadiusKm / driveDist : 1
    const clampedScale = Math.max(0.4, Math.min(1.3, scale))

    return {
      lat: centerLat + dLat * clampedScale,
      lng: centerLng + dLng * clampedScale,
    }
  })
}

/**
 * Fallback: Seeded pseudo-random polygon (no API needed).
 */
function generateFallbackPolygon(lat: number, lng: number, radiusKm: number): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = []
  function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
  }
  const baseSeed = Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm

  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const variation = 0.15 + seededRandom(baseSeed + i * 7) * 0.2
    const cardinalBias = 1 + 0.08 * Math.abs(Math.cos(2 * angle))
    const factor = (1 - variation + seededRandom(baseSeed + i * 13) * variation * 2) * cardinalBias
    const r = radiusKm * factor
    const dLat = (r / 111.32) * Math.cos(angle)
    const dLng = (r / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    points.push({ lat: lat + dLat, lng: lng + dLng })
  }
  return points
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  const radiusKm = parseFloat(req.nextUrl.searchParams.get('radius_km') ?? '20')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat und lng erforderlich' }, { status: 400 })
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`
  if (cache.has(cacheKey)) {
    return NextResponse.json({ polygon: cache.get(cacheKey), source: 'cache' })
  }

  // Try OSRM first
  const rayPoints = generateRayPoints(lat, lng, radiusKm)
  const driveDistances = await getOsrmDistances(lat, lng, rayPoints)

  let polygon: { lat: number; lng: number }[]
  let source: string

  if (driveDistances) {
    polygon = scalePoints(lat, lng, rayPoints, driveDistances, radiusKm)
    source = 'osrm'
  } else {
    polygon = generateFallbackPolygon(lat, lng, radiusKm)
    source = 'fallback'
  }

  cache.set(cacheKey, polygon)
  return NextResponse.json({ polygon, source })
}
