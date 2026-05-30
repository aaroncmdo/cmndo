// CMM-50.0 Runtime-Smoke: beweist, dass upsert_vehicle_by_fin via supabase-js
// (service_role) zur Laufzeit eine vehicles-Row anlegt + die UUID liefert — genau
// der RPC-Aufruf, den ensureVehicleFromFin macht. Test-FIN, am Ende aufgeraeumt.
//   cwd = Haupt-Repo (.env.local). node ".claude/worktrees/cmm-50-0-write-path/scripts/probe-cmm50-0-writepath.mjs"
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const env = (k) => readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '')
const url = env('NEXT_PUBLIC_SUPABASE_URL')
const key = env('SUPABASE_SERVICE_ROLE_KEY')
if (!key) { console.error('SERVICE_ROLE_KEY fehlt'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const TEST_FIN = 'WDBTESTFCMM501234' // 17 Zeichen, kein I/L/O/Q -> RPC-valid; klar als Test markiert
let exitCode = 0

async function main() {
  // Vorab aufraeumen (falls ein vorheriger Lauf abbrach)
  await db.from('vehicles').delete().eq('fin', TEST_FIN)

  // 1. RPC genau wie der Helper
  const { data: vid, error } = await db.rpc('upsert_vehicle_by_fin', {
    p_fin: TEST_FIN, p_kennzeichen: 'B-SMOKE-1', p_hsn: '0603', p_tsn: 'BMW',
    p_hersteller: 'SMOKE-CMM50', p_modell: 'TestModell', p_kilometerstand: 12345,
  })
  console.log('1) RPC error          :', error?.message ?? 'KEINER')
  console.log('   RPC returned id     :', vid, `(typeof ${typeof vid})`)
  if (error || typeof vid !== 'string') { console.error('   ✗ FAIL: RPC lieferte keine vehicle-UUID'); exitCode = 2 }

  // 2. vehicles-Row da + Felder gesetzt?
  const { data: row } = await db.from('vehicles')
    .select('id, fin, hersteller, modell_haupttyp, kennzeichen_aktuell, hsn, tsn, aktueller_kilometerstand')
    .eq('fin', TEST_FIN).maybeSingle()
  console.log('2) vehicles-Row        :', row ? 'EXISTIERT' : '✗ FEHLT')
  if (row) {
    console.log('   ->', JSON.stringify(row))
    if (row.id !== vid) { console.error('   ✗ FAIL: row.id != RPC-Rueckgabe'); exitCode = 2 }
    if (row.hersteller !== 'SMOKE-CMM50') { console.error('   ✗ FAIL: hersteller nicht gesetzt'); exitCode = 2 }
  } else { exitCode = 2 }

  // 3. Idempotenz: zweiter Aufruf -> selbe id (ON CONFLICT(fin))
  const { data: vid2 } = await db.rpc('upsert_vehicle_by_fin', { p_fin: TEST_FIN, p_hersteller: 'SMOKE-CMM50' })
  console.log('3) Idempotenz (id==id) :', vid2 === vid ? 'OK' : `✗ FAIL (${vid2} != ${vid})`)
  if (vid2 !== vid) exitCode = 2

  // 4. Cleanup
  const { error: delErr } = await db.from('vehicles').delete().eq('fin', TEST_FIN)
  const { count } = await db.from('vehicles').select('id', { count: 'exact', head: true }).eq('fin', TEST_FIN)
  console.log('4) Cleanup delete error:', delErr?.message ?? 'KEINER', '| Test-Rows verbleibend:', count)
  if (delErr || count !== 0) { console.error('   ✗ WARN: Test-Vehicle nicht sauber entfernt!'); exitCode = 3 }

  // 5. Gesamt-Tabellenstand (muss wieder Baseline sein)
  const { count: total } = await db.from('vehicles').select('id', { count: 'exact', head: true })
  console.log('5) vehicles total nach Smoke:', total, '(Baseline war 0)')

  console.log(exitCode === 0 ? '\n✅ RUNTIME-SMOKE PASS — Write-Path-Mechanik wirkt live.' : `\n❌ EXIT ${exitCode}`)
}
main().then(() => process.exit(exitCode)).catch((e) => { console.error(e); process.exit(2) })
