// AAR SV-Audit-Follow-up: Taeglicher Cron der Isochrone-Polygone nachzieht.
//
// Ausgangslage: SVs werden mit Standort-Koordinaten angelegt, aber das
// isochrone_polygon wird asynchron via HERE-API berechnet. Wenn der Call
// zum Anlege-Zeitpunkt failt (HERE-Timeout, Netz-Fehler, etc.) bleibt das
// Feld NULL — der SV faellt im Dispatch-Matching auf Radius-Fallback zurueck,
// was ungenauer ist. Audit fand 1 SV ohne Polygon.
//
// Dieser Cron (taeglich 03:00 via vercel.json) sucht SVs mit Koordinaten
// aber ohne Polygon und backfillt bis zu 20 pro Run — begrenzt, damit HERE-
// Ratelimits nicht uebertreten werden. Bei Bedarf kann der Admin ueber den
// /api/admin/backfill-isochrones-POST-Endpoint einen manuellen groesseren Run
// triggern.
//
// AAR-956: Zweiter Pass fuer sv_leads (ist_aktiv=true, isochrone_polygon NULL
// oder lat/lng NULL + adresse vorhanden). Je Zeile: fehlende Coords via
// geocodeAdresse nachzieht, dann calculateIsochrone — best-effort pro Zeile.
// MAX_PER_RUN gilt pro Tabelle (je 20), damit die Mapbox-Rate-Limits halten.

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { geocodeAdresse } from '@/lib/mapbox/geocode'

export const dynamic = 'force-dynamic'

const MAX_PER_RUN = 20
// sv_leads makes ~2x API calls per row (geocode + isochrone) — own tunable.
const MAX_SV_LEADS_PER_RUN = 20

/** Wandelt Isochrone-Punkte in ein geschlossenes GeoJSON-Polygon-Array um. */
function pointsToPolygon(points: Array<{ lat: number; lng: number }>): number[][] {
  const ring = points.map((p) => [p.lng, p.lat])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  return ring
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()

  // ─── Pass 1: sachverstaendige ────────────────────────────────────────────

  const { data: svRows } = await db
    .from('sachverstaendige')
    .select('id, paket_umkreis_km, standort_lat, standort_lng')
    .is('isochrone_polygon', null)
    .is('geloescht_am', null)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)
    .limit(MAX_PER_RUN)

  let backfilled = 0
  let skipped = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const sv of svRows ?? []) {
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

      const polygon = { type: 'Polygon' as const, coordinates: [pointsToPolygon(points)] }

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

  console.log(
    `[isochrone-backfill] sv backfilled=${backfilled} skipped=${skipped} errors=${errors.length}`,
  )

  // ─── Pass 2: sv_leads ────────────────────────────────────────────────────
  // Kandidaten: aktiv + (kein Polygon ODER keine Coords aber Adresse vorhanden).

  const { data: leadRows } = await db
    .from('sv_leads')
    .select('id, paket_umkreis_km, lat, lng, adresse, plz, ort')
    .eq('ist_aktiv', true)
    .or('isochrone_polygon.is.null,lat.is.null,lng.is.null')
    .limit(MAX_SV_LEADS_PER_RUN)

  let svLeadsBackfilled = 0
  let svLeadsSkipped = 0
  const svLeadsErrors: Array<{ id: string; error: string }> = []

  for (const lead of leadRows ?? []) {
    try {
      let lat = lead.lat != null ? Number(lead.lat) : null
      let lng = lead.lng != null ? Number(lead.lng) : null

      // Geocoding-Nachzug wenn Coords fehlen aber Adresse vorhanden
      if ((lat == null || lng == null) && lead.adresse) {
        const parts = [lead.adresse, lead.plz, lead.ort].filter(Boolean).join(' ')
        const geo = await geocodeAdresse(parts)
        if (!geo) {
          svLeadsSkipped++
          continue
        }
        lat = geo.lat
        lng = geo.lng
        // Coords persistieren damit kuenftige Runs nicht erneut geocoden
        const { error: coordErr } = await db
          .from('sv_leads')
          .update({ lat, lng })
          .eq('id', lead.id as string)
        if (coordErr) {
          svLeadsErrors.push({ id: lead.id as string, error: coordErr.message })
          continue
        }
      }

      if (lat == null || lng == null) {
        svLeadsSkipped++
        continue
      }

      const radiusKm = Number(lead.paket_umkreis_km) || 15

      const points = await calculateIsochrone(lat, lng, radiusKm)
      if (!points || points.length < 3) {
        svLeadsSkipped++
        continue
      }

      const polygon = { type: 'Polygon' as const, coordinates: [pointsToPolygon(points)] }

      const { error: upErr } = await db
        .from('sv_leads')
        .update({ isochrone_polygon: polygon })
        .eq('id', lead.id as string)

      if (upErr) {
        svLeadsErrors.push({ id: lead.id as string, error: upErr.message })
      } else {
        svLeadsBackfilled++
      }
    } catch (err) {
      svLeadsErrors.push({
        id: lead.id as string,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler',
      })
    }
  }

  console.log(
    `[isochrone-backfill] sv_leads backfilled=${svLeadsBackfilled} skipped=${svLeadsSkipped} errors=${svLeadsErrors.length}`,
  )

  return NextResponse.json({
    ok: true,
    total_candidates: (svRows ?? []).length,
    backfilled,
    skipped,
    errors: errors.slice(0, 5),
    sv_leads_total_candidates: (leadRows ?? []).length,
    sv_leads_backfilled: svLeadsBackfilled,
    sv_leads_skipped: svLeadsSkipped,
    sv_leads_errors: svLeadsErrors.slice(0, 5),
  })
}
