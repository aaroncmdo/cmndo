// AAR-196: Einmal-Script/Maintenance-Endpoint zum Backfill der Isochrone-
// Polygone + Sync von radius_km ↔ paket_umkreis_km.
// Admin-only (Auth-Check + Rolle). POST triggert den Run, GET zeigt die
// aktuelle Diskrepanz.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'

// Paket-Map für radius_km / paket_umkreis_km. Single Source of Truth
// sollte eigentlich in einer Konfig liegen — hier pragmatisch inline,
// damit das Backfill-Script allein lauffähig ist.
const PAKET_KM: Record<string, number> = {
  standard: 15,
  'starter-10': 15,
  pro: 40,
  'standard-25': 40,
  premium: 70,
  'premium-50': 70,
}

async function ensureAdmin() {
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

export async function GET() {
  const auth = await ensureAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = createAdminClient()
  const { data } = await db
    .from('sachverstaendige')
    .select('id, paket, radius_km, paket_umkreis_km, isochrone_polygon, standort_lat, standort_lng')

  const svs = (data ?? []) as Array<{
    id: string
    paket: string | null
    radius_km: number | null
    paket_umkreis_km: number | null
    isochrone_polygon: unknown
    standort_lat: number | null
    standort_lng: number | null
  }>

  const ohnePolygonMitKoords = svs.filter(
    (s) => !s.isochrone_polygon && s.standort_lat != null && s.standort_lng != null,
  )
  const radiusInkonsistent = svs.filter((s) => s.radius_km !== s.paket_umkreis_km)

  return NextResponse.json({
    total: svs.length,
    needs_isochrone_backfill: ohnePolygonMitKoords.length,
    radius_inconsistent: radiusInkonsistent.length,
    sample_ids: {
      needs_isochrone: ohnePolygonMitKoords.slice(0, 5).map((s) => s.id),
      radius_inconsistent: radiusInkonsistent.slice(0, 5).map((s) => ({
        id: s.id,
        paket: s.paket,
        radius_km: s.radius_km,
        paket_umkreis_km: s.paket_umkreis_km,
      })),
    },
  })
}

export async function POST(request: Request) {
  const auth = await ensureAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean; limit?: number }
  const dryRun = body.dryRun === true
  const limit = Number(body.limit ?? 50)

  const db = createAdminClient()
  const { data: rows } = await db
    .from('sachverstaendige')
    .select('id, paket, radius_km, paket_umkreis_km, isochrone_polygon, standort_lat, standort_lng')
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)

  const svs = (rows ?? []) as Array<{
    id: string
    paket: string | null
    radius_km: number | null
    paket_umkreis_km: number | null
    isochrone_polygon: unknown
    standort_lat: number
    standort_lng: number
  }>

  const results: Array<{ id: string; isochrone?: boolean; radius?: boolean; error?: string }> = []
  let processed = 0

  for (const sv of svs) {
    if (processed >= limit) break

    const needsPolygon = !sv.isochrone_polygon
    // Paket-Map liefert den gewünschten Radius (primär), fallback auf
    // paket_umkreis_km wenn Paket unbekannt.
    const zielRadius = (sv.paket && PAKET_KM[sv.paket]) ?? sv.paket_umkreis_km ?? sv.radius_km ?? 40
    const needsRadiusSync = sv.radius_km !== zielRadius || sv.paket_umkreis_km !== zielRadius

    if (!needsPolygon && !needsRadiusSync) continue
    processed++

    try {
      const update: Record<string, unknown> = {}

      if (needsRadiusSync) {
        update.radius_km = zielRadius
        update.paket_umkreis_km = zielRadius
      }

      if (needsPolygon) {
        if (dryRun) {
          // Dry-Run: keinen Vision-API/HERE-Call, nur als Treffer zählen
        } else {
          const radiusZahl = typeof zielRadius === 'number' ? zielRadius : Number(zielRadius) || 40
          const polygon = await calculateIsochrone(sv.standort_lat, sv.standort_lng, radiusZahl)
          if (polygon.length > 0) {
            update.isochrone_polygon = polygon
          }
        }
      }

      if (!dryRun && Object.keys(update).length > 0) {
        const { error } = await db.from('sachverstaendige').update(update).eq('id', sv.id)
        if (error) {
          results.push({ id: sv.id, error: error.message })
          continue
        }
      }

      results.push({
        id: sv.id,
        isochrone: needsPolygon,
        radius: needsRadiusSync,
      })
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
