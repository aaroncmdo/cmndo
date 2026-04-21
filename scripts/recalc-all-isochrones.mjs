#!/usr/bin/env node
// AAR-661: Bulk-Recalc aller SV-Isochronen via Mapbox Isochrone API.
// Ersetzt den alten HERE-basierten Script — HERE-Key in Vercel war kein
// REST-Key sondern OAuth-Credential, Aufrufe gaben 401.
//
// Ausführung:
//   MAPBOX_ACCESS_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/recalc-all-isochrones.mjs
//
// Schreibt direkt als GeoJSON-Polygon {type, coordinates} — das Format das
// KarteHubClient erwartet. Altes flaches Point-Array wird überschrieben.
// Rate-Limit: 300 ms zwischen Calls (Mapbox: 300 req/min auf dem Paid-Tier).
// Idempotent — kann mehrfach laufen.

import { createClient } from '@supabase/supabase-js'

const MAPBOX_ISO_URL = 'https://api.mapbox.com/isochrone/v1/mapbox/driving'
const THROTTLE_MS = 300
const MAX_METERS = 100_000 // Mapbox-Limit

async function calculateIsochrone(lat, lng, radiusKm, token) {
  const meters = Math.min(MAX_METERS, Math.round(radiusKm * 1000))
  const url = new URL(`${MAPBOX_ISO_URL}/${lng},${lat}`)
  url.searchParams.set('contours_meters', String(meters))
  url.searchParams.set('polygons', 'true')
  url.searchParams.set('denoise', '1')
  url.searchParams.set('generalize', '50') // 50m Simplify — genug fürs Admin-Overlay
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Mapbox ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const feature = data.features?.[0]
  const geom = feature?.geometry
  if (!geom || geom.type !== 'Polygon') throw new Error('Kein Polygon in Response')
  const ring = geom.coordinates?.[0]
  if (!Array.isArray(ring) || ring.length < 3) throw new Error(`Polygon zu klein (${ring?.length ?? 0} Punkte)`)
  return { type: 'Polygon', coordinates: [ring] }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!mapboxToken || !supabaseUrl || !serviceKey) {
    console.error('MAPBOX_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein')
    process.exit(1)
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // AAR-657: profiles-Embed mit FK-Hint (4 FKs auf profiles)
  // AAR-549: paket_umkreis_km ist kanonisch, radius_km wurde gedropt
  const { data: svs, error } = await db
    .from('sachverstaendige')
    .select('id, standort_lat, standort_lng, paket_umkreis_km, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)
    .is('geloescht_am', null)

  if (error) {
    console.error('SV-Query fehlgeschlagen:', error.message)
    process.exit(1)
  }

  if (!svs?.length) {
    console.log('Keine SVs mit Standort gefunden.')
    return
  }

  console.log(`Starte Recalc für ${svs.length} SVs...\n`)
  let ok = 0
  let failed = 0

  for (const sv of svs) {
    const profileRaw = sv.profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
    const name = profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : sv.id
    const radiusKm = Number(sv.paket_umkreis_km) || 15

    try {
      const polygon = await calculateIsochrone(
        Number(sv.standort_lat),
        Number(sv.standort_lng),
        radiusKm,
        mapboxToken,
      )
      const { error: upErr } = await db
        .from('sachverstaendige')
        .update({ isochrone_polygon: polygon })
        .eq('id', sv.id)
      if (upErr) throw new Error(upErr.message)
      console.log(`✓ ${name} (${polygon.coordinates[0].length} Punkte, ${radiusKm} km)`)
      ok++
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`)
      failed++
    }

    await sleep(THROTTLE_MS)
  }

  console.log(`\nFertig: ${ok} erfolgreich, ${failed} Fehler.`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
