import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decode } from '@here/flexpolyline'

const NUM_FALLBACK_POINTS = 60

// ─── HERE Isoline API ────────────────────────────────────────────────────────

async function fetchHereIsoline(lat: number, lng: number, radiusKm: number): Promise<{ lat: number; lng: number }[] | null> {
  const apiKey = process.env.HERE_API_KEY
  if (!apiKey) return null

  try {
    const radiusM = Math.round(radiusKm * 1000)
    const url = `https://isoline.router.hereapi.com/v8/isolines?transportMode=car&origin=${lat},${lng}&range[type]=distance&range[values]=${radiusM}&apiKey=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null

    const data = await res.json()
    const encoded = data?.isolines?.[0]?.polygons?.[0]?.outer
    if (!encoded) return null

    const decoded = decode(encoded)
    const points = decoded.polyline.map((coord: number[]) => ({ lat: coord[0], lng: coord[1] }))
    return points.length >= 3 ? points : null
  } catch {
    return null
  }
}

// ─── Fallback ────────────────────────────────────────────────────────────────

function generateFallbackPolygon(lat: number, lng: number, radiusKm: number): { lat: number; lng: number }[] {
  function seededRandom(seed: number) { const x = Math.sin(seed * 9301 + 49297) * 49297; return x - Math.floor(x) }
  const baseSeed = Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm
  return Array.from({ length: NUM_FALLBACK_POINTS }, (_, i) => {
    const angle = (2 * Math.PI * i) / NUM_FALLBACK_POINTS
    const variation = 0.15 + seededRandom(baseSeed + i * 7) * 0.2
    const factor = 1 - variation + seededRandom(baseSeed + i * 13) * variation * 2
    const dLat = (radiusKm * factor / 111.32) * Math.cos(angle)
    const dLng = (radiusKm * factor / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    return { lat: lat + dLat, lng: lng + dLng }
  })
}

// ─── Recalc Endpoint ─────────────────────────────────────────────────────────

export async function POST() {
  const admin = createAdminClient()

  const { data: svList, error } = await admin
    .from('sachverstaendige')
    .select('id, standort_lat, standort_lng, paket_umkreis_km, radius_km')
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; status: string; points: number; source: string }[] = []

  for (const sv of svList ?? []) {
    const lat = sv.standort_lat
    const lng = sv.standort_lng
    const radiusKm = sv.paket_umkreis_km ?? sv.radius_km ?? 15

    if (lat == null || lng == null) continue

    try {
      // HERE zuerst, dann Fallback
      const herePolygon = await fetchHereIsoline(lat, lng, radiusKm)
      const polygon = herePolygon ?? generateFallbackPolygon(lat, lng, radiusKm)
      const source = herePolygon ? 'here' : 'fallback'

      if (polygon.length > 0) {
        await admin.from('sachverstaendige')
          .update({ isochrone_polygon: polygon })
          .eq('id', sv.id)
        results.push({ id: sv.id, status: 'ok', points: polygon.length, source })
      } else {
        results.push({ id: sv.id, status: 'empty', points: 0, source })
      }
    } catch (e) {
      results.push({ id: sv.id, status: `error: ${e instanceof Error ? e.message : 'unknown'}`, points: 0, source: 'error' })
    }

    // Rate limit: 500ms zwischen Requests
    await new Promise(r => setTimeout(r, 500))
  }

  return NextResponse.json({
    total: svList?.length ?? 0,
    recalculated: results.filter(r => r.status === 'ok').length,
    hereCount: results.filter(r => r.source === 'here').length,
    fallbackCount: results.filter(r => r.source === 'fallback').length,
    results,
  })
}
