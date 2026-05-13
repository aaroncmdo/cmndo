// Legt für den Test-SV eine Zeile in `sachverstaendige` an (Geo + verifiziert),
// damit er als Marker auf der Karte erscheint und vom Smoke gepickt werden kann.
// Idempotent: upsert auf user_id.

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.test' })
loadEnv({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const svUserId = process.env.SMOKE_TEST_SV_USER_ID
if (!svUserId) {
  console.error('SMOKE_TEST_SV_USER_ID fehlt — erst seed-test-users.mjs laufen lassen')
  process.exit(1)
}

// Köln-Zentrum-Koordinaten (50667)
const KOELN = { lat: 50.937531, lng: 6.960279 }

async function inspectSchema() {
  // Probe-Insert mit Pflichtfeldern; bei Schema-Fehler bekommen wir die Spalten-Namen
  const { data, error } = await supabase
    .from('sachverstaendige')
    .select('*')
    .limit(1)
  if (error) {
    console.error('select sachverstaendige fehlgeschlagen:', error.message)
    return null
  }
  const cols = data?.[0] ? Object.keys(data[0]) : []
  return cols
}

async function main() {
  console.log('Inspeziere sachverstaendige-Schema…')
  const cols = await inspectSchema()
  if (cols) console.log(`  Spalten: ${cols.join(', ')}`)
  console.log()

  // Minimaler Upsert — Felder die in den meisten Schemas existieren
  const payload = {
    profile_id: svUserId,
    firmenname: 'Smoke SV',
    standort_plz: '50667',
    standort_adresse: 'Köln Test',
    standort_lat: KOELN.lat,
    standort_lng: KOELN.lng,
    verifiziert: true,
    ist_aktiv: true,
    paket: 'standard',
    paket_umkreis_km: 50,
    portal_zugang_freigeschaltet: true,
  }

  console.log('Upsert in sachverstaendige…')
  const { data: existing } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', svUserId)
    .maybeSingle()
  let data, error
  if (existing) {
    ;({ data, error } = await supabase.from('sachverstaendige').update(payload).eq('id', existing.id).select())
  } else {
    ;({ data, error } = await supabase.from('sachverstaendige').insert(payload).select())
  }
  if (error) {
    console.error('✗ Upsert fehlgeschlagen:', error.message)
    console.error('  Vermutlich fehlende oder anders heißende Spalte. Schema oben prüfen.')
    process.exit(1)
  }
  console.log(`✓ SV-Row angelegt/aktualisiert (id ${data?.[0]?.id ?? '?'})`)
  console.log(`  user_id=${svUserId}, lat=${KOELN.lat}, lng=${KOELN.lng}, verifiziert=true`)
}

main().catch((err) => {
  console.error('seed-sv-row abgestürzt:', err)
  process.exit(1)
})
