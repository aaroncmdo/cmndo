#!/usr/bin/env node
/**
 * AAR-912 Diagnostic — Karte-Loader sequentiell mit Service-Role-Key probieren,
 * jeden Step protokollieren. Zeigt welcher Query 25P02 auslöst.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local')
  process.exit(1)
}
const supabase = createClient(URL, KEY)

async function step(name, fn) {
  process.stdout.write(`→ ${name} ... `)
  try {
    const t0 = Date.now()
    const result = await fn()
    const ms = Date.now() - t0
    if (result?.error) {
      console.log(`ERROR (${ms}ms)\n   ${JSON.stringify(result.error, null, 2)}`)
    } else {
      const n = Array.isArray(result?.data) ? result.data.length : '?'
      console.log(`ok (${ms}ms, rows=${n})`)
    }
  } catch (err) {
    console.log(`THROW\n   ${err.message}`)
  }
}

console.log('1. Einzelne Tabellen-Reads (alle separat):\n')

await step('plz_geo', () => supabase.from('plz_geo').select('plz, lat, lng, ort').limit(5))
await step('leads (Karte-spalten)', () =>
  supabase
    .from('leads')
    .select('id, vorname, nachname, firma_name, schadentyp, besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, kunde_plz, kunde_stadt, halter_plz, halter_stadt, created_at, disqualifiziert, konvertiert_zu_fall_id')
    .or('disqualifiziert.is.null,disqualifiziert.eq.false')
    .is('konvertiert_zu_fall_id', null)
    .limit(5),
)
await step('sachverstaendige aktiv', () =>
  supabase
    .from('sachverstaendige')
    .select('id, paket, profile_id, firmenname, spezifikationen, standort_lat, standort_lng, standort_plz')
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)
    .limit(5),
)
await step('profiles (vorname/nachname)', () =>
  supabase.from('profiles').select('id, vorname, nachname').limit(5),
)
await step('google_bewertungen_cache', () =>
  supabase.from('google_bewertungen_cache').select('profile_id, durchschnitt, anzahl_bewertungen').limit(5),
)
await step('gutachter_termine (heute, simple)', () => {
  const now = new Date()
  const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
  const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
  return supabase
    .from('gutachter_termine')
    .select('id, start_zeit, status, fall_id, lead_id, sv_id, gps_lat_ankunft, gps_lng_ankunft')
    .gte('start_zeit', s)
    .lte('start_zeit', e)
    .limit(5)
})
await step('gutachter_termine (heute, mit Joins inkl. FK-Hint)', () => {
  const now = new Date()
  const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
  const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
  return supabase
    .from('gutachter_termine')
    .select(
      `id, start_zeit, status, fall_id, lead_id, sv_id, gps_lat_ankunft, gps_lng_ankunft,
       lead:leads(vorname, nachname, besichtigungsort_lat, besichtigungsort_lng, kunde_plz, halter_plz),
       sv:sachverstaendige(standort_lat, standort_lng, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname)),
       fall:faelle(fall_nummer)`,
    )
    .gte('start_zeit', s)
    .lte('start_zeit', e)
    .limit(5)
})

console.log('\n2. Selber Connection, mehrere queries nacheinander:\n')
await step('leads basic', () => supabase.from('leads').select('id').limit(1))
await step('sachverstaendige basic', () => supabase.from('sachverstaendige').select('id').limit(1))
await step('gutachter_termine basic', () => supabase.from('gutachter_termine').select('id').limit(1))

console.log('\n3. Selber Connection, Promise.all:\n')
const start = Date.now()
const [r1, r2, r3] = await Promise.all([
  supabase.from('leads').select('id').limit(1),
  supabase.from('sachverstaendige').select('id').limit(1),
  supabase.from('gutachter_termine').select('id').limit(1),
])
console.log(`Promise.all ${Date.now() - start}ms`)
console.log('  leads', r1.error ? `ERR ${JSON.stringify(r1.error)}` : 'ok')
console.log('  sachverstaendige', r2.error ? `ERR ${JSON.stringify(r2.error)}` : 'ok')
console.log('  gutachter_termine', r3.error ? `ERR ${JSON.stringify(r3.error)}` : 'ok')
