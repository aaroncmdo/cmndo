// CMM-50.1 Runtime-Smoke: bestaetigt (a) die Datums-Cast-Funktionen (verbatim aus
// ensure-vehicle.ts) und (b) dass der Secondary-UPDATE die neuen + bestehenden
// Snapshot-Restfelder schreibt und Postgres die gecasteten Werte akzeptiert.
// Test-FIN, self-cleaning.  cwd = Haupt-Repo (.env.local).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const env = (k) => readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '')
const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })
const TEST_FIN = 'WDB50TESTCMM12345'
let exitCode = 0
const fail = (m) => { console.error('  ✗ FAIL:', m); exitCode = 2 }

// --- Cast-Funktionen: verbatim aus src/lib/vehicles/ensure-vehicle.ts (50.1) ---
function yearToDateStr(y) { if (y == null || !Number.isInteger(y) || y < 1900 || y > 2100) return null; return `${y}-01-01` }
function textToDateStr(t) {
  if (!t) return null
  const s = String(t).trim()
  const mk = (y, mo, d) => { const Y = Number(y), M = Number(mo), D = Number(d); if (!Number.isInteger(Y) || Y < 1900 || Y > 2100 || M < 1 || M > 12 || D < 1 || D > 31) return null; const iso = `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`; const dt = new Date(`${iso}T00:00:00Z`); if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() + 1 !== M || dt.getUTCDate() !== D) return null; return iso }
  let m
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/))) return mk(m[1], m[2], m[3] ?? 1)
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)))          return mk(m[3], m[2], m[1])
  if ((m = s.match(/^(\d{1,2})[./](\d{4})$/)))                   return mk(m[2], m[1], 1)
  if ((m = s.match(/^(\d{4})$/)))                                return mk(m[1], 1, 1)
  return null
}

async function main() {
  console.log('1) Cast-Funktionen (Unit-Asserts):')
  for (const [label, got, want] of [
    ['yearToDateStr(2020)', yearToDateStr(2020), '2020-01-01'],
    ['yearToDateStr(1800)', yearToDateStr(1800), null],
    ['textToDateStr("15.03.2019")', textToDateStr('15.03.2019'), '2019-03-15'],
    ['textToDateStr("03/2019")', textToDateStr('03/2019'), '2019-03-01'],
    ['textToDateStr("2018")', textToDateStr('2018'), '2018-01-01'],
    ['textToDateStr("2018-05")', textToDateStr('2018-05'), '2018-05-01'],
    ['textToDateStr("2020-13-40")', textToDateStr('2020-13-40'), null],
    ['textToDateStr("31.02.2024") Kalender', textToDateStr('31.02.2024'), null],
    ['textToDateStr("31.04.2021") Apr=30', textToDateStr('31.04.2021'), null],
    ['textToDateStr("29.02.2021") kein Schaltjahr', textToDateStr('29.02.2021'), null],
    ['textToDateStr("29.02.2020") Schaltjahr OK', textToDateStr('29.02.2020'), '2020-02-29'],
    ['textToDateStr("2020-02-31") ISO ungueltig', textToDateStr('2020-02-31'), null],
    ['textToDateStr("unbekannt")', textToDateStr('unbekannt'), null],
  ]) { const ok = got === want; console.log(`   ${ok ? '✓' : '✗'} ${label} = ${JSON.stringify(got)}${ok ? '' : ' (erwartet ' + JSON.stringify(want) + ')'}`); if (!ok) fail(label) }

  await db.from('vehicles').delete().eq('fin', TEST_FIN)
  const { data: vid, error: rpcErr } = await db.rpc('upsert_vehicle_by_fin', { p_fin: TEST_FIN, p_hersteller: 'SMOKE-CMM501' })
  if (rpcErr || typeof vid !== 'string') fail('RPC: ' + (rpcErr?.message ?? 'keine UUID'))
  console.log('\n2) RPC vehicle id:', vid)

  const update = {
    kennzeichen_buchstaben: 'AB', farbe_klartext: 'Nachtblau', farbcode: 'LZ5M', bauart: 'Limousine',
    baujahr_monat: yearToDateStr(2020), erstzulassung: textToDateStr('15.03.2019'),
    fahrzeug_ausstattung: { klima: true, navi: 'MBUX' }, fin_quelle: 'smoke_test', fin_extrahiert_am: new Date().toISOString(),
  }
  const { error: updErr } = await db.from('vehicles').update(update).eq('id', vid)
  console.log('3) Secondary-UPDATE error:', updErr?.message ?? 'KEINER')
  if (updErr) fail('Secondary-UPDATE: ' + updErr.message)

  const { data: row } = await db.from('vehicles')
    .select('kennzeichen_buchstaben, farbe_klartext, farbcode, bauart, baujahr_monat, erstzulassung, fahrzeug_ausstattung, fin_quelle, fin_extrahiert_am')
    .eq('id', vid).maybeSingle()
  console.log('4) Zurueckgelesen:', JSON.stringify(row))
  if (row) {
    if (row.kennzeichen_buchstaben !== 'AB') fail('kennzeichen_buchstaben')
    if (row.farbcode !== 'LZ5M') fail('farbcode')
    if (row.baujahr_monat !== '2020-01-01') fail('baujahr_monat cast (' + row.baujahr_monat + ')')
    if (row.erstzulassung !== '2019-03-15') fail('erstzulassung cast (' + row.erstzulassung + ')')
    if (!row.fahrzeug_ausstattung || row.fahrzeug_ausstattung.navi !== 'MBUX') fail('fahrzeug_ausstattung jsonb')
    if (row.fin_quelle !== 'smoke_test') fail('fin_quelle')
  } else fail('Row nicht gefunden')

  await db.from('vehicles').delete().eq('fin', TEST_FIN)
  const { count } = await db.from('vehicles').select('id', { count: 'exact', head: true }).eq('fin', TEST_FIN)
  const { count: total } = await db.from('vehicles').select('id', { count: 'exact', head: true })
  console.log('5) Cleanup — Test-Rows verbleibend:', count, '| vehicles total:', total)
  if (count !== 0) fail('Cleanup unvollstaendig')

  console.log(exitCode === 0 ? '\n✅ CMM-50.1 RUNTIME-SMOKE PASS — Casts + Secondary-UPDATE wirken, DB akzeptiert alle Felder.' : `\n❌ EXIT ${exitCode}`)
}
main().then(() => process.exit(exitCode)).catch((e) => { console.error(e); process.exit(2) })
