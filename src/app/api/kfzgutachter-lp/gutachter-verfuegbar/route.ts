import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// API für den Scroll-Popover (Step 2): nimmt eine Google-Place-ID,
// löst sie über die Places-Details-API in lat/lng auf, und zählt
// dann wie viele verifizierte Sachverständige diesen Punkt in ihrer
// Isochrone (= ihrem Service-Gebiet) abdecken.
//
// Spec: Aaron-Wunsch 2026-05-19, Phase 1 des Scroll-Popovers. Ziel
// ist eine Trust-Pille "Wir haben X Sachverständige in Ihrer Region
// verfügbar", die direkt nach der Standort-Auswahl erscheint.
//
// Isochrone-Format: GeoJSON-Polygon mit closed LinearRing (Aaron-
// Hotfix a335539d). Point-in-Polygon wird in JS gerechnet — kein
// PostGIS-Setup nötig, ~50 SVs in NRW × ~200 Vertices = <50 ms.

export const runtime = 'nodejs'

type GeoPolygon = {
  type: 'Polygon'
  coordinates: number[][][] // [outer ring [, hole rings…]]
}

function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 4) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}

// Ray-Casting Point-in-Polygon. point = [lng, lat] (GeoJSON-Order),
// ring = Array<[lng, lat]>. Holes werden ignoriert — Isochronen
// haben in unserem Schema keine.
function pointInRing(point: [number, number], ring: number[][]): boolean {
  if (!isClosedRing(ring)) return false
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function isValidPolygon(poly: unknown): poly is GeoPolygon {
  if (!poly || typeof poly !== 'object') return false
  const p = poly as { type?: unknown; coordinates?: unknown }
  if (p.type !== 'Polygon') return false
  if (!Array.isArray(p.coordinates) || p.coordinates.length === 0) return false
  const ring = p.coordinates[0]
  return Array.isArray(ring) && ring.length >= 4
}

export async function POST(req: Request) {
  let body: { placeId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  const placeId = String(body.placeId ?? '').trim()
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(placeId)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid place_id' },
      { status: 400 },
    )
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('[gutachter-verfuegbar] GOOGLE_PLACES_API_KEY fehlt')
    return NextResponse.json(
      { ok: false, error: 'maps_unavailable' },
      { status: 503 },
    )
  }

  // 1. Place-Details → lat/lng. Next-Cache 1 h, damit wiederholte
  //    Klicks auf dieselbe Adresse kein neues Places-Billing-Event
  //    triggern.
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'geometry/location')
  url.searchParams.set('language', 'de')
  url.searchParams.set('key', apiKey)

  let placeRes: Response
  try {
    placeRes = await fetch(url.toString(), { next: { revalidate: 3600 } })
  } catch (e) {
    console.error('[gutachter-verfuegbar] places fetch threw:', e)
    return NextResponse.json(
      { ok: false, error: 'maps_unavailable' },
      { status: 502 },
    )
  }
  if (!placeRes.ok) {
    return NextResponse.json(
      { ok: false, error: `maps_status_${placeRes.status}` },
      { status: 502 },
    )
  }
  const placeData = (await placeRes.json()) as {
    status?: string
    result?: { geometry?: { location?: { lat?: number; lng?: number } } }
  }
  const loc = placeData?.result?.geometry?.location
  if (
    placeData.status !== 'OK' ||
    !loc ||
    typeof loc.lat !== 'number' ||
    typeof loc.lng !== 'number'
  ) {
    return NextResponse.json(
      { ok: false, error: 'no_location' },
      { status: 502 },
    )
  }

  const lat = loc.lat
  const lng = loc.lng

  // 2. Map-ready SVs holen (gleicher Filter wie die anon-Map-View).
  const sb = createServiceClient()
  const { data: svs, error: svErr } = await sb
    .from('sachverstaendige')
    .select('id, isochrone_polygon')
    .eq('verifiziert', true)
    .eq('ist_aktiv', true)
    .is('geloescht_am', null)
    .not('isochrone_polygon', 'is', null)

  if (svErr || !svs) {
    console.error(
      '[gutachter-verfuegbar] SV-Query Fehler:',
      svErr?.message ?? 'no data',
    )
    return NextResponse.json(
      { ok: false, error: 'sv_query_failed' },
      { status: 502 },
    )
  }

  // 3. Point-in-Polygon für jede Isochrone.
  const point: [number, number] = [lng, lat]
  let count = 0
  let skipped = 0
  for (const row of svs) {
    const poly = row.isochrone_polygon
    if (!isValidPolygon(poly)) {
      skipped++
      continue
    }
    const outerRing = poly.coordinates[0]
    if (pointInRing(point, outerRing)) {
      count++
    }
  }

  if (skipped > 0) {
    console.warn(
      `[gutachter-verfuegbar] ${skipped} SV-Polygone übersprungen (invalides GeoJSON)`,
    )
  }

  // Lat/Lng + total bewusst nicht zurückgegeben — der LP-Visitor
  // braucht nur den Count, alles weitere wäre unnötige PII-Exposition.
  return NextResponse.json({ ok: true, count })
}
