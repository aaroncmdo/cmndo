// CMM-50.3b Smoke: beweist, dass die repointete v_faelle_mit_aktuellem_termin die
// vehicles-Daten ueber ALLE 15 Fahrzeug-Spalten surfacet (COALESCE + LEFT JOIN), mit
// korrekten Casts (date->int Jahr, date->text, varchar->text). Haengt ein Test-Vehicle
// KURZ an einen echten Claim, prueft die View, und revertiert IMMER (finally) + loescht
// das Test-Vehicle. Kein bleibender Change.
//   cwd = Haupt-Repo (.env.local).  Run: node scripts/probe-cmm50-3b-smoke.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const env = (k) => readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '')
const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })
// Gueltige ISO-3779-FIN: KEINE I/L/O/Q (die RPC validiert das). 17 Zeichen.
const TEST_FIN = 'WDB503BSMK3000012'
let exitCode = 0
const ok = (b, m) => { console.log(`   ${b ? '✓' : '✗'} ${m}`); if (!b) exitCode = 2 }

async function main() {
  let claimId = null, fallId = null, origVid = undefined, vid = null
  try {
    await db.from('vehicles').delete().eq('fin', TEST_FIN)

    // vehicles-Row anlegen (50.0-Write-Path) + reiche Snapshot setzen (50.1).
    const { data: rid, error: rpcErr } = await db.rpc('upsert_vehicle_by_fin', {
      p_fin: TEST_FIN, p_kennzeichen: 'B-503B-1', p_hersteller: 'SMOKE-503B', p_modell: '3b-Modell',
    })
    vid = rid
    ok(!rpcErr && typeof vid === 'string', `vehicles-Row angelegt (${vid})`)
    const FIN_EXTR = '2026-05-30T12:34:56.000Z'
    const { error: updErr } = await db.from('vehicles').update({
      bauart: '503B-Bauart', baujahr_monat: '2021-01-01', farbe_klartext: '503B-Blau', farbcode: '503B',
      erstzulassung: '2020-06-15', aktueller_kilometerstand: 84210, hsn: '1313', tsn: 'ABC',
      fahrzeug_ausstattung: { smoke503b: true }, fin_quelle: 'cmm503b_smoke', fin_extrahiert_am: FIN_EXTR,
    }).eq('id', vid)
    ok(!updErr, 'Snapshot (bauart/baujahr/farbe/farbcode/erstzulassung/km/hsn/tsn/ausstattung/fin_quelle/fin_extr) gesetzt')

    // Echten Claim + faelle holen (View-Key = faelle.id)
    const { data: fr } = await db.from('faelle').select('id, claim_id').not('claim_id', 'is', null).limit(1).single()
    fallId = fr?.id; claimId = fr?.claim_id
    if (!claimId) { ok(false, 'Kein Claim mit faelle gefunden — View-Smoke uebersprungen'); return }
    const { data: cr } = await db.from('claims').select('vehicle_id').eq('id', claimId).single()
    origVid = cr?.vehicle_id ?? null

    // Test-Vehicle KURZ an den Claim haengen
    await db.from('claims').update({ vehicle_id: vid }).eq('id', claimId)

    // v_faelle_mit_aktuellem_termin muss ALLE 15 Fahrzeug-Spalten aus vehicles surfacen
    console.log(`v_faelle_mit_aktuellem_termin (Claim ${claimId} kurz verlinkt):`)
    const { data: v, error: vErr } = await db.from('v_faelle_mit_aktuellem_termin')
      .select('kennzeichen, fahrzeug_typ, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, fin_quelle, fin_extrahiert_am, fahrzeug_farbe, erstzulassung, kilometerstand, fin_vin, fahrzeug_ausstattung, hsn, tsn, lackfarbe_code')
      .eq('id', fallId).single()
    ok(!vErr && !!v, `View-Row gelesen${vErr ? ' (' + vErr.message + ')' : ''}`)
    if (v) {
      ok(v.kennzeichen === 'B-503B-1', `kennzeichen (←kennzeichen_aktuell::text) = ${v.kennzeichen}`)
      ok(v.fahrzeug_typ === '503B-Bauart', `fahrzeug_typ (←bauart) = ${v.fahrzeug_typ}`)
      ok(v.fahrzeug_hersteller === 'SMOKE-503B', `fahrzeug_hersteller (←hersteller) = ${v.fahrzeug_hersteller}`)
      ok(v.fahrzeug_modell === '3b-Modell', `fahrzeug_modell (←modell_haupttyp) = ${v.fahrzeug_modell}`)
      ok(v.fahrzeug_baujahr === 2021, `fahrzeug_baujahr (←EXTRACT YEAR baujahr_monat::int) = ${v.fahrzeug_baujahr}`)
      ok(v.fin_quelle === 'cmm503b_smoke', `fin_quelle = ${v.fin_quelle}`)
      ok(typeof v.fin_extrahiert_am === 'string' && v.fin_extrahiert_am.startsWith('2026-05-30'), `fin_extrahiert_am = ${v.fin_extrahiert_am}`)
      ok(v.fahrzeug_farbe === '503B-Blau', `fahrzeug_farbe (←farbe_klartext) = ${v.fahrzeug_farbe}`)
      ok(v.erstzulassung === '2020-06-15', `erstzulassung (←date::text) = ${v.erstzulassung}`)
      ok(v.kilometerstand === 84210, `kilometerstand (←aktueller_kilometerstand) = ${v.kilometerstand}`)
      ok(v.fin_vin === TEST_FIN, `fin_vin (←fin::text) = ${v.fin_vin}`)
      ok(v.hsn === '1313', `hsn (←varchar::text) = ${v.hsn}`)
      ok(v.tsn === 'ABC', `tsn (←varchar::text) = ${v.tsn}`)
      ok(v.lackfarbe_code === '503B', `lackfarbe_code (←farbcode) = ${v.lackfarbe_code}`)
      ok(v.fahrzeug_ausstattung && v.fahrzeug_ausstattung.smoke503b === true, `fahrzeug_ausstattung (jsonb) = ${JSON.stringify(v.fahrzeug_ausstattung)}`)
    }
  } finally {
    if (claimId !== null && origVid !== undefined) {
      await db.from('claims').update({ vehicle_id: origVid }).eq('id', claimId)
      const { data: chk } = await db.from('claims').select('vehicle_id').eq('id', claimId).single()
      console.log('Cleanup:')
      ok((chk?.vehicle_id ?? null) === (origVid ?? null), `claims.vehicle_id zurueckgesetzt auf ${origVid}`)
    }
    await db.from('vehicles').delete().eq('fin', TEST_FIN)
    const { count } = await db.from('vehicles').select('id', { count: 'exact', head: true }).eq('fin', TEST_FIN)
    ok(count === 0, `Test-Vehicle entfernt (verbleibend ${count})`)
  }
  console.log(exitCode === 0 ? '\n✅ CMM-50.3b SMOKE PASS — v_faelle_mit_aktuellem_termin surfacet alle 15 Fahrzeug-Spalten aus vehicles.' : `\n❌ EXIT ${exitCode}`)
}
main().then(() => process.exit(exitCode)).catch((e) => { console.error(e); process.exit(2) })
