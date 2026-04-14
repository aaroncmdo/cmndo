#!/usr/bin/env node
// AAR-129: Einmaliges Backfill-Script für bestehende Organisationen
// (Communities, Büros, Akademien) die noch keine standort_lat/isochrone_polygon haben.
//
// Strategie pro Org:
//   1. Wenn einsatzgebiet_zentrum_lat/lng bereits existiert → als standort_lat/lng übernehmen
//   2. Sonst: ersten SV-Member mit Koordinaten nehmen (fallback, selten nötig)
//   3. Wenn Koordinaten + einsatzgebiet_km bekannt sind → HERE API aufrufen, Polygon schreiben
//
// Ausführung:
//   HERE_API_KEY=xxx \
//   SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
//     node scripts/backfill-org-isochrones.mjs
//
// Rate-Limit: 200 ms zwischen HERE-Calls (HERE Free-Tier: 5 req/sec).

import { createClient } from '@supabase/supabase-js'
import { decode } from '@here/flexpolyline'

const HERE_API_URL = 'https://isoline.router.hereapi.com/v8/isolines'
const THROTTLE_MS = 200

async function calculateIsochrone(lat, lng, radiusKm, apiKey) {
  const url = new URL(HERE_API_URL)
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('transportMode', 'car')
  url.searchParams.set('origin', `${lat},${lng}`)
  url.searchParams.set('range[type]', 'distance')
  url.searchParams.set('range[values]', String(Math.round(radiusKm * 1000)))
  url.searchParams.set('routingMode', 'fast')
  url.searchParams.set('shape', 'simple')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HERE ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const outer = data.isolines?.[0]?.polygons?.[0]?.outer
  if (!outer) throw new Error('Kein Polygon in Response')
  const decoded = decode(outer)
  if (!decoded.polyline || decoded.polyline.length < 3) {
    throw new Error(`Polygon zu klein (${decoded.polyline?.length ?? 0} Punkte)`)
  }
  // GeoJSON: [lng, lat] + Ring schließen
  const ring = decoded.polyline.map(([pLat, pLng]) => [pLng, pLat])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  return { type: 'Polygon', coordinates: [ring] }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const hereKey = process.env.HERE_API_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!hereKey || !supabaseUrl || !serviceKey) {
    console.error('HERE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein')
    process.exit(1)
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Alle Orgs ohne Polygon laden (aber ggf. mit Koordinaten)
  const { data: orgs, error } = await db
    .from('organisationen')
    .select('id, name, typ, standort_lat, standort_lng, einsatzgebiet_zentrum_lat, einsatzgebiet_zentrum_lng, einsatzgebiet_radius_km, einsatzgebiet_km, isochrone_polygon')
    .is('isochrone_polygon', null)

  if (error) {
    console.error('Org-Query fehlgeschlagen:', error.message)
    process.exit(1)
  }

  if (!orgs?.length) {
    console.log('Alle Organisationen haben bereits ein Polygon — nichts zu tun.')
    return
  }

  console.log(`Starte Backfill für ${orgs.length} Organisationen...\n`)
  let ok = 0
  let skipped = 0
  let failed = 0

  for (const org of orgs) {
    let lat = org.standort_lat != null ? Number(org.standort_lat) : null
    let lng = org.standort_lng != null ? Number(org.standort_lng) : null
    const updatePatch = {}

    // Fallback 1: einsatzgebiet_zentrum_*
    if (lat == null || lng == null) {
      if (org.einsatzgebiet_zentrum_lat != null && org.einsatzgebiet_zentrum_lng != null) {
        lat = Number(org.einsatzgebiet_zentrum_lat)
        lng = Number(org.einsatzgebiet_zentrum_lng)
        updatePatch.standort_lat = lat
        updatePatch.standort_lng = lng
      }
    }

    // Fallback 2: ersten SV-Member mit Koordinaten
    if (lat == null || lng == null) {
      const { data: memberSv } = await db
        .from('sachverstaendige')
        .select('standort_lat, standort_lng')
        .eq('organisation_id', org.id)
        .not('standort_lat', 'is', null)
        .not('standort_lng', 'is', null)
        .limit(1)
        .maybeSingle()
      if (memberSv?.standort_lat != null && memberSv?.standort_lng != null) {
        lat = Number(memberSv.standort_lat)
        lng = Number(memberSv.standort_lng)
        updatePatch.standort_lat = lat
        updatePatch.standort_lng = lng
      }
    }

    const radiusKm = Number(org.einsatzgebiet_km ?? org.einsatzgebiet_radius_km ?? 0)

    if (lat == null || lng == null || radiusKm <= 0) {
      console.log(`— ${org.typ}/${org.name}: keine Koordinaten oder Radius, skip`)
      skipped++
      continue
    }

    try {
      const polygon = await calculateIsochrone(lat, lng, radiusKm, hereKey)
      updatePatch.isochrone_polygon = polygon
      if (org.einsatzgebiet_km == null) updatePatch.einsatzgebiet_km = radiusKm

      const { error: upErr } = await db
        .from('organisationen')
        .update(updatePatch)
        .eq('id', org.id)
      if (upErr) throw new Error(upErr.message)
      console.log(`✓ ${org.typ}/${org.name} (${polygon.coordinates[0].length} Punkte, ${radiusKm} km)`)
      ok++
    } catch (err) {
      console.error(`✗ ${org.typ}/${org.name}: ${err.message}`)
      failed++
    }

    await sleep(THROTTLE_MS)
  }

  console.log(`\nFertig: ${ok} erfolgreich, ${skipped} skipped (keine Koords), ${failed} Fehler.`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
