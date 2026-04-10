import { NextRequest, NextResponse } from 'next/server'
import { decode } from '@here/flexpolyline'

const cache = new Map<string, { lat: number; lng: number }[]>()

const NUM_FALLBACK_POINTS = 60

// ─── HERE Isoline API ────────────────────────────────────────────────────────

async function fetchHereIsoline(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<{ lat: number; lng: number }[] | null> {
  const apiKey = process.env.HERE_API_KEY
  if (!apiKey) {
    console.warn('[isochrone] HERE_API_KEY nicht gesetzt, nutze Fallback')
    return null
  }

  try {
    const radiusM = Math.round(radiusKm * 1000)
    const url = `https://isoline.router.hereapi.com/v8/isolines?transportMode=car&origin=${lat},${lng}&range[type]=distance&range[values]=${radiusM}&apiKey=${apiKey}`

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      console.warn(`[isochrone] HERE API ${res.status}: ${res.statusText}`)
      return null
    }

    const data = await res.json()
    const encoded = data?.isolines?.[0]?.polygons?.[0]?.outer

    if (!encoded) {
      console.warn('[isochrone] HERE API: Kein Polygon im Response')
      return null
    }

    // Flexible Polyline decoding
    const decoded = decode(encoded)
    const points = decoded.polyline.map((coord: number[]) => ({ lat: coord[0], lng: coord[1] }))

    if (points.length < 3) {
      console.warn('[isochrone] HERE API: Zu wenige Punkte')
      return null
    }

    return points
  } catch (err) {
    console.warn('[isochrone] HERE API Fehler:', err)
    return null
  }
}

// ─── Fallback: Seeded pseudo-random polygon (kein API nötig) ─────────────────

function generateFallbackPolygon(lat: number, lng: number, radiusKm: number): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = []
  function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
  }
  const baseSeed = Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm

  for (let i = 0; i < NUM_FALLBACK_POINTS; i++) {
    const angle = (2 * Math.PI * i) / NUM_FALLBACK_POINTS
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

// ─── API Route ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  const radiusKm = parseFloat(req.nextUrl.searchParams.get('radius_km') ?? '15')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat und lng erforderlich' }, { status: 400 })
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`
  if (cache.has(cacheKey)) {
    return NextResponse.json({ polygon: cache.get(cacheKey), source: 'cache' })
  }

  // 1. Versuche HERE Isoline API (echtes Polygon mit hunderten Punkten)
  const herePolygon = await fetchHereIsoline(lat, lng, radiusKm)

  let polygon: { lat: number; lng: number }[]
  let source: string

  if (herePolygon) {
    polygon = herePolygon
    source = 'here'
  } else {
    // 2. Fallback: Pseudo-Random Polygon
    polygon = generateFallbackPolygon(lat, lng, radiusKm)
    source = 'fallback'
  }

  cache.set(cacheKey, polygon)
  return NextResponse.json({ polygon, source })
}
