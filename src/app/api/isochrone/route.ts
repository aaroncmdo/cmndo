import { NextRequest, NextResponse } from 'next/server'

// ─── In-memory cache ────────────────────────────────────────────────────────

const cache = new Map<string, { lat: number; lng: number }[]>()

// ─── Simulated isochrone polygon generator ──────────────────────────────────
// Generates an irregular polygon approximating drive-time coverage around a
// center point. Uses seeded pseudo-random variation to produce consistent but
// realistic shapes that look like actual road-network coverage areas.

function generateIsochronePolygon(
  lat: number,
  lng: number,
  radiusKm: number,
): { lat: number; lng: number }[] {
  const numPoints = 20 // 20 vertices for a smooth but irregular shape
  const points: { lat: number; lng: number }[] = []

  // Seed-based pseudo-random so the same center+radius always produces the same shape
  function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
  }

  // Base seed from lat/lng/radius
  const baseSeed = Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm

  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints

    // Random variation: +/- 15-25% of the radius
    const rand = seededRandom(baseSeed + i * 137)
    const variation = 0.75 + rand * 0.50 // range [0.75, 1.25]

    // Bias toward cardinal directions (N-S, E-W) to simulate highway corridors
    // Roads tend to run N-S and E-W, so radius is slightly larger in those directions
    const cardinalBias = 1.0 + 0.08 * (Math.abs(Math.cos(2 * angle)))

    // Secondary irregularity: add a second harmonic for more natural look
    const secondHarmonic = 1.0 + 0.05 * Math.sin(3 * angle + seededRandom(baseSeed + 1000) * Math.PI * 2)

    const effectiveRadius = radiusKm * variation * cardinalBias * secondHarmonic

    // Convert km to degrees (approximate)
    const dLat = (effectiveRadius / 111.32) * Math.cos(angle)
    const dLng = (effectiveRadius / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle)

    points.push({
      lat: lat + dLat,
      lng: lng + dLng,
    })
  }

  // Close the polygon
  points.push(points[0])

  return points
}

// ─── GET /api/isochrone?lat=...&lng=...&radius_km=... ───────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const latStr = searchParams.get('lat')
  const lngStr = searchParams.get('lng')
  const radiusStr = searchParams.get('radius_km')

  if (!latStr || !lngStr || !radiusStr) {
    return NextResponse.json(
      { error: 'lat, lng, and radius_km query parameters are required' },
      { status: 400 },
    )
  }

  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)
  const radiusKm = parseFloat(radiusStr)

  if (isNaN(lat) || isNaN(lng) || isNaN(radiusKm) || radiusKm <= 0) {
    return NextResponse.json(
      { error: 'Invalid parameter values' },
      { status: 400 },
    )
  }

  // Cache key with 4 decimal places (approx 11m precision)
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`

  if (cache.has(cacheKey)) {
    return NextResponse.json({ polygon: cache.get(cacheKey) })
  }

  const polygon = generateIsochronePolygon(lat, lng, radiusKm)
  cache.set(cacheKey, polygon)

  return NextResponse.json({ polygon })
}
