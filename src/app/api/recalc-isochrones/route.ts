import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const NUM_POINTS = 60

async function calculateIsochrone(lat: number, lng: number, radiusKm: number): Promise<{ lat: number; lng: number }[]> {
  const rayPoints: { lat: number; lng: number; angle: number }[] = []
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const dLat = (radiusKm / 111.32) * Math.cos(angle)
    const dLng = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    rayPoints.push({ lat: lat + dLat, lng: lng + dLng, angle })
  }

  try {
    const coords = [[lng, lat], ...rayPoints.map(p => [p.lng, p.lat])]
      .map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join(';')
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (res.ok) {
      const data = await res.json()
      if (data.code === 'Ok' && data.distances?.[0]) {
        const driveDistances: number[] = data.distances[0].slice(1).map((d: number) => d / 1000)
        return rayPoints.map((p, i) => {
          const driveDist = driveDistances[i]
          if (!driveDist || driveDist <= 0) return { lat: p.lat, lng: p.lng }
          const dLat = p.lat - lat
          const dLng = p.lng - lng
          const airDist = Math.sqrt((dLat * 111.32) ** 2 + (dLng * 111.32 * Math.cos(lat * Math.PI / 180)) ** 2)
          const scale = Math.max(0.4, Math.min(1.3, airDist > 0 ? radiusKm / driveDist : 1))
          return { lat: lat + dLat * scale, lng: lng + dLng * scale }
        })
      }
    }
  } catch { /* fallback */ }

  function seededRandom(seed: number) { const x = Math.sin(seed * 9301 + 49297) * 49297; return x - Math.floor(x) }
  const baseSeed = Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm
  return rayPoints.map((_, i) => {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const variation = 0.15 + seededRandom(baseSeed + i * 7) * 0.2
    const factor = 1 - variation + seededRandom(baseSeed + i * 13) * variation * 2
    const dLat = (radiusKm * factor / 111.32) * Math.cos(angle)
    const dLng = (radiusKm * factor / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    return { lat: lat + dLat, lng: lng + dLng }
  })
}

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

  const results: { id: string; status: string; points: number }[] = []

  for (const sv of svList ?? []) {
    const lat = sv.standort_lat
    const lng = sv.standort_lng
    const radiusKm = sv.paket_umkreis_km ?? sv.radius_km ?? 15

    if (lat == null || lng == null) continue

    try {
      const polygon = await calculateIsochrone(lat, lng, radiusKm)
      if (polygon.length > 0) {
        await admin.from('sachverstaendige')
          .update({ isochrone_polygon: polygon })
          .eq('id', sv.id)
        results.push({ id: sv.id, status: 'ok', points: polygon.length })
      } else {
        results.push({ id: sv.id, status: 'empty', points: 0 })
      }
    } catch (e) {
      results.push({ id: sv.id, status: `error: ${e instanceof Error ? e.message : 'unknown'}`, points: 0 })
    }

    // Rate limit: 1s between OSRM requests
    await new Promise(r => setTimeout(r, 1000))
  }

  return NextResponse.json({
    total: svList?.length ?? 0,
    recalculated: results.filter(r => r.status === 'ok').length,
    results,
  })
}
