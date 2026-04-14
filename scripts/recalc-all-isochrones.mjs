#!/usr/bin/env node
// AAR-132: Migrations-Script — alle sachverstaendige.isochrone_polygon Einträge
// einmalig mit HERE API neu berechnen, damit alle SVs nach dem OSRM→HERE-Wechsel
// auf dem gleichen (präziseren) Stand sind.
//
// Ausführung:
//   HERE_API_KEY=xxx \
//   SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
//     node scripts/recalc-all-isochrones.mjs
//
// Rate-Limit: 200 ms zwischen HERE-Calls (HERE Free-Tier erlaubt 5 req/sec).
// Idempotent — kann mehrfach laufen, überschreibt bestehende Polygone.

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

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
  })
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
  return decoded.polyline.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng }))
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

  const { data: svs, error } = await db
    .from('sachverstaendige')
    .select('id, standort_lat, standort_lng, paket_umkreis_km, radius_km, profiles(vorname, nachname)')
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
    const radiusKm = Number(sv.paket_umkreis_km) || Number(sv.radius_km) || 15

    try {
      const polygon = await calculateIsochrone(
        Number(sv.standort_lat),
        Number(sv.standort_lng),
        radiusKm,
        hereKey,
      )
      const { error: upErr } = await db
        .from('sachverstaendige')
        .update({ isochrone_polygon: polygon })
        .eq('id', sv.id)
      if (upErr) throw new Error(upErr.message)
      console.log(`✓ ${name} (${polygon.length} Punkte, ${radiusKm} km)`)
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
