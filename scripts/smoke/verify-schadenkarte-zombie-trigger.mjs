// Verhaltens-Verifikation des Zombie-Triggers (Migration 20260714210048) auf prod.
//
// "Trigger existiert" != "Trigger greift". Dieses Script beweist das Verhalten:
//   Fahrzeug + gebundene Karte anlegen -> Fahrzeug loeschen -> Karte MUSS auf 'frei' stehen.
// Ohne den Trigger bliebe sie 'gebunden' mit fahrzeug_id=NULL (der Zombie) und waere damit
// weder nutzbar noch neu bindbar.
//
// Legt ausschliesslich Wegwerf-Daten an und raeumt sie restlos wieder ab.
// Usage: node scripts/smoke/verify-schadenkarte-zombie-trigger.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV_PFAD = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const PROD_REF = 'paizkjajbuxxksdoycev'
const TEST_FIRMA = 'dafc57ee-0d27-4d7e-8e1a-4a11edd6f713' // Test-Flotte GmbH (Smoke)
const TOKEN = 'SKT-ZZTRIGGERTEST9' // 16 Zeichen nach SKT-, Alphabet-konform

function ladeEnv(p) {
  const o = {}
  for (const z of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(z)
    if (!m) continue
    let v = m[2].trim()
    if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1)
    o[m[1]] = v
  }
  return o
}

const env = ladeEnv(ENV_PFAD)
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes(PROD_REF)) throw new Error('falsche DB-ref')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let vehicleId = null
let karteId = null

async function aufraeumen() {
  if (karteId) await db.from('schadenkarten').delete().eq('id', karteId)
  if (vehicleId) await db.from('vehicles').delete().eq('id', vehicleId)
}

try {
  // 1) Wegwerf-Fahrzeug
  const { data: v, error: ve } = await db
    .from('vehicles')
    .insert({ kennzeichen_aktuell: 'XX-TRIGGER 1', hersteller: 'ZZ-Trigger-Test' })
    .select('id')
    .single()
  if (ve) throw new Error(`Fahrzeug-Insert: ${ve.message}`)
  vehicleId = v.id
  console.log(`[1] Wegwerf-Fahrzeug angelegt: ${vehicleId}`)

  // 2) Karte GEBUNDEN an dieses Fahrzeug
  const { data: k, error: ke } = await db
    .from('schadenkarten')
    .insert({
      karten_token: TOKEN,
      firma_id: TEST_FIRMA,
      fahrzeug_id: vehicleId,
      status: 'gebunden',
      gebunden_am: new Date().toISOString(),
      charge: 'trigger-verify',
    })
    .select('id, status, fahrzeug_id')
    .single()
  if (ke) throw new Error(`Karten-Insert: ${ke.message}`)
  karteId = k.id
  console.log(`[2] Karte gebunden:  status=${k.status}  fahrzeug_id=${k.fahrzeug_id ? 'gesetzt' : 'NULL'}`)

  // 3) Fahrzeug loeschen -> der Trigger muss feuern
  const { error: de } = await db.from('vehicles').delete().eq('id', vehicleId)
  if (de) throw new Error(`Fahrzeug-Delete: ${de.message}`)
  vehicleId = null
  console.log('[3] Fahrzeug geloescht.')

  // 4) Zustand der Karte pruefen
  const { data: nach, error: se } = await db
    .from('schadenkarten')
    .select('status, fahrzeug_id, gebunden_am, gebunden_von')
    .eq('id', karteId)
    .single()
  if (se) throw new Error(`Karten-Read: ${se.message}`)

  console.log(`[4] Karte danach:    status=${nach.status}  fahrzeug_id=${nach.fahrzeug_id ?? 'NULL'}`)

  const ok =
    nach.status === 'frei' &&
    nach.fahrzeug_id === null &&
    nach.gebunden_am === null &&
    nach.gebunden_von === null

  console.log('')
  if (ok) {
    console.log('=== BESTANDEN: Trigger greift. Karte ist frei und wiederverwendbar. ===')
  } else {
    console.log('=== FEHLGESCHLAGEN: Karte ist ein ZOMBIE (status=gebunden, fahrzeug_id=NULL). ===')
    process.exitCode = 1
  }
} catch (err) {
  console.error(`\n!! FEHLER: ${err.message}`)
  process.exitCode = 1
} finally {
  await aufraeumen()
  const { count } = await db
    .from('schadenkarten')
    .select('id', { count: 'exact', head: true })
    .eq('karten_token', TOKEN)
  console.log(`\nAufgeraeumt. Rest-Testkarten: ${count ?? 0} (soll 0)`)
}
