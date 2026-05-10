// AAR-196: Einmal-Script/Maintenance-Endpoint zum Backfill der Isochrone-
// Polygone. Admin-only (Auth-Check + Rolle). POST triggert den Run, GET zeigt
// wie viele SVs noch ein Polygon brauchen.
//
// AAR-549 S1 Follow-Up: Der ursprüngliche Radius-Sync radius_km ↔
// paket_umkreis_km ist mit der Konsolidierung entfallen — paket_umkreis_km
// ist kanonisch, radius_km wurde gedropt.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'

async function ensureAdmin(request?: Request) {
  // CRON_SECRET-Header erlaubt VPS-Aufrufe ohne Browser-Session
  if (request) {
    const auth = request.headers.get('authorization')
    if (auth === `Bearer ${process.env.CRON_SECRET}`) return { ok: true as const }
  }
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' as const, status: 401 }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') {
    return { error: 'Nur Admin' as const, status: 403 }
  }
  return { ok: true as const }
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = createAdminClient()
  const { data } = await db
    .from('sachverstaendige')
    .select('id, paket, paket_umkreis_km, isochrone_polygon, standort_lat, standort_lng')

  const svs = (data ?? []) as Array<{
    id: string
    paket: string | null
    paket_umkreis_km: number | null
    isochrone_polygon: unknown
    standort_lat: number | null
    standort_lng: number | null
  }>

  const ohnePolygonMitKoords = svs.filter(
    (s) => !s.isochrone_polygon && s.standort_lat != null && s.standort_lng != null,
  )

  return NextResponse.json({
    total: svs.length,
    needs_isochrone_backfill: ohnePolygonMitKoords.length,
    sample_ids: {
      needs_isochrone: ohnePolygonMitKoords.slice(0, 5).map((s) => s.id),
    },
  })
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean; limit?: number }
  const dryRun = body.dryRun === true
  const limit = Number(body.limit ?? 50)

  const db = createAdminClient()
  const { data: rows } = await db
    .from('sachverstaendige')
    .select('id, paket, paket_umkreis_km, isochrone_polygon, standort_lat, standort_lng')
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)

  const svs = (rows ?? []) as Array<{
    id: string
    paket: string | null
    paket_umkreis_km: number | null
    isochrone_polygon: unknown
    standort_lat: number
    standort_lng: number
  }>

  const results: Array<{ id: string; isochrone?: boolean; error?: string }> = []
  let processed = 0

  for (const sv of svs) {
    if (processed >= limit) break
    if (sv.isochrone_polygon) continue
    processed++

    try {
      const radiusZahl = Number(sv.paket_umkreis_km) || 40
      if (dryRun) {
        results.push({ id: sv.id, isochrone: true })
        continue
      }
      const polygon = await calculateIsochrone(sv.standort_lat, sv.standort_lng, radiusZahl)
      if (polygon.length === 0) {
        results.push({ id: sv.id, error: 'Isochrone lieferte 0 Punkte' })
        continue
      }
      const { error } = await db
        .from('sachverstaendige')
        .update({ isochrone_polygon: polygon })
        .eq('id', sv.id)
      if (error) {
        results.push({ id: sv.id, error: error.message })
        continue
      }
      results.push({ id: sv.id, isochrone: true })
    } catch (err) {
      results.push({ id: sv.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({
    dry_run: dryRun,
    processed,
    results,
  })
}
