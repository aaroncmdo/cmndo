// AAR SV-Audit-Follow-up: Täglicher Cron der Isochrone-Polygone nachzieht.
//
// Ausgangslage: SVs werden mit Standort-Koordinaten angelegt, aber das
// isochrone_polygon wird asynchron via HERE-API berechnet. Wenn der Call
// zum Anlege-Zeitpunkt failt (HERE-Timeout, Netz-Fehler, etc.) bleibt das
// Feld NULL — der SV fällt im Dispatch-Matching auf Radius-Fallback zurück,
// was ungenauer ist. Audit fand 1 SV ohne Polygon.
//
// Dieser Cron (täglich 03:00 via vercel.json) sucht SVs mit Koordinaten
// aber ohne Polygon und backfillt bis zu 20 pro Run — begrenzt, damit HERE-
// Ratelimits nicht übertreten werden. Bei Bedarf kann der Admin über den
// /api/admin/backfill-isochrones-POST-Endpoint einen manuellen größeren Run
// triggern.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'

export const dynamic = 'force-dynamic'

const MAX_PER_RUN = 20

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()

  const { data: rows } = await db
    .from('sachverstaendige')
    .select('id, paket_umkreis_km, standort_lat, standort_lng')
    .is('isochrone_polygon', null)
    .is('geloescht_am', null)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)
    .limit(MAX_PER_RUN)

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, backfilled: 0, skipped: 0, message: 'Keine SVs ohne Polygon' })
  }

  let backfilled = 0
  let skipped = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const sv of rows) {
    const lat = sv.standort_lat != null ? Number(sv.standort_lat) : null
    const lng = sv.standort_lng != null ? Number(sv.standort_lng) : null
    const radiusKm = Number(sv.paket_umkreis_km) || 15
    if (lat == null || lng == null || radiusKm <= 0) {
      skipped++
      continue
    }

    try {
      const points = await calculateIsochrone(lat, lng, radiusKm)
      if (!points || points.length < 3) {
        skipped++
        continue
      }

      // GeoJSON Polygon mit geschlossenem Ring
      const ring = points.map((p) => [p.lng, p.lat])
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      const polygon = { type: 'Polygon' as const, coordinates: [ring] }

      const { error: upErr } = await db
        .from('sachverstaendige')
        .update({ isochrone_polygon: polygon })
        .eq('id', sv.id as string)

      if (upErr) {
        errors.push({ id: sv.id as string, error: upErr.message })
      } else {
        backfilled++
      }
    } catch (err) {
      errors.push({
        id: sv.id as string,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler',
      })
    }
  }

  console.log(`[isochrone-backfill] backfilled=${backfilled} skipped=${skipped} errors=${errors.length}`)

  return NextResponse.json({
    ok: true,
    total_candidates: rows.length,
    backfilled,
    skipped,
    errors: errors.slice(0, 5),
  })
}
